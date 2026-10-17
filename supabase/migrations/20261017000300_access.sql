begin;

-- Definer helpers avoid recursive membership RLS. They derive identity from the
-- verified JWT via auth.uid(), never from a caller-supplied user ID.
create function pact_private.is_member(p_agreement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.agreements a where a.id = p_agreement and a.owner_id = auth.uid()) or
    exists (select 1 from public.participants p where p.agreement_id = p_agreement and
      p.user_id = auth.uid() and p.removed_at is null)
  );
$$;
create function pact_private.is_assigned_reviewer(p_agreement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and
    exists (select 1 from public.review_cases c join public.reviewer_grants g on g.user_id = c.assigned_reviewer_id
      where c.agreement_id = p_agreement and g.user_id = auth.uid() and g.revoked_at is null) and
    not exists (select 1 from public.agreements a where a.id = p_agreement and a.owner_id = auth.uid()) and
    not exists (select 1 from public.participants p where p.agreement_id = p_agreement and p.user_id = auth.uid());
$$;
create function pact_private.can_read_agreement(p_agreement uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select pact_private.is_member(p_agreement) or pact_private.is_assigned_reviewer(p_agreement);
$$;
create function pact_private.can_read_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or exists (
    select 1 from public.agreements a where pact_private.can_read_agreement(a.id) and
      (a.owner_id = p_user or exists (select 1 from public.participants p where
        p.agreement_id = a.id and p.user_id = p_user and p.removed_at is null))
  );
$$;
create function pact_private.can_read_evidence(p_evidence uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e where e.id = p_evidence and
    ((e.submitted_at is not null and pact_private.can_read_agreement(e.agreement_id)) or
     (e.uploader_id = auth.uid() and pact_private.can_read_agreement(e.agreement_id))));
$$;
create function pact_private.can_write_evidence_object(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e where e.object_path = p_path and
    e.submitted_at is null and e.uploader_id = auth.uid() and
    pact_private.can_read_agreement(e.agreement_id));
$$;
create function pact_private.can_read_evidence_object(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.evidence_files e where e.object_path = p_path and
    pact_private.can_read_evidence(e.id));
$$;

-- Revoke Supabase's default grants explicitly, including service_role writes.
-- Future mutations are narrow, authenticated RPCs; service_role is not an app DAL.
do $$
declare t text;
begin
  foreach t in array array['profiles','reviewer_grants','agreements','participants',
    'agreement_versions','version_participants','invitations','change_requests',
    'acceptances','operation_requests','contributions','payment_attempts',
    'exchange_events','verification_challenges','disputes','review_cases',
    'evidence_requests','evidence_files','exchange_evidence','dispute_evidence','settlement_proposals',
    'proposal_acceptances','reviewer_decisions','decision_evidence','settlements',
    'settlement_allocations','ledger_transactions','ledger_entries','audit_events',
    'notifications','job_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['participants','agreement_versions','version_participants',
    'change_requests','acceptances','contributions','payment_attempts','exchange_events',
    'disputes','review_cases','evidence_requests','exchange_evidence','dispute_evidence','settlement_proposals',
    'proposal_acceptances','reviewer_decisions','decision_evidence','settlements',
    'settlement_allocations','ledger_transactions','ledger_entries','audit_events'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy agreement_read on public.%I for select to authenticated using (pact_private.can_read_agreement(agreement_id))', t);
  end loop;
end $$;

grant select on public.agreements, public.profiles, public.evidence_files, public.notifications to authenticated;
create policy agreement_read on public.agreements for select to authenticated
  using (pact_private.can_read_agreement(id));
create policy profile_read on public.profiles for select to authenticated
  using (pact_private.can_read_profile(id));
-- Safe, column-limited self-service fields. No reviewer flags or financial fields.
grant insert (id, display_name), update (display_name) on public.profiles to authenticated;
create policy profile_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy evidence_read on public.evidence_files for select to authenticated
  using (pact_private.can_read_evidence(id));
create policy notification_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and pact_private.is_member(agreement_id));
grant update (read_at) on public.notifications to authenticated;
create policy notification_mark_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and pact_private.is_member(agreement_id))
  with check (recipient_id = (select auth.uid()) and pact_private.is_member(agreement_id));

-- No grants/policies for invitations, challenge secrets, reviewer grants,
-- operation payloads/results, or job telemetry. Expose sanitized RPC results later.
-- Trigger/helper functions are private; only identity-bound RLS predicates may execute.
revoke all on all functions in schema pact_private from public, anon, authenticated, service_role;
grant usage on schema pact_private to authenticated;
grant execute on function pact_private.is_member(uuid),
  pact_private.is_assigned_reviewer(uuid), pact_private.can_read_agreement(uuid),
  pact_private.can_read_profile(uuid), pact_private.can_read_evidence(uuid),
  pact_private.can_write_evidence_object(text), pact_private.can_read_evidence_object(text)
  to authenticated;
alter default privileges in schema pact_private revoke execute on functions from public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pact-evidence', 'pact-evidence', false, 10000000,
  array['image/jpeg','image/png','image/webp','application/pdf']);
create policy pact_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'pact-evidence' and pact_private.can_read_evidence_object(name));
create policy pact_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'pact-evidence' and pact_private.can_write_evidence_object(name));
create policy pact_evidence_remove_draft on storage.objects for delete to authenticated
  using (bucket_id = 'pact-evidence' and pact_private.can_write_evidence_object(name));
-- No UPDATE policy: uploads use fresh UUID paths, never overwrite/upsert.
commit;
