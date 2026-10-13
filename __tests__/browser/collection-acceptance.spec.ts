import { test, expect } from "@playwright/test";

test("create, edit, switch saved view, reload, edit in read-only mode denied", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await expect(page.getByTestId("collection-acceptance")).toBeVisible();
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const container = page.getByTestId("collection-block");
  await expect(container).toBeVisible();
  await container.getByRole("button", { name: "+ Record" }).click();
  await container.getByRole("textbox", { name: "Name" }).first().fill("Persisted acceptance record");
  await container.getByRole("button", { name: "Kanban", exact: true }).click();
  await expect(container.getByText("Persisted acceptance record").first()).toBeVisible();
  await page.reload();
  const reopened = page.getByTestId("collection-block");
  await expect(reopened).toBeVisible();
  await expect(reopened.getByText("Persisted acceptance record").first()).toBeVisible();
  await expect(reopened.getByRole("button", { name: "Kanban", exact: true })).toHaveClass(/border-blue-500/);
  await page.getByRole("checkbox", { name: "Read-only" }).check();
  await expect(reopened.getByRole("button", { name: "+ Record" })).toBeDisabled();
  await reopened.getByRole("button", { name: "Table", exact: true }).click();
  await expect(reopened.getByRole("textbox", { name: "Name" }).first()).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("collection-block").getByRole("button", { name: "Kanban", exact: true })).toHaveClass(/border-blue-500/);
});

test("convert table without mutating source, edit and delete a record", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Table conversion controls" }).click();
  await page.getByRole("button", { name: "To Collection" }).click();
  const container = page.getByTestId("collection-block");
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Original row");
  await expect(page.getByTestId("table-source")).toContainText("Original row");
  await container.getByRole("textbox", { name: "Name" }).first().fill("Changed in Collection");
  await expect(page.getByTestId("table-source")).toContainText("Original row");
  await container.getByRole("button", { name: "Delete Changed in Collection" }).click();
  await expect(container.getByRole("textbox", { name: "Name" }).first()).toHaveValue("Other row");
  await page.reload();
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
