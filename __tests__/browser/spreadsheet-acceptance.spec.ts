import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/spreadsheet-acceptance");
  await expect(page.getByRole("button", { name: "Import file", exact: true })).toBeVisible();
  await expect(page.locator(".fortune-fx-input")).toBeVisible();
});

test("CSV import is confirmed, survives reload and exports a real XLSX through the worker", async ({ page }, info) => {
  await page.getByLabel("Import spreadsheet file", { exact: true }).setInputFiles({ name: "sample.csv", mimeType: "text/csv", buffer: Buffer.from('Name,Amount\nAlice,12\nBob,20\n') });
  await expect(page.getByRole("dialog")).toContainText("Replace this workbook?");
  await page.getByRole("button", { name: "Replace workbook", exact: true }).click();
  await expect(page.getByTestId("current-data")).toContainText("Alice");
  await page.reload();
  await expect(page.getByTestId("current-data")).toContainText("Bob");
  page.on("dialog", (dialog) => dialog.accept());
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export XLSX", exact: true }).click();
  const file = await downloaded, path = await file.path();
  expect(path).toBeTruthy();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(await readFile(path!) as never);
  expect(workbook.worksheets[0].getCell("A2").text).toBe("Alice");
  expect(workbook.worksheets[0].getCell("B3").text).toBe("20");
  await page.screenshot({ path: info.outputPath("spreadsheet.png"), fullPage: true });
});

test("a Native backup can be restored directly in Spreadsheet", async ({ page }) => {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Native backup", exact: true }).click();
  const saved = await download, path = await saved.path();
  expect(saved.suggestedFilename()).toMatch(/\.workspace\.json$/);
  expect(path).toBeTruthy();
  await page.getByLabel("Import spreadsheet file", { exact: true }).setInputFiles({
    name: "replacement.csv", mimeType: "text/csv", buffer: Buffer.from("Changed,Now\n1,2\n"),
  });
  await page.getByRole("button", { name: "Replace workbook", exact: true }).click();
  await expect(page.getByTestId("current-data")).toContainText("Changed");
  await page.getByLabel("Import spreadsheet file", { exact: true }).setInputFiles({
    name: "original.workspace.json", mimeType: "application/json", buffer: await readFile(path!),
  });
  await expect(page.getByRole("dialog")).toContainText("current Office file identity");
  await page.getByRole("button", { name: "Replace workbook", exact: true }).click();
  await expect(page.getByTestId("current-data")).toContainText("Quantity");
});

test("active formula-bar typing is committed before explicit flush, and Escape stays in the app", async ({ page }) => {
  const input = page.locator(".fortune-fx-input");
  await input.click(); await input.press("ControlOrMeta+a"); await input.pressSequentially("Flushed draft");
  await expect(page.getByTestId("draft-status")).toHaveText("Editing cell");
  await page.getByRole("button", { name: "Flush spreadsheet", exact: true }).click();
  await expect(page.getByTestId("saved-data")).toContainText("Flushed draft");
  await input.click(); await input.press("Escape");
  await expect(page).toHaveURL(/spreadsheet-acceptance/);
});

test("read-only blocks import and editing; malformed files do not replace a workbook", async ({ page }) => {
  await page.getByLabel("Import spreadsheet file", { exact: true }).setInputFiles({ name: "bad.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("not an xlsx") });
  await expect(page.getByRole("alert").filter({ hasText: "XLSX must be a ZIP workbook" })).toBeVisible();
  await expect(page.getByTestId("current-data")).toContainText("Quantity");
  await page.goto("/spreadsheet-acceptance?readonly=1");
  await expect(page.getByRole("button", { name: "Import file", exact: true })).toBeDisabled();
  await expect(page.locator(".fortune-fx-input")).toHaveAttribute("contenteditable", "false");
});
