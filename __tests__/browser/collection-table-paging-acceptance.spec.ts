import { test, expect } from "@playwright/test";

test("Table keeps 501 stable records usable without rendering 501 editors", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const block = page.getByTestId("collection-block");
  const data = {
    version: 1, title: "Large Collection fixture",
    fields: [{ id: "name-field", name: "Name", type: "text" },
      { id: "status-field", name: "Status", type: "text" }],
    records: Array.from({ length: 501 }, (_, i) => ({
      id: "stable-" + i, values: { "name-field": "Task " + i, "status-field": i % 2 ? "Done" : "To do" },
    })),
    views: [{ id: "table-view", name: "Table", kind: "table" }],
    activeViewId: "table-view",
  };
  page.once("dialog", dialog => { void dialog.accept(); });
  await block.locator('input[type="file"]').setInputFiles({
    name: "collection-test-fixture.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data)),
  });
  const table = block.getByTestId("collection-tanstack-table");
  const rows = table.locator("tr[data-record-id]");
  await expect(rows).toHaveCount(50);
  await expect(block.getByTestId("collection-page-summary")).toHaveText("1–50 of 501 matching records");
  await expect(block.getByTestId("collection-page-number")).toHaveText("Page 1 of 11");
  await block.getByRole("button", { name: "Last collection page" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-record-id", "stable-500");
  await rows.first().getByRole("textbox", { name: "Name", exact: true }).fill("Updated final task");
  await expect(rows.first().getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Updated final task");
  await block.getByRole("button", { name: "First collection page" }).click();
  await expect(rows).toHaveCount(50);
  await block.getByRole("combobox", { name: "Rows per page" }).selectOption("250");
  await expect(rows).toHaveCount(250);
  await expect(block.getByTestId("collection-page-number")).toHaveText("Page 1 of 3");
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByTestId("collection-tanstack-table").locator("tr[data-record-id]")).toHaveCount(50);
  await reopened.getByRole("button", { name: "Last collection page" }).click();
  await expect(reopened.getByTestId("collection-tanstack-table").locator('tr[data-record-id="stable-500"]')
    .getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Updated final task");
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByTestId("collection-tanstack-table").getByRole("textbox", { name: "Name", exact: true }))
    .toBeDisabled();
  await reopened.getByRole("button", { name: "First collection page" }).click();
  await expect(reopened.getByTestId("collection-tanstack-table").locator("tr[data-record-id]")).toHaveCount(50);
});
