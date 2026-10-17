begin;

create function public.cancel_agreement(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  a public.agreements;
  op public.operation_requests;
  op_id uuid;
  v_agreement uuid;
  v_revision bigint;
  v_key text;
  v_hash text;
  v_result jsonb;
  v_settlement uuid := gen_random_uuid();
  v_transaction uuid := gen_random_uuid();
  v_funding_transaction uuid;
  v_secured bigint;
  r record;
  v_outcome text;
begin
  if actor is null then return pact_private.funding_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or
    not (p_input ?& array['agreementId','expectedRevision','idempotencyKey']) or
    p_input - array['agreementId','expectedRevision','idempotencyKey'] <> '{}'::jsonb or
    exists (select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value) <> 'string') or
    (p_input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_agreement := (p_input->>'agreementId')::uuid;
  v_revision := (p_input->>'expectedRevision')::bigint;
  v_key := p_input->>'idempotencyKey';
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'agreementId',v_agreement,'expectedRevision',v_revision::text)::text,'UTF8')),'hex');

  select * into a from public.agreements where id=v_agreement for update;
  if not found then return pact_private.funding_error('not_authorized'); end if;
  if a.owner_id <> actor and not exists (
    select 1 from public.participants p where p.agreement_id=a.id
      and p.user_id=actor and p.removed_at is null
  ) then return pact_private.funding_error('not_authorized'); end if;

  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='cancelAgreement' and idempotency_key=v_key;
  if found then
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  if a.state='cancelled' then return pact_private.funding_error('already_processed'); end if;
  if a.revision <> v_revision then return pact_private.funding_error('stale_revision'); end if;
  if a.handover_at is not null or a.state not in
    ('draft','awaiting_acceptance','awaiting_funding','ready_for_handover','cancelling') then
    return pact_private.funding_error('invalid_state');
  end if;
  if exists (
    select 1 from public.payment_attempts p
    left join pact_private.simulated_attempt_outcomes o on o.attempt_id=p.id
    where p.agreement_id=a.id and p.state='processing' and o.attempt_id is null
  ) then return pact_private.funding_error('temporarily_unavailable',true); end if;

  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'cancelAgreement',v_key,v_hash)
    on conflict (actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='cancelAgreement' and idempotency_key=v_key;
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;

  -- Reconcile persisted simulated outcomes using the funding ledger before refunds.
  -- The agreement lock serializes this with complete_simulated_contribution.
  for r in
    select p.id as attempt_id, p.contribution_id
    from public.payment_attempts p
    join public.contributions c on c.id=p.contribution_id
    where p.agreement_id=a.id and p.state='processing'
    order by c.id
  loop
    perform 1 from public.contributions where id=r.contribution_id for update;
    perform 1 from public.payment_attempts where id=r.attempt_id for update;
    select outcome into v_outcome from pact_private.simulated_attempt_outcomes
      where attempt_id=r.attempt_id;
    if v_outcome='succeeded' then
      v_funding_transaction := gen_random_uuid();
      insert into public.ledger_transactions(
        id,agreement_id,currency,operation_id,kind,payment_attempt_id
      )
      select v_funding_transaction,a.id,a.currency,p.operation_id,'funding',p.id
        from public.payment_attempts p where p.id=r.attempt_id;
      insert into public.ledger_entries(
        agreement_id,transaction_id,currency,account,contribution_id,amount_minor
      )
      select a.id,v_funding_transaction,a.currency,'simulated_source'::public.ledger_account,c.id,-c.amount_minor
        from public.contributions c where c.id=r.contribution_id;
      insert into public.ledger_entries(
        agreement_id,transaction_id,currency,account,contribution_id,amount_minor
      )
      select a.id,v_funding_transaction,a.currency,'restricted_deposit'::public.ledger_account,null,c.amount_minor
        from public.contributions c where c.id=r.contribution_id;
      update public.contributions set state='secured',secured_minor=amount_minor
        where id=r.contribution_id;
      update public.payment_attempts set state='succeeded',completed_at=clock_timestamp()
        where id=r.attempt_id;
      insert into public.audit_events(agreement_id,operation_id,action,metadata)
        select a.id,p.operation_id,'contribution_succeeded',
          jsonb_build_object('attemptId',p.id,'contributionId',c.id,'reconciledByCancellation',true)
        from public.payment_attempts p
        join public.contributions c on c.id=p.contribution_id where p.id=r.attempt_id;
    elsif v_outcome='failed' then
      update public.contributions set state='failed' where id=r.contribution_id;
      update public.payment_attempts set state='failed',failure_code='simulated_decline',
        completed_at=clock_timestamp() where id=r.attempt_id;
      insert into public.audit_events(agreement_id,operation_id,action,metadata)
        select a.id,p.operation_id,'contribution_failed',
          jsonb_build_object('attemptId',p.id,'contributionId',c.id,'reconciledByCancellation',true)
        from public.payment_attempts p
        join public.contributions c on c.id=p.contribution_id where p.id=r.attempt_id;
    else
      raise exception 'missing_simulated_attempt_outcome' using errcode='P0001';
    end if;
  end loop;

  select coalesce(sum(secured_minor),0) into v_secured
    from public.contributions where agreement_id=a.id;
  insert into public.settlements(
    id,agreement_id,currency,operation_id,reason,secured_minor,owner_minor,refunded_minor
  ) values(v_settlement,a.id,a.currency,op_id,'cancellation',v_secured,0,v_secured);
  insert into public.settlement_allocations(
    agreement_id,settlement_id,contribution_id,secured_minor,deducted_minor,refunded_minor
  )
  select a.id,v_settlement,c.id,c.secured_minor,0,c.secured_minor
    from public.contributions c where c.agreement_id=a.id and c.secured_minor>0;

  if v_secured>0 then
    insert into public.ledger_transactions(
      id,agreement_id,currency,operation_id,kind,settlement_id
    ) values(v_transaction,a.id,a.currency,op_id,'settlement',v_settlement);
    insert into public.ledger_entries(
      agreement_id,transaction_id,currency,account,contribution_id,amount_minor
    )
    select a.id,v_transaction,a.currency,'restricted_deposit'::public.ledger_account,
      null::uuid,-v_secured
    union all
    select a.id,v_transaction,a.currency,'borrower_refund'::public.ledger_account,c.id,c.secured_minor
      from public.contributions c where c.agreement_id=a.id and c.secured_minor>0;
    update public.contributions set state='refunded',refunded_minor=secured_minor
      where agreement_id=a.id and secured_minor>0;
  end if;

  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(a.id,actor,op_id,'agreement_cancelled',
      jsonb_build_object('settlementId',v_settlement,'securedMinor',v_secured,'refundedMinor',v_secured));
  insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
    select a.id,recipients.user_id,'agreement_cancelled','cancellation:'||a.id::text,
      'The agreement was cancelled. Any secured contribution has been refunded.'
    from (
      select a.owner_id as user_id
      union
      select p.user_id from public.participants p
        where p.agreement_id=a.id and p.removed_at is null and p.user_id is not null
    ) recipients
    on conflict (recipient_id,deduplication_key) do nothing;
  update public.agreements set state='cancelled',cancelled_at=clock_timestamp()
    where id=a.id returning * into a;

  v_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreement',pact_private.agreement_summary(a),'operationId',op_id));
  update public.operation_requests set status='succeeded',result=v_result,completed_at=clock_timestamp()
    where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

revoke all on function public.cancel_agreement(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cancel_agreement(jsonb) to authenticated;

commit;
