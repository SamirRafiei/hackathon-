import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";
import type { DemoSnapshot } from "@/features/demo/model";
import { demoActors } from "@/lib/auth/identity-provider";
import { returnReviewDemoSnapshot } from "./fixtures/handover";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/handover/handover-workspace", () => ({
  HandoverWorkspace: () => null,
}));
vi.mock("@/features/agreements/components/agreement-setup-form", () => ({
  default: () => null,
}));

function savedSnapshot(): DemoSnapshot {
  const raw = window.localStorage.getItem("pact-demo-v1");
  if (!raw) throw new Error("Demo state was not saved");
  return JSON.parse(raw) as DemoSnapshot;
}

async function renderReturnReview(role: "landlord" | "tenant" = "landlord") {
  const snapshot = {
    ...returnReviewDemoSnapshot(),
    activeActorId: demoActors[role].id as DemoSnapshot["activeActorId"],
  };
  window.localStorage.setItem("pact-demo-v1", JSON.stringify(snapshot));
  render(<DemoWorkspace />);
  if (role === "landlord") {
    await screen.findByRole("button", { name: "Release full deposit" });
  } else {
    await screen.findByText("Return review is open");
  }
  return snapshot;
}

describe("landlord return review", () => {
  beforeEach(() => window.localStorage.clear());

  it("offers full release first and refunds the complete deposit without a split proposal", async () => {
    const initial = await renderReturnReview();
    expect(screen.getByRole("button", { name: "Start dispute" })).toBeVisible();
    expect(
      screen.queryByLabelText("Landlord allocation"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Release full deposit" }),
    );

    await screen.findByText("Demo settlement complete");
    await waitFor(() =>
      expect(savedSnapshot().agreement.status).toBe("COMPLETED"),
    );
    const { agreement } = savedSnapshot();
    expect(agreement.reservedMinor).toBe(0);
    expect(agreement.proposal).toBeNull();
    expect(
      agreement.ledger
        .filter((entry) => entry.account === "renter_refund")
        .reduce((sum, entry) => sum + entry.amountMinor, 0),
    ).toBe(initial.agreement.amountMinor);
    expect(
      agreement.ledger.reduce((sum, entry) => sum + entry.amountMinor, 0),
    ).toBe(0);
  });

  it("opens the existing split flow only after Start dispute and preserves tenant approval", async () => {
    const initial = await renderReturnReview();
    fireEvent.click(screen.getByRole("button", { name: "Start dispute" }));

    expect(screen.getByLabelText("Landlord allocation")).toBeVisible();
    expect(savedSnapshot().agreement).toEqual(initial.agreement);
    fireEvent.change(screen.getByLabelText("Landlord allocation"), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Repair supported by the attached quote" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Send split proposal/ }),
    );

    await screen.findByText("Split proposal sent");
    expect(savedSnapshot().agreement.status).toBe("PROPOSAL_PENDING");
    expect(savedSnapshot().agreement.reservedMinor).toBe(
      initial.agreement.reservedMinor,
    );
    expect(savedSnapshot().agreement.ledger).toEqual(initial.agreement.ledger);
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to tenant demo identity" }),
    );
    await screen.findByText("Review split proposal · v1");
    fireEvent.click(screen.getByRole("button", { name: "Approve this split" }));

    await screen.findByText("Demo settlement complete");
    const { agreement } = savedSnapshot();
    expect(agreement.reservedMinor).toBe(0);
    expect(agreement.proposal?.tenantApproved).toBe(true);
    expect(agreement.proposal?.ownerAllocationMinor).toBe(8_000);
    expect(agreement.proposal?.renterRefundMinor).toBe(
      initial.agreement.amountMinor - 8_000,
    );
    expect(
      agreement.ledger.reduce((sum, entry) => sum + entry.amountMinor, 0),
    ).toBe(0);
  });

  it("can return from the dispute form without changing funds or the review deadline", async () => {
    const initial = await renderReturnReview();
    fireEvent.click(screen.getByRole("button", { name: "Start dispute" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Back to return review" }),
    );

    expect(
      screen.getByRole("button", { name: "Release full deposit" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Landlord allocation"),
    ).not.toBeInTheDocument();
    expect(savedSnapshot().agreement).toEqual(initial.agreement);
  });

  it("keeps owner actions out of the tenant view and resets the form when switching identities", async () => {
    await renderReturnReview();
    fireEvent.click(screen.getByRole("button", { name: "Start dispute" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to tenant demo identity" }),
    );

    await screen.findByText("Return review is open");
    expect(
      screen.queryByRole("button", { name: "Release full deposit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start dispute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Landlord allocation"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to landlord demo identity" }),
    );
    await screen.findByRole("button", { name: "Release full deposit" });
    expect(
      screen.queryByLabelText("Landlord allocation"),
    ).not.toBeInTheDocument();
  });
});
