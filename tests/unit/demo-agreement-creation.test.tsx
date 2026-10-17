import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialDemoSnapshot } from "@/features/demo/model";
import { LocalDemoRepository } from "@/features/demo/repository";
import DemoWorkspace from "@/features/demo/demo-workspace";

vi.mock("@/features/handover/handover-workspace", () => ({
  HandoverWorkspace: () => null,
}));

describe("landlord-only agreement creation", () => {
  beforeEach(() => window.localStorage.clear());

  it("hides creation from tenants and closes an owner's form when switching roles", async () => {
    await new LocalDemoRepository().save(createInitialDemoSnapshot());
    const user = userEvent.setup();
    render(<DemoWorkspace />);
    await waitFor(() =>
      expect(screen.queryByText("Loading saved demo…")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /^LM\s*Tenant$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: "New agreement" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rental type")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^MP\s*Landlord$/ }));
    await user.click(screen.getByRole("button", { name: "New agreement" }));
    expect(screen.getByLabelText("Rental type")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^LM\s*Tenant$/ }));
    expect(
      screen.queryByRole("button", { name: "New agreement" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rental type")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^MP\s*Landlord$/ }));
    expect(screen.queryByLabelText("Rental type")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New agreement" }));
    await user.click(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Version 1 is ready for the tenant",
    );
  });
});
