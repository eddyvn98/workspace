import { test, expect, type Page } from "@playwright/test";

// Prevent a silent "Preparing browser test..." shell from being counted as
// a persistence bug. Fail explicitly for uncaught client errors / failed RSC.
// Hooks survive page.reload() and apply to both mobile and desktop projects.
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push("uncaught: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration|failed to fetch rsc|chunkloaderror/i.test(message.text())) {
      errors.push("console: " + message.text());
    }
  });
  page.on("requestfailed", (request) => {
    if (/[?&]_rsc=/.test(request.url())) {
      errors.push("RSC request failed: " + request.url() + " " + request.failure()?.errorText);
    }
  });
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? [], "No hydration, JS exception or failed RSC request").toEqual([]);
});


test("create, edit, switch saved view, reload, edit in read-only mode denied", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const container = page.getByTestId("collection-block");
  await expect(container).toBeVisible();
  await container.getByRole("button", { name: "+ Record" }).click();
  await container.getByRole("textbox", { name: "Name" }).first().fill("Persisted acceptance record");
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Persisted acceptance record");
  await container.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(container.getByText("Persisted acceptance record").first()).toBeVisible();
  const reloadResponse = await page.reload();
  expect(reloadResponse?.status(), "Reload must return a successful document").toBe(200);
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText("Persisted acceptance record").first()).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Kanban", exact: true })).toHaveClass(/border-blue-500/);
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("button", { name: "+ Record" })).toBeDisabled();
  await reopened.getByRole("button", { name: "Table", exact: true }).click();
  await expect(reopened.getByRole("textbox", { name: "Name" }).first()).toBeDisabled();
  const secondReload = await page.reload();
  expect(secondReload?.status()).toBe(200);
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await expect(page.getByTestId("collection-block").getByRole("button", { name: "Kanban", exact: true })).toHaveClass(/border-blue-500/);
});

test("convert table without mutating source, edit and delete a record", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  const container = page.getByTestId("collection-block");
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Original row");
  await expect(page.getByTestId("table-source")).toContainText("Original row");
  const firstRowId = await container.locator("tr[data-record-id]").first().getAttribute("data-record-id");
  await container.getByRole("textbox", { name: "Name" }).first().fill("Changed in Collection");
  // A frozen main thread prevents the following assertions from completing.
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Changed in Collection");
  await expect(container.locator("tr[data-record-id]").first()).toHaveAttribute("data-record-id", firstRowId!);
  expect(await page.evaluate(() => document.readyState)).toBe("complete");
  await expect(page.getByTestId("table-source")).toContainText("Original row");
  await container.getByRole("button", { name: "Delete Changed in Collection" }).click();
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Other row");
  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await expect(page.getByTestId("collection-block").getByRole("textbox", { name: "Name" }).first()).toHaveValue("Other row");
});

test("fullscreen canvas-portal works at desktop and mobile viewport", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Expand" }).click();
  const exit = page.getByRole("button", { name: "Exit full screen" });
  await expect(exit).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const editor = document.querySelector("div.fixed.inset-0") as HTMLElement | null;
    if (!editor) return null;
    const rect = editor.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, screenWidth: innerWidth, screenHeight: innerHeight };
  });
  expect(dimensions).not.toBeNull();
  expect(dimensions!.width).toBeGreaterThanOrEqual(dimensions!.screenWidth - 2);
  expect(dimensions!.height).toBeGreaterThanOrEqual(dimensions!.screenHeight - 2);
  await exit.click();
  await expect(page.getByTestId("collection-block").getByRole("button", { name: "Expand" })).toBeVisible();
});

test("Table multi-filter and multi-sort survive reload while legacy views remain usable", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  const table = page.getByTestId("collection-block");
  await expect(table.getByTestId("collection-tanstack-table")).toBeVisible();
  await table.getByRole("button", { name: "Settings" }).click();
  await table.getByRole("button", { name: "+ Filter" }).click();
  await table.getByRole("combobox", { name: "Filter field 1" }).selectOption({ label: "Status" });
  // Table conversion saves option labels ("Done"), not source IDs ("done").
  await table.getByRole("textbox", { name: "Filter value 1" }).fill("Done");
  expect(await page.evaluate(() => document.readyState)).toBe("complete");
  const cells = table.getByTestId("collection-tanstack-table");
  const nameCells = cells.getByRole("textbox", { name: "Name", exact: true });
  await expect(nameCells).toHaveCount(1);
  await expect(nameCells).toHaveValue("Other row");
  await table.getByRole("button", { name: "+ Filter" }).click();
  await table.getByRole("textbox", { name: "Filter value 2" }).fill("Other row");
  await expect(nameCells).toHaveCount(1);
  await expect(nameCells).toHaveValue("Other row");
  await table.getByRole("button", { name: "+ Sort" }).click();
  await table.getByRole("combobox", { name: "Sort field 1" }).selectOption({ label: "Status" });
  await table.getByRole("button", { name: "+ Sort" }).click();
  await table.getByRole("combobox", { name: "Sort field 2" }).selectOption({ label: "Name" });
  await expect(table.getByRole("combobox", { name: "Sort field 2" })).toBeVisible();
  const reload = await page.reload();
  expect(reload?.status()).toBe(200);
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  const reopened = page.getByTestId("collection-block");
  await reopened.getByRole("button", { name: "Settings" }).click();
  await expect(reopened.getByRole("textbox", { name: "Filter value 1" })).toHaveValue("Done");
  await expect(reopened.getByRole("textbox", { name: "Filter value 2" })).toHaveValue("Other row");
  await expect(reopened.getByRole("combobox", { name: "Filter field 1" }).locator("option:checked")).toHaveText("Status");
  await expect(reopened.getByRole("combobox", { name: "Filter field 2" }).locator("option:checked")).toHaveText("Name");
  await expect(reopened.getByRole("combobox", { name: "Sort field 1" }).locator("option:checked")).toHaveText("Status");
  await expect(reopened.getByRole("combobox", { name: "Sort field 2" }).locator("option:checked")).toHaveText("Name");
  await expect(reopened.getByTestId("collection-tanstack-table").getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Other row");
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("button", { name: "+ Filter" })).toBeDisabled();
  // The Table sort buttons currently use stable field IDs as their aria-labels.
  // Select by the displayed column header rather than assuming "Sort Name".
  const nameHeader = reopened.getByTestId("collection-tanstack-table").locator("thead th").filter({ hasText: "Name" });
  await expect(nameHeader.getByRole("button")).toBeDisabled();
  // Existing Kanban view still reads the same Collection, and switching back
  // must not erase the Table view-specific multi-condition configuration.
  await reopened.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(reopened.getByText("Other row", { exact: true }).first()).toBeVisible();
  await reopened.getByRole("button", { name: "Table", exact: true }).click();
  await expect(reopened.getByTestId("collection-tanstack-table").getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Other row");
  await expect(reopened.getByRole("textbox", { name: "Filter value 1" })).toHaveValue("Done");
  await expect(reopened.getByRole("textbox", { name: "Filter value 2" })).toHaveValue("Other row");
});

test("Kanban dnd-kit drag changes persisted status, respects read-only mode", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name" }).first().fill("Drag test record");
  await block.getByRole("button", { name: "Kanban", exact: true }).click();
  const card = block.getByTestId("collection-kanban-card").first();
  await expect(card).toBeVisible();
  const toDo = block.getByTestId("collection-kanban-column").and(block.locator('[data-status="To do"]'));
  if (page.viewportSize()!.width < 600) {
    // Touch-sized screens retain an accessible select alternative to drag.
    await block.getByRole("combobox", { name: "Status for Drag test record" }).selectOption("To do");
  } else {
    const handle = block.getByRole("button", { name: "Drag Drag test record" });
    const from = await handle.boundingBox();
    const to = await toDo.boundingBox();
    expect(from).not.toBeNull();
    expect(to).not.toBeNull();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 15 });
    await page.mouse.up();
  }
  await expect(toDo.getByText("Drag test record").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByTestId("collection-kanban-column").and(reopened.locator('[data-status="To do"]'))
    .getByText("Drag test record").first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("button", { name: "Drag Drag test record" })).toBeDisabled();
  await expect(reopened.getByRole("combobox", { name: "Status for Drag test record" })).toBeDisabled();
});
test("Calendar month/week/day navigation and date persistence", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).fill("Calendar task");
  await block.getByLabel("Due", { exact: true }).first().fill("2026-10-13");
  await block.getByRole("button", { name: "Calendar", exact: true }).click();
  const calendar = block.getByTestId("collection-calendar");
  await calendar.getByLabel("Calendar selected day").fill("2026-10-13");
  await expect(calendar.locator('[data-date="2026-10-13"]')).toContainText("Calendar task");
  await calendar.getByLabel("Calendar mode").selectOption("week");
  await expect(calendar.locator('[data-date="2026-10-13"]')).toContainText("Calendar task");
  await calendar.getByLabel("Calendar mode").selectOption("day");
  await expect(calendar.getByTestId("collection-calendar-day")).toHaveCount(1);
  await calendar.getByRole("button", { name: "Next calendar period" }).click();
  await expect(calendar.getByTestId("collection-calendar-period")).toHaveText("2026-10-14");
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByTestId("collection-calendar").locator('[data-date="2026-10-13"]'))
    .toContainText("Calendar task");
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByTestId("collection-calendar").getByLabel("Due", { exact: true })).toBeDisabled();
});
