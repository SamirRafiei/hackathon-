// @vitest-environment node
import { describe, expect, it } from "vitest";
import { demoActors } from "@/lib/auth/identity-provider";
import {
  acceptTerms,
  createInitialDemoSnapshot,
  demoSnapshotSchema,
  fundAgreement,
  recordBaseline,
  recordArrivalInspection,
  submitReturn,
} from "@/features/demo/model";
import {
  activeDemoSnapshot,
  conditionPhoto,
  declaredReturn,
  fixtureTime,
  publishedBaselineSnapshot,
  reviewedBaselineSnapshot,
} from "./fixtures/handover";

describe("handover and demo integration", () => {
  it("requires accepted terms, owner publication and tenant review before funding", () => {
    const accepted = acceptTerms(
      createInitialDemoSnapshot(),
      demoActors.tenant,
    );
    const published = publishedBaselineSnapshot();
    const reviewed = reviewedBaselineSnapshot();
    expect(accepted.agreement.status).toBe("AWAITING_BASELINE");
    expect(() => fundAgreement(accepted, demoActors.tenant)).toThrow();
    // Also guard older accepted saves using the former AWAITING_FUNDING status.
    expect(() =>
      fundAgreement(
        {
          ...accepted,
          agreement: { ...accepted.agreement, status: "AWAITING_FUNDING" },
        },
        demoActors.tenant,
      ),
    ).toThrow("current condition baseline");
    expect(() => fundAgreement(published, demoActors.tenant)).toThrow(
      "current condition baseline",
    );
    for (const snapshot of [accepted, published, reviewed]) {
      expect(snapshot.agreement.reservedMinor).toBe(0);
      expect(snapshot.agreement.ledger).toEqual([]);
      expect(demoSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(() => submitReturn(snapshot, demoActors.tenant)).toThrow(
        "must be funded",
      );
    }
    expect(fundAgreement(reviewed, demoActors.tenant).agreement.status).toBe(
      "ACTIVE",
    );
  });
  it("rejects baseline publication before tenant acceptance", () => {
    const baseline = publishedBaselineSnapshot().agreement.handover?.baseline;
    if (!baseline) throw new Error("missing fixture");
    expect(() =>
      recordBaseline(
        createInitialDemoSnapshot(),
        demoActors.landlord,
        baseline,
      ),
    ).toThrow("accepted terms");
  });
  it("resets tenant review when the landlord publishes a baseline revision", () => {
    const reviewed = reviewedBaselineSnapshot();
    const baseline = reviewed.agreement.handover?.baseline;
    if (!baseline) throw new Error("missing fixture");
    const revised = recordBaseline(reviewed, demoActors.landlord, {
      ...baseline,
      id: "baseline-2",
      version: 2,
      notes: "Updated condition",
      acknowledgedBy: { [demoActors.landlord.id]: fixtureTime },
    });
    expect(
      revised.agreement.handover?.baseline?.acknowledgedBy[
        demoActors.tenant.id
      ],
    ).toBeUndefined();
    expect(() => fundAgreement(revised, demoActors.tenant)).toThrow(
      "current condition baseline",
    );
    expect(revised.agreement.reservedMinor).toBe(0);
  });
  it("lets legacy funded saves finish baseline review without funding twice", () => {
    const active = activeDemoSnapshot();
    const published = publishedBaselineSnapshot();
    const legacy = {
      ...active,
      agreement: {
        ...active.agreement,
        status: "FUNDED" as const,
        handover: published.agreement.handover,
      },
    };
    const baseline = active.agreement.handover?.baseline;
    if (!baseline) throw new Error("missing fixture");
    const result = recordBaseline(legacy, demoActors.tenant, baseline);
    expect(result.agreement.status).toBe("ACTIVE");
    expect(result.agreement.ledger).toEqual(active.agreement.ledger);
    expect(() => fundAgreement(result, demoActors.tenant)).toThrow();
  });
  it("activates only after baseline consent and preserves evidence after serialized reload", () => {
    const active = activeDemoSnapshot();
    expect(active.agreement.status).toBe("ACTIVE");
    const loaded = demoSnapshotSchema.parse(JSON.parse(JSON.stringify(active)));
    expect(loaded.agreement.handover?.baseline?.evidence[0].id).toBe(
      "photo-baseline",
    );
    expect(loaded.agreement.reservedMinor).toBe(active.agreement.reservedMinor);
  });
  it("rejects baseline edits once active", () => {
    const active = activeDemoSnapshot();
    const baseline = active.agreement.handover?.baseline;
    if (!baseline) throw new Error("missing fixture");
    expect(() =>
      recordBaseline(active, demoActors.landlord, {
        ...baseline,
        notes: "Replaced",
      }),
    ).toThrow("awaiting activation");
  });
  it("requires a photographed return, fixes one deadline, and preserves reserved funds", () => {
    const active = activeDemoSnapshot();
    expect(() => submitReturn(active, demoActors.tenant)).toThrow(
      "photographs",
    );
    const result = submitReturn(
      active,
      demoActors.tenant,
      declaredReturn(active),
    );
    expect(result.agreement.status).toBe("RETURN_REVIEW");
    expect(result.agreement.handover?.returnRecord?.inspectionDeadline).toBe(
      "2026-10-19T10:00:00.000Z",
    );
    expect(result.agreement.reservedMinor).toBe(active.agreement.reservedMinor);
    expect(result.agreement.ledger).toEqual(active.agreement.ledger);
    expect(() =>
      submitReturn(result, demoActors.tenant, declaredReturn(active)),
    ).toThrow();
  });
  it("rejects a return for another baseline, wrong actor, or changed deadline", () => {
    const active = activeDemoSnapshot();
    const record = declaredReturn(active);
    expect(() =>
      submitReturn(active, demoActors.tenant, {
        ...record,
        baselineId: "different",
      }),
    ).toThrow("does not match");
    expect(() => submitReturn(active, demoActors.landlord, record)).toThrow(
      "tenant",
    );
    expect(() =>
      submitReturn(active, demoActors.tenant, {
        ...record,
        inspectionDeadline: fixtureTime,
      }),
    ).toThrow("exactly one");
  });
  it("records an unfavorable arrival inspection without releasing any funds", () => {
    const active = activeDemoSnapshot();
    const record = {
      id: "arrival-1",
      agreementId: active.agreement.id,
      submittedBy: demoActors.tenant.id,
      submittedAt: fixtureTime,
      accessConfirmed: false,
      available: false,
      matchesListing: false,
      notes: "Keys did not open the unit",
      evidence: [conditionPhoto("arrival", demoActors.tenant.id)],
    };
    const inspected = recordArrivalInspection(
      active,
      demoActors.tenant,
      record,
    );
    expect(inspected.agreement.handover?.arrivalRecord?.accessConfirmed).toBe(
      false,
    );
    expect(inspected.agreement.status).toBe("ACTIVE");
    expect(inspected.agreement.reservedMinor).toBe(
      active.agreement.reservedMinor,
    );
    expect(inspected.agreement.ledger).toEqual(active.agreement.ledger);
    expect(() =>
      recordArrivalInspection(inspected, demoActors.tenant, record),
    ).toThrow("already submitted");
  });
});
