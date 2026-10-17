import type {
  AgreementSummary,
  AgreementTerms,
  AgreementVersionSnapshot,
  EvidenceMime,
  EvidencePhase,
  Json,
  MinorUnits,
  UUID,
  UtcTimestamp,
} from "./model";

export type DomainErrorCode =
  | "not_authenticated"
  | "not_authorized"
  | "validation_failed"
  | "not_found"
  | "stale_version"
  | "stale_revision"
  | "invalid_state"
  | "terms_frozen"
  | "acceptances_required"
  | "funding_incomplete"
  | "inspection_expired"
  | "claim_open"
  | "invitation_invalid"
  | "verified_email_required"
  | "challenge_invalid"
  | "evidence_required"
  | "idempotency_conflict"
  | "already_processed"
  | "temporarily_unavailable";
export type OperationResult<T> =
  | { ok: true; data: T; replayed: boolean }
  | {
      ok: false;
      error: { code: DomainErrorCode; message: string; retryable: boolean };
    };
export interface MutationInput {
  agreementId: UUID;
  expectedRevision: string;
  idempotencyKey: string;
}
export interface VersionMutationInput extends MutationInput {
  versionId: UUID;
}
export interface TransitionResult {
  agreement: AgreementSummary;
  operationId: UUID;
}
export interface BatchInput {
  batchSize: number;
  idempotencyKey: string;
}
export interface BatchResult {
  jobRunId: UUID;
  processedCount: number;
  hasMore: boolean;
}
export interface EvidenceInput {
  phase: EvidencePhase;
  exchangeEventId?: UUID;
  disputeId?: UUID;
  caseId?: UUID;
  mimeType: EvidenceMime;
  sizeBytes: number;
  sha256: string;
  caption?: string;
  actualParticipantId?: UUID;
}
type Operation<I, O> = { input: I; output: O };

/** Domain contract map. See supabase/FUNDING.md and CANCELLATION.md for implemented RPCs.
 * Implementers obtain identity from verified auth, not input. Every authoritative
 * transition must call ONE authorized database transaction.
 */
export interface DomainOperations {
  createAgreement: Operation<
    { idempotencyKey: string; currency: AgreementTerms["currency"] },
    TransitionResult
  >;
  publishAgreementVersion: Operation<
    MutationInput & { terms: AgreementTerms },
    TransitionResult & { version: AgreementVersionSnapshot }
  >;
  claimInvitation: Operation<
    { token: string; idempotencyKey: string },
    TransitionResult & { participantId: UUID }
  >;
  createInvitation: Operation<
    VersionMutationInput & { participantId: UUID },
    { invitationId: UUID; token: string; expiresAt: UtcTimestamp }
  >;
  revokeInvitation: Operation<
    VersionMutationInput & { invitationId: UUID },
    TransitionResult
  >;
  proposeAgreementChange: Operation<
    VersionMutationInput & {
      proposedChanges: Record<string, Json>;
      reason: string;
    },
    TransitionResult & { changeRequestId: UUID }
  >;
  acceptAgreementVersion: Operation<VersionMutationInput, TransitionResult>;
  startContribution: Operation<
    VersionMutationInput & { contributionId: UUID },
    TransitionResult & { attemptId: UUID; dueAt: UtcTimestamp }
  >;
  completeSimulatedContribution: Operation<
    { attemptId: UUID; idempotencyKey: string },
    TransitionResult & {
      attemptId: UUID;
      attemptState: "succeeded" | "failed" | "cancelled";
    }
  >;
  cancelAgreement: Operation<MutationInput, TransitionResult>;
  prepareCollection: Operation<
    VersionMutationInput & {
      checklist: Record<string, Json>;
      itemIdentifier?: string;
    },
    TransitionResult & { exchangeEventId: UUID }
  >;
  createVerificationChallenge: Operation<
    MutationInput & { exchangeEventId: UUID; purpose: "collection" | "return" },
    {
      challengeId: UUID;
      token: string;
      manualCode: string;
      expiresAt: UtcTimestamp;
    }
  >;
  confirmHandover: Operation<
    VersionMutationInput & {
      exchangeEventId: UUID;
      challengeId: UUID;
      proof: string;
      evidenceIds: UUID[];
      checklist: Record<string, Json>;
    },
    TransitionResult
  >;
  requestReturn: Operation<
    MutationInput & { evidenceIds: UUID[]; checklist: Record<string, Json> },
    TransitionResult & { exchangeEventId: UUID }
  >;
  acknowledgeReturn: Operation<
    MutationInput & { exchangeEventId: UUID },
    TransitionResult
  >;
  approveFullRefund: Operation<MutationInput, TransitionResult>;
  openClaim: Operation<
    MutationInput & {
      requestedMinor: MinorUnits;
      reason: string;
      evidenceIds: UUID[];
    },
    TransitionResult & { disputeId: UUID }
  >;
  prepareEvidenceUpload: Operation<
    MutationInput & EvidenceInput,
    { evidenceId: UUID; bucketId: "pact-evidence"; objectPath: string }
  >;
  submitEvidence: Operation<
    MutationInput & { evidenceId: UUID },
    TransitionResult
  >;
  proposeSettlement: Operation<
    MutationInput & {
      disputeId: UUID;
      deductionMinor: MinorUnits;
      reason: string;
    },
    TransitionResult & { proposalId: UUID }
  >;
  acceptSettlement: Operation<
    MutationInput & { proposalId: UUID },
    TransitionResult
  >;
  rejectSettlement: Operation<
    MutationInput & { proposalId: UUID },
    TransitionResult
  >;
  requestReviewEvidence: Operation<
    MutationInput & { caseId: UUID; explanation: string },
    TransitionResult & { evidenceRequestId: UUID }
  >;
  recordReviewerDecision: Operation<
    MutationInput & {
      caseId: UUID;
      evidenceIds: UUID[];
      explanation: string;
      policyBasis: string;
    } & (
        | { kind: "financial"; deductionMinor: MinorUnits }
        | { kind: "receipt_confirmed" | "receipt_unconfirmed" }
      ),
    TransitionResult & { decisionId: UUID }
  >;
  processDueInspections: Operation<BatchInput, BatchResult>;
  escalateDueCases: Operation<BatchInput, BatchResult>;
  processDueContributions: Operation<BatchInput, BatchResult>;
  processReturnReminders: Operation<BatchInput, BatchResult>;
}
export type OperationInput<K extends keyof DomainOperations> =
  DomainOperations[K]["input"];
export type OperationOutput<K extends keyof DomainOperations> =
  DomainOperations[K]["output"];
export type DomainHandler<K extends keyof DomainOperations> = (
  input: OperationInput<K>,
) => Promise<OperationResult<OperationOutput<K>>>;

/** Server adapter boundary; simulate only. Completion is worker-driven, not a browser timer. */
export interface DepositProvider {
  readonly kind: "simulated";
  start(
    input: OperationInput<"startContribution">,
  ): Promise<OperationResult<OperationOutput<"startContribution">>>;
  cancel(
    input: OperationInput<"cancelAgreement">,
  ): Promise<OperationResult<OperationOutput<"cancelAgreement">>>;
  complete(
    input: OperationInput<"completeSimulatedContribution">,
  ): Promise<OperationResult<OperationOutput<"completeSimulatedContribution">>>;
}
