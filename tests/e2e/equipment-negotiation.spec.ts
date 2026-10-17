import { expect, test } from "@playwright/test";
import { equipmentReturnReviewDemoSnapshot } from "../unit/fixtures/handover";

// A1 rehearsal starts at return review; Hayk's H2 owns the full upload journeys.
for (const width of [1280, 390]) {
  test(`equipment proposal revision and consent at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const snapshot = equipmentReturnReviewDemoSnapshot();
    await page.goto("/");
    await page.evaluate((state) => {
      localStorage.setItem("pact-demo-v1", JSON.stringify(state));
    }, snapshot);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Camera rental deposit" }),
    ).toBeVisible();

    async function propose(amount: string, reason: string) {
      await page
        .getByRole("button", { name: "Start dispute", exact: true })
        .click();
      await page
        .getByLabel("Landlord allocation", { exact: true })
        .fill(amount);
      await page.getByLabel("Reason", { exact: true }).fill(reason);
      await page.getByRole("button", { name: "Send split proposal" }).click();
    }
    await propose("25", "Case repair shown in return photo.");
    await page
      .getByRole("button", { name: "Switch to tenant demo identity" })
      .click();
    await expect(page.getByText("Review split proposal · v1")).toBeVisible();
    await page.getByRole("button", { name: "Ask to revise" }).click();
    await expect(page.getByText("Revision requested for v1")).toBeVisible();
    await expect(page.getByText(/The landlord acts next:/)).toContainText(
      "€300.00 stays reserved",
    );
    await page
      .getByRole("button", { name: "Switch to landlord demo identity" })
      .click();
    await propose("20", "Revised case repair estimate after comparison.");
    await page
      .getByRole("button", { name: "Switch to tenant demo identity" })
      .click();
    await page.reload();
    await expect(page.getByText("Review split proposal · v2")).toBeVisible();
    await expect(page.getByText("€280.00", { exact: true })).toBeVisible();
    await expect(page.getByText("€20.00", { exact: true })).toBeVisible();
    const pending = await page.evaluate(
      () => JSON.parse(localStorage.getItem("pact-demo-v1") ?? "{}").agreement,
    );
    expect(pending.reservedMinor).toBe(30_000);
    expect(pending.proposal.tenantApproved).toBe(false);
    expect(pending.ledger).toHaveLength(2);
    await page.getByRole("button", { name: "Approve this split" }).click();
    await expect(
      page.getByText(
        /€280.00 to the tenant · €20.00 to the landlord · €0.00 reserved/,
      ),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Demo settlement complete")).toBeVisible();
    const final = await page.evaluate(
      () => JSON.parse(localStorage.getItem("pact-demo-v1") ?? "{}").agreement,
    );
    expect(
      final.ledger
        .slice(-3)
        .map((entry: { amountMinor: number }) => entry.amountMinor),
    ).toEqual([-30_000, 28_000, 2_000]);
    expect(final.handover.returnRecord.inspectionDeadline).toBe(
      snapshot.agreement.handover?.returnRecord?.inspectionDeadline,
    );
    await expect(page.getByText(/Asked the landlord to revise/)).toBeVisible();
    await expect(page.getByText(/Approved split version 2/)).toBeVisible();
  });
}
