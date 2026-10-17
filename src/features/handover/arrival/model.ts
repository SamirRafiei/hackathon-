import type { ArrivalRecord, EvidenceFile, HandoverActor } from "../contracts";
import { MAX_EVIDENCE_BYTES, MAX_EVIDENCE_FILES } from "../evidence/validation";

export type ArrivalDraft = {
  id: string;
  agreementId: string;
  actor: HandoverActor;
  ownerId: string;
  renterId: string;
  enabled: boolean;
  existingRecord: ArrivalRecord | null;
  accessConfirmed: boolean | null;
  available: boolean | null;
  matchesListing: boolean | null;
  notes: string;
  evidence: EvidenceFile[];
  now: string;
};

/** Validate on the server again when wiring this record to persistence. */
export function createArrivalRecord(input: ArrivalDraft): ArrivalRecord {
  if (!input.enabled)
    throw new Error("Arrival inspection is not available yet.");
  if (
    input.actor.role !== "renter" ||
    input.actor.id !== input.renterId ||
    input.actor.id === input.ownerId
  )
    throw new Error(
      "Only the participating renter can submit an arrival inspection.",
    );
  if (input.existingRecord)
    throw new Error("This arrival inspection has already been submitted.");
  if (
    !input.id ||
    !input.agreementId ||
    !Number.isFinite(Date.parse(input.now))
  )
    throw new Error("The inspection identity or submission time is invalid.");
  const answers = [
    input.accessConfirmed,
    input.available,
    input.matchesListing,
  ];
  if (answers.some((answer) => typeof answer !== "boolean"))
    throw new Error("Answer all three inspection questions with Yes or No.");
  const notes = input.notes.trim();
  if (notes.length > 4000)
    throw new Error("Keep inspection notes to 4,000 characters.");
  if (answers.includes(false) && notes.length < 10)
    throw new Error(
      "Describe the access problem or listing differences in at least 10 characters.",
    );
  if (!input.evidence.length || input.evidence.length > MAX_EVIDENCE_FILES)
    throw new Error("Add between 1 and 12 arrival photographs.");
  const ids = new Set<string>();
  for (const file of input.evidence) {
    if (
      ids.has(file.id) ||
      !file.id ||
      file.agreementId !== input.agreementId ||
      file.phase !== "arrival" ||
      file.uploaderId !== input.actor.id
    )
      throw new Error(
        "Arrival evidence must belong to this agreement and renter.",
      );
    ids.add(file.id);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.mimeType) ||
      file.sizeBytes <= 0 ||
      file.sizeBytes > MAX_EVIDENCE_BYTES
    )
      throw new Error(
        "Arrival evidence must be a supported photograph up to 10 MB.",
      );
    if (!file.submittedAt || !Number.isFinite(Date.parse(file.submittedAt)))
      throw new Error("Save all photographs before submitting the inspection.");
  }
  return {
    id: input.id,
    agreementId: input.agreementId,
    submittedBy: input.actor.id,
    submittedAt: input.now,
    accessConfirmed: input.accessConfirmed as boolean,
    available: input.available as boolean,
    matchesListing: input.matchesListing as boolean,
    notes,
    evidence: input.evidence.map((file) => ({ ...file })),
  };
}
