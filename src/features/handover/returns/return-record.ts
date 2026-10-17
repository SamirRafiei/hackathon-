import type {
  BaselineRecord,
  ChecklistItem,
  EvidenceFile,
  HandoverActor,
  ReturnRecord,
} from "../contracts";

export const INSPECTION_WINDOW_MS = 48 * 60 * 60 * 1000;

export type CreateReturnInput = {
  id: string;
  agreementId: string;
  actor: HandoverActor;
  ownerId: string;
  renterId: string;
  active: boolean;
  baseline: BaselineRecord | null;
  baselineId: string;
  baselineVersion: number;
  existingRecord: ReturnRecord | null;
  location: string;
  notes: string;
  checklist: ChecklistItem[];
  evidence: EvidenceFile[];
  now: string;
};

/** Validates a declaration without releasing funds or proving physical receipt. */
export function createReturnRecord(input: CreateReturnInput): ReturnRecord {
  if (input.existingRecord) {
    throw new Error(
      "A return has already been declared. Its deadline cannot be reset.",
    );
  }
  if (input.actor.role !== "renter" || input.actor.id !== input.renterId) {
    throw new Error("Only this agreement's renter can declare the return.");
  }
  if (!input.active)
    throw new Error("The agreement must be active to declare a return.");
  const baseline = input.baseline;
  if (!baseline || baseline.agreementId !== input.agreementId) {
    throw new Error("A condition baseline for this agreement is required.");
  }
  if (
    baseline.id !== input.baselineId ||
    baseline.version !== input.baselineVersion
  ) {
    throw new Error(
      "The baseline changed. Review the latest condition record before returning.",
    );
  }
  if (
    !baseline.acknowledgedBy[input.ownerId] ||
    !baseline.acknowledgedBy[input.renterId]
  ) {
    throw new Error(
      "Both parties must acknowledge the current baseline first.",
    );
  }
  const location = input.location.trim();
  if (!location) throw new Error("Enter the return location.");
  if (location.length > 300 || input.notes.length > 4000) {
    throw new Error(
      "Keep the location within 300 characters and notes within 4,000 characters.",
    );
  }
  const expectedIds = baseline.checklist.map((item) => item.id);
  if (
    new Set(input.checklist.map((item) => item.id)).size !==
      input.checklist.length ||
    expectedIds.length !== input.checklist.length ||
    expectedIds.some((id) => !input.checklist.some((item) => item.id === id))
  ) {
    throw new Error("Review every item from the accepted baseline checklist.");
  }
  if (input.checklist.some((item) => !item.checked && !item.note.trim())) {
    throw new Error(
      "Explain any keys, accessories, or inventory that were not returned.",
    );
  }
  if (!input.evidence.some((file) => file.mimeType.startsWith("image/"))) {
    throw new Error("Add at least one return condition photo.");
  }
  if (
    new Set(input.evidence.map((file) => file.id)).size !==
      input.evidence.length ||
    input.evidence.some(
      (file) =>
        file.agreementId !== input.agreementId ||
        file.phase !== "return" ||
        file.uploaderId !== input.actor.id ||
        !file.submittedAt,
    )
  ) {
    throw new Error(
      "All return evidence must be finalized for this renter and agreement.",
    );
  }
  const submittedTime = Date.parse(input.now);
  if (!Number.isFinite(submittedTime))
    throw new Error("A valid submission time is required.");
  return {
    id: input.id,
    agreementId: input.agreementId,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
    submittedBy: input.actor.id,
    submittedAt: new Date(submittedTime).toISOString(),
    inspectionDeadline: new Date(
      submittedTime + INSPECTION_WINDOW_MS,
    ).toISOString(),
    location,
    notes: input.notes.trim(),
    checklist: baseline.checklist.map((item) => {
      const answer = input.checklist.find((entry) => entry.id === item.id);
      if (!answer) throw new Error("A baseline checklist answer is missing.");
      return {
        id: item.id,
        label: item.label,
        checked: answer.checked,
        note: answer.note.trim(),
      };
    }),
    evidence: input.evidence.map((file) => ({ ...file })),
  };
}
