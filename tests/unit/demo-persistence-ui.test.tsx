import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";

describe("demo persistence errors", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("keeps the current identity and reports a failed browser save", async () => {
    render(<DemoWorkspace />);
    const identitySwitch = within(
      screen.getByRole("group", { name: "Choose a demo identity" }),
    );
    const landlord = identitySwitch.getByRole("button", { name: /Landlord/i });
    const tenant = identitySwitch.getByRole("button", { name: /Tenant/i });
    await waitFor(() =>
      expect(screen.queryByText(/Loading saved demo/i)).toBeNull(),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });

    fireEvent.click(landlord);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "This browser could not save the demo change",
    );
    expect(landlord).toHaveAttribute("aria-pressed", "false");
    expect(tenant).toHaveAttribute("aria-pressed", "true");
  });
});
