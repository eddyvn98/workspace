import type { CollectionRecord } from "../collections/model";
import { isoDay, parseCalendarDay } from "./collectionCalendarDates";

const DAY_MS = 86_400_000;
export const addUtcDays = (iso: string, amount: number): string | null => {
  const date = parseCalendarDay(iso);
  return date ? isoDay(new Date(date.getTime() + amount * DAY_MS)) : null;
};
const utcIndex = (iso: string) => parseCalendarDay(iso)!.getTime() / DAY_MS;
export interface TimelineEntry { record: CollectionRecord; start: string; end: string; startOffset: number; length: number; }
export function timelineLayout(records: CollectionRecord[], startId?: string, endId?: string, limit = 180) {
  const intervals = records.flatMap(record => {
    const start = record.values[startId ?? ""] ?? "";
    const endValue = record.values[endId ?? ""] ?? "";
    if (!parseCalendarDay(start)) return [];
    const end = parseCalendarDay(endValue) && endValue >= start ? endValue : start;
    return [{ record, start, end }];
  });
  const from = intervals.map(item => item.start).sort()[0] ?? isoDay(new Date());
  const last = intervals.map(item => item.end).sort().at(-1) ?? addUtcDays(from, 13)!;
  const days = Math.min(limit, Math.max(14, utcIndex(last) - utcIndex(from) + 1));
  const ticks = Array.from({ length: days }, (_, index) => addUtcDays(from, index)!);
  const entries: TimelineEntry[] = intervals.map(item => ({
    ...item, startOffset: utcIndex(item.start) - utcIndex(from),
    length: utcIndex(item.end) - utcIndex(item.start) + 1,
  }));
  return { from, to: ticks[ticks.length - 1], ticks, days, entries,
    beyondWindow: entries.filter(item => item.startOffset >= days).length,
    undated: records.length - entries.length };
}
