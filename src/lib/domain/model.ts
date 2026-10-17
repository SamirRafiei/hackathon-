/** Hand-authored domain contracts, NOT generated database row types. */
export const PACT_POLICY = {
  version: "pact-v1",
  inspectionHours: 24,
  negotiationHours: 24,
  unacknowledgedReturnHours: 24,
  invitationHours: 24,
  challengeMinutes: 10,
  maxBorrowers: 20,
  maxDepositMinor: 100_000_000,
  basisPointTotal: 10_000,
  maxEvidenceBytes: 10_000_000,
} as const;

export const CURRENCIES = ["EUR", "USD", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const AGREEMENT_STATES = [
  "draft",
  "awaiting_acceptance",
  "awaiting_funding",
  "ready_for_handover",
  "active",
  "return_requested",
  "inspecting",
  "disputed",
  "settling",
  "completed",
  "cancelling",
  "cancelled",
] as const;
export type AgreementState = (typeof AGREEMENT_STATES)[number];
export const CONTRIBUTION_STATES = [
  "awaiting_payment",
  "processing",
  "secured",
  "failed",
  "refund_pending",
  "refunded",
  "partially_refunded",
  "allocated_to_owner",
] as const;
export type ContributionState = (typeof CONTRIBUTION_STATES)[number];
export const DISPUTE_STATES = [
  "negotiating",
  "in_review",
  "awaiting_evidence",
  "resolved",
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];
export type ReviewReason =
  "overdue_return" | "unacknowledged_return" | "negotiation_expired";
export type EvidencePhase = "item" | "collection" | "return" | "dispute";
export type EvidenceMime =
  "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export type UUID = string;
/** UTC ISO 8601 timestamp, serialized by the server. */
export type UtcTimestamp = string;
/** Integer JSON number within PACT_POLICY.maxDepositMinor. Validate at boundaries. */
export type MinorUnits = number;
export type BasisPoints = number;
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Money {
  currency: Currency;
  amountMinor: MinorUnits;
}
export interface BorrowerShare {
  participantId: UUID;
  shareBps: BasisPoints;
}
export interface ContributionAllocation extends BorrowerShare {
  amountMinor: MinorUnits;
}
export interface BorrowerTerms extends BorrowerShare {
  email: string;
}
export interface AgreementTerms {
  currency: Currency;
  depositMinor: MinorUnits;
  rentalFeeMinor?: MinorUnits;
  itemName: string;
  itemDescription: string;
  itemIdentifier?: string;
  accessories: string[];
  terms: string;
  conditionRequirements: Record<string, Json>;
  startsAt: UtcTimestamp;
  dueAt: UtcTimestamp;
  borrowers: BorrowerTerms[];
  policyVersion: "pact-v1";
  inspectionHours: 24;
  anyBorrowerMayExchange: true;
}
export interface AgreementVersionSnapshot extends Omit<
  AgreementTerms,
  "borrowers"
> {
  id: UUID;
  agreementId: UUID;
  ownerId: UUID;
  versionNumber: number;
  publishedAt: UtcTimestamp;
  borrowers: (BorrowerTerms & { amountMinor: MinorUnits })[];
}
export interface AgreementSummary {
  id: UUID;
  ownerId: UUID;
  currency: Currency;
  state: AgreementState;
  currentVersionId: UUID | null;
  /** bigint is serialized as a decimal string to avoid eventual precision loss. */
  revision: string;
  returnedAt: UtcTimestamp | null;
  inspectionDeadline: UtcTimestamp | null;
}
