begin;

-- Administrator-controlled demo fixtures. Never accept an outcome from a client.
create table pact_private.simulated_failure_fixtures (
  contribution_id uuid primary key references public.contributions(id),
  failures_remaining integer not null check (failures_remaining between 0 and 10)
);
create table pact_private.simulated_attempt_outcomes (
  attempt_id uuid primary key references public.payment_attempts(id),
  outcome text not null check (outcome in ('succeeded', 'failed'))
);
revoke all on pact_private.simulated_failure_fixtures, pact_private.simulated_attempt_outcomes
  from public, anon, authenticated, service_role;

create function pact_private.funding_error(code text, retryable boolean default false) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok',false,'error',jsonb_build_object(
    'code',code,'message',replace(code,'_',' '),'retryable',retryable));
$$;
create function pact_private.agreement_summary(a public.agreements) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',a.id,'ownerId',a.owner_id,'currency',a.currency,
    'state',a.state,'currentVersionId',a.current_version_id,'revision',a.revision::text,
    'returnedAt',a.returned_at,'inspectionDeadline',a.inspection_deadline);
$$;

-- Current snapshot membership, verified identities, all acceptances, and one
-- correctly allocated contribution per borrower. Must run under agreement lock.
create function pact_private.funding_accepted(a public.agreements) returns boolean
language sql stable set search_path = '' as $$
  select a.current_version_id is not null
    and exists (select 1 from public.acceptances where version_id=a.current_version_id and actor_id=a.owner_id)
    and exists (select 1 from public.version_participants where version_id=a.current_version_id)
    and not exists (
      select 1 from public.version_participants v
      join public.participants p on p.id=v.participant_id
      left join auth.users u on u.id=p.user_id
      left join public.acceptances ac on ac.version_id=v.version_id and ac.actor_id=p.user_id
      left join public.contributions c on c.version_id=v.version_id and c.participant_id=p.id
      where v.version_id=a.current_version_id and
        (p.removed_at is not null or p.user_id is null or ac.actor_id is null or
         u.email_confirmed_at is null or lower(u.email) is distinct from v.email or
         p.email <> v.email or p.share_bps <> v.share_bps or p.allocated_minor <> v.allocated_minor or
         c.id is null or c.amount_minor <> v.allocated_minor or c.currency <> a.currency)
    ) and not exists (
      select 1 from public.participants p where p.agreement_id=a.id and p.removed_at is null
      and not exists (select 1 from public.version_participants v where v.version_id=a.current_version_id and v.participant_id=p.id)
    );
$$;

create function public.start_contribution(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); a public.agreements; c public.contributions;
  op public.operation_requests; op_id uuid; attempt_id uuid := gen_random_uuid();
  v_agreement uuid; v_version uuid; v_contribution uuid; v_revision bigint;
  v_key text; v_hash text; v_result jsonb; v_due timestamptz;
  v_outcome text := 'succeeded'; v_failures integer;
begin
  if actor is null then return pact_private.funding_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object' or
    not (p_input ?& array['agreementId','versionId','contributionId','expectedRevision','idempotencyKey']) or
    p_input - array['agreementId','versionId','contributionId','expectedRevision','idempotencyKey'] <> '{}'::jsonb or
    exists (select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value) <> 'string') or
    (p_input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_agreement := (p_input->>'agreementId')::uuid;
  v_version := (p_input->>'versionId')::uuid;
  v_contribution := (p_input->>'contributionId')::uuid;
  v_revision := (p_input->>'expectedRevision')::bigint;
  v_key := p_input->>'idempotencyKey';
  v_hash := encode(sha256(convert_to(jsonb_build_object('agreementId',v_agreement,
    'versionId',v_version,'contributionId',v_contribution,'expectedRevision',v_revision::text)::text,'UTF8')),'hex');

  select * into a from public.agreements where id=v_agreement for update;
  if not found then return pact_private.funding_error('not_authorized'); end if;
  select c0.* into c from public.contributions c0 join public.participants p on p.id=c0.participant_id
    where c0.id=v_contribution and c0.agreement_id=a.id and p.user_id=actor and p.removed_at is null
    for update of c0;
  if not found then return pact_private.funding_error('not_authorized'); end if;

  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='startContribution' and idempotency_key=v_key;
  if found then
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  if a.current_version_id <> v_version or c.version_id <> v_version then return pact_private.funding_error('stale_version'); end if;
  if a.revision <> v_revision then return pact_private.funding_error('stale_revision'); end if;
  if a.state <> 'awaiting_funding' or a.handover_at is not null or c.state not in ('awaiting_payment','failed') or c.secured_minor <> 0 then
    return pact_private.funding_error('invalid_state');
  end if;
  if not pact_private.funding_accepted(a) then return pact_private.funding_error('acceptances_required'); end if;

  -- ON CONFLICT handles concurrent reuse of a global actor/key on another agreement.
  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'startContribution',v_key,v_hash)
    on conflict (actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='startContribution' and idempotency_key=v_key;
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  select failures_remaining into v_failures from pact_private.simulated_failure_fixtures where contribution_id=c.id for update;
  if coalesce(v_failures,0) > 0 then
    v_outcome := 'failed';
    update pact_private.simulated_failure_fixtures set failures_remaining=failures_remaining-1 where contribution_id=c.id;
  end if;
  v_due := clock_timestamp() + interval '2 seconds';
  insert into public.payment_attempts(id,agreement_id,contribution_id,operation_id,due_at)
    values(attempt_id,a.id,c.id,op_id,v_due);
  insert into pact_private.simulated_attempt_outcomes values(attempt_id,v_outcome);
  update public.contributions set state='processing' where id=c.id;
  update public.agreements set updated_at=clock_timestamp() where id=a.id returning * into a;
  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(a.id,actor,op_id,'contribution_processing',jsonb_build_object('attemptId',attempt_id,'contributionId',c.id));
  v_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreement',pact_private.agreement_summary(a),'operationId',op_id,'attemptId',attempt_id,'dueAt',v_due));
  update public.operation_requests set status='succeeded',result=v_result,completed_at=clock_timestamp() where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

create function public.complete_simulated_contribution(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.agreements; c public.contributions; attempt public.payment_attempts;
  op public.operation_requests; op_id uuid; v_attempt uuid; v_agreement uuid;
  v_key text; v_hash text; v_outcome text; v_result jsonb; v_tx uuid := gen_random_uuid();
  v_completed timestamptz; v_state text; v_failure text; v_ready boolean;
begin
  -- Only service_role has EXECUTE; this function is not a participant endpoint.
  if p_input is null or jsonb_typeof(p_input) <> 'object' or
    not (p_input ?& array['attemptId','idempotencyKey']) or
    p_input - array['attemptId','idempotencyKey'] <> '{}'::jsonb or
    exists (select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value) <> 'string') or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_attempt := (p_input->>'attemptId')::uuid; v_key := p_input->>'idempotencyKey';
  v_hash := encode(sha256(convert_to(v_attempt::text,'UTF8')),'hex');
  select agreement_id into v_agreement from public.payment_attempts where id=v_attempt;
  if not found then return pact_private.funding_error('not_found'); end if;
  select * into strict a from public.agreements where id=v_agreement for update;
  select c0.* into strict c from public.contributions c0 join public.payment_attempts p on p.contribution_id=c0.id
    where p.id=v_attempt for update of c0;
  select * into strict attempt from public.payment_attempts where id=v_attempt for update;
  select * into op from public.operation_requests where actor_scope='scheduler:complete_payments'
    and operation='completeSimulatedContribution' and idempotency_key=v_key;
  if found then
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  if attempt.state <> 'processing' then return pact_private.funding_error('already_processed'); end if;
  v_completed := clock_timestamp();
  if a.state='awaiting_funding' and attempt.due_at > v_completed then
    return pact_private.funding_error('temporarily_unavailable',true);
  end if;
  if c.state <> 'processing' or c.secured_minor <> 0 then
    return pact_private.funding_error('invalid_state');
  end if;
  select outcome into v_outcome from pact_private.simulated_attempt_outcomes where attempt_id=v_attempt;
  if v_outcome is null then return pact_private.funding_error('invalid_state'); end if;
  if a.state <> 'awaiting_funding' or a.handover_at is not null or c.version_id <> a.current_version_id or not pact_private.funding_accepted(a) then
    v_state := 'cancelled';
  elsif v_outcome='failed' then
    v_state := 'failed'; v_failure := 'simulated_decline';
  else
    v_state := 'succeeded';
  end if;
  insert into public.operation_requests(agreement_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,'scheduler:complete_payments','completeSimulatedContribution',v_key,v_hash)
    on conflict (actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='scheduler:complete_payments'
      and operation='completeSimulatedContribution' and idempotency_key=v_key;
    if op.payload_hash <> v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result || jsonb_build_object('replayed',true);
  end if;
  update public.payment_attempts set state=v_state,failure_code=v_failure,completed_at=v_completed where id=v_attempt;
  if v_state='succeeded' then
    insert into public.ledger_transactions(id,agreement_id,currency,operation_id,kind,payment_attempt_id)
      values(v_tx,a.id,a.currency,op_id,'funding',v_attempt);
    insert into public.ledger_entries(agreement_id,transaction_id,currency,account,contribution_id,amount_minor) values
      (a.id,v_tx,a.currency,'simulated_source',c.id,-c.amount_minor),
      (a.id,v_tx,a.currency,'restricted_deposit',null,c.amount_minor);
    update public.contributions set state='secured',secured_minor=amount_minor where id=c.id;
    select not exists (select 1 from public.contributions where version_id=a.current_version_id and state <> 'secured')
      and (select coalesce(sum(secured_minor),0) from public.contributions where version_id=a.current_version_id)=
        (select deposit_minor from public.agreement_versions where id=a.current_version_id) into v_ready;
    update public.agreements set terms_frozen_at=coalesce(terms_frozen_at,v_completed),
      state=case when v_ready then 'ready_for_handover'::public.agreement_state else 'awaiting_funding'::public.agreement_state end
      where id=a.id returning * into a;
  else
    update public.contributions set state='failed' where id=c.id;
    -- Final cancelled/completed agreements are immutable; reconcile attempt only.
    if a.state not in ('cancelled','completed') then
      update public.agreements set updated_at=v_completed where id=a.id returning * into a;
    end if;
  end if;
  insert into public.audit_events(agreement_id,operation_id,action,metadata)
    values(a.id,op_id,'contribution_'||v_state,jsonb_build_object('attemptId',v_attempt,'contributionId',c.id));
  insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
    select a.id,p.user_id,'contribution_'||v_state,'payment:'||v_attempt::text,
      case v_state when 'succeeded' then 'Your simulated contribution is secured.'
        when 'failed' then 'Your simulated contribution failed. You can retry.'
        else 'Your simulated contribution was cancelled without securing funds.' end
    from public.participants p where p.id=c.participant_id
    on conflict (recipient_id,deduplication_key) do nothing;
  v_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreement',pact_private.agreement_summary(a),'operationId',op_id,'attemptId',v_attempt,'attemptState',v_state));
  update public.operation_requests set status='succeeded',result=v_result,completed_at=v_completed where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

-- Browser-independent bounded worker, callable by a trusted local worker / cron.
-- No schedule or public HTTP endpoint is installed here.
create function public.process_due_contributions(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer; v_key text; v_hash text; op public.operation_requests; op_id uuid;
  v_job uuid; r record; outcome jsonb; v_result jsonb; v_count integer := 0; v_more boolean;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['batchSize','idempotencyKey']) or p_input-array['batchSize','idempotencyKey']<>'{}'::jsonb or
    jsonb_typeof(p_input->'batchSize')<>'number' or (p_input->>'batchSize') !~ '^[0-9]+$' or
    jsonb_typeof(p_input->'idempotencyKey')<>'string' or length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_limit := (p_input->>'batchSize')::integer; v_key := p_input->>'idempotencyKey';
  if v_limit not between 1 and 100 then return pact_private.funding_error('validation_failed'); end if;
  v_hash := encode(sha256(convert_to(v_limit::text,'UTF8')),'hex');
  insert into public.operation_requests(actor_scope,operation,idempotency_key,payload_hash)
    values('scheduler:complete_payments','processDueContributions',v_key,v_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='scheduler:complete_payments'
      and operation='processDueContributions' and idempotency_key=v_key;
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  insert into public.job_runs(job_name,scheduled_for) values('complete_payments',clock_timestamp()) returning id into v_job;
  begin
  -- Stable agreement order avoids multi-agreement worker deadlocks. Do not lock
  -- attempts before the completion operation obtains its agreement lock.
  for r in select id from public.payment_attempts where state='processing' and due_at<=clock_timestamp()
    order by agreement_id,id limit v_limit loop
    outcome := public.complete_simulated_contribution(jsonb_build_object('attemptId',r.id,'idempotencyKey','worker:'||r.id::text));
    if outcome->>'ok'='true' and outcome->>'replayed'='false' then v_count:=v_count+1; end if;
    if outcome->>'ok'='false' and outcome#>>'{error,code}'<>'already_processed' then
      raise exception 'payment_worker_failed' using errcode='P0001';
    end if;
  end loop;
  exception
    when serialization_failure or deadlock_detected then raise;
    when others then
      -- Roll back the whole batch's nested transaction, retain safe job telemetry.
      v_result:=pact_private.funding_error('temporarily_unavailable',true);
      update public.job_runs set status='failed',finished_at=clock_timestamp(),error_code='payment_worker_failed' where id=v_job;
      update public.operation_requests set status='failed',completed_at=clock_timestamp(),result=v_result where id=op_id;
      return v_result;
  end;
  select exists(select 1 from public.payment_attempts where state='processing' and due_at<=clock_timestamp()) into v_more;
  update public.job_runs set status='succeeded',finished_at=clock_timestamp(),processed_count=v_count where id=v_job;
  v_result:=jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('jobRunId',v_job,'processedCount',v_count,'hasMore',v_more));
  update public.operation_requests set status='succeeded',completed_at=clock_timestamp(),result=v_result where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

revoke all on function pact_private.funding_error(text,boolean), pact_private.agreement_summary(public.agreements),
  pact_private.funding_accepted(public.agreements) from public,anon,authenticated,service_role;
revoke all on function public.start_contribution(jsonb), public.complete_simulated_contribution(jsonb),
  public.process_due_contributions(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.start_contribution(jsonb) to authenticated;
grant execute on function public.complete_simulated_contribution(jsonb),public.process_due_contributions(jsonb) to service_role;

commit;
