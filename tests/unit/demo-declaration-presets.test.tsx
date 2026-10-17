import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HandoverWorkspace } from "@/features/handover/handover-workspace";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";
import { acceptTerms, createDemoAgreement } from "@/features/demo/model";
import { demoActors } from "@/lib/auth/identity-provider";

describe("demo declaration drafts", () => {
  it.each(["APARTMENT", "EQUIPMENT"] as const)(
    "prefills the %s initial condition without publishing evidence",
    async (assetType) => {
      const snapshot = acceptTerms(
        createDemoAgreement(
          demoActors.landlord,
          DEMO_AGREEMENT_PRESETS[assetType],
        ),
        demoActors.tenant,
      );
      const onBaselineChange = vi.fn();
      render(
        <HandoverWorkspace
          agreement={snapshot.agreement}
          actor={demoActors.landlord}
          onBaselineChange={onBaselineChange}
          onSubmitReturn={vi.fn()}
          onSubmitInspection={vi.fn()}
        />,
      );
      expect(
        (
          screen.getByLabelText(
            /Property address and identifying details|Item model and serial/,
          ) as HTMLInputElement
        ).value,
      ).toContain(
        assetType === "APARTMENT" ? snapshot.agreement.address : "DEMO-CAM-001",
      );
      expect(
        screen.getByLabelText("Condition and existing damage"),
      ).not.toHaveValue("");
      const checks = screen.getAllByRole("checkbox");
      expect(checks).toHaveLength(4);
      expect(checks.every((check) => (check as HTMLInputElement).checked)).toBe(
        true,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Publish condition record" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Add at least one condition photograph",
      );
      expect(onBaselineChange).not.toHaveBeenCalled();
    },
  );
});
