import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/handover/handover-workspace", () => ({
  HandoverWorkspace: () => null,
}));

describe("local setup entry", () => {
  beforeEach(() => window.localStorage.clear());
  it("opens and completes local setup without an account entry", async () => {
    render(<DemoWorkspace />);
    await screen.findByRole("button", { name: "Accept version 1.0" });
    expect(
      screen.queryByRole("link", { name: "Account setup preview" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/agreements/new"]')).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Use account" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to landlord demo identity" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "New agreement" }),
    );
    expect(
      screen.getByRole("heading", { name: "Set the terms together" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create and accept version 1" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create and accept version 1" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Set the terms together" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to tenant demo identity" }),
    );
    fireEvent.click(
      await screen.findByRole("checkbox", { name: /I reviewed and accept/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept version 1.0" }));
    expect(
      screen.queryByRole("button", { name: /Simulate funding/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Waiting for the landlord’s condition baseline")
        .length,
    ).toBeGreaterThan(0);
  });
});
