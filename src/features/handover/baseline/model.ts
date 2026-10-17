import type {
  AssetType,
  BaselineRecord,
  ChecklistItem,
  EvidenceFile,
  HandoverActor,
} from "../contracts";

export function baselineChecklist(assetType: AssetType): ChecklistItem[] {
  const labels =
    assetType === "APARTMENT"
      ? [
          "Rooms and surfaces inspected",
          "Furniture and inventory recorded",
          "Keys and access devices counted",
          "Existing damage documented",
        ]
      : [
          "Serial number and identifying details checked",
          "Accessories counted",
          "Working condition checked",
          "Existing damage documented",
        ];
  return labels.map((label, index) => ({
    id: `${assetType.toLowerCase()}-${index}`,
    label,
    checked: false,
    note: "",
  }));
}

export type PublishBaselineInput = {
  agreementId: string;
  termsVersion: number;
  assetType: AssetType;
  actor: HandoverActor;
  ownerId: string;
  previous: BaselineRecord | null;
  identifier: string;
  notes: string;
  checklist: ChecklistItem[];
  evidence: EvidenceFile[];
  now: string;
  id: string;
  locked?: boolean;
};

/** Validates a snapshot; persistence/authorization must also be enforced by the server adapter. */
export function publishBaseline(input: PublishBaselineInput): BaselineRecord {
  if (
    !input.id.trim() ||
    !input.ownerId.trim() ||
    !Number.isFinite(Date.parse(input.now))
  )
    throw new Error("A record ID and valid publication time are required.");
  if (input.locked)
    throw new Error("The condition record is locked after activation.");
  if (input.actor.role !== "owner" || input.actor.id !== input.ownerId)
    throw new Error("Only the owner can publish the condition record.");
  if (
    !input.agreementId ||
    !Number.isInteger(input.termsVersion) ||
    input.termsVersion < 1
  )
    throw new Error("A valid agreement version is required.");
  if (
    input.previous &&
    (input.previous.agreementId !== input.agreementId ||
      input.previous.assetType !== input.assetType ||
      input.previous.termsVersion > input.termsVersion)
  )
    throw new Error(
      "The previous condition record does not match this agreement.",
    );
  if (
    input.identifier.trim().length < 3 ||
    input.identifier.trim().length > 240
  )
    throw new Error("Add identifying details between 3 and 240 characters.");
  if (input.notes.length > 5000)
    throw new Error("Keep condition notes to 5,000 characters or fewer.");
  const expected = baselineChecklist(input.assetType);
  if (
    input.checklist.length !== 4 ||
    input.checklist.some(
      (item, index) =>
        item.id !== expected[index].id ||
        item.label !== expected[index].label ||
        item.note.length > 2000 ||
        !item.checked,
    )
  )
    throw new Error("Complete every condition check before publishing.");
  if (!input.evidence.some((file) => file.mimeType.startsWith("image/")))
    throw new Error("Add at least one condition photograph.");
  if (
    new Set(input.evidence.map((file) => file.id)).size !==
      input.evidence.length ||
    input.evidence.some(
      (file) =>
        !["image/jpeg", "image/png", "image/webp"].includes(file.mimeType),
    )
  )
    throw new Error(
      "Each condition photograph must be unique and use JPEG, PNG or WebP.",
    );
  if (
    input.evidence.some(
      (file) =>
        file.agreementId !== input.agreementId ||
        file.phase !== "baseline" ||
        file.uploaderId !== input.ownerId ||
        !file.submittedAt ||
        !Number.isFinite(Date.parse(file.submittedAt)),
    )
  )
    throw new Error(
      "Every photograph must be finalized for this agreement and owner.",
    );
  return {
    id: input.id,
    agreementId: input.agreementId,
    termsVersion: input.termsVersion,
    version: (input.previous?.version ?? 0) + 1,
    assetType: input.assetType,
    identifier: input.identifier.trim(),
    notes: input.notes.trim(),
    checklist: input.checklist.map((item) => ({ ...item })),
    evidence: input.evidence.map((file) => ({ ...file })),
    publishedAt: input.now,
    acknowledgedBy: { [input.ownerId]: input.now },
  };
}

export function acknowledgeBaseline(input: {
  record: BaselineRecord;
  agreementId: string;
  termsVersion: number;
  baselineId: string;
  baselineVersion: number;
  actor: HandoverActor;
  ownerId: string;
  renterId: string;
  now: string;
}): BaselineRecord {
  const { record, actor } = input;
  if (!Number.isFinite(Date.parse(input.now)))
    throw new Error("A valid acknowledgment time is required.");
  if (
    record.agreementId !== input.agreementId ||
    record.termsVersion !== input.termsVersion ||
    record.id !== input.baselineId ||
    record.version !== input.baselineVersion
  )
    throw new Error("The condition record changed. Review the latest version.");
  if (!(
    (actor.id === input.ownerId && actor.role === "owner") ||
    (actor.id === input.renterId && actor.role === "renter")
  ))
    throw new Error("Only agreement participants can acknowledge this record.");
  return {
    ...record,
    acknowledgedBy: {
      ...record.acknowledgedBy,
      [actor.id]: record.acknowledgedBy[actor.id] ?? input.now,
    },
  };
}
