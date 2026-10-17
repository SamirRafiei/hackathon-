import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";
import { LocalDemoRepository } from "@/features/demo/repository";
import { publishedBaselineSnapshot } from "./fixtures/handover";

vi.mock("next/image", () => ({ default: () => null }));

describe("tenant condition review before funding", () => {
  beforeEach(() => window.localStorage.clear());

  it("withholds funding until the tenant acknowledges the landlord baseline, then activates with the full deposit", async () => {
    const initial = publishedBaselineSnapshot();
    initial.activeActorId = "demo-tenant";
    await new LocalDemoRepository().save(initial);
    render(<DemoWorkspace />);

    const acknowledge = await screen.findByRole("button", {
      name: "I acknowledge condition version 1",
    });
    expect(
      screen.queryByRole("button", { name: /Simulate funding/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Review the condition baseline")).toBeVisible();
    fireEvent.click(acknowledge);

    const fund = await screen.findByRole("button", {
      name: "Simulate funding €1,000.00",
    });
    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem("pact-demo-v1") ?? "null",
      );
      expect(saved.agreement.status).toBe("AWAITING_FUNDING");
      expect(saved.agreement.reservedMinor).toBe(0);
      expect(saved.agreement.ledger).toEqual([]);
    });
    fireEvent.click(fund);
    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem("pact-demo-v1") ?? "null",
      );
      expect(saved.agreement.status).toBe("ACTIVE");
      expect(saved.agreement.reservedMinor).toBe(100_000);
      expect(saved.agreement.ledger).toHaveLength(2);
    });
    expect(
      screen.queryByRole("button", { name: /Simulate funding/ }),
    ).not.toBeInTheDocument();
  });
});
