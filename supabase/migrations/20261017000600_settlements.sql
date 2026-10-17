begin;

create function pact_private.post_agreement_settlement(
  p_agreement public.agreements,
  p_operation_id uuid,
  p_actor uuid,
  p_reason text,
  p_deduction bigint,
  p_proposal uuid default null,
  p_reviewer_decision uuid default null,
  p_dispute uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_settlement uuid := gen_random_uuid();
  v_transaction uuid := gen_random_uuid();
  v_secured bigint;
  v_deposit bigint;
  v_refunded bigint;
  v_agreement public.agreements;
begin
  select deposit_minor into strict v_deposit
    from public.agreement_versions where id=p_agreement.current_version_id;
  select coalesce(sum(secured_minor),0) into v_secured
    from public.contributions where agreement_id=p_agreement.id;
  if v_secured <> v_deposit or exists (
    select 1 from public.contributions
    where agreement_id=p_agreement.id and
      (secured_minor <> amount_minor or state not in ('secured','refund_pending'))
  ) then
    return pact_private.funding_error('funding_incomplete');
  end if;
  if p_deduction < 0 or p_deduction > v_secured then
    return pact_private.funding_error('validation_failed');
  end if;
  if (select coalesce(sum(share_bps),0) from public.version_participants
      where version_id=p_agreement.current_version_id) <> 10000 or
     (select count(*) from public.version_participants
      where version_id=p_agreement.current_version_id) <>
     (select count(*) from public.contributions where agreement_id=p_agreement.id) then
    raise exception 'settlement_snapshot_mismatch' using errcode='23514';
  end if;

  insert into public.settlements(
    agreement_id,currency,operation_id,reason,proposal_id,reviewer_decision_id,
    secured_minor,owner_minor,refunded_minor
  ) values (
    p_agreement.id,p_agreement.currency,p_operation_id,p_reason,p_proposal,p_reviewer_decision,
    v_secured,p_deduction,v_secured-p_deduction
  ) returning id into v_settlement;

  with shares as (
    select c.id as contribution_id,v.participant_id,c.secured_minor,v.share_bps,
      (p_deduction::bigint*v.share_bps)/10000 as base_minor,
      (p_deduction::bigint*v.share_bps)%10000 as remainder
    from public.contributions c
    join public.version_participants v
      on v.version_id=c.version_id and v.participant_id=c.participant_id
    where c.agreement_id=p_agreement.id
  ), ranked as (
    select *,row_number() over(order by remainder desc,participant_id) as position,
      p_deduction-sum(base_minor) over() as extra_minor
    from shares
  )
  insert into public.settlement_allocations(
    agreement_id,settlement_id,contribution_id,secured_minor,deducted_minor,refunded_minor
  )
  select p_agreement.id,v_settlement,contribution_id,secured_minor,
    base_minor+case when position<=extra_minor then 1 else 0 end,
    secured_minor-(base_minor+case when position<=extra_minor then 1 else 0 end)
  from ranked;

  if exists (
    select 1 from public.settlement_allocations
    where settlement_id=v_settlement and deducted_minor>secured_minor
  ) then raise exception 'settlement_allocation_exceeds_contribution' using errcode='23514'; end if;

  update public.contributions c set
    deducted_minor=a.deducted_minor,
    refunded_minor=a.refunded_minor,
    state=case
      when a.refunded_minor=0 then 'allocated_to_owner'::public.contribution_state
      when a.deducted_minor=0 then 'refunded'::public.contribution_state
      else 'partially_refunded'::public.contribution_state
    end
  from public.settlement_allocations a
  where a.settlement_id=v_settlement and c.id=a.contribution_id;

  v_refunded := v_secured-p_deduction;
  insert into public.ledger_transactions(
    id,agreement_id,currency,operation_id,kind,settlement_id
  ) values(v_transaction,p_agreement.id,p_agreement.currency,p_operation_id,'settlement',v_settlement);
  insert into public.ledger_entries(
    agreement_id,transaction_id,currency,account,contribution_id,amount_minor
  )
  select p_agreement.id,v_transaction,p_agreement.currency,
    'restricted_deposit'::public.ledger_account,null::uuid,-v_secured
  union all
  select p_agreement.id,v_transaction,p_agreement.currency,
    'borrower_refund'::public.ledger_account,a.contribution_id,a.refunded_minor
  from public.settlement_allocations a
  where a.settlement_id=v_settlement and a.refunded_minor>0
  union all
  select p_agreement.id,v_transaction,p_agreement.currency,
    'owner_allocation'::public.ledger_account,null::uuid,p_deduction
  where p_deduction>0;

  if p_dispute is not null then
    update public.disputes set state='resolved',resolved_at=clock_timestamp()
      where id=p_dispute and agreement_id=p_agreement.id and state<>'resolved';
    update public.review_cases set state='resolved',resolved_at=clock_timestamp()
      where agreement_id=p_agreement.id and dispute_id=p_dispute and state<>'resolved';
  end if;
  update public.agreements set state='completed',completed_at=clock_timestamp()
    where id=p_agreement.id returning * into v_agreement;
  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(p_agreement.id,p_actor,p_operation_id,'agreement_settled',jsonb_build_object(
      'settlementId',v_settlement,'reason',p_reason,'securedMinor',v_secured,
      'deductedMinor',p_deduction,'refundedMinor',v_refunded,
      'proposalId',p_proposal,'reviewerDecisionId',p_reviewer_decision
    ));
  insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
    select p_agreement.id,recipients.user_id,'agreement_settled',
      'settlement:'||v_settlement::text,
      case when p_deduction=0 then 'The deposit was fully refunded.'
        else 'The deposit was settled with a recorded deduction and proportional refunds.' end
    from (
      select p_agreement.owner_id as user_id
      union
      select p.user_id from public.participants p
        where p.agreement_id=p_agreement.id and p.removed_at is null and p.user_id is not null
    ) recipients
    on conflict (recipient_id,deduplication_key) do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreement',pact_private.agreement_summary(v_agreement),'operationId',p_operation_id
  ));
end $$;

create function public.approve_full_refund(p_input jsonb) returns jsonb
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
  v_dispute uuid;
begin
  if actor is null then return pact_private.funding_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['agreementId','expectedRevision','idempotencyKey']) or
    p_input-array['agreementId','expectedRevision','idempotencyKey']<>'{}'::jsonb or
    exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string') or
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
  if a.owner_id<>actor then return pact_private.funding_error('not_authorized'); end if;
  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='approveFullRefund' and idempotency_key=v_key;
  if found then
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  if a.state='completed' then return pact_private.funding_error('already_processed'); end if;
  if a.revision<>v_revision then return pact_private.funding_error('stale_revision'); end if;
  if a.state<>'inspecting' or a.handover_at is null or a.returned_at is null then
    return pact_private.funding_error('invalid_state');
  end if;
  select id into v_dispute from public.disputes
    where agreement_id=a.id and created_at<a.inspection_deadline limit 1;
  if v_dispute is not null then return pact_private.funding_error('claim_open'); end if;
  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'approveFullRefund',v_key,v_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='approveFullRefund' and idempotency_key=v_key;
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  v_result:=pact_private.post_agreement_settlement(a,op_id,actor,'early_refund',0);
  if v_result->>'ok'<>'true' then
    update public.operation_requests set status='failed',result=v_result,
      completed_at=clock_timestamp() where id=op_id;
    return v_result;
  end if;
  update public.operation_requests set status='succeeded',result=v_result,completed_at=clock_timestamp()
    where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

create function public.settle_agreement(p_input jsonb) returns jsonb
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
  v_kind text;
  v_proposal uuid;
  v_case uuid;
  v_dispute uuid;
  v_deduction bigint;
  v_decision uuid;
  v_reason text;
  v_result jsonb;
begin
  if actor is null then return pact_private.funding_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' then
    return pact_private.funding_error('validation_failed');
  end if;
  v_kind:=p_input->>'kind';
  if v_kind='proposal' then
    if p_input-array['agreementId','expectedRevision','idempotencyKey','kind','proposalId']<>'{}'::jsonb
      or not (p_input ?& array['agreementId','expectedRevision','idempotencyKey','kind','proposalId'])
      or exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string') then
      return pact_private.funding_error('validation_failed');
    end if;
    v_proposal:=(p_input->>'proposalId')::uuid;
  elsif v_kind='reviewer_decision' then
    if p_input-array['agreementId','expectedRevision','idempotencyKey','kind','caseId']<>'{}'::jsonb
      or not (p_input ?& array['agreementId','expectedRevision','idempotencyKey','kind','caseId'])
      or exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string') then
      return pact_private.funding_error('validation_failed');
    end if;
    v_case:=(p_input->>'caseId')::uuid;
  else
    return pact_private.funding_error('validation_failed');
  end if;
  if (p_input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_agreement:=(p_input->>'agreementId')::uuid;
  v_revision:=(p_input->>'expectedRevision')::bigint;
  v_key:=p_input->>'idempotencyKey';
  v_hash:=encode(sha256(convert_to(jsonb_build_object('agreementId',v_agreement,
    'expectedRevision',v_revision::text,'kind',v_kind,
    'proposalId',v_proposal,'caseId',v_case)::text,'UTF8')),'hex');
  select * into a from public.agreements where id=v_agreement for update;
  if not found then return pact_private.funding_error('not_authorized'); end if;
  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='settleAgreement' and idempotency_key=v_key;
  if found then
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  if a.state='completed' then return pact_private.funding_error('already_processed'); end if;
  if a.revision<>v_revision then return pact_private.funding_error('stale_revision'); end if;
  if a.state not in ('disputed','settling') then return pact_private.funding_error('invalid_state'); end if;

  if v_kind='proposal' then
    if not (a.owner_id=actor or exists(select 1 from public.participants p
      where p.agreement_id=a.id and p.user_id=actor and p.removed_at is null)) then
      return pact_private.funding_error('not_authorized');
    end if;
    select d.id,s.deduction_minor into v_dispute,v_deduction
      from public.settlement_proposals s join public.disputes d on d.id=s.dispute_id
      where s.id=v_proposal and s.agreement_id=a.id and
        d.current_proposal_id=s.id and d.state='negotiating';
    if not found then return pact_private.funding_error('invalid_state'); end if;
    if exists(select 1 from public.disputes d where d.id=v_dispute and
      v_deduction>d.requested_minor) then return pact_private.funding_error('invalid_state'); end if;
    if exists(
      select 1 from (
        select a.owner_id as actor_id
        union
          select p.user_id from public.version_participants v
            join public.participants p on p.id=v.participant_id
            where v.version_id=a.current_version_id and p.removed_at is null
              and p.user_id is not null
      ) people left join public.proposal_acceptances pa
        on pa.proposal_id=v_proposal and pa.actor_id=people.actor_id
      where pa.decision is distinct from 'accepted'
    ) then return pact_private.funding_error('acceptances_required'); end if;
    v_reason:='unanimous_proposal';
  else
    select d.id,rd.id,rd.deduction_minor into v_dispute,v_decision,v_deduction
      from public.review_cases rc
      join public.reviewer_decisions rd on rd.case_id=rc.id
      left join public.disputes d on d.id=rc.dispute_id
      join public.reviewer_grants g on g.user_id=rd.reviewer_id
      where rc.id=v_case and rc.agreement_id=a.id and rd.kind='financial'
        and rd.reviewer_id=actor and rc.assigned_reviewer_id=actor
        and rc.state<>'resolved' and g.revoked_at is null;
    if not found then return pact_private.funding_error('not_authorized'); end if;
    if exists(select 1 from public.agreements where id=a.id and owner_id=actor)
      or exists(select 1 from public.participants where agreement_id=a.id and user_id=actor) then
      return pact_private.funding_error('not_authorized');
    end if;
    if v_dispute is null then return pact_private.funding_error('invalid_state'); end if;
    v_reason:='reviewer_decision';
  end if;

  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'settleAgreement',v_key,v_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='settleAgreement' and idempotency_key=v_key;
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  v_result:=pact_private.post_agreement_settlement(
    a,op_id,actor,v_reason,v_deduction,v_proposal,v_decision,v_dispute
  );
  if v_result->>'ok'<>'true' then
    update public.operation_requests set status='failed',result=v_result,
      completed_at=clock_timestamp() where id=op_id;
    return v_result;
  end if;
  update public.operation_requests set status='succeeded',result=v_result,completed_at=clock_timestamp()
    where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

create function public.process_due_inspections(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit integer;
  v_key text;
  v_hash text;
  op public.operation_requests;
  op_id uuid;
  v_job uuid;
  a public.agreements;
  expiry_op_id uuid;
  v_result jsonb;
  v_count integer:=0;
  v_more boolean;
begin
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['batchSize','idempotencyKey']) or
    p_input-array['batchSize','idempotencyKey']<>'{}'::jsonb or
    jsonb_typeof(p_input->'batchSize')<>'number' or (p_input->>'batchSize') !~ '^[0-9]+$' or
    jsonb_typeof(p_input->'idempotencyKey')<>'string' or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.funding_error('validation_failed');
  end if;
  v_limit:=(p_input->>'batchSize')::integer;
  v_key:=p_input->>'idempotencyKey';
  if v_limit not between 1 and 100 then return pact_private.funding_error('validation_failed'); end if;
  v_hash:=encode(sha256(convert_to(v_limit::text,'UTF8')),'hex');
  insert into public.operation_requests(actor_scope,operation,idempotency_key,payload_hash)
    values('scheduler:inspection_expiry','processDueInspections',v_key,v_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests
      where actor_scope='scheduler:inspection_expiry'
        and operation='processDueInspections' and idempotency_key=v_key;
    if op.payload_hash<>v_hash then return pact_private.funding_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  insert into public.job_runs(job_name,scheduled_for)
    values('process_due_inspections',clock_timestamp()) returning id into v_job;
  begin
    for a in
      select * from public.agreements g
      where g.state='inspecting' and g.inspection_deadline<=clock_timestamp()
        and not exists(select 1 from public.disputes d where d.agreement_id=g.id
          and d.created_at<g.inspection_deadline)
      order by g.id limit v_limit for update skip locked
    loop
      insert into public.operation_requests(
        agreement_id,actor_scope,operation,idempotency_key,payload_hash
      ) values(a.id,'scheduler:inspection_expiry','inspectionExpiry',
        'inspection:'||a.id::text,
        encode(sha256(convert_to(a.id::text,'UTF8')),'hex'))
      on conflict(actor_scope,operation,idempotency_key) do nothing returning id into expiry_op_id;
      if expiry_op_id is null then
        raise exception 'inspection_expiry_operation_conflict' using errcode='P0001';
      end if;
      v_result:=pact_private.post_agreement_settlement(
        a,expiry_op_id,null,'inspection_expired',0
      );
      if v_result->>'ok'<>'true' then
        raise exception 'inspection_expiry_settlement_failed' using errcode='P0001';
      end if;
      update public.operation_requests set status='succeeded',result=v_result,
        completed_at=clock_timestamp() where id=expiry_op_id;
      v_count:=v_count+1;
    end loop;
  exception
    when serialization_failure or deadlock_detected then raise;
    when others then
      v_result:=pact_private.funding_error('temporarily_unavailable',true);
      update public.job_runs set status='failed',finished_at=clock_timestamp(),
        error_code='inspection_worker_failed' where id=v_job;
      update public.operation_requests set status='failed',result=v_result,
        completed_at=clock_timestamp() where id=op_id;
      return v_result;
  end;
  select exists(
    select 1 from public.agreements g
    where g.state='inspecting' and g.inspection_deadline<=clock_timestamp()
      and not exists(select 1 from public.disputes d where d.agreement_id=g.id
        and d.created_at<g.inspection_deadline)
  ) into v_more;
  update public.job_runs set status='succeeded',finished_at=clock_timestamp(),
    processed_count=v_count where id=v_job;
  v_result:=jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'jobRunId',v_job,'processedCount',v_count,'hasMore',v_more
  ));
  update public.operation_requests set status='succeeded',result=v_result,
    completed_at=clock_timestamp() where id=op_id;
  return v_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.funding_error('validation_failed');
end $$;

revoke all on function pact_private.post_agreement_settlement(
  public.agreements,uuid,uuid,text,bigint,uuid,uuid,uuid
) from public,anon,authenticated,service_role;
revoke all on function public.approve_full_refund(jsonb),public.settle_agreement(jsonb),
  public.process_due_inspections(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.approve_full_refund(jsonb),public.settle_agreement(jsonb)
  to authenticated;
grant execute on function public.process_due_inspections(jsonb) to service_role;

commit;
