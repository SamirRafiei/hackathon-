import {
  CURRENCIES,
  PACT_POLICY,
  type BorrowerShare,
  type ContributionAllocation,
  type Money,
} from "./model";

export type AllocationErrorCode =
  | "invalid_currency"
  | "invalid_amount"
  | "invalid_participant_count"
  | "invalid_participant_id"
  | "duplicate_participant"
  | "invalid_share"
  | "invalid_share_total"
  | "deposit_too_small";

export class AllocationError extends Error {
  constructor(public readonly code: AllocationErrorCode) {
    super(code);
    this.name = "AllocationError";
  }
}

// Canonical UUID byte order matches PostgreSQL UUID ordering, independent of locale.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure preview/validation. Published database snapshots remain authoritative.
 * Exact BigInt multiplication/division; never round a floating-point percentage.
 * Returns a new array sorted by canonical participant ID, independent of input order.
 */
export function allocateContributions(
  deposit: Money,
  borrowers: readonly BorrowerShare[],
): ContributionAllocation[] {
  if (!CURRENCIES.includes(deposit.currency)) {
    throw new AllocationError("invalid_currency");
  }
  if (
    !Number.isSafeInteger(deposit.amountMinor) ||
    deposit.amountMinor < 1 ||
    deposit.amountMinor > PACT_POLICY.maxDepositMinor
  ) {
    throw new AllocationError("invalid_amount");
  }
  if (borrowers.length < 1 || borrowers.length > PACT_POLICY.maxBorrowers) {
    throw new AllocationError("invalid_participant_count");
  }
  const seen = new Set<string>();
  let totalBps = 0;
  const total = BigInt(deposit.amountMinor);
  const denominator = BigInt(PACT_POLICY.basisPointTotal);
  const rows = borrowers.map(({ participantId, shareBps }) => {
    if (!UUID_PATTERN.test(participantId))
      throw new AllocationError("invalid_participant_id");
    const id = participantId.toLowerCase();
    if (seen.has(id)) throw new AllocationError("duplicate_participant");
    seen.add(id);
    if (
      !Number.isSafeInteger(shareBps) ||
      shareBps < 1 ||
      shareBps > PACT_POLICY.basisPointTotal
    ) {
      throw new AllocationError("invalid_share");
    }
    totalBps += shareBps;
    const numerator = total * BigInt(shareBps);
    return {
      participantId: id,
      shareBps,
      amountMinor: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  if (totalBps !== PACT_POLICY.basisPointTotal)
    throw new AllocationError("invalid_share_total");

  const compareId = (a: BorrowerShare, b: BorrowerShare) =>
    a.participantId < b.participantId
      ? -1
      : a.participantId > b.participantId
        ? 1
        : 0;
  rows.sort((a, b) =>
    a.remainder === b.remainder
      ? compareId(a, b)
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const extras =
    deposit.amountMinor - rows.reduce((sum, row) => sum + row.amountMinor, 0);
  for (let i = 0; i < extras; i++) rows[i].amountMinor += 1;
  if (rows.some((row) => row.amountMinor === 0))
    throw new AllocationError("deposit_too_small");
  return rows
    .sort(compareId)
    .map(({ participantId, shareBps, amountMinor }) => ({
      participantId,
      shareBps,
      amountMinor,
    }));
}
