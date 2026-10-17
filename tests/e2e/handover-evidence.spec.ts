import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import type { DemoSnapshot } from "../../src/features/demo/model";

// Tayma's evidence checks stop at return/comparison. Hayk owns the full
// refund/negotiation release journeys; no fake identities claim server authority.
// The shared dev server is launched at localhost; matching that origin also
// allows the current Next.js dev handshake to complete before hydration.
test.use({ baseURL: "http://localhost:3000" });

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected a persisted handover record.");
  return value;
}

const fixture = (name: string) =>
  fileURLToPath(
    new URL(`../../public/demo-evidence/${name}.png`, import.meta.url),
  );
const saved = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("pact-demo-v1") ?? "null",
      ) as DemoSnapshot,
  );

async function status(
  page: Page,
  expected: DemoSnapshot["agreement"]["status"],
) {
  await expect
    .poll(async () => (await saved(page))?.agreement.status)
    .toBe(expected);
}

async function chooseView(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

async function readyForBaseline(page: Page, asset: "apartment" | "camera") {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
  await expect(page.getByText("Loading saved demo…")).toHaveCount(0);
  await page.getByRole("button", { name: /Landlord$/ }).click();
  await expect(page.getByRole("button", { name: /Landlord$/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Set the terms together" }),
  ).toBeVisible();
  await page
    .getByLabel("Rental type")
    .selectOption(asset === "camera" ? "EQUIPMENT" : "APARTMENT");
  await page
    .getByLabel("Agreement name")
    .fill(asset === "camera" ? "Demo camera kit" : "Demo apartment");
  await page
    .getByLabel(/Property location|Pickup \/ return location/)
    .fill("Fictional demo handover desk");
  await page
    .getByLabel("Refundable deposit · EUR")
    .fill(asset === "camera" ? "300" : "1000");
  await page
    .getByRole("button", { name: "Create and accept version 1" })
    .click();
  await status(page, "AWAITING_ACCEPTANCE");
  await expect(
    page.getByText(
      "The tenant must accept the agreement before the landlord can publish the condition baseline.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Tenant$/ }).click();
  await page
    .getByRole("checkbox", { name: /I reviewed and accept version/ })
    .check();
  await page
    .getByRole("button", { name: "Accept version 1.0", exact: true })
    .click();
  await status(page, "AWAITING_BASELINE");
  await expect(
    page.getByRole("button", { name: /Simulate funding/ }),
  ).toHaveCount(0);
  await chooseView(page, "Return declaration");
  await expect(
    page.getByText(
      "Return declaration becomes available when the agreement is active.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit return declaration" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Landlord$/ }).click();
  await chooseView(page, "Initial condition");
}

async function publish(
  page: Page,
  asset: "apartment" | "camera",
  revision = false,
) {
  const panel = page.getByRole("region", {
    name: "Initial condition record",
    exact: true,
  });
  if (revision)
    await panel
      .getByRole("button", { name: "Create a new condition version" })
      .click();
  if (asset === "apartment" && !revision) {
    await expect(
      panel.getByLabel("Property address and identifying details"),
    ).toHaveValue("Fictional demo handover desk; two keys");
    await expect(panel.getByLabel("Condition and existing damage")).toHaveValue(
      /existing wall mark/,
    );
    for (const checkbox of await panel.getByRole("checkbox").all())
      await expect(checkbox).toBeChecked();
    await panel
      .getByRole("button", { name: "Publish condition record" })
      .click();
    await expect(panel.getByRole("alert")).toHaveText(
      /Add at least one condition photograph/,
    );
    expect(
      required((await saved(page)).agreement).handover?.baseline ?? null,
    ).toBeNull();
  } else {
    await panel
      .getByLabel(
        /Property address and identifying details|Item model and serial/,
      )
      .fill(
        asset === "camera"
          ? "Camera DEMO-CAM-001; battery and case"
          : "Unit DEMO-18; two keys",
      );
    await panel
      .getByLabel("Condition and existing damage")
      .fill(
        asset === "camera"
          ? "Working camera; clean case, no scuff."
          : "Existing wall mark beside sofa; two keys.",
      );
    for (const checkbox of await panel.getByRole("checkbox").all()) {
      if (!(await checkbox.isChecked())) {
        await checkbox.focus();
        await page.keyboard.press("Space");
      }
    }
  }
  const evidenceBounds = required(
    await page.locator("#condition-records").boundingBox(),
  );
  const agreementBounds = required(
    await page.locator(".agreement-card").boundingBox(),
  );
  const nextBounds = required(await page.locator(".next-card").boundingBox());
  expect(agreementBounds.y + agreementBounds.height).toBeLessThanOrEqual(
    evidenceBounds.y,
  );
  expect(evidenceBounds.y + evidenceBounds.height).toBeLessThanOrEqual(
    nextBounds.y,
  );
  await panel
    .getByRole("textbox", { name: "Caption for new files" })
    .fill(`${asset} baseline — synthetic demo`);
  const picker = page.waitForEvent("filechooser");
  await panel
    .getByRole("button", { name: "Upload photos", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await (await picker).setFiles(fixture(`${asset}-baseline`));
  const uploader = panel.getByRole("region", {
    name: "baseline evidence",
    exact: true,
  });
  await expect(uploader.locator("img")).toBeVisible();
  await uploader.screenshot({
    path: test
      .info()
      .outputPath(`uploader-${asset}${revision ? "-revision" : ""}.png`),
  });
  await expect(
    panel.getByRole("button", { name: "Publish condition record" }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "Publish condition record" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByText(`Condition version ${revision ? 2 : 1} · Terms version 1`),
  ).toBeVisible();
  await status(page, "AWAITING_FUNDING");
}

async function decodedPhotos(page: Page, count: number) {
  const photos = page.locator('img[src^="blob:"]');
  await expect(photos).toHaveCount(count);
  for (const photo of await photos.all()) {
    await expect
      .poll(() =>
        photo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
}

for (const asset of ["apartment", "camera"] as const) {
  for (const width of [1280, 390]) {
    test(`${asset}: photos, consent and return survive reload at ${width}px`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await readyForBaseline(page, asset);
      await publish(page, asset);
      await noOverflow(page);
      // Owner-only publication is insufficient, including after reload.
      const original = required(
        (await saved(page)).agreement.handover?.baseline,
      );
      expect(Object.keys(original.acknowledgedBy)).toEqual(["demo-landlord"]);
      await page.reload();
      await decodedPhotos(page, 1);
      await status(page, "AWAITING_FUNDING");
      await page.getByRole("button", { name: /Tenant$/ }).click();
      const acknowledge = page.getByRole("button", {
        name: "I acknowledge condition version 1",
      });
      await acknowledge.focus();
      await page.keyboard.press("Enter");
      await status(page, "AWAITING_FUNDING");
      expect((await saved(page)).agreement.reservedMinor).toBe(0);
      await page.getByRole("button", { name: /Simulate funding/ }).click();
      await status(page, "ACTIVE");
      await expect(
        page.getByRole("button", { name: "Create a new condition version" }),
      ).toHaveCount(0);
      await chooseView(page, "Return declaration");
      const panel = page.getByRole("region", {
        name: "Return declaration",
        exact: true,
      });
      await panel
        .getByLabel("Return location", { exact: true })
        .fill("Fictional demo handover desk");
      for (const checkbox of await panel.getByRole("checkbox").all())
        await checkbox.check();
      if (asset === "camera") {
        await panel
          .getByRole("checkbox", { name: /Existing damage documented/ })
          .uncheck();
        await panel
          .getByLabel("Explain missing or changed condition", { exact: true })
          .fill("New cosmetic scuff on case; camera works.");
      }
      await panel
        .getByLabel("Return condition notes")
        .fill(
          asset === "camera"
            ? "Case scuff for discussion; no automatic deduction."
            : "Same wall mark; both keys returned.",
        );
      await panel
        .getByLabel("Choose evidence files")
        .setInputFiles(fixture(`${asset}-return`));
      await expect(
        panel.getByRole("button", { name: "Submit return declaration" }),
      ).toBeEnabled();
      await panel
        .getByRole("button", { name: "Submit return declaration" })
        .focus();
      await page.keyboard.press("Enter");
      await status(page, "RETURN_REVIEW");
      const returned = required(
        (await saved(page)).agreement.handover?.returnRecord,
      );
      expect(
        Date.parse(returned.inspectionDeadline) -
          Date.parse(returned.submittedAt),
      ).toBe(48 * 60 * 60 * 1000);
      await noOverflow(page);
      await page.reload();
      await chooseView(page, "Return declaration");
      await decodedPhotos(page, 1);
      await expect(
        page.getByRole("button", { name: "Submit return declaration" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: /Landlord$/ }).click();
      await chooseView(page, "Before & after");
      await decodedPhotos(page, 2);
      await expect(
        page.getByText(/Differences do not establish damage/),
      ).toBeVisible();
      if (asset === "camera")
        await expect(
          page.getByText("Not confirmed — review exception"),
        ).toBeVisible();
      await noOverflow(page);
      const reloaded = (await saved(page)).agreement;
      expect(reloaded.handover?.returnRecord).toEqual(returned);
      expect(reloaded.handover?.baseline).toEqual({
        ...original,
        acknowledgedBy: required(reloaded.handover?.baseline).acknowledgedBy,
      });
      expect(reloaded.reservedMinor).toBe(
        asset === "camera" ? 30_000 : 100_000,
      );
      await page
        .getByRole("region", {
          name: "Condition evidence comparison",
          exact: true,
        })
        .screenshot({ path: testInfo.outputPath("comparison.png") });
      if (asset === "apartment") {
        await chooseView(page, "Arrival inspection");
        await expect(
          page.getByText(/does not convert the deposit into an advance/),
        ).toBeVisible();
      }
    });
  }
}

test("baseline revision requires acknowledgement of the new version", async ({
  page,
}) => {
  await readyForBaseline(page, "camera");
  await publish(page, "camera");
  await publish(page, "camera", true);
  await page.getByRole("button", { name: /Tenant$/ }).click();
  await expect(
    page.getByRole("button", { name: "I acknowledge condition version 1" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "I acknowledge condition version 2" })
    .click();
  await status(page, "AWAITING_FUNDING");
  await page.getByRole("button", { name: /Simulate funding/ }).click();
  await status(page, "ACTIVE");
  expect(
    required((await saved(page)).agreement.handover?.baseline).version,
  ).toBe(2);
});

test("a corrupted local photo offers recovery without changing submitted evidence", async ({
  page,
}) => {
  await readyForBaseline(page, "camera");
  await publish(page, "camera");
  const before = required((await saved(page)).agreement.handover?.baseline);
  await page.evaluate(async (fileId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pact-private-demo-evidence", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const request = store.get(fileId);
      request.onsuccess = () =>
        store.put({
          ...request.result,
          blob: new Blob(["corrupted bytes"], { type: "image/png" }),
        });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    database.close();
  }, before.evidence[0].id);
  await page.reload();
  await expect(
    page.getByText(/This image could not be displayed/),
  ).toBeVisible();
  await expect(
    page.getByText("camera-baseline.png", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry preview" }).click();
  await expect(
    page.getByText(/This image could not be displayed/),
  ).toBeVisible();
  expect((await saved(page)).agreement.handover?.baseline).toEqual(before);
});
