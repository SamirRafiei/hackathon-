-- Authenticated agreement setup, invitation claim, and exact-version acceptance.
-- All writes happen inside one database transaction per RPC. Invitations store
-- only a SHA-256 hash; the raw capability is returned once to the owner.
begin;

create function pact_private.agreement_error(code text) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('ok',false,'error',jsonb_build_object(
    'code',code,'message',replace(code,'_',' '),'retryable',false));
$$;

create function public.ensure_profile(p_display_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  email text;
  display_name text;
begin
  if actor is null then return pact_private.agreement_error('not_authenticated'); end if;
  select lower(u.email) into email from auth.users u
    where u.id=actor and u.email_confirmed_at is not null;
  if email is null then return pact_private.agreement_error('verified_email_required'); end if;
  display_name := coalesce(nullif(btrim(p_display_name),''),split_part(email,'@',1));
  if length(display_name) not between 1 and 100 then
    return pact_private.agreement_error('validation_failed');
  end if;
  insert into public.profiles(id,display_name) values(actor,display_name)
    on conflict(id) do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object('profileId',actor));
end $$;

create function public.create_agreement(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  owner_profile public.profiles;
  a public.agreements;
  v public.agreement_versions;
  p public.participants;
  op public.operation_requests;
  op_id uuid;
  token text;
  key text;
  email text;
  owner_email text;
  owner_email_verified timestamptz;
  title text;
  address text;
  terms text;
  asset_type text;
  amount bigint;
  starts date;
  due date;
  payload_hash text;
  response_result jsonb;
begin
  if actor is null then return pact_private.agreement_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['assetType','title','address','tenantEmail','startDate','endDate','amountMinor','terms','idempotencyKey']) or
    p_input-array['assetType','title','address','tenantEmail','startDate','endDate','amountMinor','terms','idempotencyKey']<>'{}'::jsonb or
    exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string') then
    return pact_private.agreement_error('validation_failed');
  end if;
  asset_type := p_input->>'assetType';
  title := btrim(p_input->>'title');
  address := btrim(p_input->>'address');
  terms := btrim(p_input->>'terms');
  email := lower(btrim(p_input->>'tenantEmail'));
  key := p_input->>'idempotencyKey';
  if asset_type not in ('APARTMENT','EQUIPMENT') or length(title) not between 1 and 200 or
    length(address) not between 1 and 240 or length(terms) not between 10 and 20000 or
    email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
    (p_input->>'amountMinor') !~ '^[0-9]+$' or
    (p_input->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$' or
    (p_input->>'endDate') !~ '^\d{4}-\d{2}-\d{2}$' or
    length(key) not between 1 and 200 then
    return pact_private.agreement_error('validation_failed');
  end if;
  amount := (p_input->>'amountMinor')::bigint;
  starts := (p_input->>'startDate')::date;
  due := (p_input->>'endDate')::date;
  if amount not between 100 and 100000000 or due<=starts then
    return pact_private.agreement_error('validation_failed');
  end if;
  select * into owner_profile from public.profiles where id=actor;
  if not found then return pact_private.agreement_error('profile_required'); end if;
  select lower(u.email),u.email_confirmed_at into owner_email,owner_email_verified
    from auth.users u where u.id=actor;
  if owner_email_verified is null or owner_email=email then
    return pact_private.agreement_error('verified_email_required');
  end if;

  payload_hash := encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('user:'||actor::text||':createAgreement:'||key,0));
  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='createAgreement' and idempotency_key=key;
  if found then
    if op.payload_hash<>payload_hash then return pact_private.agreement_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  insert into public.agreements(owner_id,currency,state) values(actor,'EUR','draft') returning * into a;
  insert into public.participants(agreement_id,email,share_bps,allocated_minor)
    values(a.id,email,10000,amount) returning * into p;
  insert into public.agreement_versions(agreement_id,owner_id,version_number,currency,deposit_minor,
    item_name,item_description,terms,condition_requirements,starts_at,due_at)
    values(a.id,actor,1,'EUR',amount,title,
      jsonb_build_object('assetType',asset_type,'location',address)::text,terms,'{}',
      starts::timestamp at time zone 'UTC',due::timestamp at time zone 'UTC') returning * into v;
  insert into public.version_participants(agreement_id,version_id,participant_id,email,share_bps,allocated_minor)
    values(a.id,v.id,p.id,email,10000,amount);
  update public.agreements set current_version_id=v.id,state='awaiting_acceptance' where id=a.id returning * into a;
  insert into public.acceptances(agreement_id,version_id,actor_id) values(a.id,v.id,actor);
  insert into public.contributions(agreement_id,version_id,participant_id,currency,amount_minor)
    values(a.id,v.id,p.id,a.currency,amount);
  token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.invitations(agreement_id,version_id,participant_id,token_hash)
    values(a.id,v.id,p.id,encode(sha256(convert_to(token,'UTF8')),'hex'));
  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'createAgreement',key,payload_hash) returning id into op_id;
  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(a.id,actor,op_id,'agreement_created',jsonb_build_object('versionId',v.id,'participantCount',1));
  response_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreementId',a.id,'versionId',v.id,'revision',a.revision::text,
    'invitationToken',token,'invitationExpiresAt',now()+interval '24 hours'));
  update public.operation_requests set status='succeeded',result=response_result,completed_at=clock_timestamp() where id=op_id;
  return response_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.agreement_error('validation_failed');
end $$;

create function public.claim_invitation(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  verified_email text;
  key text;
  token text;
  v_token_hash text;
  invitation public.invitations;
  p public.participants;
  a public.agreements;
  op public.operation_requests;
  op_id uuid;
  payload_hash text;
  response_result jsonb;
begin
  if actor is null then return pact_private.agreement_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['invitationToken','idempotencyKey']) or
    p_input-array['invitationToken','idempotencyKey']<>'{}'::jsonb or
    jsonb_typeof(p_input->'invitationToken')<>'string' or jsonb_typeof(p_input->'idempotencyKey')<>'string' or
    length(p_input->>'invitationToken') not between 32 and 128 or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.agreement_error('validation_failed');
  end if;
  token := p_input->>'invitationToken'; key := p_input->>'idempotencyKey';
  select lower(email) into verified_email from auth.users where id=actor and email_confirmed_at is not null;
  if verified_email is null or not exists(select 1 from public.profiles where id=actor) then
    return pact_private.agreement_error('verified_email_required');
  end if;
  v_token_hash := encode(sha256(convert_to(token,'UTF8')),'hex');
  payload_hash := encode(sha256(convert_to(jsonb_build_object('invitationTokenHash',v_token_hash)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('user:'||actor::text||':claimInvitation:'||key,0));
  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='claimInvitation' and idempotency_key=key;
  if found then
    if op.payload_hash<>payload_hash then return pact_private.agreement_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  select i.* into invitation from public.invitations i where i.token_hash=v_token_hash for update;
  if not found or invitation.expires_at<=clock_timestamp() or
    invitation.claimed_at is not null or invitation.revoked_at is not null then
    return pact_private.agreement_error('invitation_invalid');
  end if;
  select * into p from public.participants where id=invitation.participant_id for update;
  if p.email<>verified_email or p.user_id is not null then
    return pact_private.agreement_error('invitation_invalid');
  end if;
  select * into a from public.agreements where id=invitation.agreement_id for update;
  if a.current_version_id<>invitation.version_id or a.state<>'awaiting_acceptance' then
    return pact_private.agreement_error('invitation_invalid');
  end if;
  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'claimInvitation',key,payload_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='claimInvitation' and idempotency_key=key;
    if op.payload_hash<>payload_hash then return pact_private.agreement_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  update public.participants set user_id=actor,joined_at=clock_timestamp() where id=p.id;
  update public.invitations set claimed_by=actor,claimed_at=clock_timestamp() where id=invitation.id;
  update public.agreements set updated_at=clock_timestamp() where id=a.id returning * into a;
  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(a.id,actor,op_id,'invitation_claimed',jsonb_build_object('participantId',p.id,'versionId',invitation.version_id));
  insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
    values(a.id,a.owner_id,'invitation_claimed','invitation:'||invitation.id::text,'The invited renter joined the agreement.')
    on conflict(recipient_id,deduplication_key) do nothing;
  response_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreementId',a.id,'versionId',invitation.version_id,'participantId',p.id,'revision',a.revision::text));
  update public.operation_requests set status='succeeded',result=response_result,completed_at=clock_timestamp() where id=op_id;
  return response_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.agreement_error('validation_failed');
end $$;

create function public.accept_agreement_version(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  a public.agreements;
  op public.operation_requests;
  op_id uuid;
  agreement_id uuid;
  target_version_id uuid;
  revision bigint;
  key text;
  payload_hash text;
  response_result jsonb;
begin
  if actor is null then return pact_private.agreement_error('not_authenticated'); end if;
  if p_input is null or jsonb_typeof(p_input)<>'object' or
    not (p_input ?& array['agreementId','versionId','expectedRevision','idempotencyKey']) or
    p_input-array['agreementId','versionId','expectedRevision','idempotencyKey']<>'{}'::jsonb or
    exists(select 1 from jsonb_each(p_input) e where jsonb_typeof(e.value)<>'string') or
    (p_input->>'expectedRevision') !~ '^(0|[1-9][0-9]*)$' or
    length(p_input->>'idempotencyKey') not between 1 and 200 then
    return pact_private.agreement_error('validation_failed');
  end if;
  agreement_id := (p_input->>'agreementId')::uuid;
  target_version_id := (p_input->>'versionId')::uuid;
  revision := (p_input->>'expectedRevision')::bigint;
  key := p_input->>'idempotencyKey';
  select * into a from public.agreements where id=agreement_id for update;
  if not found then return pact_private.agreement_error('not_authorized'); end if;
  if not exists(select 1 from public.profiles where id=actor) or not exists(
    select 1 from auth.users where id=actor and email_confirmed_at is not null) then
    return pact_private.agreement_error('verified_email_required');
  end if;
  if a.owner_id<>actor and not exists(select 1 from public.participants member
      where member.agreement_id=a.id and member.user_id=actor
        and member.removed_at is null and member.joined_at is not null) then
    return pact_private.agreement_error('not_authorized');
  end if;
  payload_hash := encode(sha256(convert_to(jsonb_build_object('agreementId',agreement_id,
    'versionId',target_version_id,'expectedRevision',revision::text)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('user:'||actor::text||':acceptAgreementVersion:'||key,0));
  select * into op from public.operation_requests where actor_scope='user:'||actor::text
    and operation='acceptAgreementVersion' and idempotency_key=key;
  if found then
    if op.payload_hash<>payload_hash then return pact_private.agreement_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  if a.current_version_id<>target_version_id then return pact_private.agreement_error('stale_version'); end if;
  if a.revision<>revision then return pact_private.agreement_error('stale_revision'); end if;
  if a.state<>'awaiting_acceptance' then return pact_private.agreement_error('invalid_state'); end if;
  insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
    values(a.id,actor,'user:'||actor::text,'acceptAgreementVersion',key,payload_hash)
    on conflict(actor_scope,operation,idempotency_key) do nothing returning id into op_id;
  if op_id is null then
    select * into strict op from public.operation_requests where actor_scope='user:'||actor::text
      and operation='acceptAgreementVersion' and idempotency_key=key;
    if op.payload_hash<>payload_hash then return pact_private.agreement_error('idempotency_conflict'); end if;
    return op.result||jsonb_build_object('replayed',true);
  end if;
  insert into public.acceptances(agreement_id,version_id,actor_id) values(a.id,target_version_id,actor)
    on conflict(version_id,actor_id) do nothing;
  if exists(select 1 from public.participants p where p.agreement_id=a.id and p.removed_at is null
      and (p.user_id is null or p.joined_at is null or not exists(select 1 from public.acceptances ac
        where ac.version_id=target_version_id and ac.actor_id=p.user_id))) then
    -- Keep awaiting acceptance until every invited participant has joined and accepted.
    update public.agreements set updated_at=clock_timestamp() where id=a.id returning * into a;
  else
    update public.agreements set state='awaiting_funding',updated_at=clock_timestamp()
      where id=a.id returning * into a;
  end if;
  insert into public.audit_events(agreement_id,actor_id,operation_id,action,metadata)
    values(a.id,actor,op_id,'agreement_version_accepted',jsonb_build_object('versionId',target_version_id));
  insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
    select a.id,p.user_id,'version_accepted','acceptance:'||target_version_id::text||':'||actor::text,
      'A party accepted the current agreement terms.' from public.participants p
    where p.agreement_id=a.id and p.user_id is not null and p.user_id<>actor and p.removed_at is null
    on conflict(recipient_id,deduplication_key) do nothing;
  response_result := jsonb_build_object('ok',true,'replayed',false,'data',jsonb_build_object(
    'agreement',pact_private.agreement_summary(a),'operationId',op_id));
  update public.operation_requests set status='succeeded',result=response_result,completed_at=clock_timestamp() where id=op_id;
  return response_result;
exception when invalid_text_representation or numeric_value_out_of_range then
  return pact_private.agreement_error('validation_failed');
end $$;

revoke all on function pact_private.agreement_error(text), public.create_agreement(jsonb),
  public.ensure_profile(text), public.claim_invitation(jsonb),
  public.accept_agreement_version(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.create_agreement(jsonb), public.claim_invitation(jsonb),
  public.accept_agreement_version(jsonb) to authenticated;

commit;
