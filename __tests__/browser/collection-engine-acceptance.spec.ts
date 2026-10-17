import { test, expect } from "@playwright/test";

test("compound Collection filters, OR/AND, persistence and read-only controls", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  const cells = block.getByTestId("collection-tanstack-table");
  const names = cells.getByRole("textbox", { name: "Name", exact: true });
  await block.getByRole("button", { name: "Settings" }).click();
  await block.getByRole("button", { name: "+ Filter" }).click();
  await block.getByRole("combobox", { name: "Filter field 1" }).selectOption({ label: "Status" });
  await block.getByRole("combobox", { name: "Filter operator 1" }).selectOption("neq");
  await block.getByRole("textbox", { name: "Filter value 1" }).fill("Done");
  await expect(names).toHaveCount(1);
  await expect(names.first()).toHaveValue("Original row");
  await block.getByRole("button", { name: "+ Filter" }).click();
  await block.getByRole("combobox", { name: "Filter field 2" }).selectOption({ label: "Name" });
  await block.getByRole("combobox", { name: "Filter operator 2" }).selectOption("contains");
  await block.getByRole("textbox", { name: "Filter value 2" }).fill("Other");
  await expect(names).toHaveCount(0);
  await block.getByRole("combobox", { name: "Filter logic" }).selectOption("or");
  await expect(names).toHaveCount(2);
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await reopened.getByRole("button", { name: "Settings" }).click();
  await expect(reopened.getByRole("combobox", { name: "Filter logic" })).toHaveValue("or");
  await expect(reopened.getByRole("combobox", { name: "Filter operator 1" })).toHaveValue("neq");
  await expect(reopened.getByRole("combobox", { name: "Filter operator 2" })).toHaveValue("contains");
  await expect(reopened.getByRole("textbox", { name: "Filter value 1" })).toHaveValue("Done");
  await expect(reopened.getByRole("textbox", { name: "Filter value 2" })).toHaveValue("Other");
  await expect(reopened.getByTestId("collection-tanstack-table").getByRole("textbox", { name: "Name", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("combobox", { name: "Filter logic" })).toBeDisabled();
  await expect(reopened.getByRole("combobox", { name: "Filter operator 1" })).toBeDisabled();
});

test("Timeline bounds 501 scheduled rows to a navigable 100-row slice", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  const fixture = {
    version: 1, title: "Large timeline",
    fields: [{ id: "name", name: "Name", type: "text" }, { id: "date", name: "Start", type: "date" }],
    records: Array.from({ length: 501 }, (_, i) => ({
      id: "task-" + i, values: { name: "Task " + i, date: "2026-10-17" },
    })),
    views: [{ id: "timeline", name: "Timeline", kind: "timeline", dateFieldId: "date" }],
    activeViewId: "timeline",
  };
  page.once("dialog", dialog => { void dialog.accept(); });
  await block.locator('input[type="file"]').setInputFiles({
    name: "timeline-501.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const rows = block.getByTestId("collection-timeline-row");
  await expect(rows).toHaveCount(100);
  await expect(block.getByTestId("collection-timeline-page-number")).toHaveText("Page 1 of 6");
  await block.getByRole("button", { name: "Next timeline page" }).click();
  await expect(rows).toHaveCount(100);
  await expect(rows.first()).toHaveAttribute("data-record-id", "task-100");
  for (let i = 0; i < 4; i++) {
    await block.getByRole("button", { name: "Next timeline page" }).click();
  }
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-record-id", "task-500");
  await expect(block.getByTestId("collection-timeline-edit")).toHaveCount(1);
});
