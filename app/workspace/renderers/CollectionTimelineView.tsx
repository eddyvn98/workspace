"use client";
import React, { useMemo, useState } from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "../collections/model";
import { recordTitle, setRecordValue } from "../collections/model";
import { FieldEditor, btnClass } from "./CollectionFieldEditor";
import { addUtcDays, timelineLayout } from "./collectionTimelineDates";
import { parseCalendarDay } from "./collectionCalendarDates";

interface Props { rows: CollectionRecord[]; data: CollectionBlockPayload; start?: CollectionField;
  end?: CollectionField; readOnly: boolean; onChange: (next: CollectionBlockPayload) => void;
  patch: (r: CollectionRecord, f: CollectionField, v: string) => void; }
const CELL = 26;
export function TimelineView({ rows, data, start, end, readOnly, onChange, patch }: Props) {
  const [scale, setScale] = useState<"day" | "week">("day");
  const view = useMemo(() => timelineLayout(rows, start?.id, end?.id), [rows, start?.id, end?.id]);
  const span = view.days * CELL;
  const changeDates = (record: CollectionRecord, amount: number) => {
    if (!start || readOnly) return;
    const previousStart = record.values[start.id] ?? "";
    const nextStart = addUtcDays(previousStart, amount);
    if (!nextStart) return;
    let updated = setRecordValue(data, record.id, start.id, nextStart);
    if (end && end.id !== start.id && parseCalendarDay(record.values[end.id] ?? "")) {
      const nextEnd = addUtcDays(record.values[end.id], amount);
      if (nextEnd) updated = setRecordValue(updated, record.id, end.id, nextEnd);
    }
    // Commit one consistent start/end change, never two stale patches.
    onChange(updated);
  };
  const resize = (record: CollectionRecord, amount: number) => {
    if (readOnly || !start || !end || start.id === end.id) return;
    const initial = record.values[end.id] || record.values[start.id];
    const shifted = addUtcDays(initial, amount);
    if (shifted && shifted >= record.values[start.id]) patch(record, end, shifted);
  };
  return <div className="space-y-3 text-xs" data-testid="collection-timeline">
    {!start && <p className="text-amber-600">Add a date field for Timeline.</p>}
    <div className="flex flex-wrap items-center gap-2">
      <strong>{view.from} – {view.to}</strong>
      <label>Ruler <select className="rounded border p-1" aria-label="Timeline ruler"
        value={scale} onChange={event => setScale(event.target.value as "day" | "week")}>
        <option value="day">Days</option><option value="week">Weeks</option>
      </select></label>
      {view.undated > 0 && <span>{view.undated} undated records (edit in Table)</span>}
      {view.beyondWindow > 0 && <span>Showing first 180 days; {view.beyondWindow} records outside window</span>}
    </div>
    <div className="max-w-full overflow-x-auto rounded border" data-testid="collection-timeline-scroll">
      <div style={{ minWidth: 150 + span }}>
        <div className="flex border-b bg-slate-100 dark:bg-slate-900">
          <span className="w-[150px] shrink-0 border-r p-1 font-semibold">Record</span>
          <div className="relative h-10" style={{ width: span }}>
            {view.ticks.map((day, index) => {
              // 26px ticks are too narrow for labels on every day: show each third day.
              const shown = index === 0 || (scale === "day" ? index % 3 === 0
                : new Date(day + "T12:00:00Z").getUTCDay() === 1);
              return <div key={day} className="absolute top-0 h-full border-l border-slate-300"
                data-testid="collection-timeline-tick" data-date={day}
                style={{ left: index * CELL, width: CELL }}>
                {shown && <span className="block whitespace-nowrap text-[10px]" aria-label={"Ruler date " + day}>{day.slice(5).replace("-", "/")}</span>}
              </div>;
            })}
          </div>
        </div>
        {view.entries.map(({ record, startOffset, length }) =>
          <div className="flex min-h-12 items-center border-b" key={record.id}
            data-testid="collection-timeline-row" data-record-id={record.id}>
            <div className="w-[150px] shrink-0 truncate border-r p-1" title={recordTitle(data, record)}>
              {recordTitle(data, record)}
            </div>
            <div className="relative h-11" style={{ width: span }}>
              {startOffset < view.days && <div className="absolute top-2 h-7 rounded bg-blue-600 text-white"
                role="img" aria-label={"Timeline duration " + recordTitle(data, record) + " " + length + " days"}
                style={{ left: startOffset * CELL, width: Math.min(length, view.days - startOffset) * CELL }} />}
            </div>
          </div>)}
      </div>
    </div>
    <div className="space-y-2">
      {view.entries.map(({ record }) => <div key={record.id}
        className="flex flex-wrap items-center gap-2 border-b py-1" data-testid="collection-timeline-edit">
        <strong className="w-28 truncate">{recordTitle(data, record)}</strong>
        {start && <FieldEditor field={start} value={record.values[start.id] ?? ""}
          readOnly={readOnly} onSet={value => patch(record, start, value)} />}
        {end && end.id !== start?.id && <FieldEditor field={end} value={record.values[end.id] ?? ""}
          readOnly={readOnly} onSet={value => patch(record, end, value)} />}
        <button className={btnClass} disabled={readOnly || !start}
          aria-label={"Move " + recordTitle(data, record) + " backward one day"}
          onClick={() => changeDates(record, -1)}>← 1d</button>
        <button className={btnClass} disabled={readOnly || !start}
          aria-label={"Move " + recordTitle(data, record) + " forward one day"}
          onClick={() => changeDates(record, 1)}>1d →</button>
        <button className={btnClass} disabled={readOnly || !end || end.id === start?.id}
          aria-label={"Extend " + recordTitle(data, record) + " by one day"}
          onClick={() => resize(record, 1)}>+ Duration</button>
        <button className={btnClass} disabled={readOnly || !end || end.id === start?.id}
          aria-label={"Shorten " + recordTitle(data, record) + " by one day"}
          onClick={() => resize(record, -1)}>− Duration</button>
      </div>)}
    </div>
  </div>;
}
