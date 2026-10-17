import { describe, expect, it } from "vitest";
import type { EvidenceFile } from "@/features/handover/contracts";
import {
  acknowledgeBaseline,
  baselineChecklist,
  publishBaseline,
  type PublishBaselineInput,
} from "@/features/handover/baseline/model";

const evidence: EvidenceFile = {
  id: "photo",
  agreementId: "a",
  phase: "baseline",
  fileName: "condition.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 100,
  sha256: "hash",
  createdAt: "2026-10-17T12:00:00Z",
  uploaderId: "owner",
  caption: "",
  storage: "browser-demo",
  objectPath: "photo",
  submittedAt: "2026-10-17T12:00:01Z",
};
function input(): PublishBaselineInput {
  return {
    agreementId: "a",
    termsVersion: 1,
    assetType: "EQUIPMENT",
    actor: { id: "owner", displayName: "Owner", role: "owner" },
    ownerId: "owner",
    previous: null,
    identifier: "Camera SN123",
    notes: "Small existing scuff",
    checklist: baselineChecklist("EQUIPMENT").map((item) => ({
      ...item,
      checked: true,
    })),
    evidence: [{ ...evidence }],
    now: "2026-10-17T12:01:00Z",
    id: "baseline-1",
  };
}
function acknowledgment(record = publishBaseline(input())) {
  return {
    record,
    agreementId: "a",
    termsVersion: 1,
    baselineId: record.id,
    baselineVersion: record.version,
    actor: { id: "renter", displayName: "Borrower", role: "renter" as const },
    ownerId: "owner",
    renterId: "renter",
    now: "2026-10-17T12:02:00Z",
  };
}

describe("baseline record lifecycle", () => {
  it("publishes a detached snapshot and acknowledges only the owner", () => {
    const source = input();
    const record = publishBaseline(source);
    source.checklist[0].note = "Changed later";
    source.evidence[0].caption = "Changed later";
    expect(record.checklist[0].note).toBe("");
    expect(record.evidence[0].caption).toBe("");
    expect(record.acknowledgedBy).toEqual({ owner: source.now });
  });
  it("revisions increment the version and reset borrower acknowledgment without mutating history", () => {
    const original = acknowledgeBaseline(acknowledgment());
    const revised = publishBaseline({
      ...input(),
      previous: original,
      id: "baseline-2",
    });
    expect(revised.version).toBe(2);
    expect(revised.acknowledgedBy.renter).toBeUndefined();
    expect(original.acknowledgedBy.renter).toBeDefined();
    expect(original.version).toBe(1);
  });
  it.each([
    [
      "wrong owner",
      {
        actor: {
          id: "stranger",
          displayName: "Stranger",
          role: "owner" as const,
        },
      },
    ],
    [
      "renter role",
      { actor: { id: "owner", displayName: "Owner", role: "renter" as const } },
    ],
    ["locked record", { locked: true }],
    ["missing identifier", { identifier: " " }],
    ["overlong identifier", { identifier: "x".repeat(241) }],
    ["overlong notes", { notes: "x".repeat(5001) }],
    ["missing record ID", { id: " " }],
    ["invalid publication time", { now: "not a date" }],
    ["duplicate image IDs", { evidence: [{ ...evidence }, { ...evidence }] }],
    [
      "non-photo document",
      {
        evidence: [
          { ...evidence },
          { ...evidence, id: "pdf", mimeType: "application/pdf" as const },
        ],
      },
    ],
    [
      "invalid evidence timestamp",
      { evidence: [{ ...evidence, submittedAt: "invalid" }] },
    ],
    [
      "spoofed checklist label",
      {
        checklist: input().checklist.map((item, index) =>
          index === 0 ? { ...item, label: "Irrelevant check" } : item,
        ),
      },
    ],
    [
      "overlong checklist notes",
      {
        checklist: input().checklist.map((item, index) =>
          index === 0 ? { ...item, note: "x".repeat(2001) } : item,
        ),
      },
    ],
    ["missing image", { evidence: [] }],
    ["unchecked checklist", { checklist: baselineChecklist("EQUIPMENT") }],
    ["unfinalized image", { evidence: [{ ...evidence, submittedAt: null }] }],
    [
      "different agreement image",
      { evidence: [{ ...evidence, agreementId: "b" }] },
    ],
    [
      "different owner image",
      { evidence: [{ ...evidence, uploaderId: "stranger" }] },
    ],
    ["return image", { evidence: [{ ...evidence, phase: "return" as const }] }],
  ])("rejects %s", (_, changes) => {
    expect(() => publishBaseline({ ...input(), ...changes })).toThrow();
  });
  it("requires acknowledgment of the exact baseline and terms versions", () => {
    const source = acknowledgment();
    expect(() =>
      acknowledgeBaseline({ ...source, baselineVersion: 9 }),
    ).toThrow();
    expect(() =>
      acknowledgeBaseline({ ...source, baselineId: "different" }),
    ).toThrow();
    expect(() => acknowledgeBaseline({ ...source, termsVersion: 2 })).toThrow();
    expect(() =>
      acknowledgeBaseline({ ...source, agreementId: "b" }),
    ).toThrow();
  });
  it("rejects a participant with the wrong identity or role", () => {
    expect(() =>
      acknowledgeBaseline({
        ...acknowledgment(),
        actor: { id: "stranger", displayName: "Other", role: "renter" },
      }),
    ).toThrow();
    expect(() =>
      acknowledgeBaseline({
        ...acknowledgment(),
        actor: { id: "renter", displayName: "Borrower", role: "owner" },
      }),
    ).toThrow();
  });
  it("retains the original timestamp on duplicate acknowledgment", () => {
    const accepted = acknowledgeBaseline(acknowledgment());
    const again = acknowledgeBaseline({
      ...acknowledgment(accepted),
      now: "2026-10-18T12:00:00Z",
    });
    expect(again.acknowledgedBy.renter).toBe("2026-10-17T12:02:00Z");
  });
  it("includes apartment inventory and equipment serial checks", () => {
    expect(
      baselineChecklist("APARTMENT").some((item) =>
        item.label.includes("Keys"),
      ),
    ).toBe(true);
    expect(
      baselineChecklist("EQUIPMENT").some((item) =>
        item.label.includes("Serial"),
      ),
    ).toBe(true);
  });
});
