"use client";
import React, { useMemo, useRef } from "react";
import { flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type SortingState } from "@tanstack/react-table";
import { deleteRecord, recordTitle, viewSorts, type CollectionBlockPayload,
  type CollectionField, type CollectionRecord, type CollectionView } from "../collections/model";
import { btnClass, FieldEditor } from "./CollectionFieldEditor";

interface Props {
  data: CollectionBlockPayload; view: CollectionView; rows: CollectionRecord[];
  readOnly: boolean; onChange: (next: CollectionBlockPayload) => void;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void;
}
const getRecordId = (row: CollectionRecord) => row.id;

export function CollectionTableView({ data, view, rows, readOnly, onChange, patch }: Props) {
  // Keep the cell renderer identity stable while edits update Collection data.
  // Calling the latest patch via a ref avoids unmounting the focused input.
  const patchRef = useRef(patch);
  patchRef.current = patch;
  // Stable controlled state: one sorting array per saved View configuration.
  const sorting = useMemo<SortingState>(() => viewSorts(view).map(s =>
    ({ id: s.fieldId, desc: s.direction === "desc" })), [view]);
  const columns = useMemo<ColumnDef<CollectionRecord>[]>(() => data.fields.map(field => ({
    id: field.id, accessorFn: record => record.values[field.id] ?? "", header: () => field.name,
    sortingFn: field.type === "number" ? "basic" : "alphanumeric",
    cell: ctx => <FieldEditor field={field} value={ctx.row.original.values[field.id] ?? ""}
      readOnly={readOnly} onSet={value => patchRef.current(ctx.row.original, field, value)} />,
  })), [data.fields, readOnly]);
  const table = useReactTable({
    data: rows, columns, getRowId: getRecordId,
    getCoreRowModel: getCoreRowModel(),
    // visibleRecords already applies all saved sorts. Do not sort twice or
    // auto-reset table state in response to a controlled input keystroke.
    manualSorting: true, autoResetAll: false,
    state: { sorting }, enableMultiSort: true,
    onSortingChange: update => {
      if (readOnly) return;
      const next = typeof update === "function" ? update(sorting) : update;
      const sorts = next.map(item => ({ fieldId: item.id, direction: item.desc ? "desc" as const : "asc" as const }));
      onChange({ ...data, views: data.views.map(v => v.id === view.id ? { ...v, sorts, sort: undefined } : v) });
    },
  });
  return <table className="w-full border-collapse text-left text-xs" data-testid="collection-tanstack-table">
    <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>
      {group.headers.map(header => <th key={header.id} className="sticky top-0 whitespace-nowrap border-b bg-slate-100 p-2 dark:bg-slate-800">
        <button type="button" disabled={readOnly} onClick={header.column.getToggleSortingHandler()}
          aria-label={"Sort " + header.column.id}
          title="Shift-click to sort by multiple columns">
          {flexRender(header.column.columnDef.header, header.getContext())}
          {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
          {header.column.getSortIndex() > 0 ? " (" + (header.column.getSortIndex() + 1) + ")" : ""}
        </button>
      </th>)}<th className="border-b"> </th>
    </tr>)}</thead>
    <tbody>{table.getRowModel().rows.map(row => <tr key={row.original.id} data-record-id={row.original.id}>
      {row.getVisibleCells().map(cell => <td className="min-w-28 border-b p-1" key={cell.id}>
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </td>)}
      <td><button aria-label={"Delete " + recordTitle(data, row.original)} className={btnClass}
        disabled={readOnly} onClick={() => onChange(deleteRecord(data, row.original.id))}>×</button></td>
    </tr>)}</tbody>
  </table>;
}
