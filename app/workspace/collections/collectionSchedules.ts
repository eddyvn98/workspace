import type { CollectionBlockPayload } from "./model";
import { applyCollectionAutomations, automationWritable, validAutomationTarget } from "./collectionAutomations";
import { appendCollectionAudit } from "./collectionAudit";

export const SCHEDULE_TIMEZONES = ["Asia/Ho_Chi_Minh", "UTC", "Asia/Singapore",
  "America/New_York", "Europe/London"] as const;
export type ScheduleTimeZone = typeof SCHEDULE_TIMEZONES[number];

export interface CollectionScheduledRule {
  id: string;
  name: string;
  enabled: boolean;
  hour: number;
  minute: number;
  timeZone: ScheduleTimeZone;
  targetFieldId: string;
  targetValue: string;
  matchFieldId?: string;
  matchEquals?: string;
  /** Last successfully committed local calendar day. Owned by the board revision CAS. */
  lastRunDay?: string;
}
export function validScheduledRule(data: CollectionBlockPayload, rule: CollectionScheduledRule): boolean {
  const target = data.fields.find(field => field.id === rule.targetFieldId);
  const match = data.fields.find(field => field.id === rule.matchFieldId);
  return !!rule.id && rule.id.length <= 128 && rule.name.length <= 80
    && Number.isInteger(rule.hour) && rule.hour >= 0 && rule.hour < 24
    && Number.isInteger(rule.minute) && rule.minute >= 0 && rule.minute < 60
    && SCHEDULE_TIMEZONES.includes(rule.timeZone)
    && automationWritable(target) && validAutomationTarget(target, rule.targetValue)
    && (!rule.matchFieldId || !!match && !["lookup", "rollup", "formula", "relation"].includes(match.type))
    && (!rule.matchEquals || rule.matchEquals.length <= 2000);
}
export function sanitizeCollectionSchedules(data: CollectionBlockPayload): CollectionScheduledRule[] {
  const raw = Array.isArray(data.scheduledAutomations) ? data.scheduledAutomations : [];
  const seen = new Set<string>();
  return raw.filter(rule => rule && validScheduledRule(data, rule) &&
    !seen.has(rule.id) && (seen.add(rule.id), true)).slice(0, 20);
}
export function localScheduledDay(now: Date, timeZone: ScheduleTimeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  const day = part("year") + "-" + part("month") + "-" + part("day");
  return { day, minuteOfDay: Number(part("hour")) * 60 + Number(part("minute")) };
}
/** In-memory deterministic evaluation. Caller must persist using board revision CAS;
 * concurrent runs each compute against the saved lastRunDay, never a client timer.
 * Missed days are intentionally not backfilled or replayed after an outage. */
export function applyDueCollectionSchedules(
  data: CollectionBlockPayload, now: Date, actor = "Workspace Scheduler",
): { next: CollectionBlockPayload; rulesRun: number; recordsChanged: number } {
  const active = sanitizeCollectionSchedules(data);
  if (!active.some(rule => rule.enabled)) return { next: data, rulesRun: 0, recordsChanged: 0 };
  const due = new Map<string, string>();
  for (const rule of active) {
    if (!rule.enabled) continue;
    const local = localScheduledDay(now, rule.timeZone);
    if (local.minuteOfDay < rule.hour * 60 + rule.minute ||
      local.day <= (rule.lastRunDay ?? "")) continue;
    due.set(rule.id, local.day);
  }
  if (!due.size) return { next: data, rulesRun: 0, recordsChanged: 0 };
  let recordsChanged = 0;
  const records = data.records.map(record => {
    let updated = record;
    for (const rule of active) {
      if (!due.has(rule.id)) continue;
      if (rule.matchFieldId && (updated.values[rule.matchFieldId] ?? "") !== (rule.matchEquals ?? "")) continue;
      if (updated.values[rule.targetFieldId] === rule.targetValue) continue;
      updated = applyCollectionAutomations(data, updated, {
        ...updated, values: { ...updated.values, [rule.targetFieldId]: rule.targetValue },
      }, [rule.targetFieldId]);
    }
    if (updated !== record) recordsChanged++;
    return updated;
  });
  const next = {
    ...data, records, scheduledAutomations: active.map(rule =>
      due.has(rule.id) ? { ...rule, lastRunDay: due.get(rule.id) } : rule),
  };
  return { next: recordsChanged ? appendCollectionAudit(data, next, actor) : next,
    rulesRun: due.size, recordsChanged };
}
