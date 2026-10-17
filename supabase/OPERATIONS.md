# Operation contracts and Stage 2 boundary

Canonical names and inputs/results are in
[`src/lib/domain/contracts.ts`](../src/lib/domain/contracts.ts).
**Business mutation RPCs are not implemented or granted in Stage 1.** Allocation,
schema integrity and access policies are working implementations.

**Stage 2A update:** `startContribution`, `completeSimulatedContribution` and
`processDueContributions` are implemented by migration 004. See
[FUNDING.md](./FUNDING.md) for grants, payloads, failure fixtures and local test limits.
**Stage 2B update:** `cancelAgreement` is implemented by migration 005. See
[CANCELLATION.md](./CANCELLATION.md) for in-flight reconciliation and refund behavior.
**Stage 2C update:** owner full refunds, unanimous/reviewer settlement execution and
the due-inspection worker are implemented by migration 006. See
[SETTLEMENTS.md](./SETTLEMENTS.md). Proposal, claim, evidence and reviewer-decision
creation operations remain separate implementation contracts.

## Transaction protocol

1. Verify identity in the server handler and authorize again inside the RPC using
   `auth.uid()`. Never accept actor/reviewer identity, outcome, deadline, grant or
   scheduler authority from browser payloads.
2. Lock the agreement first, then related rows in stable UUID order. Resolve retries
   by `(actor_scope, operation, idempotency_key)` and canonical payload hash. Same
   key with changed data fails. Derive `user:<uuid>` or protected `scheduler:<job_name>`.
3. Check revision/version, role, state, consent, amounts and evidence under the lock.
   Use authoritative server time. A claim must be recorded strictly before the
   inspection deadline; equality belongs to expiry.
4. Apply the transition, ledger, aggregates, audit, notifications and operation result
   in **one Postgres transaction**, never separate Supabase HTTP writes.
5. Return minimal typed success/recoverable error. Map constraint failures to safe
   domain codes; never leak SQL, token hashes or private membership details.

Definer mutation functions must pin empty `search_path`, qualify objects, explicitly
authorize and revoke PUBLIC/anon execution. Grant only intended operations. Scheduler
and provisioning routines need separate grants. Keep adapters server-only; hidden UI
and RLS alone cannot enforce complete transition rules.

## Required checks by operation

| Operations                                                            | Caller and rules                                                                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAgreement`, `publishAgreementVersion`                          | Authenticated owner; validate terms/borrowers; atomically create active slots and immutable snapshot; reset current-version acceptance; reject secured/frozen terms and reconcile processing attempts against old versions |
| `createInvitation`, `revokeInvitation`, `claimInvitation`             | Owner issues/revokes before funding; high-entropy hashed tokens; expire/revoke outstanding tokens on reissue; matching verified email, live current version and unclaimed slot; generic public landing page                |
| `proposeAgreementChange`, `acceptAgreementVersion`                    | Borrower proposes; owner/borrowers accept exact current version; owner publishes; everyone must accept before funding                                                                                                      |
| `startContribution`, `completeSimulatedContribution`                  | Own contribution only; all accepted; persist processing and due time; authorized worker determines result; stale/cancelled completion cannot secure funds; failed retries get new keys                                     |
| `cancelAgreement`                                                     | Implemented in migration 005: any participant before handover; reconcile processing attempts; refund secured contributions only; atomically finalize cancellation; no unilateral post-handover cancellation                |
| `prepareCollection`, `createVerificationChallenge`, `confirmHandover` | Fully funded agreement, any borrower, purpose/expiry/attempt limits and hashed proofs, distinct owner/borrower confirmations of submitted evidence/checklist; scanning is not consent                                      |
| `prepareEvidenceUpload`, `submitEvidence`                             | Authorized participant/assigned reviewer; reserve random path; verify MIME/size/content/hash and stored object; finalize append-only; permit initial claim evidence before dispute creation                                |
| `requestReturn`, `acknowledgeReturn`                                  | Either side initiates, any borrower supplies evidence; owner alone acknowledges physical receipt/evidence; set exact 24-hour deadline once; optional in-person code or documented remote pending request                   |
| `approveFullRefund`                                                   | Implemented in migration 006: owner during inspection, no timely claim; same unique settlement path as expiry                                                                                                              |
| `openClaim`                                                           | Owner strictly before deadline under expiry lock; amount 0..secured; preserve timestamp/details; link submitted files via `dispute_evidence`; missing initial evidence flags follow-up                                     |
| `proposeSettlement`, `acceptSettlement`, `rejectSettlement`           | Any participant proposes with reason; immutable new proposal resets approval set; unanimous owner/all-borrower approval; rejection escalates, silence never consents                                                       |
| `requestReviewEvidence`, `recordReviewerDecision`                     | Live assigned independent reviewer; evidence request keeps restriction; explanation/policy/evidence recorded; deduction capped by claim/secured; receipt determination is distinct                                         |
| `settleAgreement`                                                     | Implemented in migration 006: consume unanimous current proposal or authorized persisted reviewer financial decision and post final settlement                                                                             |
| `processDueContributions`                                             | Restricted bounded worker completes persisted attempts without a browser                                                                                                                                                   |
| `processDueInspections`                                               | Implemented in migration 006: restricted bounded scheduler; no timely claim and deadline reached; same settlement as early refund; no duplicate disposition                                                                |
| `escalateDueCases`                                                    | Pending receipt older than 24 hours or negotiation rejection/24-hour expiry; create attention without assuming receipt or awarding money                                                                                   |
| `processReturnReminders`                                              | Deduplicated 24-hour/1-hour reminders only when scheduled in future; overdue active-return flags; no automatic forfeiture                                                                                                  |

Compute damage deductions from original shares with deterministic capped rounding.
Prove owner allocation plus borrower refunds equals secured money exactly. Final
simulated settlement may mark every leg successful atomically; preserve truthful
processing/pending history. A 100% deduction uses `allocated_to_owner`.

Cron will invoke bounded routines every minute, recording job result/count/error.
Scheduled occurrences can have retries; unique operations/disposition prevent double
postings. `job_runs` alone is not idempotency. No cron is enabled in Stage 1.

## Teammate handoff

- **Valera:** terms/envelope validators, version/invitation/acceptance DTOs; finish
  Auth refresh, profiles, verified email and server adapters. Request schema additions
  through Sameer instead of competing migrations.
- **Hayk:** currency/state types and allocation previews; persisted snapshot amounts
  after acceptance; typed funding/results/history. Coordinate `DepositProvider` with
  authoritative RPCs rather than local balances.
- **Tayma:** evidence phases/limits/paths and exchange contracts; upload/checklist/QR
  UI and content validation. Metadata preparation/challenge/receipt mutations await RPCs.
- **Aiperi:** claim/proposal/reviewer/settlement contracts and assigned-case access;
  UI/E2E cases using persisted UTC deadlines and unresolved states. Monitoring needs
  a sanitized authorized job-status endpoint.

Next slice: create/publish/invite/accept, exact contributions, persisted simulated
funding and cancellation/refunds. Verify full Supabase integration and multi-connection
races before enabling mutations. Then add handover/receipt, expiry, claims, capped
deductions, unanimous/reviewer settlement and scheduled processing.
