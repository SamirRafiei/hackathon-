import { demoActors } from "@/lib/auth/identity-provider";
import {
  acceptTerms,
  createInitialDemoSnapshot,
  fundAgreement,
  recordBaseline,
  submitReturn,
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
): EvidenceFile {
  return {
    id: `photo-${phase}`,
    agreementId: "demo-apartment-agreement",
    phase,
    fileName: "condition.png",
    mimeType: "image/png",
    sizeBytes: 100,
    sha256: "a".repeat(64),
    createdAt: fixtureTime,
    uploaderId,
    caption: "Condition photo",
    storage: "browser-demo",
    objectPath: `demo-apartment-agreement/${phase}/photo`,
    submittedAt: fixtureTime,
  };
}
export function activeDemoSnapshot() {
  let snapshot = fundAgreement(
    acceptTerms(createInitialDemoSnapshot(), demoActors.tenant),
    demoActors.tenant,
  );
  const baseline = publishBaseline({
    id: "baseline-1",
    agreementId: snapshot.agreement.id,
    termsVersion: 1,
    assetType: "APARTMENT",
    actor: { ...demoActors.landlord, role: "owner" },
    ownerId: demoActors.landlord.id,
    previous: null,
    identifier: "Apartment 18, keys 1 and 2",
    notes: "Existing wall mark photographed",
    checklist: baselineChecklist("APARTMENT").map((item) => ({
      ...item,
      checked: true,
    })),
    evidence: [conditionPhoto("baseline", demoActors.landlord.id)],
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
    location: "Apartment front desk",
    notes: "Keys returned",
    checklist: baseline.checklist.map((item) => ({
      ...item,
      checked: true,
      note: "",
    })),
    evidence: [conditionPhoto("return", demoActors.tenant.id)],
    now: fixtureTime,
  });
}
export function returnReviewDemoSnapshot() {
  const snapshot = activeDemoSnapshot();
  return submitReturn(snapshot, demoActors.tenant, declaredReturn(snapshot));
}
