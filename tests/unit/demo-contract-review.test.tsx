import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoWorkspace from "@/features/demo/demo-workspace";
import { BrowserContractStorage } from "@/features/agreements/contracts/storage";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";
import { createDemoAgreement } from "@/features/demo/model";
import { LocalDemoRepository } from "@/features/demo/repository";
import { demoActors } from "@/lib/auth/identity-provider";

vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/features/handover/handover-workspace", () => ({
  HandoverWorkspace: () => null,
}));
beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("tenant contract review", () => {
  it("blocks acceptance while the PDF is unavailable and allows it after a successful retry", async () => {
    const snapshot = createDemoAgreement(demoActors.landlord, {
      ...DEMO_AGREEMENT_PRESETS.APARTMENT,
      contract: {
        source: "browser-demo",
        id: "9a6bfa94-f943-4f26-8e36-2ca5422d6b58",
        fileName: "lease.pdf",
        sizeBytes: 31,
        sha256: "a".repeat(64),
      },
    });
    snapshot.activeActorId = "demo-tenant";
    await new LocalDemoRepository().save(snapshot);
    const release = vi.fn();
    const getUrl = vi
      .spyOn(BrowserContractStorage.prototype, "getUrl")
      .mockRejectedValueOnce(new Error("Contract missing from this browser."))
      .mockResolvedValue({ url: "blob:verified-contract", release });
    const view = render(<DemoWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Contract missing",
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed and accept/ }),
    );
    const accept = screen.getByRole("button", { name: "Accept version 1.0" });
    expect(accept).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Remove contract" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry contract" }));
    expect(
      await screen.findByRole("link", {
        name: "View PDF: lease.pdf (opens in a new tab)",
      }),
    ).toHaveAttribute("href", "blob:verified-contract");
    await waitFor(() => expect(accept).toBeEnabled());
    expect(getUrl).toHaveBeenCalledTimes(2);
    fireEvent.click(accept);
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem("pact-demo-v1") ?? "null")
          .agreement.status,
      ).toBe("AWAITING_BASELINE"),
    );
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
  });
});
