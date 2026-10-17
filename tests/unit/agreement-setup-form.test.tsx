import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AgreementSetupForm from "@/features/agreements/components/agreement-setup-form";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";

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
        startDate: "2026-10-16",
        endDate: "2026-10-17",
      }),
    );
  });

  it("does not enable agreement creation for the tenant demo identity", () => {
    const onCreate = vi.fn();
    render(
      <AgreementSetupForm
        isLandlord={false}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Switch to the landlord demo identity",
    );
    expect(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    ).toBeDisabled();
    const form = screen.getByLabelText("Rental type").closest("form");
    if (!form) throw new Error("Agreement form missing");
    fireEvent.submit(form);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

function setup(isLandlord = true) {
  const onCreate = vi.fn();
  render(
    <AgreementSetupForm
      isLandlord={isLandlord}
      onCancel={vi.fn()}
      onCreate={onCreate}
    />,
  );
  const form = screen
    .getByRole("button", { name: "Create and accept version 1" })
    .closest("form");
  if (!form) throw new Error("Agreement form is missing");
  return { onCreate, form };
}

describe("agreed examples and form boundaries", () => {
  it("submits the agreed apartment example with explicit owner acceptance", async () => {
    const { onCreate } = setup();
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Create and accept version 1" }),
      );
    expect(onCreate).toHaveBeenCalledWith(DEMO_AGREEMENT_PRESETS.APARTMENT);
    expect(screen.getByLabelText("Terms and return expectations")).toHaveValue(
      DEMO_AGREEMENT_PRESETS.APARTMENT.terms,
    );
  });

  it("loads the complete camera example and switches back to the agreed apartment", async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.selectOptions(screen.getByLabelText("Rental type"), "EQUIPMENT");
    expect(screen.getByLabelText("Pickup / return location")).toHaveValue(
      DEMO_AGREEMENT_PRESETS.EQUIPMENT.address,
    );
    expect(screen.getByLabelText("Refundable deposit · EUR")).toHaveValue(300);
    expect(screen.getByText("Renter for this walkthrough")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    );
    expect(onCreate).toHaveBeenLastCalledWith(DEMO_AGREEMENT_PRESETS.EQUIPMENT);
    await user.selectOptions(screen.getByLabelText("Rental type"), "APARTMENT");
    await user.click(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    );
    expect(onCreate).toHaveBeenLastCalledWith(DEMO_AGREEMENT_PRESETS.APARTMENT);
  });

  it.each([
    ["Agreement name", "   ", /Add a name/],
    ["Property location", "   ", /Add the rental location/],
    ["Terms and return expectations", "short", /Add the agreement terms/],
    ["Rental starts", "", /valid rental start date/],
    ["Rental ends", "", /valid rental end date/],
    ["Rental ends", "2026-09-30", /end date must be after/],
    ["Rental ends", "2026-10-01", /end date must be after/],
    ["Refundable deposit · EUR", "", /Enter a deposit/],
    ["Refundable deposit · EUR", "0", /Enter a deposit/],
    ["Refundable deposit · EUR", "-1", /Enter a deposit/],
    ["Refundable deposit · EUR", "1000000.01", /Enter a deposit/],
    ["Refundable deposit · EUR", "1.005", /two decimal places/],
  ])("rejects invalid %s (%s) with a useful error", (label, value, message) => {
    const { onCreate, form } = setup();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("accepts exact cents and trimmed text after correcting an error", () => {
    const { onCreate, form } = setup();
    fireEvent.change(screen.getByLabelText("Refundable deposit · EUR"), {
      target: { value: "1.005" },
    });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Refundable deposit · EUR"), {
      target: { value: "300.01" },
    });
    fireEvent.change(screen.getByLabelText("Agreement name"), {
      target: { value: "  Custom deposit  " },
    });
    fireEvent.submit(form);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Custom deposit", amountMinor: 30_001 }),
    );
  });

  it("blocks tenant creation even if submission bypasses the disabled button", () => {
    const { onCreate, form } = setup(false);
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Switch to the landlord demo identity",
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("reports creation failure and preserves inputs for retry", () => {
    const { onCreate, form } = setup();
    onCreate.mockImplementationOnce(() => {
      throw new Error("Could not create the agreement. Retry.");
    });
    fireEvent.submit(form);
    expect(screen.getByRole("alert")).toHaveTextContent("Retry");
    expect(screen.getByLabelText("Property location")).toHaveValue(
      DEMO_AGREEMENT_PRESETS.APARTMENT.address,
    );
    fireEvent.submit(form);
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
