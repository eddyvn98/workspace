import { test, expect } from "@playwright/test";

test("Form View submits to the same records, reloads, and enforces read-only", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
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
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByTestId("collection-form").getByRole("button", { name: "Submit record" })).toBeDisabled();
});

test("Gallery settings persist selected card fields across reload", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
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
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("checkbox", { name: "Show Status in Gallery" })).toBeDisabled();
});
