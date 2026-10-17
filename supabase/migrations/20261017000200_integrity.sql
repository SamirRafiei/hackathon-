begin;

-- Pure integer allocator used to validate published snapshots. No financial mutation.
create function pact_private.allocate_contributions(p_deposit bigint, p_shares jsonb)
returns table (participant_id uuid, share_bps integer, amount_minor bigint)
language plpgsql immutable set search_path = '' as $$
declare allocation record;
begin
  if p_deposit is null or p_deposit not between 1 and 100000000 or
     p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'invalid_allocation' using errcode = '23514';
  end if;
  if jsonb_array_length(p_shares) not between 1 and 20 then
    raise exception 'invalid_participant_count' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(p_shares) s
      where s->>'participantId' is null or s->>'shareBps' is null or
        (s->>'shareBps') !~ '^[0-9]+$' or (s->>'shareBps')::numeric not between 1 and 10000) then
    raise exception 'invalid_share' using errcode = '23514';
  end if;
  if (select sum((s->>'shareBps')::integer) from jsonb_array_elements(p_shares) s) <> 10000 or
     (select count(distinct (s->>'participantId')::uuid) from jsonb_array_elements(p_shares) s) <> jsonb_array_length(p_shares) then
    raise exception 'invalid_split' using errcode = '23514';
  end if;
  for allocation in
    with shares as (
      select (s->>'participantId')::uuid id, (s->>'shareBps')::integer bps
      from jsonb_array_elements(p_shares) s
    ), floors as (
      select id, bps, p_deposit * bps / 10000 base, p_deposit * bps % 10000 remainder
      from shares
    ), ranked as (
      select *, row_number() over (order by remainder desc, id) rank,
        p_deposit - sum(base) over () extras from floors
    )
    select id, bps, base + case when rank <= extras then 1 else 0 end allocated from ranked order by id
  loop
    if allocation.allocated < 1 then
      raise exception 'deposit_too_small' using errcode = '23514';
    end if;
    participant_id := allocation.id;
    share_bps := allocation.bps;
    amount_minor := allocation.allocated;
    return next;
  end loop;
end $$;

create function pact_private.reject_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '23514';
end $$;

do $$
declare t text;
begin
  foreach t in array array['agreement_versions','version_participants','acceptances',
    'settlement_proposals','proposal_acceptances','reviewer_decisions','decision_evidence',
    'settlements','settlement_allocations','ledger_transactions','ledger_entries','audit_events',
    'exchange_evidence','dispute_evidence'] loop
    execute format('create trigger immutable_rows before update or delete on public.%I for each row execute function pact_private.reject_mutation()', t);
  end loop;
end $$;

create function pact_private.guard_agreement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id or new.currency <> old.currency or new.created_at <> old.created_at then
    raise exception 'agreement_identity_immutable' using errcode = '23514';
  end if;
  if old.terms_frozen_at is not null and
    (new.terms_frozen_at is distinct from old.terms_frozen_at or new.current_version_id is distinct from old.current_version_id) then
    raise exception 'terms_frozen' using errcode = '23514';
  end if;
  if new.current_version_id is distinct from old.current_version_id and exists
    (select 1 from public.contributions where agreement_id = old.id and secured_minor > 0) then
    raise exception 'terms_frozen' using errcode = '23514';
  end if;
  if old.returned_at is not null and
    (new.returned_at is distinct from old.returned_at or new.inspection_deadline is distinct from old.inspection_deadline) then
    raise exception 'receipt_already_recorded' using errcode = '23514';
  end if;
  if old.state in ('completed', 'cancelled') then
    raise exception 'agreement_final' using errcode = '23514';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end $$;
create trigger guard_agreement before update on public.agreements
for each row execute function pact_private.guard_agreement();

create function pact_private.guard_participant() returns trigger
language plpgsql set search_path = '' as $$
declare a public.agreements; v_email text; v_verified timestamptz;
begin
  if tg_op = 'DELETE' then
    raise exception 'use_removed_at_preserve_history' using errcode = '23514';
  end if;
  select * into strict a from public.agreements where id = new.agreement_id for update;
  if a.terms_frozen_at is not null or exists
    (select 1 from public.contributions where agreement_id = a.id and secured_minor > 0) then
    raise exception 'membership_frozen' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.agreement_id <> old.agreement_id or
      (old.user_id is not null and new.user_id is distinct from old.user_id) then
      raise exception 'participant_identity_immutable' using errcode = '23514';
    end if;
  end if;
  if new.user_id = a.owner_id or new.email =
    (select lower(email) from auth.users where id = a.owner_id) then
    raise exception 'owner_cannot_borrow' using errcode = '23514';
  end if;
  if new.removed_at is null and (select count(*) from public.participants
    where agreement_id = a.id and removed_at is null and id <> new.id) >= 20 then
    raise exception 'too_many_borrowers' using errcode = '23514';
  end if;
  if new.user_id is not null then
    select lower(email), email_confirmed_at into v_email, v_verified from auth.users where id = new.user_id;
    if v_email is distinct from new.email or v_verified is null then
      raise exception 'verified_email_required' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger guard_participant before insert or update or delete on public.participants
for each row execute function pact_private.guard_participant();

create function pact_private.guard_version() returns trigger
language plpgsql set search_path = '' as $$
declare a public.agreements;
begin
  select * into strict a from public.agreements where id = new.agreement_id for update;
  if a.terms_frozen_at is not null or exists
    (select 1 from public.contributions where agreement_id = a.id and secured_minor > 0) then
    raise exception 'terms_frozen' using errcode = '23514';
  end if;
  new.created_txid := txid_current();
  return new;
end $$;
create trigger guard_version before insert on public.agreement_versions
for each row execute function pact_private.guard_version();

-- Child rows of immutable records must be written in the parent's transaction.
-- Otherwise a later INSERT could rewrite a published snapshot or settled ledger.
create function pact_private.guard_attachment() returns trigger
language plpgsql set search_path = '' as $$
declare parent_txid bigint;
begin
  execute format('select created_txid from public.%I where id = ($1).%I', tg_argv[0], tg_argv[1])
    into parent_txid using new;
  if parent_txid is distinct from txid_current() then
    raise exception 'immutable_parent' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger snapshot_attachment before insert on public.version_participants
for each row execute function pact_private.guard_attachment('agreement_versions', 'version_id');
create trigger ledger_attachment before insert on public.ledger_entries
for each row execute function pact_private.guard_attachment('ledger_transactions', 'transaction_id');
create trigger settlement_attachment before insert on public.settlement_allocations
for each row execute function pact_private.guard_attachment('settlements', 'settlement_id');
create trigger decision_attachment before insert on public.decision_evidence
for each row execute function pact_private.guard_attachment('reviewer_decisions', 'decision_id');

create function pact_private.validate_version() returns trigger
language plpgsql set search_path = '' as $$
declare v_id uuid; v_deposit bigint; v_shares jsonb;
begin
  if tg_table_name = 'agreement_versions' then v_id := new.id; else v_id := new.version_id; end if;
  select deposit_minor into strict v_deposit from public.agreement_versions where id = v_id;
  select jsonb_agg(jsonb_build_object('participantId', participant_id, 'shareBps', share_bps))
    into v_shares from public.version_participants where version_id = v_id;
  if v_shares is null then raise exception 'borrowers_required' using errcode = '23514'; end if;
  if exists (
    select 1 from pact_private.allocate_contributions(v_deposit, v_shares) a
    join public.version_participants p on p.version_id = v_id and p.participant_id = a.participant_id
    where a.amount_minor < 1 or a.amount_minor <> p.allocated_minor
  ) then raise exception 'invalid_allocated_snapshot' using errcode = '23514'; end if;
  if exists (select 1 from public.version_participants v join public.participants p on p.id = v.participant_id
    where v.version_id = v_id and (p.removed_at is not null or p.email <> v.email or
      p.share_bps <> v.share_bps or p.allocated_minor <> v.allocated_minor)) then
    raise exception 'snapshot_membership_mismatch' using errcode = '23514';
  end if;
  if (select count(*) from public.participants p join public.agreement_versions v on v.agreement_id = p.agreement_id
      where v.id = v_id and p.removed_at is null) <> jsonb_array_length(v_shares) then
    raise exception 'snapshot_members_missing' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger version_complete after insert on public.agreement_versions
deferrable initially deferred for each row execute function pact_private.validate_version();
create constraint trigger snapshot_complete after insert on public.version_participants
deferrable initially deferred for each row execute function pact_private.validate_version();

create function pact_private.validate_ledger() returns trigger
language plpgsql set search_path = '' as $$
declare v_id uuid; v_count bigint; v_sum numeric; v_kind text;
begin
  if tg_table_name = 'ledger_transactions' then v_id := new.id; else v_id := new.transaction_id; end if;
  select count(*), coalesce(sum(amount_minor), 0) into v_count, v_sum from public.ledger_entries where transaction_id = v_id;
  select kind into v_kind from public.ledger_transactions where id = v_id;
  if v_count < 2 or v_sum <> 0 then raise exception 'unbalanced_ledger' using errcode = '23514'; end if;
  if exists (select 1 from public.ledger_entries where transaction_id = v_id and
    ((v_kind = 'funding' and (account not in ('simulated_source', 'restricted_deposit') or
      (account = 'restricted_deposit' and amount_minor < 0))) or
     (v_kind = 'settlement' and (account = 'simulated_source' or
      (account = 'restricted_deposit' and amount_minor > 0))))) then
    raise exception 'invalid_ledger_accounts' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger transaction_balanced after insert on public.ledger_transactions
deferrable initially deferred for each row execute function pact_private.validate_ledger();
create constraint trigger entries_balanced after insert on public.ledger_entries
deferrable initially deferred for each row execute function pact_private.validate_ledger();

create function pact_private.validate_settlement_totals() returns trigger
language plpgsql set search_path = '' as $$
declare v_id uuid; s public.settlements; v_secured numeric; v_deducted numeric; v_refunded numeric;
begin
  if tg_table_name = 'settlements' then v_id := new.id; else v_id := new.settlement_id; end if;
  select * into strict s from public.settlements where id = v_id;
  select coalesce(sum(secured_minor),0), coalesce(sum(deducted_minor),0), coalesce(sum(refunded_minor),0)
    into v_secured, v_deducted, v_refunded from public.settlement_allocations where settlement_id = v_id;
  if (s.secured_minor, s.owner_minor, s.refunded_minor) is distinct from (v_secured, v_deducted, v_refunded) then
    raise exception 'settlement_totals_mismatch' using errcode = '23514';
  end if;
  if s.secured_minor <> (select coalesce(sum(secured_minor),0) from public.contributions where agreement_id = s.agreement_id) or
    exists (select 1 from public.settlement_allocations a join public.contributions c on c.id = a.contribution_id
      where a.settlement_id = v_id and a.secured_minor <> c.secured_minor) then
    raise exception 'settlement_secured_mismatch' using errcode = '23514';
  end if;
  if exists (select 1 from public.contributions c left join public.settlement_allocations a
    on a.contribution_id = c.id and a.settlement_id = v_id
    where c.agreement_id = s.agreement_id and c.secured_minor > 0 and
      (a.contribution_id is null or a.secured_minor <> c.secured_minor)) then
    raise exception 'settlement_contributions_mismatch' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger settlement_totals after insert on public.settlements
deferrable initially deferred for each row execute function pact_private.validate_settlement_totals();
create constraint trigger allocation_totals after insert on public.settlement_allocations
deferrable initially deferred for each row execute function pact_private.validate_settlement_totals();

create function pact_private.guard_contribution() returns trigger
language plpgsql set search_path = '' as $$
declare allocated bigint;
begin
  select allocated_minor into allocated from public.version_participants
    where version_id = new.version_id and participant_id = new.participant_id;
  if new.amount_minor is distinct from allocated then
    raise exception 'contribution_snapshot_mismatch' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if (new.agreement_id, new.version_id, new.participant_id, new.amount_minor, new.currency) is distinct from
       (old.agreement_id, old.version_id, old.participant_id, old.amount_minor, old.currency) then
      raise exception 'contribution_identity_immutable' using errcode = '23514';
    end if;
    if new.secured_minor < old.secured_minor or new.refunded_minor < old.refunded_minor or new.deducted_minor < old.deducted_minor then
      raise exception 'financial_totals_cannot_decrease' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger guard_contribution before insert or update on public.contributions
for each row execute function pact_private.guard_contribution();

create function pact_private.guard_final_outcome() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_table_name = 'payment_attempts' and to_jsonb(old)->>'state' <> 'processing') or
     (tg_table_name = 'operation_requests' and to_jsonb(old)->>'status' <> 'processing') then
    raise exception 'outcome_immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then raise exception 'history_required' using errcode = '23514'; end if;
  if tg_table_name = 'operation_requests' and
    (to_jsonb(new) - array['status','result','completed_at']) is distinct from
    (to_jsonb(old) - array['status','result','completed_at']) then
    raise exception 'operation_identity_immutable' using errcode = '23514';
  end if;
  if tg_table_name = 'payment_attempts' and
    (to_jsonb(new) - array['state','failure_code','completed_at']) is distinct from
    (to_jsonb(old) - array['state','failure_code','completed_at']) then
    raise exception 'attempt_identity_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger payment_outcome before update or delete on public.payment_attempts
for each row execute function pact_private.guard_final_outcome();
create trigger operation_outcome before update or delete on public.operation_requests
for each row execute function pact_private.guard_final_outcome();

create function pact_private.guard_evidence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.submitted_at is not null then raise exception 'submitted_evidence_immutable' using errcode = '23514'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if (to_jsonb(new) - array['caption','submitted_at']) is distinct from
     (to_jsonb(old) - array['caption','submitted_at']) then
    raise exception 'evidence_identity_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_evidence before update or delete on public.evidence_files
for each row execute function pact_private.guard_evidence();

create function pact_private.guard_reviewer() returns trigger
language plpgsql set search_path = '' as $$
declare v_reviewer uuid; v_case public.review_cases; v_claim bigint;
begin
  perform 1 from public.agreements where id = new.agreement_id for update;
  if tg_table_name = 'review_cases' then v_reviewer := new.assigned_reviewer_id;
  else
    v_reviewer := new.reviewer_id;
    select * into strict v_case from public.review_cases where id = new.case_id;
    if v_case.assigned_reviewer_id is distinct from v_reviewer or v_case.state = 'resolved' then
      raise exception 'reviewer_not_assigned' using errcode = '23514';
    end if;
    if new.kind = 'financial' then
      select requested_minor into v_claim from public.disputes where id = v_case.dispute_id;
      if v_claim is null or new.deduction_minor > v_claim or new.deduction_minor >
        (select coalesce(sum(secured_minor),0) from public.contributions where agreement_id = new.agreement_id) then
        raise exception 'decision_exceeds_claim' using errcode = '23514';
      end if;
    end if;
  end if;
  if v_reviewer is not null and (
    not exists (select 1 from public.reviewer_grants where user_id = v_reviewer and revoked_at is null) or
    exists (select 1 from public.agreements where id = new.agreement_id and owner_id = v_reviewer) or
    exists (select 1 from public.participants where agreement_id = new.agreement_id and user_id = v_reviewer)) then
    raise exception 'independent_reviewer_required' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_case_reviewer before insert or update on public.review_cases
for each row execute function pact_private.guard_reviewer();
create trigger guard_decision_reviewer before insert on public.reviewer_decisions
for each row execute function pact_private.guard_reviewer();

create function pact_private.guard_acceptance() returns trigger
language plpgsql set search_path = '' as $$
declare a public.agreements;
begin
  select * into strict a from public.agreements where id = new.agreement_id for update;
  if a.current_version_id is distinct from new.version_id then
    raise exception 'stale_version' using errcode = '23514';
  end if;
  if new.actor_id <> a.owner_id and not exists (
    select 1 from public.version_participants v join public.participants p on p.id = v.participant_id
    where v.version_id = new.version_id and p.user_id = new.actor_id and p.removed_at is null
  ) then raise exception 'acceptance_actor_not_participant' using errcode = '23514'; end if;
  return new;
end $$;
create trigger guard_acceptance before insert on public.acceptances
for each row execute function pact_private.guard_acceptance();

create function pact_private.guard_claim_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'claim_history_required' using errcode = '23514'; end if;
  if (to_jsonb(new) - array['state','current_proposal_id','evidence_missing','resolved_at']) is distinct from
     (to_jsonb(old) - array['state','current_proposal_id','evidence_missing','resolved_at']) then
    raise exception 'claim_terms_immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger guard_claim_history before update or delete on public.disputes
for each row execute function pact_private.guard_claim_history();

create function pact_private.guard_evidence_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.evidence_files e where e.id = new.evidence_id
    and e.agreement_id = new.agreement_id and e.submitted_at is not null) then
    raise exception 'submitted_evidence_required' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger exchange_submitted_evidence before insert on public.exchange_evidence
for each row execute function pact_private.guard_evidence_link();
create trigger dispute_submitted_evidence before insert on public.dispute_evidence
for each row execute function pact_private.guard_evidence_link();
create trigger decision_submitted_evidence before insert on public.decision_evidence
for each row execute function pact_private.guard_evidence_link();

commit;
