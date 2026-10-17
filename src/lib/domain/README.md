# Shared domain contracts — Sameer

Stage 1 supplies working allocation and validation plus typed integration contracts.
Import from `@/lib/domain`. These are hand-authored domain DTOs, not generated database
types. `src/types/database.ts` must be generated from the applied Supabase schema.

| Module          | Purpose                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `model.ts`      | Currency, money, shares, lifecycle states, policy constants, terms/snapshot/summary DTOs |
| `allocation.ts` | Pure deterministic contribution allocation and typed validation errors                   |
| `validation.ts` | Zod validators for terms, mutation identity/revision, amounts, shares, evidence metadata |
| `contracts.ts`  | Named operation inputs/results, safe errors, server provider interface contract          |
| `index.ts`      | Public exports; no credentials, database clients, or financial mutations                 |

## Allocation

```ts
import { allocateContributions } from "@/lib/domain";

const allocations = allocateContributions(
  { currency: "EUR", amountMinor: 25000 },
  [
    { participantId: "00000000-0000-0000-0000-000000000001", shareBps: 6000 },
    { participantId: "00000000-0000-0000-0000-000000000002", shareBps: 4000 },
  ],
);
// Canonical participant-ID order, amounts 15000 and 10000.
```

Multiply integer minor units by integer basis points using BigInt, divide by 10,000,
then distribute remaining minor units by descending remainder and ascending UUID.
UUIDs are canonicalized to lowercase; comparisons never use locale collation.
Outputs are safe integer JSON numbers within the configured limit. Inputs are not
mutated. Every borrower must receive at least one minor unit. SQL validates the
published snapshot with the same algorithm; SQL/TypeScript parity is tested.

Use this function for previews. After publication, display `version_participants`
amounts from the immutable snapshot instead of recomputing the accepted agreement.
Do **not** reuse it for damage deductions without contribution caps: independent
largest-remainder allocations at different totals can violate those caps. The
capped deduction allocator and settlement engine belong to Stage 2.

## Boundary rules

- `agreementTermsSchema` normalizes emails, validates dates, unique emails, shares,
  allocation, policy constants, and exact currency. Verify owner identity/email
  separately on the server; the schema cannot know the authenticated owner.
- `mutationInputSchema` validates the base envelope. It is strict: compose an
  operation-specific schema before parsing an extended operation payload.
- `evidenceMetadataSchema` validates metadata only. Server-side content sniffing,
  hashing, upload existence verification and authorization remain mandatory.
- Validate all untrusted operation-specific payloads in their server handlers;
  TypeScript interfaces alone are not validation or authorization.
- Monetary JSON numbers are bounded integers; revisions use decimal strings for
  PostgreSQL bigint safety. Times are UTC ISO strings. No client clock is authoritative.
- Actor/reviewer identity is derived from verified authentication. Scheduler
  completion and expiry operations are never browser-callable. A client never
  chooses a simulated success/failure result.
- Every mutation has an idempotency key. Scope it to the authenticated actor and
  operation; compare a canonical request hash before returning a stored result.
  Replays return the original success with `replayed: true`; different payloads
  with the same key return `idempotency_conflict`.
- `expectedRevision` and `versionId` prevent stale writes. Neither replaces a
  database lock. Same-key retries must be resolved before rejecting a now-stale
  revision from the original request.

## Integration status

**No `DomainOperations` mutation is deployed in Stage 1.** The types are contracts
for implementation, not fake RPC functions. Do not implement adapters as a series
of direct Supabase writes or relax table grants to bypass this boundary.

```ts
import type { DomainHandler, OperationInput } from "@/lib/domain";

type FundingInput = OperationInput<"startContribution">;
type FundingHandler = DomainHandler<"startContribution">;
```

The contract includes the plan's operations plus necessary entry points for draft
creation, invitation issuance/revocation, preparing collection/evidence uploads,
rejecting a proposal, requesting reviewer evidence, payment processing and reminders.
`createAgreement` returns a draft; `publishAgreementVersion` creates the immutable
snapshot. `prepareCollection` creates an exchange event before challenges are issued.
`prepareEvidenceUpload` reserves an authorized random object path; `submitEvidence`
verifies and finalizes it. Initial claim evidence can be prepared before a dispute
exists and linked through `dispute_evidence` when `openClaim` executes.

See [schema and access rules](../../../supabase/SCHEMA.md) and
[operation implementation requirements](../../../supabase/OPERATIONS.md).
