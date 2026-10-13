import dayjs from "dayjs";
import type { TableCellValue } from "../types/table";

const DATE_TOKEN = /(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p)|("[^"]*")|(\\.)|(\[[^\]]*\])|(.)/gi;
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const stripQuotes = (pattern: string) => pattern.replace(/"[^"]*"/g, "").replace(/\\./g, "").replace(/\[[^\]]*\]/g, "");

function isDatePattern(pattern: string): boolean {
  return /[ymdhs]/i.test(stripQuotes(pattern)) && !/e[+-]/i.test(pattern);
}

function dateFromValue(value: TableCellValue): dayjs.Dayjs | null {
  if (typeof value === "number") return dayjs(new Date(EXCEL_EPOCH_MS + Math.round(value * 86400000)));
  if (typeof value !== "string" || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(value.trim())) return dayjs(new Date(EXCEL_EPOCH_MS + Math.round(numeric * 86400000)));
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function formatDate(date: dayjs.Dayjs, pattern: string): string {
  const tokens = [...pattern.matchAll(DATE_TOKEN)].map((match) => match[0]);
  const twelveHour = tokens.some((token) => /^(am\/pm|a\/p)$/i.test(token));
  let lastTime = false;
  const out = tokens.map((token, index) => {
    const lower = token.toLowerCase();
    if (/^(h|hh)$/.test(lower)) { lastTime = true; return twelveHour ? (lower === "hh" ? "hh" : "h") : (lower === "hh" ? "HH" : "H"); }
    if (/^(m|mm)$/.test(lower)) {
      const nextTime = tokens.slice(index + 1).find((item) => /^(s|ss|[hdy]+)$/i.test(item));
      const minute = lastTime || /^(s|ss)$/i.test(nextTime ?? "");
      return minute ? lower : lower.toUpperCase();
    }
    lastTime = /^(s|ss)$/.test(lower) ? true : lastTime;
    if (/^(yyyy|yy|mmmm|mmm)$/.test(lower)) return lower === "yyyy" ? "YYYY" : lower === "yy" ? "YY" : lower === "mmmm" ? "MMMM" : "MMM";
    if (lower === "dddd" || lower === "ddd") return lower;
    if (lower === "dd") return "DD";
    if (lower === "d") return "D";
    if (lower === "ss" || lower === "s") return lower;
    if (lower === "am/pm" || lower === "a/p") return "A";
    const literal = token.startsWith("\"") ? token.slice(1, -1) : token.startsWith("\\") ? token[1] : token.startsWith("[") ? "" : token;
    return literal ? `[${literal.replace(/[\[\]]/g, "")}]` : "";
  });
  return date.format(out.join(""));
}

function formatNumber(value: number, pattern: string): string | undefined {
  const sections = pattern.split(";");
  const negative = value < 0 && sections.length > 1;
  const section = negative ? sections[1] : value === 0 && sections.length > 2 ? sections[2] : sections[0];
  const core = /[#0?][#0?,]*(\.[#0?]+)?|\.[#0?]+/.exec(section);
  if (!core) return undefined;
  const literal = (text: string) => text.replace(/"([^"]*)"/g, "$1").replace(/\\(.)/g, "$1").replace(/\[[^\]]*\]/g, "").replace(/[_*]./g, "");
  const prefix = literal(section.slice(0, core.index));
  const suffix = literal(section.slice(core.index + core[0].length));
  const [intPattern, decimalPattern = ""] = core[0].split(".");
  const percent = section.includes("%");
  const amount = Math.abs(percent ? value * 100 : value);
  const fixed = amount.toFixed(decimalPattern.length);
  let [integer, decimals = ""] = fixed.split(".");
  const minDecimals = (decimalPattern.match(/0/g) ?? []).length;
  while (decimals.length > minDecimals && decimals.endsWith("0")) decimals = decimals.slice(0, -1);
  const minInteger = (intPattern.match(/0/g) ?? []).length;
  if (integer.length < minInteger) integer = integer.padStart(minInteger, "0");
  else if (integer === "0" && minInteger === 0) integer = decimals ? "" : "0";
  if (intPattern.includes(",")) integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = value < 0 && !negative ? "-" : "";
  return `${sign}${prefix}${integer}${decimals ? `.${decimals}` : ""}${suffix}`;
}

/** Formats a cell value with an Excel-style pattern ("#,##0.00", "0%",
 * "yyyy-mm-dd", ...). Returns undefined when the pattern or value does not apply,
 * so callers keep the original text. */
export function formatTableValue(value: TableCellValue | undefined, pattern: string | undefined): string | undefined {
  if (value === undefined || value === "" || !pattern || /^(general|@)$/i.test(pattern.trim())) return undefined;
  if (isDatePattern(pattern)) {
    const date = dateFromValue(value);
    return date ? formatDate(date, pattern) : undefined;
  }
  const numeric = typeof value === "number" ? value : /^-?\d+(\.\d+)?$/.test(String(value).trim()) ? Number(value) : undefined;
  return numeric === undefined || !Number.isFinite(numeric) ? undefined : formatNumber(numeric, pattern);
}
