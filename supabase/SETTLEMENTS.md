# Stage 2C — full and partial settlements

Migration `20261017000600_settlements.sql` implements the atomic financial
disposition operations:

| Operation               | RPC                                      | Execute grant       |
| ----------------------- | ---------------------------------------- | ------------------- |
| `approveFullRefund`     | `approve_full_refund(p_input jsonb)`     | `authenticated`     |
| `settleAgreement`       | `settle_agreement(p_input jsonb)`        | `authenticated`     |
| `processDueInspections` | `process_due_inspections(p_input jsonb)` | `service_role` only |

No dispute-creation, proposal, evidence, or reviewer-decision workflow is added by
this stage. Settlement execution consumes a current immutable proposal with
unanimous acceptances or an already persisted, valid independent reviewer financial
decision.

## Full refunds

The agreement owner may call `approve_full_refund` during `inspecting` when no claim
was recorded before the inspection deadline. The bounded trusted worker calls
`process_due_inspections` with `{ "batchSize": 25, "idempotencyKey": "<run-key>" }`;
it fully refunds due inspections without a timely claim. A timely claim keeps funds
restricted and is never released by inspection expiry.

Both paths take the agreement lock before related rows and use the same final
settlement routine. The routine requires the secured contribution total to equal
the immutable version's deposit. It inserts one unique settlement, allocations,
ledger transaction, contribution updates, agreement transition, audit event, and
deduplicated participant notifications in the same transaction. The agreement
transitions to `completed` only with the completed disposition persisted.

## Partial settlements

Call `settle_agreement` with one of the following existing persisted decisions:

```json
{
  "agreementId": "<uuid>",
  "expectedRevision": "8",
  "idempotencyKey": "settlement-run-key",
  "kind": "proposal",
  "proposalId": "<current-proposal-uuid>"
}
```

```json
{
  "agreementId": "<uuid>",
  "expectedRevision": "8",
  "idempotencyKey": "reviewer-decision-key",
  "kind": "reviewer_decision",
  "caseId": "<assigned-review-case-uuid>"
}
```

The proposal path requires the caller to be a participant, the proposal to be the
dispute's current proposal, and the owner plus every active current-version borrower
to have accepted it. The reviewer path requires the caller to be the live assigned
reviewer, independent from the agreement, with a persisted financial decision for
the case. Review decisions remain capped by the recorded claim and secured balance.
There is no release path for an unresolved or unapproved dispute.

Damage is apportioned by immutable accepted-version borrower basis points. Integer
largest-remainder rounding uses participant UUID as the stable tie-break. Each
borrower receives their own secured amount less their proportional deduction. For
EUR 250.00 at 60/40, an EUR 80.00 deduction allocates EUR 48.00 / EUR 32.00 and
refunds EUR 102.00 / EUR 68.00. Owner allocation plus refunds always equals the
secured amount.

Ledger postings debit `restricted_deposit` and credit borrower refunds plus the
owner allocation. Entries use integer minor units, balance in one currency, and
remain append-only. A full refund emits no zero-value owner leg; a 100% deduction
emits no zero-value borrower refund legs. Per-agreement unique settlement and
operation keys prevent duplicate payouts; same-key/same-payload retries replay the
original result.

`SimulatedDepositProvider` routes owner/participant settlement calls through the
caller-scoped RPC and inspection expiry through the worker RPC. No real transfer is
made.

## Local verification

`npm run test:db` applies all migrations in PGlite. Coverage includes owner-only
early refunds, timely-claim exclusion, due-inspection expiry, unanimous consent,
reviewer authorization, duplicate settlement prevention, balanced ledger entries,
audit rollback, and the EUR 250 / 60-40 / EUR 80 proportional deduction example.
PGlite's single connection does not establish true multi-session lock contention;
test concurrent claim/expiry and duplicate settlement on independent PostgreSQL
sessions before deployment.
