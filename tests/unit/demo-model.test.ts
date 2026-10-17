// @vitest-environment node

import { describe, expect, it } from "vitest";
import { demoActors } from "@/lib/auth/identity-provider";
import {
  DEMO_AMOUNT_MINOR,
  acceptTerms,
  approveFullRefund,
  approveSplit,
  createInitialDemoSnapshot,
  declineSplit,
  fundAgreement,
  proposeSplit,
  submitReturn,
} from "@/features/demo/model";

function acceptedSnapshot() {
  return acceptTerms(createInitialDemoSnapshot(), demoActors.tenant);
}

function fundedSnapshot() {
  return fundAgreement(acceptedSnapshot(), demoActors.tenant);
}

function returnReviewSnapshot() {
  return submitReturn(fundedSnapshot(), demoActors.tenant);
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
});
