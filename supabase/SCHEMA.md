# PACT schema v1

Stage 1 provides structure, integrity, access, allocation and contracts. It does not
expose business mutation RPCs or run financial jobs. All money is simulated.

## Apply and verify

Apply migrations in timestamp order:

1. `20261017000100_schema_v1.sql`: enums, 31 tables, keys, checks, indexes, RLS and revoked API grants.
2. `20261017000200_integrity.sql`: allocation, immutable history, snapshot/ledger/settlement integrity triggers.
3. `20261017000300_access.sql`: identity-bound read policies, limited safe writes, private evidence bucket/policies.

Each migration is transactional. They target a fresh Supabase PostgreSQL 17 project
with its existing `auth` and `storage` schemas. These are recorded ordered migrations,
not scripts to rerun manually after application.

With Docker running, `npm run db:start` starts local Supabase and applies migrations
on a fresh instance. On an existing local instance, use
`npx supabase migration up --local`, then `npm run db:types`. Use `npm.cmd`/`npx.cmd`
on Windows if execution policy blocks PowerShell wrappers. Do not reset a shared
database to apply changes. Sameer coordinates hosted application and generated types.
Never hand-edit `src/types/database.ts` to approximate missing generated types.

`npm test` includes embedded PostgreSQL tests; `npm run test:db` isolates them.
The harness applies the actual migrations to PGlite with minimal Supabase-owned
infrastructure stubs. It exercises real constraints, deferred triggers, roles and
RLS. It does not test JWT verification, Storage HTTP/signed URLs, pg_cron, PostgREST,
or concurrent connections. Run integration/race tests against actual Supabase next.

## Entity map

| Tables                                                    | Responsibility                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `profiles`, `reviewer_grants`                             | Auth-user identity and administrator-managed reviewer authorization; no editable reviewer flag              |
| `agreements`                                              | Owner, currency, current version, lifecycle, revision, receipt/inspection/finality timestamps               |
| `participants`                                            | Borrower slots, normalized emails, optional claimed user, shares/amounts, soft removal history              |
| `agreement_versions`, `version_participants`              | Immutable owner/item/terms/dates/policy and borrower/share/allocation snapshot                              |
| `invitations`                                             | Version-bound token hashes, expiry, claim/revocation; never raw tokens                                      |
| `change_requests`, `acceptances`                          | Proposed edits/responses and append-only exact-version acceptance                                           |
| `operation_requests`                                      | Actor/operation/key uniqueness, canonical payload hash, persisted outcome                                   |
| `contributions`, `payment_attempts`                       | Version-specific borrower amounts, secured/refunded/deducted totals, simulated processing and retry history |
| `ledger_transactions`, `ledger_entries`                   | Signed postings, operation/attempt/settlement references, immutable balanced transactions                   |
| `exchange_events`, `verification_challenges`              | Actual actors, checklists, confirmations, purpose-bound hashed challenge/code structures                    |
| `evidence_files`, `exchange_evidence`, `dispute_evidence` | Private metadata and submitted evidence references; initial claim uploads can precede dispute creation      |
| `disputes`, `review_cases`, `evidence_requests`           | Preserved claim details, negotiation deadline, assignment/next action and evidence requests                 |
| `settlement_proposals`, `proposal_acceptances`            | Immutable proposals and per-actor acceptance/rejection; new proposal means new approval set                 |
| `reviewer_decisions`, `decision_evidence`                 | Final financial/receipt decision, policy basis, explanation and considered submitted evidence               |
| `settlements`, `settlement_allocations`                   | One final disposition per agreement and exact per-contribution refund/deduction legs                        |
| `audit_events`, `notifications`, `job_runs`               | Append-only safe audit metadata, deduplicated notifications, scheduler attempt/outcome telemetry            |

The owner is on `agreements`; `participants` contains borrowers only. A user can own
one agreement and borrow in another. Removed slots remain for history. Active
email/user uniqueness is agreement-scoped; claimed users must match a verified Auth
email. Ownership cannot be transferred.

Versions are immutable at publication, before acceptance. Acceptances reference the
retained snapshot. Revision publication leaves historical acceptances intact but
current-version joins no longer count them. The publication operation must atomically
synchronize active slots and the new snapshot. Deferred checks enforce full membership,
exactly 10,000 basis points and deterministic allocated amounts.

Composite foreign keys carry `agreement_id` through child relationships to reject
cross-agreement evidence, contributions, versions, cases, proposals and ledger links.
Deletion is restrictive for history/finance: Auth deletion cannot cascade away money.
Account deletion/anonymization needs a separately reviewed policy.

## Defaults and integrity

- EUR/USD/GBP only; 1–20 borrowers, each with positive share and contribution.
- Deposit: 1–100,000,000 minor units (up to 1,000,000 major units). These are
  documented engineering limits. Money is bigint, shares are integer basis points.
  Rental fee is terms only, never collected.
- Inspection, negotiation and unacknowledged-return policies remain 24 hours.
  Invitation validity defaults to 24 hours. Challenges allow at most 10 minutes,
  five attempts by default (bounded to 1–10).
- Receipt requires exactly `returned_at + interval '24 hours'`. Once recorded,
  receipt/deadline cannot change. The future operation supplies server time.
- Agreement updates increment `revision`. Enums/checks enforce representation and
  required timestamps. **Legal transition edges and funding/consent gates still
  require Stage 2 RPCs**; direct client state writes remain blocked meanwhile.
- Funded/frozen agreements reject participant and published-term changes.
- Versions, snapshot rows, acceptances, proposals/votes, decisions/evidence references,
  settlements/allocations, ledger and audit records are append-only.
- Snapshot, decision-reference, ledger and settlement-allocation rows must be inserted
  in their immutable parent's transaction. Later inserts cannot rewrite history.
- Deferred ledger checks require at least two entries, zero sum and valid account
  directions. Composite keys enforce one agreement and currency per transaction.
- Settlement totals must equal allocation legs and cover every secured contribution.
  Each contribution is allocated at most once; deduction plus refund equals secured
  money. Contribution totals cannot decrease or exceed secured funds.
- Review decisions require a live, assigned independent reviewer. Financial decisions
  cannot exceed the recorded claim or secured funds. Receipt decisions are distinct.

Example postings: funding has source `-15000`, restricted `+15000`; settlement has
restricted `-25000`, refunds `+10200/+6800`, owner `+8000`. Stage 2 must enforce
aggregate-to-ledger reconciliation, per-account balances, all-party consent, capped
proportional deductions and atomic unique disposition. Balanced rows alone do not
authorize payment. Unresolved cases must never produce automatic payouts.

## Access matrix

| Identity                          | Read                                                                                          | Direct write                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Anonymous                         | No PACT tables/private objects                                                                | None                                                                                 |
| Stranger/unclaimed invitee        | Own profile; invitation landing page stays generic                                            | Own display name                                                                     |
| Owner/active claimed borrower     | Agreement, snapshots, participants, contributions, ledger, submitted evidence, cases, history | Own display name, own notification `read_at`, authorized draft object upload/removal |
| Assigned reviewer with live grant | Assigned agreement context, submitted evidence, own drafts                                    | Own display name, authorized draft object upload/removal                             |
| Unassigned/revoked reviewer       | No reviewer-based access                                                                      | No privileged writes                                                                 |
| `service_role` API                | No PACT table grants                                                                          | Future narrowly granted scheduler/provisioning functions only                        |
| Migration administrator           | Trusted SQL administration                                                                    | Migrations and controlled provisioning; never client credentials                     |

`pact_private` is not an exposed API schema. Narrow `SECURITY DEFINER` RLS predicates
derive `auth.uid()` and pin empty `search_path` with qualified object names. Other
private functions have no API execute grants. Invitation/challenge hashes, reviewer
grants, idempotency requests/results and job telemetry are not client-readable.
Authorized operations must return sanitized DTOs.

`pact-evidence` is private, allows JPEG/PNG/WebP/PDF and at most 10,000,000 bytes.
PDF metadata is limited to dispute evidence. Paths are `agreement-id/phase/evidence-uuid`.
Uploads require server-created draft metadata owned by the caller with current
agreement access. No UPDATE policy exists. Submitted files cannot be deleted by
clients. Drafts are uploader-only; submitted evidence is participant/reviewer-visible.
Signed downloads need the same access check. Content verification/finalization is
Stage 2. Initial owner claim uploads may have no dispute ID yet; `dispute_evidence`
links the submitted files atomically when the claim is opened.

## Infrastructure boundary

The embedded engine has applied/tested the schema. Full Supabase is unavailable here:
Docker's Linux engine pipe is missing. Official local CLI type generation therefore
fails; the existing empty-schema type file is preserved. No cron jobs are installed
until bounded retry-safe routines exist. Local Auth's starter configuration still
disables email confirmation; Valera must configure verified identity before invitation
claims. The database independently rejects unverified-email membership.
No hosted project, credentials or demo passwords were changed/added.

References: [Supabase function security](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[PostgreSQL deferred triggers](https://www.postgresql.org/docs/17/sql-createtrigger.html),
[PGlite](https://pglite.dev/docs/).
