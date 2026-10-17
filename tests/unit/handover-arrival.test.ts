import { describe, expect, it } from "vitest";
import {
  createArrivalRecord,
  type ArrivalDraft,
} from "@/features/handover/arrival/model";

function arrivalDraft(): ArrivalDraft {
  return {
    id: "inspection",
    agreementId: "agreement",
    actor: { id: "renter", displayName: "Sam", role: "renter" },
    ownerId: "owner",
    renterId: "renter",
    enabled: true,
    existingRecord: null,
    accessConfirmed: true,
    available: true,
    matchesListing: true,
    notes: "",
    now: "2026-10-17T12:00:00.000Z",
    evidence: [
      {
        id: "photo",
        agreementId: "agreement",
        phase: "arrival",
        fileName: "arrival.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 100,
        sha256: "hash",
        createdAt: "2026-10-17T11:59:00.000Z",
        uploaderId: "renter",
        caption: "Entry",
        storage: "browser-demo",
        objectPath: "arrival/photo",
        submittedAt: "2026-10-17T12:00:00.000Z",
      },
    ],
  };
}
describe("arrival inspection validation", () => {
  it("makes an independent immutable snapshot of submitted evidence", () => {
    const input = arrivalDraft();
    const result = createArrivalRecord(input);
    input.evidence[0].caption = "changed";
    expect(result.evidence[0].caption).toBe("Entry");
  });
  it("records unfavorable results with explanation without financial actions", () => {
    const record = createArrivalRecord({
      ...arrivalDraft(),
      accessConfirmed: false,
      notes: "The keys do not open the front door.",
    });
    expect(record.accessConfirmed).toBe(false);
    expect(record).not.toHaveProperty("refund");
  });
  it("requires explicit answers, photo and meaningful discrepancy notes", () => {
    expect(() =>
      createArrivalRecord({ ...arrivalDraft(), available: null }),
    ).toThrow(/all three/);
    expect(() =>
      createArrivalRecord({ ...arrivalDraft(), evidence: [] }),
    ).toThrow(/photographs/);
    expect(() =>
      createArrivalRecord({
        ...arrivalDraft(),
        matchesListing: false,
        notes: "wrong",
      }),
    ).toThrow(/at least 10/);
  });
  it("rejects owner, outsider, disabled and duplicate submissions", () => {
    const input = arrivalDraft();
    expect(() =>
      createArrivalRecord({
        ...input,
        actor: { ...input.actor, id: "owner", role: "owner" },
      }),
    ).toThrow(/Only/);
    expect(() =>
      createArrivalRecord({
        ...input,
        actor: { ...input.actor, id: "outsider" },
      }),
    ).toThrow(/Only/);
    expect(() => createArrivalRecord({ ...input, enabled: false })).toThrow(
      /not available/,
    );
    expect(() =>
      createArrivalRecord({
        ...input,
        existingRecord: createArrivalRecord(input),
      }),
    ).toThrow(/already/);
  });
  it.each([
    { phase: "return" },
    { agreementId: "different" },
    { uploaderId: "owner" },
    { mimeType: "application/pdf" },
    { submittedAt: null },
    { sizeBytes: 0 },
  ])("rejects invalid evidence %j", (change) => {
    const input = arrivalDraft();
    expect(() =>
      createArrivalRecord({
        ...input,
        evidence: [
          {
            ...input.evidence[0],
            ...change,
          } as (typeof input.evidence)[number],
        ],
      }),
    ).toThrow();
  });
});
