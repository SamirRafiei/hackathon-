import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`local examples, validation and acceptance at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Set the terms together" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Account setup preview" }),
    ).toHaveCount(0);
    await expect(page.locator('a[href="/agreements/new"]')).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "New agreement" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^MP\s*Landlord$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: /^LM\s*Tenant$/ }),
    ).toBeDisabled();
    await expect(page.getByRole("link", { name: /View PDF/ })).toHaveAttribute(
      "href",
      "/demo-contracts/demo-apartment-contract.pdf",
    );
    await expect(
      page.getByLabel("Agreement name", { exact: true }),
    ).toHaveValue("Apartment security deposit");
    await expect(
      page.getByLabel("Property location", { exact: true }),
    ).toHaveValue("Fictional unit DEMO-18, Budapest");
    await expect(page.getByLabel("Rental starts", { exact: true })).toHaveValue(
      "2026-10-01",
    );
    await expect(page.getByLabel("Rental ends", { exact: true })).toHaveValue(
      "2026-10-17",
    );

    await page
      .getByLabel("Rental type", { exact: true })
      .selectOption("EQUIPMENT");
    await expect(
      page.getByLabel("Agreement name", { exact: true }),
    ).toHaveValue("Camera rental deposit");
    await expect(
      page.getByLabel("Pickup / return location", { exact: true }),
    ).toHaveValue("Fictional camera handover desk, Budapest");
    await expect(
      page.getByLabel("Refundable deposit · EUR", { exact: true }),
    ).toHaveValue("300");
    await expect(page.getByLabel("Rental starts", { exact: true })).toHaveValue(
      "2026-10-16",
    );

    const create = page.getByRole("button", {
      name: "Create and accept version 1",
    });
    await page.getByLabel("Rental ends", { exact: true }).fill("2026-10-15");
    await create.click();
    await expect(page.getByRole("alert")).toContainText(
      "end date must be after",
    );
    await page.getByLabel("Rental ends", { exact: true }).fill("2026-10-17");
    await page
      .getByLabel("Refundable deposit · EUR", { exact: true })
      .fill("300.001");
    await create.click();
    await expect(page.getByRole("alert")).toContainText("two decimal places");
    await page
      .getByLabel("Refundable deposit · EUR", { exact: true })
      .fill("300");
    await page
      .getByLabel("Contract PDF", { exact: true })
      .setInputFiles(
        fileURLToPath(
          new URL(
            "../../public/demo-contracts/demo-equipment-contract.pdf",
            import.meta.url,
          ),
        ),
      );
    await expect(page.getByRole("link", { name: /View PDF/ })).toHaveAttribute(
      "href",
      /^blob:/,
    );
    await create.click();

    await expect(
      page.getByRole("heading", { name: "Set the terms together" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Camera rental deposit" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Switch to tenant demo identity" })
      .click();
    const accept = page.getByRole("button", { name: "Accept version 1.0" });
    await expect(accept).toBeDisabled();
    await page.getByRole("checkbox", { name: /I reviewed and accept/ }).check();
    await accept.click();
    await expect(
      page.getByRole("button", { name: /Simulate funding/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Waiting for the landlord’s condition baseline").first(),
    ).toBeVisible();
    const contract = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("pact-demo-v1") ?? "null").agreement
          .contract,
    );
    expect(contract.source).toBe("browser-demo");
    await page.reload();
    await expect(page.getByRole("link", { name: /View PDF/ })).toHaveAttribute(
      "href",
      /^blob:/,
    );
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("pact-demo-v1") ?? "null").agreement
            .contract,
      ),
    ).toEqual(contract);
    await expect(
      page.getByRole("heading", { name: "Camera rental deposit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Simulate funding/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Waiting for the landlord’s condition baseline").first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
