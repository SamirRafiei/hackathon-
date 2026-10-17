// @vitest-environment node

import { describe, expect, it } from "vitest";
import { demoActors } from "@/lib/auth/identity-provider";
import { returnReviewDemoSnapshot } from "./fixtures/handover";
import {
  DEMO_AMOUNT_MINOR,
  acceptTerms,
  approveFullRefund,
  approveSplit,
  createInitialDemoSnapshot,
  createDemoAgreement,
  declineSplit,
  fundAgreement,
  proposeSplit,
  submitReturn,
} from "@/features/demo/model";

function acceptedSnapshot() {
  return acceptTerms(createInitialDemoSnapshot(), demoActors.tenant);
}

function returnReviewSnapshot() {
  return returnReviewDemoSnapshot();
}

function expectBalancedLedger(
  snapshot: ReturnType<typeof createInitialDemoSnapshot>,
) {
  expect(
    snapshot.agreement.ledger.reduce(
      (total, entry) => total + entry.amountMinor,
      0,
    ),
  ).toBe(0);
}

describe("Pact demo agreement lifecycle", () => {
  it("creates a landlord-approved version 1 and waits for tenant acceptance", () => {
    const snapshot = createDemoAgreement(demoActors.landlord, {
      assetType: "EQUIPMENT",
      title: "Camera rental deposit",
      address: "Budapest pickup point",
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      amountMinor: 30_000,
      terms:
        "Return the camera and listed accessories in the recorded condition.",
    });

    expect(snapshot.agreement).toMatchObject({
      assetType: "EQUIPMENT",
      title: "Camera rental deposit",
      termsVersion: 1,
      status: "AWAITING_ACCEPTANCE",
      acceptedBy: { landlord: true, tenant: false },
      amountMinor: 30_000,
    });
    expect(snapshot.agreement.ledger).toHaveLength(0);
  });

  it("rejects tenant-created agreements and invalid terms or dates", () => {
    const input = {
      assetType: "APARTMENT" as const,
      title: "Apartment deposit",
      address: "Budapest",
      startDate: "2026-11-01",
      endDate: "2026-10-31",
      amountMinor: 30_000,
      terms: "Short",
    };

    expect(() => createDemoAgreement(demoActors.tenant, input)).toThrow(
      "Switch to the landlord demo identity to do this.",
    );
    expect(() => createDemoAgreement(demoActors.landlord, input)).toThrow();
  });

  it("starts with landlord acceptance and waits for the tenant", () => {
    const snapshot = createInitialDemoSnapshot();

    expect(snapshot.agreement.status).toBe("AWAITING_ACCEPTANCE");
    expect(snapshot.agreement.acceptedBy).toEqual({
      landlord: true,
      tenant: false,
    });
    expect(() => fundAgreement(snapshot, demoActors.tenant)).toThrow(
      "Both parties must accept before funding.",
    );
  });

  it("moves to funding only after the tenant accepts the same terms", () => {
    const snapshot = acceptedSnapshot();

    expect(snapshot.agreement.status).toBe("AWAITING_FUNDING");
    expect(snapshot.agreement.acceptedBy).toEqual({
      landlord: true,
      tenant: true,
    });
  });

  it("does not let the landlord accept for the tenant or accept twice", () => {
    const initial = createInitialDemoSnapshot();
    expect(() => acceptTerms(initial, demoActors.landlord)).toThrow(
      "Switch to the tenant demo identity to do this.",
    );
    const accepted = acceptTerms(initial, demoActors.tenant);
    expect(() => acceptTerms(accepted, demoActors.tenant)).toThrow(
      "These terms are no longer awaiting acceptance.",
    );
  });

  it("allows only the tenant to fund, and records a balanced reservation", () => {
    const accepted = acceptedSnapshot();
    expect(() => fundAgreement(accepted, demoActors.landlord)).toThrow(
      "Switch to the tenant demo identity to do this.",
    );

    const funded = fundAgreement(accepted, demoActors.tenant);
    expect(funded.agreement.status).toBe("FUNDED");
    expect(funded.agreement.reservedMinor).toBe(DEMO_AMOUNT_MINOR);
    expect(funded.agreement.ledger.map((entry) => entry.amountMinor)).toEqual([
      -DEMO_AMOUNT_MINOR,
      DEMO_AMOUNT_MINOR,
    ]);
    expectBalancedLedger(funded);
  });

  it("requires funding before the tenant can record a return", () => {
    expect(() => submitReturn(acceptedSnapshot(), demoActors.tenant)).toThrow(
      "The agreement must be funded before return can be recorded.",
    );
    expect(returnReviewSnapshot().agreement.status).toBe("RETURN_REVIEW");
  });

  it("lets the landlord propose only a valid, fully allocated split", () => {
    const review = returnReviewSnapshot();

    expect(() =>
      proposeSplit(review, demoActors.tenant, 70_000, "damage"),
    ).toThrow("Switch to the landlord demo identity to do this.");
    expect(() =>
      proposeSplit(review, demoActors.landlord, -1, "damage"),
    ).toThrow();
    expect(() =>
      proposeSplit(
        review,
        demoActors.landlord,
        DEMO_AMOUNT_MINOR + 1,
        "damage",
      ),
    ).toThrow();
    expect(() =>
      proposeSplit(review, demoActors.landlord, 70_000, "   "),
    ).toThrow("Add a short reason for the proposed split.");

    const proposed = proposeSplit(
      review,
      demoActors.landlord,
      70_000,
      "Repair costs",
    );
    expect(proposed.agreement.status).toBe("PROPOSAL_PENDING");
    expect(proposed.agreement.proposal).toMatchObject({
      version: 1,
      ownerAllocationMinor: 70_000,
      renterRefundMinor: 30_000,
      reason: "Repair costs",
      landlordApproved: true,
      tenantApproved: false,
    });
    expect(proposed.agreement.reservedMinor).toBe(DEMO_AMOUNT_MINOR);
    expect(proposed.agreement.ledger).toHaveLength(2);
  });

  it("keeps funds reserved when the tenant declines and versions a revised proposal", () => {
    const proposed = proposeSplit(
      returnReviewSnapshot(),
      demoActors.landlord,
      70_000,
      "Repair costs",
    );
    expect(() => declineSplit(proposed, demoActors.landlord)).toThrow(
      "Switch to the tenant demo identity to do this.",
    );

    const declined = declineSplit(proposed, demoActors.tenant);
    expect(declined.agreement.status).toBe("RETURN_REVIEW");
    expect(declined.agreement.proposal?.version).toBe(1);
    expect(declined.agreement.reservedMinor).toBe(DEMO_AMOUNT_MINOR);
    expect(declined.agreement.ledger).toHaveLength(2);

    const revised = proposeSplit(
      declined,
      demoActors.landlord,
      65_000,
      "Revised repair costs",
    );
    expect(revised.agreement.proposal?.version).toBe(2);
  });

  it("settles a split only after tenant approval, with a balanced ledger", () => {
    const proposed = proposeSplit(
      returnReviewSnapshot(),
      demoActors.landlord,
      70_000,
      "Repair costs",
    );
    expect(() => approveSplit(proposed, demoActors.landlord)).toThrow(
      "Switch to the tenant demo identity to do this.",
    );

    const settled = approveSplit(proposed, demoActors.tenant);
    expect(settled.agreement.status).toBe("COMPLETED");
    expect(settled.agreement.reservedMinor).toBe(0);
    expect(settled.agreement.proposal?.tenantApproved).toBe(true);
    expect(
      settled.agreement.ledger.slice(-3).map((entry) => entry.amountMinor),
    ).toEqual([-DEMO_AMOUNT_MINOR, 30_000, 70_000]);
    expectBalancedLedger(settled);
  });

  it("rejects a split approval when no proposal is pending", () => {
    expect(() =>
      approveSplit(returnReviewSnapshot(), demoActors.tenant),
    ).toThrow("There is no open split proposal to approve.");
  });

  it("allows the landlord to complete a full refund during return review", () => {
    const review = returnReviewSnapshot();
    expect(() => approveFullRefund(review, demoActors.tenant)).toThrow(
      "Switch to the landlord demo identity to do this.",
    );

    const settled = approveFullRefund(review, demoActors.landlord);
    expect(settled.agreement.status).toBe("COMPLETED");
    expect(settled.agreement.reservedMinor).toBe(0);
    expect(
      settled.agreement.ledger.slice(-2).map((entry) => entry.amountMinor),
    ).toEqual([-DEMO_AMOUNT_MINOR, DEMO_AMOUNT_MINOR]);
    expectBalancedLedger(settled);
  });

  it("clears a rejected split when the owner instead refunds the full deposit", () => {
    const proposed = proposeSplit(
      returnReviewSnapshot(),
      demoActors.landlord,
      2_500,
      "Camera repair",
    );
    const declined = declineSplit(proposed, demoActors.tenant);
    const settled = approveFullRefund(declined, demoActors.landlord);

    expect(settled.agreement.status).toBe("COMPLETED");
    expect(settled.agreement.proposal).toBeNull();
    expect(settled.agreement.reservedMinor).toBe(0);
    expect(
      settled.agreement.ledger
        .filter((entry) => entry.account === "renter_refund")
        .reduce((total, entry) => total + entry.amountMinor, 0),
    ).toBe(DEMO_AMOUNT_MINOR);
    expect(
      settled.agreement.ledger.some(
        (entry) => entry.account === "landlord_allocation",
      ),
    ).toBe(false);
    expect(
      settled.agreement.activity.map((event) => event.description),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Asked the landlord to revise"),
        expect.stringContaining("Approved the full renter refund"),
      ]),
    );
    expectBalancedLedger(settled);
    expect(() => approveFullRefund(settled, demoActors.landlord)).toThrow();
    expect(() => approveSplit(settled, demoActors.tenant)).toThrow();
  });

  it("settles the camera example only after approval, including odd cents and boundaries", () => {
    const camera = createDemoAgreement(demoActors.landlord, {
      assetType: "EQUIPMENT",
      title: "Camera deposit",
      address: "Budapest pickup point",
      startDate: "2026-11-01",
      endDate: "2026-11-08",
      amountMinor: 30_000,
      terms:
        "Return the camera and listed accessories in the recorded condition.",
    });
    const review = returnReviewDemoSnapshot(camera);
    expect(review.agreement.reservedMinor).toBe(30_000);
    const odd = proposeSplit(
      review,
      demoActors.landlord,
      1,
      "One-cent example",
    );
    expect(odd.agreement.proposal).toMatchObject({
      ownerAllocationMinor: 1,
      renterRefundMinor: 29_999,
    });
    for (const allocation of [0, 30_000]) {
      const proposed = proposeSplit(
        review,
        demoActors.landlord,
        allocation,
        "Boundary example",
      );
      expect(proposed.agreement.proposal?.ownerAllocationMinor).toBe(
        allocation,
      );
      expect(proposed.agreement.proposal?.renterRefundMinor).toBe(
        30_000 - allocation,
      );
      const boundarySettlement = approveSplit(proposed, demoActors.tenant);
      expect(boundarySettlement.agreement.reservedMinor).toBe(0);
      expect(
        boundarySettlement.agreement.ledger
          .slice(-3)
          .map((entry) => entry.amountMinor),
      ).toEqual([-30_000, 30_000 - allocation, allocation]);
      expectBalancedLedger(boundarySettlement);
    }

    const first = proposeSplit(
      review,
      demoActors.landlord,
      2_500,
      "Repair quote",
    );
    const declined = declineSplit(first, demoActors.tenant);
    expect(declined.agreement.reservedMinor).toBe(30_000);
    const revised = proposeSplit(
      declined,
      demoActors.landlord,
      2_000,
      "Revised quote",
    );
    expect(revised.agreement.proposal).toMatchObject({
      version: 2,
      ownerAllocationMinor: 2_000,
      renterRefundMinor: 28_000,
      tenantApproved: false,
    });
    const settled = approveSplit(revised, demoActors.tenant);
    expect(settled.agreement.reservedMinor).toBe(0);
    expect(settled.agreement.proposal?.tenantApproved).toBe(true);
    expect(
      settled.agreement.ledger.slice(-3).map((entry) => entry.amountMinor),
    ).toEqual([-30_000, 28_000, 2_000]);
    expectBalancedLedger(settled);
    expect(() => approveSplit(settled, demoActors.tenant)).toThrow();
  });
});
