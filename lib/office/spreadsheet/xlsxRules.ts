import type { Cell, Worksheet } from "exceljs";
import type { TableBlockPayload } from "@/app/workspace/types/table";
import { parseRange, rangeAddress } from "./addresses";
import { colorFromExcel, colorToExcel, type Warnings } from "./xlsxStyles";

export function readValidation(cell: Cell, data: TableBlockPayload, key: string, warnings: Warnings): void {
  const rule = cell.dataValidation;
  if (!rule?.type) return;
  const source = rule.formulae?.[0];
  if (rule.type !== "list" || typeof source !== "string" || !/^"[^"\r\n]*"$/.test(source)) {
    warnings.add("Only inline dropdown validations are imported; formula-based and numeric validation rules are omitted."); return;
  }
  (data.dataValidations ??= {})[key] = { type: "dropdown", type2: null, value1: source.slice(1, -1), value2: "",
    validity: "", remote: false, prohibitInput: Boolean(rule.showErrorMessage), hintShow: Boolean(rule.showInputMessage), hintValue: rule.prompt ?? "" };
}
export function writeValidation(cell: Cell, data: TableBlockPayload, key: string, warnings: Warnings): void {
  const rule = data.dataValidations?.[key];
  if (!rule) return;
  if (rule.type !== "dropdown" || typeof rule.value1 !== "string" || rule.value1.length > 253 || /["\r\n]/.test(rule.value1)) {
    warnings.add("Only inline dropdown validations (up to 253 characters) are exported."); return;
  }
  cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"' + rule.value1 + '"'],
    showErrorMessage: Boolean(rule.prohibitInput), showInputMessage: Boolean(rule.hintShow), prompt: String(rule.hintValue ?? "") };
}
const OPERATORS = ["equal", "notEqual", "greaterThan", "lessThan", "greaterThanOrEqual", "lessThanOrEqual", "between", "notBetween"];
export function readConditional(ws: Worksheet, data: TableBlockPayload, warnings: Warnings): void {
  const rules = (ws.model as unknown as { conditionalFormattings?: { ref: string; rules: Record<string, unknown>[] }[] }).conditionalFormattings ?? [];
  for (const set of rules) for (const rule of set.rules) {
    if (rule.type !== "cellIs" || !OPERATORS.includes(String(rule.operator)) || !Array.isArray(rule.formulae)
      || !rule.formulae.every((x) => Number.isFinite(Number(x))) || set.ref.includes(" ")) {
      warnings.add("Only numeric cell-value conditional formatting rules are imported."); continue;
    }
    const style = rule.style as { font?: { color?: { argb?: string } }; fill?: { fgColor?: { argb?: string } } } | undefined;
    (data.conditionalFormats ??= []).push({ type: "default", cellrange: [parseRange(set.ref)],
      conditionName: rule.operator, conditionRange: [], conditionValue: rule.formulae.map(String),
      format: { textColor: colorFromExcel(style?.font?.color, warnings) ?? null, cellColor: colorFromExcel(style?.fill?.fgColor, warnings) ?? null } });
  }
}
export function writeConditional(ws: Worksheet, data: TableBlockPayload, warnings: Warnings): void {
  for (const rule of data.conditionalFormats ?? []) {
    if (rule.type !== "default" || !OPERATORS.includes(String(rule.conditionName)) || !Array.isArray(rule.cellrange)
      || !Array.isArray(rule.conditionValue) || !rule.conditionValue.every((x) => Number.isFinite(Number(x)))) {
      warnings.add("Only numeric cell-value conditional formatting rules are exported."); continue;
    }
    const format = rule.format as { textColor?: string; cellColor?: string } | undefined;
    const color = colorToExcel(format?.textColor, warnings), background = colorToExcel(format?.cellColor, warnings);
    for (const raw of rule.cellrange) {
      const ref = rangeAddress(raw as Parameters<typeof rangeAddress>[0]);
      const range = parseRange(ref);
      if (range.row[1] >= data.rows || range.column[1] >= data.cols) throw new Error("Conditional format exceeds sheet bounds.");
      ws.addConditionalFormatting({ ref, rules: [{ type: "cellIs", operator: rule.conditionName as "greaterThan",
        formulae: rule.conditionValue.map(String), priority: 1,
        style: { ...(color ? { font: { color } } : {}), ...(background ? { fill: { type: "pattern", pattern: "solid", fgColor: background } } : {}) } }] });
    }
  }
}
