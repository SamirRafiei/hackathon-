-- PACT schema v1. Apply as postgres through Supabase migrations.
-- No public mutation RPCs are enabled in Stage 1.
begin;

create schema if not exists pact_private;
revoke all on schema pact_private from public, anon, authenticated;

create type public.pact_currency as enum ('EUR', 'USD', 'GBP');
create type public.agreement_state as enum (
  'draft', 'awaiting_acceptance', 'awaiting_funding', 'ready_for_handover',
  'active', 'return_requested', 'inspecting', 'disputed', 'settling',
  'completed', 'cancelling', 'cancelled'
);
create type public.contribution_state as enum (
  'awaiting_payment', 'processing', 'secured', 'failed', 'refund_pending',
  'refunded', 'partially_refunded', 'allocated_to_owner'
);
create type public.dispute_state as enum ('negotiating', 'in_review', 'awaiting_evidence', 'resolved');
create type public.evidence_phase as enum ('item', 'collection', 'return', 'dispute');
create type public.review_reason as enum ('overdue_return', 'unacknowledged_return', 'negotiation_expired');
create type public.ledger_account as enum ('simulated_source', 'restricted_deposit', 'borrower_refund', 'owner_allocation');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.reviewer_grants (
  user_id uuid primary key references public.profiles(id),
  granted_by uuid not null references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz check (revoked_at >= granted_at)
);
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  currency public.pact_currency not null,
  state public.agreement_state not null default 'draft',
  current_version_id uuid,
  revision bigint not null default 0 check (revision >= 0),
  terms_frozen_at timestamptz,
  handover_at timestamptz,
  return_requested_at timestamptz,
  returned_at timestamptz,
  inspection_deadline timestamptz,
  overdue_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, currency),
  unique (id, owner_id),
  check ((returned_at is null and inspection_deadline is null) or
    (returned_at is not null and inspection_deadline is not null and
     inspection_deadline = returned_at + interval '24 hours')),
  check (returned_at is null or handover_at is not null),
  check (state = 'draft' or current_version_id is not null),
  check (state not in ('active', 'return_requested', 'inspecting', 'disputed', 'settling', 'completed') or handover_at is not null),
  check (state not in ('inspecting', 'disputed', 'settling', 'completed') or returned_at is not null),
  check (state <> 'completed' or completed_at is not null),
  check (state <> 'cancelled' or cancelled_at is not null)
);
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  user_id uuid references public.profiles(id),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  share_bps integer not null check (share_bps between 1 and 10000),
  allocated_minor bigint not null check (allocated_minor between 1 and 100000000),
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, id),
  check ((user_id is null) = (joined_at is null))
);
create unique index participants_active_email on public.participants(agreement_id, email) where removed_at is null;
create unique index participants_active_user on public.participants(agreement_id, user_id) where removed_at is null;
create index participants_user on public.participants(user_id, agreement_id) where removed_at is null;

create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  owner_id uuid not null,
  version_number integer not null check (version_number > 0),
  currency public.pact_currency not null,
  deposit_minor bigint not null check (deposit_minor between 1 and 100000000),
  rental_fee_minor bigint check (rental_fee_minor between 0 and 100000000),
  item_name text not null check (length(btrim(item_name)) between 1 and 200),
  item_description text not null check (length(item_description) <= 10000),
  item_identifier text,
  accessories jsonb not null default '[]' check (jsonb_typeof(accessories) = 'array'),
  terms text not null check (length(btrim(terms)) between 1 and 20000),
  condition_requirements jsonb not null check (jsonb_typeof(condition_requirements) = 'object'),
  starts_at timestamptz not null,
  due_at timestamptz not null check (due_at > starts_at),
  policy_version text not null default 'pact-v1' check (policy_version = 'pact-v1'),
  inspection_hours integer not null default 24 check (inspection_hours = 24),
  any_borrower_may_exchange boolean not null default true check (any_borrower_may_exchange),
  published_at timestamptz not null default now(),
  created_txid bigint not null default txid_current(),
  unique (agreement_id, id),
  unique (agreement_id, version_number),
  foreign key (agreement_id, currency) references public.agreements(id, currency),
  foreign key (agreement_id, owner_id) references public.agreements(id, owner_id)
);
alter table public.agreements add constraint agreements_current_version_fk
  foreign key (id, current_version_id) references public.agreement_versions(agreement_id, id)
  deferrable initially deferred;
-- Normalized, immutable borrower snapshot. User identity is linked by participant;
-- an invitation can be claimed after publication without changing the snapshot.
create table public.version_participants (
  agreement_id uuid not null,
  version_id uuid not null,
  participant_id uuid not null,
  email text not null check (email = lower(btrim(email))),
  share_bps integer not null check (share_bps between 1 and 10000),
  allocated_minor bigint not null check (allocated_minor between 1 and 100000000),
  primary key (version_id, participant_id),
  unique (version_id, email),
  unique (agreement_id, version_id, participant_id),
  foreign key (agreement_id, version_id) references public.agreement_versions(agreement_id, id),
  foreign key (agreement_id, participant_id) references public.participants(agreement_id, id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  version_id uuid not null,
  participant_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  revoked_at timestamptz,
  foreign key (agreement_id, version_id, participant_id) references public.version_participants(agreement_id, version_id, participant_id),
  check (expires_at > created_at),
  check ((claimed_at is null) = (claimed_by is null)),
  check (claimed_at is null or (claimed_at < expires_at and revoked_at is null))
);
create unique index invitations_one_live on public.invitations(participant_id, version_id) where claimed_at is null and revoked_at is null;
create table public.change_requests (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  version_id uuid not null,
  proposed_by uuid not null references public.profiles(id),
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object'),
  reason text not null check (length(btrim(reason)) between 1 and 10000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  response text,
  responded_at timestamptz,
  published_version_id uuid,
  created_at timestamptz not null default now(),
  foreign key (agreement_id, version_id) references public.agreement_versions(agreement_id, id),
  foreign key (agreement_id, published_version_id) references public.agreement_versions(agreement_id, id),
  check ((status = 'pending') = (responded_at is null))
);
create table public.acceptances (
  agreement_id uuid not null,
  version_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  accepted_at timestamptz not null default now(),
  primary key (version_id, actor_id),
  foreign key (agreement_id, version_id) references public.agreement_versions(agreement_id, id)
);

-- Actor scope is user:<uuid> or scheduler:<job name>; never supplied by a browser.
create table public.operation_requests (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid references public.agreements(id),
  actor_id uuid references public.profiles(id),
  actor_scope text not null,
  operation text not null check (length(operation) between 1 and 100),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_scope, operation, idempotency_key),
  unique (agreement_id, id),
  check ((actor_id is not null and actor_scope = 'user:' || actor_id::text) or
    (actor_id is null and actor_scope ~ '^scheduler:[a-z_]+$')),
  check ((status = 'processing' and completed_at is null and result is null) or
    (status <> 'processing' and completed_at is not null and result is not null))
);
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  version_id uuid not null,
  participant_id uuid not null,
  currency public.pact_currency not null,
  amount_minor bigint not null check (amount_minor between 1 and 100000000),
  state public.contribution_state not null default 'awaiting_payment',
  secured_minor bigint not null default 0 check (secured_minor >= 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  deducted_minor bigint not null default 0 check (deducted_minor >= 0),
  created_at timestamptz not null default now(),
  unique (version_id, participant_id),
  unique (agreement_id, id),
  foreign key (agreement_id, version_id, participant_id) references public.version_participants(agreement_id, version_id, participant_id),
  foreign key (agreement_id, currency) references public.agreements(id, currency),
  check (secured_minor in (0, amount_minor)),
  check (refunded_minor + deducted_minor <= secured_minor),
  check (state not in ('awaiting_payment', 'processing', 'failed') or secured_minor = 0),
  check (state not in ('secured', 'refund_pending') or refunded_minor + deducted_minor = 0),
  check (state not in ('secured', 'refund_pending', 'refunded', 'partially_refunded', 'allocated_to_owner') or secured_minor = amount_minor),
  check (state <> 'refunded' or (refunded_minor = secured_minor and deducted_minor = 0)),
  check (state <> 'partially_refunded' or (refunded_minor > 0 and deducted_minor > 0 and refunded_minor + deducted_minor = secured_minor)),
  check (state <> 'allocated_to_owner' or (deducted_minor = secured_minor and refunded_minor = 0))
);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  contribution_id uuid not null,
  operation_id uuid not null unique,
  provider text not null default 'simulated' check (provider = 'simulated'),
  state text not null default 'processing' check (state in ('processing', 'succeeded', 'failed', 'cancelled')),
  due_at timestamptz not null,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (agreement_id, id),
  foreign key (agreement_id, contribution_id) references public.contributions(agreement_id, id),
  foreign key (agreement_id, operation_id) references public.operation_requests(agreement_id, id),
  check ((state = 'processing') = (completed_at is null)),
  check ((state = 'failed') = (failure_code is not null))
);
create unique index payment_attempts_one_processing on public.payment_attempts(contribution_id) where state = 'processing';
create unique index payment_attempts_one_success on public.payment_attempts(contribution_id) where state = 'succeeded';
create index payment_attempts_due on public.payment_attempts(due_at) where state = 'processing';

create table public.exchange_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  phase text not null check (phase in ('collection', 'return')),
  initiated_by uuid not null references public.profiles(id),
  borrower_id uuid references public.profiles(id),
  owner_id uuid not null,
  item_identifier text,
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  borrower_confirmed_at timestamptz,
  owner_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (agreement_id, id),
  foreign key (agreement_id, owner_id) references public.agreements(id, owner_id),
  check (borrower_id is null or borrower_id <> owner_id),
  check (borrower_confirmed_at is null or borrower_id is not null)
);
create unique index exchange_one_completed_phase on public.exchange_events(agreement_id, phase) where owner_confirmed_at is not null and borrower_confirmed_at is not null;
create table public.verification_challenges (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  exchange_event_id uuid not null,
  purpose text not null check (purpose in ('collection', 'return')),
  created_by uuid not null references public.profiles(id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  consumed_by uuid references public.profiles(id),
  foreign key (agreement_id, exchange_event_id) references public.exchange_events(agreement_id, id),
  check (attempts <= max_attempts),
  check (expires_at > created_at and expires_at <= created_at + interval '10 minutes'),
  check ((consumed_at is null) = (consumed_by is null)),
  check (consumed_at is null or consumed_at < expires_at)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null unique references public.agreements(id),
  opened_by uuid not null,
  requested_minor bigint not null check (requested_minor between 0 and 100000000),
  reason text not null check (length(btrim(reason)) between 1 and 10000),
  state public.dispute_state not null default 'negotiating',
  current_proposal_id uuid,
  evidence_missing boolean not null default false,
  created_at timestamptz not null default now(),
  negotiation_deadline timestamptz not null default (now() + interval '24 hours'),
  resolved_at timestamptz,
  unique (agreement_id, id),
  foreign key (agreement_id, opened_by) references public.agreements(id, owner_id),
  check (negotiation_deadline = created_at + interval '24 hours'),
  check ((state = 'resolved') = (resolved_at is not null))
);
create table public.review_cases (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  dispute_id uuid,
  reason public.review_reason not null,
  assigned_reviewer_id uuid references public.reviewer_grants(user_id),
  state text not null default 'open' check (state in ('open', 'awaiting_evidence', 'resolved')),
  next_action text not null check (length(btrim(next_action)) between 1 and 10000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (agreement_id, id),
  unique (agreement_id, reason),
  foreign key (agreement_id, dispute_id) references public.disputes(agreement_id, id),
  check (reason <> 'negotiation_expired' or dispute_id is not null),
  check ((state = 'resolved') = (resolved_at is not null))
);
create index review_cases_assigned on public.review_cases(assigned_reviewer_id, state);
create table public.evidence_requests (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  case_id uuid not null,
  requested_by uuid not null references public.reviewer_grants(user_id),
  explanation text not null check (length(btrim(explanation)) between 1 and 10000),
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  foreign key (agreement_id, case_id) references public.review_cases(agreement_id, id)
);
create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  uploader_id uuid not null references public.profiles(id),
  actual_participant_id uuid references public.profiles(id),
  phase public.evidence_phase not null,
  exchange_event_id uuid,
  dispute_id uuid,
  case_id uuid,
  bucket_id text not null default 'pact-evidence' check (bucket_id = 'pact-evidence'),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes between 1 and 10000000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  caption text check (length(caption) <= 10000),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (agreement_id, id),
  foreign key (agreement_id, exchange_event_id) references public.exchange_events(agreement_id, id),
  foreign key (agreement_id, dispute_id) references public.disputes(agreement_id, id),
  foreign key (agreement_id, case_id) references public.review_cases(agreement_id, id),
  check (object_path = agreement_id::text || '/' || phase::text || '/' || id::text),
  check (mime_type <> 'application/pdf' or phase = 'dispute')
);
-- An owner may prepare claim evidence before a dispute exists. Link the already
-- submitted immutable files when openClaim creates the dispute atomically.
create table public.dispute_evidence (
  agreement_id uuid not null,
  dispute_id uuid not null,
  evidence_id uuid not null,
  primary key (dispute_id, evidence_id),
  foreign key (agreement_id, dispute_id) references public.disputes(agreement_id, id),
  foreign key (agreement_id, evidence_id) references public.evidence_files(agreement_id, id)
);
create table public.exchange_evidence (
  agreement_id uuid not null,
  exchange_event_id uuid not null,
  evidence_id uuid not null,
  primary key (exchange_event_id, evidence_id),
  foreign key (agreement_id, exchange_event_id) references public.exchange_events(agreement_id, id),
  foreign key (agreement_id, evidence_id) references public.evidence_files(agreement_id, id)
);
create table public.settlement_proposals (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  dispute_id uuid not null,
  proposed_by uuid not null references public.profiles(id),
  deduction_minor bigint not null check (deduction_minor between 0 and 100000000),
  reason text not null check (length(btrim(reason)) between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (agreement_id, id),
  unique (dispute_id, id),
  foreign key (agreement_id, dispute_id) references public.disputes(agreement_id, id)
);
alter table public.disputes add constraint disputes_current_proposal_fk
  foreign key (id, current_proposal_id) references public.settlement_proposals(dispute_id, id)
  deferrable initially deferred;
create table public.proposal_acceptances (
  agreement_id uuid not null,
  proposal_id uuid not null,
  actor_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('accepted', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (proposal_id, actor_id),
  foreign key (agreement_id, proposal_id) references public.settlement_proposals(agreement_id, id)
);
create table public.reviewer_decisions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  case_id uuid not null unique,
  reviewer_id uuid not null references public.reviewer_grants(user_id),
  kind text not null check (kind in ('financial', 'receipt_confirmed', 'receipt_unconfirmed')),
  deduction_minor bigint check (deduction_minor between 0 and 100000000),
  explanation text not null check (length(btrim(explanation)) between 1 and 10000),
  policy_basis text not null check (length(btrim(policy_basis)) between 1 and 10000),
  policy_version text not null default 'pact-v1' check (policy_version = 'pact-v1'),
  created_at timestamptz not null default now(),
  created_txid bigint not null default txid_current(),
  unique (agreement_id, id),
  foreign key (agreement_id, case_id) references public.review_cases(agreement_id, id),
  check ((kind = 'financial') = (deduction_minor is not null))
);
create table public.decision_evidence (
  agreement_id uuid not null,
  decision_id uuid not null,
  evidence_id uuid not null,
  primary key (decision_id, evidence_id),
  foreign key (agreement_id, decision_id) references public.reviewer_decisions(agreement_id, id),
  foreign key (agreement_id, evidence_id) references public.evidence_files(agreement_id, id)
);
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null unique,
  currency public.pact_currency not null,
  operation_id uuid not null unique,
  reason text not null check (reason in ('cancellation', 'early_refund', 'inspection_expired', 'unanimous_proposal', 'reviewer_decision')),
  proposal_id uuid,
  reviewer_decision_id uuid,
  secured_minor bigint not null check (secured_minor between 0 and 100000000),
  owner_minor bigint not null check (owner_minor >= 0),
  refunded_minor bigint not null check (refunded_minor >= 0),
  created_at timestamptz not null default now(),
  created_txid bigint not null default txid_current(),
  unique (agreement_id, id),
  foreign key (agreement_id, currency) references public.agreements(id, currency),
  foreign key (agreement_id, operation_id) references public.operation_requests(agreement_id, id),
  foreign key (agreement_id, proposal_id) references public.settlement_proposals(agreement_id, id),
  foreign key (agreement_id, reviewer_decision_id) references public.reviewer_decisions(agreement_id, id),
  check (owner_minor + refunded_minor = secured_minor),
  check ((reason = 'unanimous_proposal') = (proposal_id is not null)),
  check ((reason = 'reviewer_decision') = (reviewer_decision_id is not null)),
  check (reason not in ('cancellation', 'early_refund', 'inspection_expired') or owner_minor = 0)
);
create table public.settlement_allocations (
  agreement_id uuid not null,
  settlement_id uuid not null,
  contribution_id uuid not null unique,
  secured_minor bigint not null check (secured_minor > 0),
  deducted_minor bigint not null check (deducted_minor >= 0),
  refunded_minor bigint not null check (refunded_minor >= 0),
  primary key (settlement_id, contribution_id),
  foreign key (agreement_id, settlement_id) references public.settlements(agreement_id, id),
  foreign key (agreement_id, contribution_id) references public.contributions(agreement_id, id),
  check (deducted_minor + refunded_minor = secured_minor)
);
create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  currency public.pact_currency not null,
  operation_id uuid not null unique,
  kind text not null check (kind in ('funding', 'settlement')),
  payment_attempt_id uuid unique,
  settlement_id uuid unique,
  created_at timestamptz not null default now(),
  created_txid bigint not null default txid_current(),
  unique (agreement_id, id, currency),
  foreign key (agreement_id, currency) references public.agreements(id, currency),
  foreign key (agreement_id, operation_id) references public.operation_requests(agreement_id, id),
  foreign key (agreement_id, payment_attempt_id) references public.payment_attempts(agreement_id, id),
  foreign key (agreement_id, settlement_id) references public.settlements(agreement_id, id),
  check ((kind = 'funding' and payment_attempt_id is not null and settlement_id is null) or
    (kind = 'settlement' and payment_attempt_id is null and settlement_id is not null))
);
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null,
  transaction_id uuid not null,
  currency public.pact_currency not null,
  account public.ledger_account not null,
  contribution_id uuid,
  amount_minor bigint not null check (amount_minor <> 0 and amount_minor between -100000000 and 100000000),
  created_at timestamptz not null default now(),
  foreign key (agreement_id, transaction_id, currency) references public.ledger_transactions(agreement_id, id, currency),
  foreign key (agreement_id, contribution_id) references public.contributions(agreement_id, id),
  check ((account in ('simulated_source', 'borrower_refund')) = (contribution_id is not null)),
  check (account <> 'simulated_source' or amount_minor < 0),
  check (account not in ('borrower_refund', 'owner_allocation') or amount_minor > 0)
);
create index ledger_entries_transaction on public.ledger_entries(transaction_id);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  actor_id uuid references public.profiles(id),
  operation_id uuid,
  action text not null check (length(action) between 1 and 100),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (agreement_id, operation_id) references public.operation_requests(agreement_id, id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  recipient_id uuid not null references public.profiles(id),
  kind text not null check (length(kind) between 1 and 100),
  deduplication_key text not null check (length(deduplication_key) between 1 and 200),
  message text not null check (length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (recipient_id, deduplication_key)
);
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name in ('complete_payments', 'process_due_inspections', 'escalate_due_cases', 'return_reminders')),
  scheduled_for timestamptz not null,
  attempt integer not null default 1 check (attempt > 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  processed_count integer not null default 0 check (processed_count >= 0),
  error_code text,
  unique (job_name, scheduled_for, attempt),
  check ((status = 'running') = (finished_at is null)),
  check ((status = 'failed') = (error_code is not null))
);

create index agreements_owner on public.agreements(owner_id);
create index agreements_inspection_due on public.agreements(inspection_deadline) where state = 'inspecting';
create index agreements_unacknowledged_due on public.agreements(return_requested_at) where state = 'return_requested';
create index agreement_versions_due on public.agreement_versions(due_at);
create index disputes_negotiation_due on public.disputes(negotiation_deadline) where state = 'negotiating';
create index notifications_recipient on public.notifications(recipient_id, created_at desc);
create index audit_events_timeline on public.audit_events(agreement_id, created_at, id);
create index evidence_files_agreement on public.evidence_files(agreement_id, phase);
-- All agreement-scoped tables need an access/filter index, including child FKs.
do $$
declare t text;
begin
  foreach t in array array['invitations','change_requests','acceptances','contributions',
    'payment_attempts','exchange_events','verification_challenges','review_cases',
    'evidence_requests','exchange_evidence','settlement_proposals','proposal_acceptances',
    'reviewer_decisions','decision_evidence','settlement_allocations','ledger_transactions',
    'ledger_entries','operation_requests','version_participants','dispute_evidence'] loop
    execute format('create index %I on public.%I(agreement_id)', t || '_agreement', t);
  end loop;
end $$;

-- Fail closed even between migration files; Supabase defaults can grant tables
-- to API roles on creation. Only the later access migration enables reads.
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
end $$;

commit;
