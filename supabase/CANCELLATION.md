# Stage 2B — cancellation and refunds

Migration `20261017000500_cancellation.sql` implements the `cancelAgreement`
operation as `cancel_agreement(p_input jsonb)`. It is an authenticated, atomic
PostgreSQL RPC. Migration administrators can also invoke it; no direct financial
table grants, privileged client, worker endpoint, or real payment rail is added.
All postings remain simulated.

Pass the domain mutation input:

```json
{
  "agreementId": "<uuid>",
  "expectedRevision": "3",
  "idempotencyKey": "cancel-request-unique-key"
}
```

The owner or any active borrower can cancel the entire agreement before handover.
The RPC rejects strangers, stale revisions, handed-over agreements, and completed
cancellations. After handover, the return/dispute workflow applies instead. A
successful cancellation records one final cancellation settlement even when no
contribution was secured. Unpaid and failed contributions receive no allocation or
refund; secured contributions are refunded at their exact secured minor-unit amount.

## In-flight funding reconciliation

Cancellation takes the agreement lock first, then locks each processing contribution
and its payment attempt in the same order as Stage 2A completion. The simulated
provider outcome is persisted when funding starts, so cancellation can reconcile it
without waiting for a browser or worker:

- A pending success posts the original balanced funding transaction, marks the exact
  contribution secured, then refunds it through the cancellation settlement in the
  same database transaction.
- A pending decline marks the attempt and contribution failed and creates no ledger
  movement or refund.
- If completion obtained the agreement lock first, its secured amount is refunded
  by cancellation. If cancellation wins, the attempt is finalized and later
  completion returns `already_processed`.

Thus an exception at any point rolls back the reconciliation, refunds, settlement,
agreement state, audit record, and notifications together. The agreement revision,
append-only audit trail, and deduplicated participant notifications are updated on
success.

## Ledger and retries

The cancellation settlement allocates each positive secured contribution exactly
once. Its ledger transaction debits the restricted deposit and credits each
borrower's simulated refund; the entries balance to zero in the agreement currency.
For zero secured funds, the settlement totals are zero and no empty ledger
transaction is created. Unique settlement, operation, and ledger keys prevent
duplicate refunds. Same-key/same-payload retries replay the original response;
same-key/different-payload requests return `idempotency_conflict`.

The server-only `SimulatedDepositProvider.cancel` uses the caller-scoped RPC
transport. It never uses the worker transport. Keep completion and batch processing
worker-only.

## Local verification

`npm run test:db` applies all migrations in PGlite and tests authorization,
handover rejection, zero and partial funding, pending success/decline reconciliation,
balanced refunds, idempotent retries, duplicate prevention, and transaction rollback.
The embedded database uses a single connection; true multi-session lock contention,
PostgREST/JWT integration, generated Supabase types and hosted deployment remain
unverified.
