// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  agreementTermsSchema,
  evidenceMetadataSchema,
  mutationInputSchema,
} from "../../src/lib/domain/validation";

const terms = {
  currency: "EUR",
  depositMinor: 25000,
  itemName: "Camera",
  itemDescription: "Camera and lens",
  accessories: ["Lens"],
  terms: "Return in the documented condition",
  conditionRequirements: { photos: true },
  startsAt: "2026-10-17T10:00:00Z",
  dueAt: "2026-10-20T10:00:00Z",
  borrowers: [
    {
      participantId: "00000000-0000-0000-0000-000000000001",
      email: "sam@example.com",
      shareBps: 10000,
    },
  ],
  policyVersion: "pact-v1",
  inspectionHours: 48,
  anyBorrowerMayExchange: true,
};
describe("shared domain validation", () => {
  it("validates terms and normalizes invitation emails", () => {
    expect(
      agreementTermsSchema.parse({
        ...terms,
        borrowers: [{ ...terms.borrowers[0], email: " SAM@example.com " }],
      }).borrowers[0].email,
    ).toBe("sam@example.com");
  });
  it.each([
    { inspectionHours: 1 },
    { anyBorrowerMayExchange: false },
    { depositMinor: 0 },
    { dueAt: terms.startsAt },
    { dueAt: "invalid" },
    { currency: "JPY" },
    { ownerId: "caller-cannot-set-owner" },
  ])("rejects invalid or policy-changing terms %j", (change) => {
    expect(
      agreementTermsSchema.safeParse({ ...terms, ...change }).success,
    ).toBe(false);
  });
  it("rejects duplicate emails and invalid allocation", () => {
    expect(
      agreementTermsSchema.safeParse({
        ...terms,
        borrowers: [
          terms.borrowers[0],
          {
            ...terms.borrowers[0],
            participantId: "00000000-0000-0000-0000-000000000002",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      agreementTermsSchema.safeParse({
        ...terms,
        borrowers: [{ ...terms.borrowers[0], shareBps: 9999 }],
      }).success,
    ).toBe(false);
  });
  it("accepts only bounded decimal revisions and no caller identity", () => {
    const input = {
      agreementId: terms.borrowers[0].participantId,
      expectedRevision: "0",
      idempotencyKey: "fund-1",
    };
    expect(mutationInputSchema.safeParse(input).success).toBe(true);
    expect(
      mutationInputSchema.safeParse({
        ...input,
        expectedRevision: "9223372036854775808",
      }).success,
    ).toBe(false);
    expect(
      mutationInputSchema.safeParse({ ...input, actorId: input.agreementId })
        .success,
    ).toBe(false);
  });
  it("restricts evidence size, MIME and PDF phase", () => {
    const evidence = {
      phase: "dispute",
      mimeType: "application/pdf",
      sizeBytes: 10000000,
      sha256: "a".repeat(64),
    };
    expect(evidenceMetadataSchema.safeParse(evidence).success).toBe(true);
    for (const change of [
      { phase: "collection" },
      { sizeBytes: 10000001 },
      { mimeType: "image/svg+xml" },
      { sha256: "bad" },
    ]) {
      expect(
        evidenceMetadataSchema.safeParse({ ...evidence, ...change }).success,
      ).toBe(false);
    }
  });
});
