# Stage 2A — simulated funding

Migration `20261017000400_simulated_funding.sql` implements three atomic RPCs:

| Domain operation                | PostgreSQL RPC                                   | Execute grant       |
| ------------------------------- | ------------------------------------------------ | ------------------- |
| `startContribution`             | `start_contribution(p_input jsonb)`              | `authenticated`     |
| `completeSimulatedContribution` | `complete_simulated_contribution(p_input jsonb)` | `service_role` only |
| `processDueContributions`       | `process_due_contributions(p_input jsonb)`       | `service_role` only |

Migration administrators can also invoke them. No direct financial table grants,
public worker HTTP endpoint, credentials or Cron schedule are added. Everything is
simulated; never describe these postings as real transfers.

## Starting a contribution

Pass the existing domain contract as `p_input`:

```json
{
  "agreementId": "<uuid>",
  "versionId": "<uuid>",
  "contributionId": "<uuid>",
  "expectedRevision": "2",
  "idempotencyKey": "funding-request-unique-key"
}
```

The caller must be the active borrower owning the contribution. The agreement must
be `awaiting_funding`, with no handover. The owner and every current snapshot borrower
must have accepted that exact version, and borrower slots, verified email identities,
allocations and contributions must match the immutable snapshot. The owner cannot
pay a borrower's share. No amount, currency, actor or simulated outcome is accepted
from the caller. The database reads the authoritative amount/currency.

Success persists a `processing` attempt due two seconds later, advances the agreement
revision and appends an audit event. It returns the original typed agreement summary,
operation ID, attempt ID and due timestamp. No money is secured or ledger posted yet.

## Completion and retries

The trusted worker supplies `{ "attemptId": "<uuid>", "idempotencyKey": "<key>" }`.
Completion before the due time returns retryable `temporarily_unavailable`. Success
posts exactly two balanced entries (borrower simulated source negative, restricted
deposit positive), secures only this contribution, freezes terms/membership and
marks the attempt successful in the same transaction. Full deposit funding advances
the agreement to `ready_for_handover`; partial funding stays `awaiting_funding`.

Payment failure creates no ledger entries and marks the attempt/contribution failed.
A new start key can retry. A stale version, lost acceptance, or cancelling/cancelled
agreement cancels the processing attempt without securing funds. The contribution
becomes failed, while current agreement/version gates prevent inappropriate retries.
If cancellation acquires the agreement lock first, it reconciles the persisted
simulated outcome in its own transaction before creating the cancellation refund;
see [Stage 2B cancellation](./CANCELLATION.md).
Cancellation/refund implementation itself remains the next workstream milestone.

Completion returns `ok: true` when the processing operation succeeds, with explicit
`attemptState: succeeded | failed | cancelled`. A simulated decline is a successful
processing operation with a failed payment, not a transport failure.

Operation keys are scoped by actor/operation, with canonical SHA-256 payload hashes.
Same-key replays return the stored result before checking a now-stale revision. A
different payload with the same key fails. The stored start result intentionally
describes the original processing transition; refresh read data for current status.
Completed attempts reject new-key completions as `already_processed` without new
postings. Unique attempt/transaction keys provide additional protection.

All transitions lock agreement first, then contribution, then attempt. Global key
conflicts use `INSERT ... ON CONFLICT` and stored-result lookup. Batch workers process
agreements in stable order. Cancellation and revision RPCs must follow the same
agreement-lock protocol. If completion wins, cancellation must refund the secured
amount; if cancellation wins, completion cannot secure it. Post-handover full and
partial dispositions are implemented in [SETTLEMENTS.md](./SETTLEMENTS.md).

## Deterministic failure fixture

Only an administrator may configure a contribution to fail its next N starts:

```sql
insert into pact_private.simulated_failure_fixtures
  (contribution_id, failures_remaining)
values ('<fixture-contribution-uuid>', 1);
```

The counter is consumed transactionally at start; the selected outcome is stored in
`pact_private.simulated_attempt_outcomes`. Both tables have no client/service-role
table grants. Neither the borrower nor worker request selects an outcome. A replay
does not consume another failure. Ordinary contributions succeed by default.

## Bounded worker

Call `process_due_contributions` with `{ "batchSize": 25, "idempotencyKey": "<run-key>" }`.
Batch size is 1–100. It processes persisted due attempts without any browser, records
`job_runs`, and returns job ID/count/hasMore. Replay a lost response using the same
key; use a new key for the next run. Each attempt has its own stable completion key.
On a batch processing error, financial changes in that batch roll back and a safe
failed job/result is retained. Retry failed batches with a new run key. Deadlock and
serialization exceptions propagate for transaction retry with the original key.

## Server adapter and integration

`src/lib/domain/server/simulated-deposit-provider.ts` implements `DepositProvider`
and adds `processDue`. It is server-only and takes separate caller-scoped/worker RPC
transports. Each transport delegates one call to `client.rpc(name, { p_input })`.
Runtime schemas validate input/results and sanitize transport failures. Do not wire
`complete` or `processDue` into a user-callable Server Action. The borrower-facing
handler must use Valera's verified auth/session setup and a user-scoped client.

The transport interface is hand-authored, not invented generated database types.
The existing empty `src/types/database.ts` remains unchanged until the official
Supabase generator can connect. Apply migrations 001–006, generate types, then wire
the typed Supabase clients at the server composition boundary. No hosted setup is
assumed. Agreement creation/publication/acceptance RPCs are still separate work;
local tests provision coherent accepted fixtures through administrator SQL.

## Local verification and limits

`npm test` runs the complete suite; `npm run test:db` runs migration, integrity,
funding, cancellation, and settlement tests. Coverage includes authorization, unanimous acceptance, processing/due times,
separate group contributions, balanced postings, deterministic declines/retries,
same/different-key duplicates, payload conflicts, stale versions, rollback injection,
bounded workers and cancellation-first/completion-first orderings.

PGlite uses a single PostgreSQL connection. Concurrently submitted duplicate calls
are serialized by that connection; ordering tests are **not multi-session lock
contention tests**. Docker/PostgreSQL services are unavailable locally and Supabase
hosting is unconfigured. Real multi-connection races, PostgREST/JWT integration,
generated types and scheduled-worker deployment remain unverified. Before release,
run two independent database sessions against duplicate start/complete calls and
payment-versus-cancellation while deliberately holding the agreement row lock.
