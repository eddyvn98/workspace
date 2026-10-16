"use client";
import React, { useMemo, useState } from "react";
import type { CollectionBlockPayload, CollectionField, CollectionRecord } from "../collections/model";
import { recordTitle, setRecordValue } from "../collections/model";
import { FieldEditor, btnClass, hintClass } from "./CollectionFieldEditor";
import { addUtcDays, timelineLayout } from "./collectionTimelineDates";
import { parseCalendarDay } from "./collectionCalendarDates";
import { CollectionGanttBar } from "./CollectionGanttBar";
import { longestCollectionDependencyChain, scheduleCollectionDependencies, setCollectionDependencies } from "../collections/collectionDependencies";

interface Props { rows: CollectionRecord[]; data: CollectionBlockPayload; start?: CollectionField;
  end?: CollectionField; readOnly: boolean; onChange: (next: CollectionBlockPayload) => void;
  patch: (r: CollectionRecord, f: CollectionField, v: string) => void; }
const CELL = 26;
export function TimelineView({ rows, data, start, end, readOnly, onChange, patch }: Props) {
  const [scale, setScale] = useState<"day" | "week">("day");
  const [highlightChain, setHighlightChain] = useState(false);
  const longest = useMemo(() => longestCollectionDependencyChain(data, start?.id, end?.id),
    [data, start?.id, end?.id]);
  const highlightedIds = new Set(highlightChain ? longest.ids : []);
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
      <span className={hintClass}>Drag a bar to move dates, or drag its right edge to change duration.</span>
      <button className={btnClass} type="button" disabled={readOnly || !start}
        onClick={() => onChange(scheduleCollectionDependencies(data, start?.id, end?.id))}>
        Schedule dependencies
      </button>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={highlightChain}
          onChange={event => setHighlightChain(event.target.checked)} />
        Longest dependency chain ({longest.days} task-days)
      </label>
      <label>Ruler <select className="rounded border p-1" aria-label="Timeline ruler"
        value={scale} onChange={event => setScale(event.target.value as "day" | "week")}>
        <option value="day">Days</option><option value="week">Weeks</option>
      </select></label>
      {view.undated > 0 && <span className={hintClass}>{view.undated} undated records (edit in Table)</span>}
      {view.beyondWindow > 0 && <span className={hintClass}>Showing first 180 days; {view.beyondWindow} records outside window</span>}
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
              {startOffset < view.days && <CollectionGanttBar
                left={startOffset * CELL} width={Math.min(length, view.days - startOffset) * CELL}
                label={recordTitle(data, record)} durationDays={length} disabled={readOnly}
                highlighted={highlightedIds.has(record.id)}
                onMove={days => changeDates(record, days)}
                onResize={days => resize(record, days)} />}
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
        <label>Depends on
          <select className="ml-1 max-w-44 rounded border bg-transparent p-1"
            aria-label={"Add dependency for " + recordTitle(data, record)}
            value="" disabled={readOnly || (record.dependsOn ?? []).length >= 20}
            onChange={event => {
              const dependency = event.target.value;
              if (!dependency) return;
              const next = setCollectionDependencies(data, record.id,
                [...(record.dependsOn ?? []), dependency]);
              if (next === data) window.alert("That dependency would create a cycle or is invalid.");
              else onChange(next);
            }}>
            <option value="">+ Predecessor</option>
            {data.records.filter(item => item.id !== record.id && !(record.dependsOn ?? []).includes(item.id))
              .map(item => <option key={item.id} value={item.id}>{recordTitle(data, item)}</option>)}
          </select>
        </label>
        {(record.dependsOn ?? []).map(id => <button key={id} type="button" className={btnClass}
          disabled={readOnly} title="Remove dependency"
          aria-label={"Remove dependency " + (data.records.find(item => item.id === id)
            ? recordTitle(data, data.records.find(item => item.id === id)!) : id)}
          onClick={() => onChange(setCollectionDependencies(data, record.id,
            (record.dependsOn ?? []).filter(item => item !== id)))}>
          {data.records.find(item => item.id === id)
            ? recordTitle(data, data.records.find(item => item.id === id)!) : "Missing task"} ×
        </button>)}
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
