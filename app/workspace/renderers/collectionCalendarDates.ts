export type CalendarMode = "month" | "week" | "day";
const MS_DAY = 86_400_000;
export const isoDay = (value: Date): string => value.toISOString().slice(0, 10);

/** Use noon UTC to avoid browser timezone and DST rollover. */
export function parseCalendarDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && isoDay(date) === value ? date : null;
}
export function calendarDays(anchor: string, mode: CalendarMode): string[] {
  const date = parseCalendarDay(anchor);
  if (!date) return [];
  if (mode === "day") return [isoDay(date)];
  const first = new Date(date);
  if (mode === "month") first.setUTCDate(1);
  const offset = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - offset);
  const count = mode === "week" ? 7 :
    Math.ceil((offset + new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => isoDay(new Date(first.getTime() + index * MS_DAY)));
}
export function shiftCalendarDay(anchor: string, mode: CalendarMode, direction: -1 | 1): string {
  const date = parseCalendarDay(anchor);
  if (!date) return anchor;
  if (mode === "month") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + direction);
    const max = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).getUTCDate();
    date.setUTCDate(Math.min(day, max));
  } else date.setUTCDate(date.getUTCDate() + direction * (mode === "week" ? 7 : 1));
  return isoDay(date);
}
