import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";
import {
  approveFullRefund,
  declineSplit,
  demoSnapshotSchema,
  proposeSplit,
  type DemoSnapshot,
} from "@/features/demo/model";
import { LocalDemoRepository } from "@/features/demo/repository";
import { demoActors } from "@/lib/auth/identity-provider";
import { equipmentReturnReviewDemoSnapshot as equipmentReview } from "./fixtures/handover";

// Evidence upload/consent has its own integration tests. Rehearse negotiation
// from a valid photographed return through the actual workspace and repository.
vi.mock("@/features/handover/handover-workspace", () => ({
  HandoverWorkspace: () => null,
}));

async function saved() {
  const snapshot = await new LocalDemoRepository().load();
  expect(snapshot).not.toBeNull();
  return snapshot as DemoSnapshot;
}

async function open(snapshot: DemoSnapshot) {
  await new LocalDemoRepository().save(snapshot);
  const view = render(<DemoWorkspace />);
  await screen.findByText("Camera rental deposit");
  return view;
}

describe("Aiperi's equipment negotiation rehearsal", () => {
  beforeEach(() => window.localStorage.clear());

  it("revises €25 to €20, keeps €300 reserved on reload, then settles only after fresh approval", async () => {
    const user = userEvent.setup();
    const review = equipmentReview();
    let view = await open(review);
    const deadline =
      review.agreement.handover?.returnRecord?.inspectionDeadline;

    async function propose(amount: string, reason: string) {
      await user.clear(screen.getByLabelText("Landlord allocation"));
      await user.type(screen.getByLabelText("Landlord allocation"), amount);
      await user.clear(screen.getByLabelText("Reason"));
      await user.type(screen.getByLabelText("Reason"), reason);
      await user.click(
        screen.getByRole("button", { name: "Send split proposal" }),
      );
    }

    await propose(
      "25",
      "Case mark shown in return photo; proposed repair cost.",
    );
    await user.click(
      screen.getByRole("button", { name: "Switch to tenant demo identity" }),
    );
    expect(screen.getByText("Review split proposal · v1")).toBeInTheDocument();
    expect(screen.getByText("€275.00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask to revise" }));
    expect(screen.getByText("Revision requested for v1")).toBeInTheDocument();
    expect(screen.getByText(/The landlord acts next:/)).toHaveTextContent(
      "€300.00 stays reserved",
    );
    let current = await saved();
    expect(current.agreement.ledger).toHaveLength(2);
    expect(current.agreement.reservedMinor).toBe(30_000);

    await user.click(
      screen.getByRole("button", { name: "Switch to landlord demo identity" }),
    );
    expect(screen.getByText("Revise proposal v1")).toBeInTheDocument();
    await propose("20", "Revised case repair estimate after comparison.");
    expect(screen.getByText(/The tenant acts next:/)).toHaveTextContent(
      "€280.00 refund and €20.00 landlord allocation",
    );
    await user.click(
      screen.getByRole("button", { name: "Switch to tenant demo identity" }),
    );
    current = await saved();
    expect(current.agreement.proposal).toMatchObject({
      version: 2,
      tenantApproved: false,
    });
    expect(current.agreement.reservedMinor).toBe(30_000);
    expect(current.agreement.ledger).toHaveLength(2);
    view.unmount();
    view = await open(current);
    expect(screen.getByText("Review split proposal · v2")).toBeInTheDocument();
    expect(screen.getByText("€280.00")).toBeInTheDocument();
    expect(screen.getByText("€20.00")).toBeInTheDocument();
    expect(
      screen.getByText(/€300.00 stays reserved until you approve/),
    ).toHaveTextContent("not responding does not settle funds");
    await user.click(
      screen.getByRole("button", { name: "Approve this split" }),
    );

    current = await saved();
    expect(current.agreement.status).toBe("COMPLETED");
    expect(current.agreement.reservedMinor).toBe(0);
    expect(current.agreement.proposal).toMatchObject({
      version: 2,
      tenantApproved: true,
    });
    expect(
      current.agreement.ledger.slice(-3).map((entry) => entry.amountMinor),
    ).toEqual([-30_000, 28_000, 2_000]);
    expect(current.agreement.handover?.returnRecord?.inspectionDeadline).toBe(
      deadline,
    );
    expect(demoSnapshotSchema.safeParse(current).success).toBe(true);
    const activity = within(
      screen.getByRole("region", { name: "Agreement activity" }),
    );
    expect(activity.getByText(/Proposed version 1:/)).toBeInTheDocument();
    expect(
      activity.getByText(/Asked the landlord to revise/),
    ).toBeInTheDocument();
    expect(activity.getByText(/Proposed version 2:/)).toBeInTheDocument();
    expect(activity.getByText(/Approved split version 2/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Approve this split" }),
    ).not.toBeInTheDocument();
    view.unmount();
    await open(current);
    expect(
      screen.getByText(
        /€280.00 to the tenant · €20.00 to the landlord · €0.00 reserved/,
      ),
    ).toBeInTheDocument();
    expect((await saved()).agreement.ledger).toHaveLength(5);
  }, 15_000);

  it("uses settled ledger amounts in completion even if a rejected proposal is retained (S1 dependency)", async () => {
    const rejected = declineSplit(
      proposeSplit(
        equipmentReview(),
        demoActors.landlord,
        2_500,
        "Case repair",
      ),
      demoActors.tenant,
    );
    const refund = approveFullRefund(rejected, demoActors.landlord);
    // Render directly because S1's retained proposal currently fails the saved-state schema.
    vi.spyOn(LocalDemoRepository.prototype, "load").mockResolvedValueOnce(
      refund,
    );
    const view = render(<DemoWorkspace />);
    await screen.findByText(
      /€300.00 to the tenant · €0.00 to the landlord · €0.00 reserved/,
    );
    expect(screen.queryByText(/€275.00 to the tenant/)).not.toBeInTheDocument();
    expect(screen.getByText(/No real payment was made/)).toBeInTheDocument();
    view.unmount();
    vi.restoreAllMocks();
  });
});
