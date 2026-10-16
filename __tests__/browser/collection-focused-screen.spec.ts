import { test, expect } from "@playwright/test";

test("focused Collection screen survives reload and returns to its Workspace board", async ({ page }) => {
  await page.goto("/collection-acceptance");
  await page.getByRole("button", { name: "Insert content" }).click();
  await page.getByRole("button", { name: "Add Collection" }).click();
  const block = page.getByTestId("collection-block");
  await expect(block.getByText("Collection · Workspace")).toBeVisible();
  await expect(block.getByText("No records yet")).toBeVisible();
  await block.getByRole("button", { name: "Open collection" }).click();
  const exit = page.getByRole("button", { name: "Exit collection screen" });
  const screen = page.getByRole("dialog", { name: /Collection screen/ });
  await expect(screen).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Workspace" })).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Import CSV/JSON" })).toBeFocused();
  expect(new URL(page.url()).searchParams.get("collectionScreen")).toBeTruthy();
  const dimensions = await page.evaluate(() => {
    const screen = document.querySelector("div.fixed.inset-0") as HTMLElement | null;
    if (!screen) return null;
    const rect = screen.getBoundingClientRect();
    return { width: rect.width, height: rect.height, screenWidth: innerWidth, screenHeight: innerHeight };
  });
  expect(dimensions).not.toBeNull();
  expect(dimensions!.width).toBeGreaterThanOrEqual(dimensions!.screenWidth - 2);
  expect(dimensions!.height).toBeGreaterThanOrEqual(dimensions!.screenHeight - 2);

  await page.reload();
  await expect(exit).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exit).toBeHidden();
  expect(new URL(page.url()).searchParams.has("collectionScreen")).toBe(false);
  await block.getByRole("button", { name: "Open collection" }).click();
  await page.goBack();
  await expect(exit).toBeHidden();
  await expect(block.getByRole("button", { name: "Open collection" })).toBeVisible();
  await page.goForward();
  await expect(exit).toBeVisible();
});
