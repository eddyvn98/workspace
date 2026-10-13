import { test, expect } from "@playwright/test";

test("computed formula cells and visible totals persist through reload", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).fill("Budget");
  await block.getByRole("button", { name: "Settings" }).click();
  for (const [field, type] of [["Field 7", "number"], ["Field 8", "number"], ["Field 9", "formula"]]) {
    await block.getByRole("button", { name: "+ Field" }).click();
    await block.getByRole("combobox", { name: "Type " + field }).selectOption(type);
  }
  await block.getByRole("combobox", { name: "Formula operation Field 9" }).selectOption("sum");
  await block.getByRole("combobox", { name: "Formula source 1 Field 9" }).selectOption({ label: "Field 7" });
  await block.getByRole("combobox", { name: "Formula source 2 Field 9" }).selectOption({ label: "Field 8" });
  const table = block.getByTestId("collection-tanstack-table");
  await table.getByRole("spinbutton", { name: "Field 7" }).fill("10");
  await table.getByRole("spinbutton", { name: "Field 8" }).fill("5");
  await expect(table.locator('output[aria-label="Field 9"]')).toHaveText("15");
  await block.getByRole("button", { name: "+ Aggregate" }).click();
  await block.getByRole("combobox", { name: "Aggregate field 1" }).selectOption({ label: "Field 9" });
  await expect(table.locator("tfoot")).toContainText("sum: 15");
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByTestId("collection-tanstack-table").locator('output[aria-label="Field 9"]'))
    .toHaveText("15");
  await expect(reopened.getByTestId("collection-tanstack-table").locator("tfoot")).toContainText("sum: 15");
  await reopened.getByRole("button", { name: "Settings" }).click();
  await expect(reopened.getByRole("combobox", { name: "Formula operation Field 9" })).toHaveValue("sum");
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("button", { name: "+ Aggregate" })).toBeDisabled();
  await expect(reopened.getByRole("combobox", { name: "Formula source 1 Field 9" })).toBeDisabled();
});
