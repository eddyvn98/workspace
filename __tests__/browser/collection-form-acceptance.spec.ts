import { test, expect } from "@playwright/test";

test("Form View submits to the same records, reloads, and enforces read-only", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "Form", exact: true }).click();
  const form = block.getByTestId("collection-form");
  await expect(form).toBeVisible();
  await expect(form.getByRole("button", { name: "Submit record" })).toBeVisible();
  await form.getByRole("textbox", { name: /Name/ }).fill("Submitted through Form");
  await form.getByRole("button", { name: "Submit record" }).click();
  await expect(form.getByRole("status")).toHaveText("Record created.");
  await block.getByRole("button", { name: "Table", exact: true }).click();
  await expect(block.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Submitted through Form");
  await page.reload();
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Submitted through Form");
  await reopened.getByRole("button", { name: "Form", exact: true }).click();
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByTestId("collection-form").getByRole("button", { name: "Submit record" })).toBeDisabled();
});

test("Gallery settings persist selected card fields across reload", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "Gallery", exact: true }).click();
  await block.getByRole("button", { name: "Settings" }).click();
  const status = block.getByRole("checkbox", { name: "Show Status in Gallery" });
  await status.uncheck();
  await expect(block.getByTestId("collection-gallery-card").first().getByText("Status")).toHaveCount(0);
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await reopened.getByRole("button", { name: "Settings" }).click();
  await expect(reopened.getByRole("checkbox", { name: "Show Status in Gallery" })).not.toBeChecked();
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("checkbox", { name: "Show Status in Gallery" })).toBeDisabled();
});

test("Gallery pagination limits 501 records and navigates without changing record IDs", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  const fixture = {
    version: 1, title: "Gallery stress",
    fields: [{ id: "name", name: "Name", type: "text" }],
    records: Array.from({ length: 501 }, (_, i) => ({ id: "g-" + i, values: { name: "Card " + i } })),
    views: [{ id: "gallery", name: "Gallery", kind: "gallery" }], activeViewId: "gallery",
  };
  page.once("dialog", dialog => { void dialog.accept(); });
  await block.locator('input[type="file"]').setInputFiles({
    name: "gallery.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const cards = block.getByTestId("collection-gallery-card");
  await expect(cards).toHaveCount(25);
  await expect(block.getByTestId("collection-gallery-page-number")).toHaveText("Page 1 of 21");
  await block.getByRole("button", { name: "Next gallery page" }).click();
  await expect(cards.first()).toHaveAttribute("data-record-id", "g-25");
  for (let i = 0; i < 19; i++) await block.getByRole("button", { name: "Next gallery page" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-record-id", "g-500");
});
