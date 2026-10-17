import { describe, expect, it } from "vitest";
import {
  createReturnRecord,
  type CreateReturnInput,
  INSPECTION_WINDOW_MS,
} from "@/features/handover/returns/return-record";

function input(): CreateReturnInput {
  return {
    id: "return-1",
    agreementId: "agreement-1",
    actor: { id: "renter", displayName: "Sam", role: "renter" },
    ownerId: "owner",
    renterId: "renter",
    active: true,
    baselineId: "baseline-1",
    baselineVersion: 2,
    baseline: {
      id: "baseline-1",
      agreementId: "agreement-1",
      termsVersion: 1,
      version: 2,
      assetType: "EQUIPMENT",
      identifier: "camera-serial",
      notes: "Good condition",
      checklist: [
        { id: "keys", label: "Camera case", checked: true, note: "" },
      ],
      evidence: [],
      publishedAt: "2026-10-17T10:00:00.000Z",
      acknowledgedBy: {
        owner: "2026-10-17T10:00:00.000Z",
        renter: "2026-10-17T10:00:00.000Z",
      },
    },
    existingRecord: null,
    location: "  Main entrance  ",
    notes: " Returned clean ",
    checklist: [
      { id: "keys", label: "Untrusted label", checked: true, note: "" },
    ],
    evidence: [
      {
        id: "photo",
        agreementId: "agreement-1",
        phase: "return",
        fileName: "return.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 200,
        sha256: "hash",
        createdAt: "2026-10-17T11:00:00.000Z",
        uploaderId: "renter",
        caption: "Camera returned",
        storage: "browser-demo",
        objectPath: "path",
        submittedAt: "2026-10-17T11:00:00.000Z",
      },
    ],
    now: "2026-10-17T12:00:00.000Z",
  };
}

describe("return declaration", () => {
  it("records a deterministic first declaration and exactly 48 hours of inspection", () => {
    const draft = input();
    const record = createReturnRecord(draft);
    expect(record.submittedAt).toBe(draft.now);
    expect(record.inspectionDeadline).toBe("2026-10-19T12:00:00.000Z");
    expect(
      Date.parse(record.inspectionDeadline) - Date.parse(record.submittedAt),
    ).toBe(INSPECTION_WINDOW_MS);
    expect(record.location).toBe("Main entrance");
    expect(record.checklist[0].label).toBe("Camera case");
    draft.evidence[0].caption = "changed";
    expect(record.evidence[0].caption).toBe("Camera returned");
  });

  it("cannot resubmit to extend an inspection deadline", () => {
    const draft = input();
    draft.existingRecord = createReturnRecord(draft);
    draft.now = "2026-10-18T12:00:00.000Z";
    expect(() => createReturnRecord(draft)).toThrow("cannot be reset");
    expect(draft.existingRecord.inspectionDeadline).toBe(
      "2026-10-19T12:00:00.000Z",
    );
  });

  it.each([
    { id: "owner", displayName: "Alex", role: "owner" as const },
    { id: "outsider", displayName: "Other", role: "renter" as const },
  ])("rejects unauthorized actor $id", (actor) => {
    expect(() => createReturnRecord({ ...input(), actor })).toThrow(
      "Only this agreement's renter",
    );
  });

  it("rejects an inactive agreement", () => {
    expect(() => createReturnRecord({ ...input(), active: false })).toThrow(
      "must be active",
    );
  });

  it("requires the current agreement and baseline version", () => {
    expect(() => createReturnRecord({ ...input(), baseline: null })).toThrow(
      "baseline",
    );
    expect(() =>
      createReturnRecord({ ...input(), agreementId: "other" }),
    ).toThrow("baseline");
    expect(() =>
      createReturnRecord({ ...input(), baselineVersion: 1 }),
    ).toThrow("baseline changed");
    expect(() => createReturnRecord({ ...input(), baselineId: "old" })).toThrow(
      "baseline changed",
    );
  });

  it.each(["owner", "renter"])(
    "requires %s acknowledgment of the current baseline",
    (actorId) => {
      const draft = input();
      delete draft.baseline?.acknowledgedBy[actorId];
      expect(() => createReturnRecord(draft)).toThrow("Both parties");
    },
  );

  it("requires return photos and rejects unfinished or mismatched evidence", () => {
    expect(() => createReturnRecord({ ...input(), evidence: [] })).toThrow(
      "photo",
    );
    for (const patch of [
      { submittedAt: null },
      { agreementId: "other" },
      { phase: "baseline" as const },
      { uploaderId: "owner" },
    ]) {
      const draft = input();
      Object.assign(draft.evidence[0], patch);
      expect(() => createReturnRecord(draft)).toThrow("finalized");
    }
    const pdfOnly = input();
    pdfOnly.evidence[0].mimeType = "application/pdf";
    expect(() => createReturnRecord(pdfOnly)).toThrow("photo");
  });

  it("requires a location, all baseline items, and explanations for missing items", () => {
    expect(() => createReturnRecord({ ...input(), location: " " })).toThrow(
      "location",
    );
    expect(() => createReturnRecord({ ...input(), checklist: [] })).toThrow(
      "every item",
    );
    const draft = input();
    draft.checklist[0].checked = false;
    expect(() => createReturnRecord(draft)).toThrow("Explain");
    draft.checklist[0].note = "Case strap missing";
    expect(createReturnRecord(draft).checklist[0].note).toBe(
      "Case strap missing",
    );
  });
});
