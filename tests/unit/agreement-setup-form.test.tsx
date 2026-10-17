import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AgreementSetupForm from "@/features/agreements/components/agreement-setup-form";

describe("AgreementSetupForm", () => {
  it("submits version-one agreement terms as integer minor units", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <AgreementSetupForm isLandlord onCancel={vi.fn()} onCreate={onCreate} />,
    );

    await user.selectOptions(screen.getByLabelText("Rental type"), "EQUIPMENT");
    await user.clear(screen.getByLabelText("Refundable deposit · EUR"));
    await user.type(screen.getByLabelText("Refundable deposit · EUR"), "300");
    await user.click(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    );

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        assetType: "EQUIPMENT",
        amountMinor: 30_000,
        startDate: "2026-11-01",
        endDate: "2027-08-31",
      }),
    );
  });

  it("does not enable agreement creation for the tenant demo identity", () => {
    render(
      <AgreementSetupForm
        isLandlord={false}
        onCancel={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Switch to the landlord demo identity",
    );
    expect(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    ).toBeDisabled();
  });
});
