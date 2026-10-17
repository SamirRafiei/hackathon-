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
} from "./fixtures/handover";

describe("handover and demo integration", () => {
  it("blocks a funded agreement from skipping both baseline acknowledgments", () => {
    const funded = fundAgreement(
      acceptTerms(createInitialDemoSnapshot(), demoActors.tenant),
      demoActors.tenant,
    );
    expect(() => submitReturn(funded, demoActors.tenant)).toThrow(
      "acknowledge the baseline",
    );
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
