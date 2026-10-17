-- Pact's first persistent model. The interactive hackathon demo still uses
-- LocalDemoRepository and does not connect to these tables.
-- Mutations are intentionally not granted to browser roles; add authenticated,
-- transactional server operations before wiring a repository to this schema.

create type public.pact_agreement_status as enum (
  'draft',
  'awaiting_acceptance',
  'awaiting_funding',
  'funded',
  'return_review',
  'disputed',
  'settling',
  'completed',
  'cancelled'
);

create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references auth.users (id) on delete restrict,
  tenant_id uuid not null references auth.users (id) on delete restrict,
  status public.pact_agreement_status not null default 'draft',
  current_terms_version integer not null default 1 check (current_terms_version > 0),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reserved_minor bigint not null default 0 check (reserved_minor >= 0 and reserved_minor <= amount_minor),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agreements_distinct_parties check (landlord_id <> tenant_id)
);

create table public.agreement_versions (
  agreement_id uuid not null references public.agreements (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  created_at timestamptz not null default now(),
  primary key (agreement_id, version_number)
);

create table public.agreement_acceptances (
  agreement_id uuid not null,
  version_number integer not null,
  actor_id uuid not null references auth.users (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  primary key (agreement_id, version_number, actor_id),
  foreign key (agreement_id, version_number)
    references public.agreement_versions (agreement_id, version_number) on delete restrict
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete restrict,
  opened_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'open'
    check (status in ('open', 'negotiating', 'resolved', 'review_required')),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.settlement_proposals (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete restrict,
  proposal_version integer not null check (proposal_version > 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  renter_refund_minor bigint not null check (renter_refund_minor >= 0),
  owner_allocation_minor bigint not null check (owner_allocation_minor >= 0),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'proposed'
    check (status in ('proposed', 'rejected', 'approved', 'settled')),
  created_at timestamptz not null default now(),
  unique (agreement_id, proposal_version)
);

create table public.proposal_approvals (
  proposal_id uuid not null references public.settlement_proposals (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  approved_at timestamptz not null default now(),
  primary key (proposal_id, actor_id)
);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete restrict,
  operation_key text not null check (length(operation_key) between 8 and 200),
  operation_type text not null check (operation_type in ('funding', 'settlement', 'refund')),
  request_fingerprint text not null check (length(request_fingerprint) between 1 and 256),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (agreement_id, operation_key)
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.ledger_transactions (id) on delete restrict,
  account text not null check (
    account in ('tenant_available', 'agreement_reserved', 'tenant_refund', 'landlord_allocation')
  ),
  amount_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  agreement_id uuid not null references public.agreements (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (length(action) between 1 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.reject_pact_record_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'This Pact record is append-only';
end;
$$;
revoke all on function private.reject_pact_record_change() from public, anon, authenticated;

create trigger agreement_versions_append_only
  before update or delete on public.agreement_versions
  for each row execute function private.reject_pact_record_change();
create trigger agreement_acceptances_append_only
  before update or delete on public.agreement_acceptances
  for each row execute function private.reject_pact_record_change();
create trigger proposal_approvals_append_only
  before update or delete on public.proposal_approvals
  for each row execute function private.reject_pact_record_change();
create trigger ledger_transactions_append_only
  before update or delete on public.ledger_transactions
  for each row execute function private.reject_pact_record_change();
create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function private.reject_pact_record_change();
create trigger audit_events_append_only
  before update or delete on public.audit_events
  for each row execute function private.reject_pact_record_change();

create function private.assert_balanced_pact_ledger_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_transaction_id uuid;
  v_entry_count bigint;
  v_total bigint;
  v_currency_count bigint;
  v_agreement_currency text;
begin
  if tg_table_name = 'ledger_transactions' then
    v_transaction_id := new.id;
  elsif tg_op = 'DELETE' then
    v_transaction_id := old.transaction_id;
  else
    v_transaction_id := new.transaction_id;
  end if;

  select count(*), coalesce(sum(le.amount_minor), 0), count(distinct le.currency)
    into v_entry_count, v_total, v_currency_count
    from public.ledger_entries le
    where le.transaction_id = v_transaction_id;

  select a.currency into v_agreement_currency
    from public.ledger_transactions lt
    join public.agreements a on a.id = lt.agreement_id
    where lt.id = v_transaction_id;

  if v_entry_count < 2 or v_total <> 0 or v_currency_count <> 1
      or not exists (
        select 1 from public.ledger_entries le
        where le.transaction_id = v_transaction_id
          and le.currency = v_agreement_currency
      ) then
    raise exception 'Pact ledger transaction must contain at least two balanced entries in the agreement currency';
  end if;

  return null;
end;
$$;
revoke all on function private.assert_balanced_pact_ledger_transaction() from public, anon, authenticated;

create constraint trigger ledger_transaction_must_balance
  after insert on public.ledger_transactions
  deferrable initially deferred
  for each row execute function private.assert_balanced_pact_ledger_transaction();
create constraint trigger ledger_entries_must_balance
  after insert or update or delete on public.ledger_entries
  deferrable initially deferred
  for each row execute function private.assert_balanced_pact_ledger_transaction();

create index agreements_landlord_created_idx on public.agreements (landlord_id, created_at desc);
create index agreements_tenant_created_idx on public.agreements (tenant_id, created_at desc);
create index disputes_agreement_created_idx on public.disputes (agreement_id, created_at desc);
create index proposals_agreement_version_idx on public.settlement_proposals (agreement_id, proposal_version desc);
create index ledger_transactions_agreement_created_idx on public.ledger_transactions (agreement_id, created_at desc);
create index audit_events_agreement_created_idx on public.audit_events (agreement_id, created_at desc);

alter table public.agreements enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.agreement_acceptances enable row level security;
alter table public.disputes enable row level security;
alter table public.settlement_proposals enable row level security;
alter table public.proposal_approvals enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_events enable row level security;

-- Participants can inspect their own agreement and its records. There are no
-- browser write policies: future operations must authorize and post atomically.
create policy "participants read agreements"
  on public.agreements for select to authenticated
  using (auth.uid() in (landlord_id, tenant_id));

create policy "participants read agreement versions"
  on public.agreement_versions for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read acceptances"
  on public.agreement_acceptances for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read disputes"
  on public.disputes for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read proposals"
  on public.settlement_proposals for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read proposal approvals"
  on public.proposal_approvals for select to authenticated
  using (exists (
    select 1
    from public.settlement_proposals p
    join public.agreements a on a.id = p.agreement_id
    where p.id = proposal_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read ledger transactions"
  on public.ledger_transactions for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read ledger entries"
  on public.ledger_entries for select to authenticated
  using (exists (
    select 1
    from public.ledger_transactions t
    join public.agreements a on a.id = t.agreement_id
    where t.id = transaction_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

create policy "participants read audit events"
  on public.audit_events for select to authenticated
  using (exists (
    select 1 from public.agreements a
    where a.id = agreement_id and auth.uid() in (a.landlord_id, a.tenant_id)
  ));

revoke all on public.agreements,
  public.agreement_versions,
  public.agreement_acceptances,
  public.disputes,
  public.settlement_proposals,
  public.proposal_approvals,
  public.ledger_transactions,
  public.ledger_entries,
  public.audit_events from anon, authenticated;

grant select on public.agreements,
  public.agreement_versions,
  public.agreement_acceptances,
  public.disputes,
  public.settlement_proposals,
  public.proposal_approvals,
  public.ledger_transactions,
  public.ledger_entries,
  public.audit_events to authenticated;

comment on table public.agreements is
  'Agreement parties and current simulated money state; mutation must use authorized atomic server operations.';
comment on table public.agreement_versions is
  'Immutable terms snapshots. Never update a published version; create a new version instead.';
comment on table public.ledger_transactions is
  'Idempotent operation envelope. Each operation must post balanced ledger entries atomically.';
comment on table public.ledger_entries is
  'Append-only integer minor-unit postings; corrections use compensating entries.';
comment on table public.audit_events is
  'Append-only record of agreement actions. Keep secrets and unnecessary personal data out of details.';
