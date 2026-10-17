import { demoActors } from "@/lib/auth/identity-provider";
import {
  acceptTerms,
  createInitialDemoSnapshot,
  createDemoAgreement,
  fundAgreement,
  recordBaseline,
  submitReturn,
  type DemoSnapshot,
} from "@/features/demo/model";
import {
  acknowledgeBaseline,
  baselineChecklist,
  publishBaseline,
} from "@/features/handover/baseline/model";
import { createReturnRecord } from "@/features/handover/returns/return-record";
import type { EvidenceFile } from "@/features/handover/contracts";

export const fixtureTime = "2026-10-17T10:00:00.000Z";
export function conditionPhoto(
  phase: EvidenceFile["phase"],
  uploaderId: string,
  agreementId = "demo-apartment-agreement",
): EvidenceFile {
  return {
    id: `photo-${phase}`,
    agreementId,
    phase,
    fileName: "condition.png",
    mimeType: "image/png",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    createdAt: fixtureTime,
    uploaderId,
    caption: "Condition photo",
    storage: "browser-demo",
    objectPath: `${agreementId}/${phase}/photo`,
    submittedAt: fixtureTime,
  };
}
export function activeDemoSnapshot(
  initial: DemoSnapshot = createInitialDemoSnapshot(),
) {
  let snapshot = fundAgreement(
    acceptTerms(initial, demoActors.tenant),
    demoActors.tenant,
  );
  const baseline = publishBaseline({
    id: "baseline-1",
    agreementId: snapshot.agreement.id,
    termsVersion: 1,
    assetType: snapshot.agreement.assetType,
    actor: { ...demoActors.landlord, role: "owner" },
    ownerId: demoActors.landlord.id,
    previous: null,
    identifier:
      snapshot.agreement.assetType === "APARTMENT"
        ? "Apartment 18, keys 1 and 2"
        : "DEMO-CAM-001; lens, battery, charger and case",
    notes:
      snapshot.agreement.assetType === "APARTMENT"
        ? "Existing wall mark photographed"
        : "Existing case scuff photographed",
    checklist: baselineChecklist(snapshot.agreement.assetType).map((item) => ({
      ...item,
      checked: true,
    })),
    evidence: [
      conditionPhoto("baseline", demoActors.landlord.id, snapshot.agreement.id),
    ],
    now: fixtureTime,
  });
  snapshot = recordBaseline(snapshot, demoActors.landlord, baseline);
  const acknowledged = acknowledgeBaseline({
    record: baseline,
    agreementId: snapshot.agreement.id,
    termsVersion: 1,
    baselineId: baseline.id,
    baselineVersion: 1,
    actor: { ...demoActors.tenant, role: "renter" },
    ownerId: demoActors.landlord.id,
    renterId: demoActors.tenant.id,
    now: fixtureTime,
  });
  return recordBaseline(snapshot, demoActors.tenant, acknowledged);
}
export function declaredReturn(snapshot = activeDemoSnapshot()) {
  const baseline = snapshot.agreement.handover?.baseline;
  if (!baseline) throw new Error("Fixture baseline missing");
  return createReturnRecord({
    id: "return-1",
    agreementId: snapshot.agreement.id,
    actor: { ...demoActors.tenant, role: "renter" },
    ownerId: demoActors.landlord.id,
    renterId: demoActors.tenant.id,
    active: true,
    baseline,
    baselineId: baseline.id,
    baselineVersion: baseline.version,
    existingRecord: null,
    location:
      snapshot.agreement.assetType === "APARTMENT"
        ? "Apartment front desk"
        : "Demo camera pickup desk",
    notes:
      snapshot.agreement.assetType === "APARTMENT"
        ? "Keys returned"
        : "Camera works; all accessories returned; new case mark shown",
    checklist: baseline.checklist.map((item) => ({
      ...item,
      checked: true,
      note: "",
    })),
    evidence: [
      conditionPhoto("return", demoActors.tenant.id, snapshot.agreement.id),
    ],
    now: fixtureTime,
  });
}
export function returnReviewDemoSnapshot() {
  const snapshot = activeDemoSnapshot();
  return submitReturn(snapshot, demoActors.tenant, declaredReturn(snapshot));
}

export function equipmentReturnReviewDemoSnapshot() {
  const active = activeDemoSnapshot(
    createDemoAgreement(demoActors.landlord, {
      assetType: "EQUIPMENT",
      title: "Camera rental deposit",
      address: "Demo camera pickup desk, Budapest",
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      amountMinor: 30_000,
      terms:
        "Return camera DEMO-CAM-001 and all listed accessories in the recorded condition. Review within 48 hours; allocations require renter approval.",
    }),
  );
  return submitReturn(active, demoActors.tenant, declaredReturn(active));
}
