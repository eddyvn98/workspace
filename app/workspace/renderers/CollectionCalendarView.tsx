"use client";
import React, { useMemo, useState } from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "../collections/model";
import { recordTitle } from "../collections/model";
import { btnClass, FieldEditor, inputClass } from "./CollectionFieldEditor";
import { calendarDays, shiftCalendarDay, type CalendarMode } from "./collectionCalendarDates";

interface Props {
  month: string;
  setMonth: (value: string) => void;
  rows: CollectionRecord[];
  data: CollectionBlockPayload;
  field?: CollectionField;
  readOnly: boolean;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void;
}

export function CalendarView({ month, setMonth, rows, data, field, readOnly, patch }: Props) {
  const [mode, setMode] = useState<CalendarMode>("month");
  const [anchor, setAnchor] = useState(() => month + "-01");
  const days = useMemo(() => calendarDays(anchor, mode), [anchor, mode]);
  const byDate = useMemo(() => {
    const index = new Map<string, CollectionRecord[]>();
    if (field) for (const record of rows) {
      const date = record.values[field.id];
      if (!date) continue;
      index.set(date, [...(index.get(date) ?? []), record]);
    }
    return index;
  }, [rows, field]);
  const navigate = (date: string) => {
    setAnchor(date);
    setMonth(date.slice(0, 7));
  };
  const caption = mode === "month" ? anchor.slice(0, 7)
    : mode === "week" ? days[0] + " – " + days[days.length - 1] : anchor;
  const onDrop = (event: React.DragEvent, day: string) => {
    event.preventDefault();
    if (readOnly || !field) return;
    const id = event.dataTransfer.getData("text/collection-record");
    const record = rows.find(item => item.id === id);
    if (record && record.values[field.id] !== day) patch(record, field, day);
  };
  return <div className="space-y-2" data-testid="collection-calendar">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button type="button" aria-label="Previous calendar period" className={btnClass}
        onClick={() => navigate(shiftCalendarDay(anchor, mode, -1))}>←</button>
      <strong data-testid="collection-calendar-period">{caption}</strong>
      <button type="button" aria-label="Next calendar period" className={btnClass}
        onClick={() => navigate(shiftCalendarDay(anchor, mode, 1))}>→</button>
      <label className="ml-2">Mode <select aria-label="Calendar mode" className={inputClass}
        value={mode} onChange={event => setMode(event.target.value as CalendarMode)}>
        <option value="month">Month</option><option value="week">Week</option><option value="day">Day</option>
      </select></label>
      <input type="date" aria-label="Calendar selected day" className={inputClass}
        value={anchor} onChange={event => event.target.value && navigate(event.target.value)} />
      {!field && <span className="text-amber-600">Add a date field to use Calendar</span>}
    </div>
    <div className={"grid gap-1 text-xs " + (mode === "day" ? "grid-cols-1" : "grid-cols-7")}>
      {mode !== "day" && ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(label =>
        <strong key={label} className="text-center">{label}</strong>)}
      {days.map(day => {
        const matches = byDate.get(day) ?? [];
        const outside = mode === "month" && !day.startsWith(anchor.slice(0, 7));
        return <section key={day} data-testid="collection-calendar-day" data-date={day}
          aria-label={"Date " + day}
          className={"min-h-20 min-w-0 rounded border p-1 dark:border-slate-700 " + (outside ? "opacity-50" : "")}
          onDragOver={event => { if (!readOnly && field) event.preventDefault(); }}
          onDrop={event => onDrop(event, day)}>
          <button type="button" className="text-slate-500 underline" aria-label={"Select " + day}
            onClick={() => navigate(day)}>{day.slice(8)}</button>
          {matches.map(record => <div key={record.id} data-record-id={record.id}
            className="mt-1 space-y-1 overflow-hidden rounded bg-blue-100 p-1 text-blue-900"
            draggable={!readOnly && !!field}
            onDragStart={event => event.dataTransfer.setData("text/collection-record", record.id)}>
            <span className="block truncate" title={recordTitle(data, record)}>{recordTitle(data, record)}</span>
            {field && <FieldEditor field={field} value={record.values[field.id] ?? ""}
              readOnly={readOnly} onSet={value => patch(record, field, value)} />}
          </div>)}
        </section>;
      })}
    </div>
    <p className="text-xs text-slate-500">
      Drag a card to change its date, or edit the date directly. Undated records remain in Table view.
    </p>
  </div>;
}
