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
    if (/[?&]_rsc=/.test(request.url()) && request.failure()?.errorText !== "net::ERR_ABORTED") {
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
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
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
  await expect(reopened.getByRole("button", { name: "Kanban", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("button", { name: "+ Record" })).toBeDisabled();
  await reopened.getByRole("button", { name: "Table", exact: true }).click();
  await expect(reopened.getByRole("textbox", { name: "Name" }).first()).toBeDisabled();
  const secondReload = await page.reload();
  expect(secondReload?.status()).toBe(200);
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await expect(page.getByTestId("collection-block").getByRole("button", { name: "Kanban", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("convert table without mutating source, edit and delete a record", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
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

test("Table multi-filter and multi-sort survive reload while legacy views remain usable", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const table = page.getByTestId("collection-block");
  await expect(table.getByTestId("collection-tanstack-table")).toBeVisible();
  await table.getByRole("button", { name: "Settings" }).click();
  await table.getByRole("button", { name: "+ Filter" }).click();
  const cells = table.getByTestId("collection-tanstack-table");
  const nameCells = cells.getByRole("textbox", { name: "Name", exact: true });
  // An unfinished filter must not hide the existing records.
  await expect(nameCells).toHaveCount(2);
  await expect(table.getByText("Inactive until value is entered")).toBeVisible();
  await table.getByRole("combobox", { name: "Filter field 1" }).selectOption({ label: "Status" });
  await expect(nameCells).toHaveCount(2);
  await expect(cells.getByRole("button", { name: "Sort Name", exact: true })).toBeVisible();
  await expect(cells.getByRole("button", { name: "Sort Status", exact: true })).toBeVisible();
  // Table conversion saves option labels ("Done"), not source IDs ("done").
  await table.getByRole("textbox", { name: "Filter value 1" }).fill("Done");
  expect(await page.evaluate(() => document.readyState)).toBe("complete");
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
  // Verify the bottom field controls can be reached inside Settings via scrolling.
  await table.getByRole("button", { name: "+ Field" }).scrollIntoViewIfNeeded();
  await expect(table.getByRole("button", { name: "+ Field" })).toBeVisible();
  const settings = table.getByTestId("collection-settings");
  await expect(settings).toBeVisible();
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
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("button", { name: "+ Filter" })).toBeDisabled();
  await expect(reopened.getByTestId("collection-tanstack-table")
    .getByRole("button", { name: "Sort Name", exact: true })).toBeDisabled();
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
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
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
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("button", { name: "Drag Drag test record" })).toBeDisabled();
  await expect(reopened.getByRole("combobox", { name: "Status for Drag test record" })).toBeDisabled();
});

test("Calendar month/week/day navigation and date persistence", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).fill("Calendar task");
  await block.getByLabel("Start", { exact: true }).first().fill("2026-10-13");
  await block.getByRole("button", { name: "Calendar", exact: true }).click();
  await block.getByRole("button", { name: "Settings" }).click();
  await expect.poll(() => block.getByRole("combobox", { name: "Date", exact: true })
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text)).toBe("Start");
  await expect(block.getByLabel("End", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByTestId("collection-calendar").getByLabel("Start", { exact: true })).toBeDisabled();
});
test("Timeline date-aligned Gantt commits start and end in one edit and survives reload", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).fill("Schedule task");
  await block.getByLabel("Start", { exact: true }).first().fill("2026-10-12");
  await block.getByLabel("Due", { exact: true }).first().fill("2026-10-14");
  await block.getByRole("button", { name: "Timeline", exact: true }).click();
  await block.getByRole("button", { name: "Settings" }).click();
  await expect.poll(() => block.getByRole("combobox", { name: "Date", exact: true })
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text)).toBe("Start");
  await expect.poll(() => block.getByRole("combobox", { name: "End", exact: true })
    .evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text)).toBe("Due");
  const timeline = block.getByTestId("collection-timeline");
  await expect(timeline.getByRole("img", { name: "Timeline duration Schedule task 3 days" })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "Extend Schedule task by one day" })).toBeEnabled();
  const dayLabels = timeline.getByTestId("collection-timeline-tick").locator("span");
  await expect(dayLabels).toHaveCount(5);
  const boxes = await dayLabels.evaluateAll(spans => spans.map(span => { const rect = span.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }));
  expect(boxes.every((box, index) => index === 0 || box.left >= boxes[index - 1].right)).toBe(true);
  await timeline.getByRole("button", { name: "Move Schedule task forward one day" }).click();
  await expect(timeline.getByLabel("Start", { exact: true })).toHaveValue("2026-10-13");
  await expect(timeline.getByLabel("Due", { exact: true })).toHaveValue("2026-10-15");
  await timeline.getByLabel("Timeline ruler").selectOption("week");
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByTestId("collection-timeline").getByLabel("Start", { exact: true })).toHaveValue("2026-10-13");
  await expect(reopened.getByTestId("collection-timeline").getByLabel("Due", { exact: true })).toHaveValue("2026-10-15");
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await expect(reopened.getByRole("button", { name: "Move Schedule task forward one day" })).toBeDisabled();
  await expect(reopened.getByRole("button", { name: "Extend Schedule task by one day" })).toBeDisabled();
});

test("React Flow Mind Map persists parent links, supports zoom and read-only", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).first().fill("Parent");
  await block.getByRole("button", { name: "+ Record" }).click();
  await block.getByRole("textbox", { name: "Name", exact: true }).nth(1).fill("Child");
  // Keep native errors visible, including opaque Event rejections in React Flow.
  await page.evaluate(() => {
    const issues: string[] = [];
    (window as Window & { __mindMapIssues?: string[] }).__mindMapIssues = issues;
    window.addEventListener("error", event => issues.push(event.message || String(event.error)));
    window.addEventListener("unhandledrejection", event => issues.push("rejection: " + String(event.reason)));
  });
  await block.getByRole("button", { name: "Mind Map", exact: true }).click();
  const map = block.getByTestId("collection-mindmap");
  await expect(map.locator(".react-flow__node")).toHaveCount(2);
  await map.getByRole("combobox", { name: "Mind Map selected record" }).selectOption({ label: "Child" });
  await map.getByRole("combobox", { name: "Parent of Child" }).selectOption({ label: "Parent" });
  await expect(map.locator(".react-flow__edge")).toHaveCount(1);
  await expect(map.getByRole("button", { name: "Zoom In" })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __mindMapIssues?: string[] }).__mindMapIssues)).toEqual([]);
  await page.reload();
  const reopened = page.getByTestId("collection-block").getByTestId("collection-mindmap");
  await expect(reopened.locator(".react-flow__edge")).toHaveCount(1);
  await page.getByRole("button", { name: "Back to Workspace" }).click();
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await page.getByRole("button", { name: "Open collection" }).click();
  await reopened.getByRole("combobox", { name: "Mind Map selected record" }).selectOption({ label: "Child" });
  await expect(reopened.getByRole("combobox", { name: "Parent of Child" })).toBeDisabled();
});

test("rapid Kanban status toggles retain the final selection after reload", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const collection = page.getByTestId("collection-block");
  await collection.getByRole("button", { name: "+ Record" }).click();
  await collection.getByRole("textbox", { name: "Name" }).first().fill("Rapid toggle");
  await collection.getByRole("button", { name: "Kanban", exact: true }).click();
  const status = collection.getByRole("combobox", { name: "Status for Rapid toggle" });
  await expect(status).toBeVisible();
  // Do not wait for autosave between selections. The final value wins.
  await status.selectOption("Done");
  await status.selectOption("In progress");
  await status.selectOption("Done");
  await expect(status).toHaveValue("Done");
  const reload = await page.reload();
  expect(reload?.status()).toBe(200);
  const reopened = page.getByTestId("collection-block");
  await expect(reopened.getByRole("combobox", { name: "Status for Rapid toggle" })).toHaveValue("Done");
});

test("Calendar initially bounds crowded days and expands on demand", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  await page.getByTestId("collection-block").getByRole("button", { name: "Open collection" }).click();
  const block = page.getByTestId("collection-block");
  const fixture = {
    version: 1, title: "Crowded calendar",
    fields: [{ id: "name", name: "Name", type: "text" }, { id: "date", name: "Start", type: "date" }],
    records: Array.from({ length: 41 }, (_, i) => ({
      id: "d-" + i, values: { name: "Task " + i, date: "2026-10-17" },
    })),
    views: [{ id: "calendar", name: "Calendar", kind: "calendar", dateFieldId: "date" }],
    activeViewId: "calendar",
  };
  page.once("dialog", dialog => { void dialog.accept(); });
  await block.locator('input[type="file"]').setInputFiles({
    name: "calendar.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(fixture)),
  });
  const calendar = block.getByTestId("collection-calendar");
  await calendar.getByLabel("Calendar selected day").fill("2026-10-17");
  const day = calendar.locator('[data-date="2026-10-17"]');
  await expect(day.locator("[data-record-id]")).toHaveCount(20);
  await day.getByRole("button", { name: "Show all records for 2026-10-17" }).click();
  await expect(day.locator("[data-record-id]")).toHaveCount(41);
  await day.getByRole("button", { name: "Show fewer records for 2026-10-17" }).click();
  await expect(day.locator("[data-record-id]")).toHaveCount(20);
});
