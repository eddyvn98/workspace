"use client";
import React, { useMemo, useRef, useState } from "react";
import { flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type SortingState } from "@tanstack/react-table";
import { deleteRecord, recordTitle, viewSorts, type CollectionBlockPayload,
  type CollectionField, type CollectionRecord, type CollectionView, type CollectionSources } from "../collections/model";
import { btnClass, FieldEditor } from "./CollectionFieldEditor";
import { CollectionRecordDetails } from "./CollectionRecordDetails";
import { calculateCollectionAggregate } from "../collections/collectionFormula";
import { COLLECTION_PAGE_SIZES, collectionTablePage, type CollectionPageSize } from "./collectionTablePaging";

interface Props {
  data: CollectionBlockPayload; sources?: CollectionSources;
  view: CollectionView; rows: CollectionRecord[];
  readOnly: boolean; onChange: (next: CollectionBlockPayload) => void;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void;
}
const getRecordId = (row: CollectionRecord) => row.id;

export function CollectionTableView({ data, sources, view, rows, readOnly, onChange, patch }: Props) {
  // Keep the cell renderer identity stable while edits update Collection data.
  // Calling the latest patch via a ref avoids unmounting the focused input.
  const patchRef = useRef(patch);
  patchRef.current = patch;
  const dataRef = useRef(data);
  dataRef.current = data;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const [requestedPage, setRequestedPage] = useState(0);
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<CollectionPageSize>(50);
  const page = useMemo(() => collectionTablePage(rows, requestedPage, pageSize),
    [rows, requestedPage, pageSize]);
  // Stable controlled state: one sorting array per saved View configuration.
  const sorting = useMemo<SortingState>(() => viewSorts(view).map(s =>
    ({ id: s.fieldId, desc: s.direction === "desc" })), [view]);
  const columns = useMemo<ColumnDef<CollectionRecord>[]>(() => data.fields.map(field => ({
    id: field.id, accessorFn: record => record.values[field.id] ?? "", header: () => field.name,
    sortingFn: field.type === "number" ? "basic" : "alphanumeric",
    cell: ctx => <FieldEditor field={field} value={ctx.row.original.values[field.id] ?? ""}
      readOnly={readOnly} data={dataRef.current} sources={sourcesRef.current}
      recordId={ctx.row.original.id}
      onSet={value => patchRef.current(ctx.row.original, field, value)} />,
  })), [data.fields, readOnly]);
  const table = useReactTable({
    // Bind TanStack only to the visible page, not thousands of input editors.
    data: page.rows, columns, getRowId: getRecordId,
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
  return <div className="space-y-2" data-testid="collection-paged-table">
    <table className="w-full border-collapse text-left text-xs" data-testid="collection-tanstack-table">
    <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>
      {group.headers.map(header => <th key={header.id} className="sticky top-0 whitespace-nowrap border-b bg-slate-100 p-2 dark:bg-slate-800">
        <button type="button" disabled={readOnly} onClick={header.column.getToggleSortingHandler()}
          aria-label={"Sort " + (data.fields.find(field => field.id === header.column.id)?.name ?? "column")}
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
      <td><button className={btnClass} aria-label={"Open " + recordTitle(data, row.original)}
        onClick={() => setOpenRecordId(row.original.id)}>Open</button>
        <button aria-label={"Delete " + recordTitle(data, row.original)} className={btnClass}
        disabled={readOnly} onClick={() => onChange(deleteRecord(data, row.original.id))}>×</button></td>
    </tr>)}</tbody>
    {!!view.aggregations?.length && <tfoot><tr>{data.fields.map(field => {
      const aggregate = view.aggregations?.find(item => item.fieldId === field.id);
      return <td key={field.id} className="border-t bg-slate-50 p-2 text-xs font-semibold dark:bg-slate-900">
        {aggregate ? aggregate.operation + ": " + calculateCollectionAggregate(rows, aggregate) : ""}</td>;
    })}<td className="border-t text-xs">Visible totals</td></tr></tfoot>}
  </table>
    <nav aria-label="Collection Table pagination" className="flex flex-wrap items-center gap-2 text-xs">
      <span role="status" aria-live="polite" data-testid="collection-page-summary">
        {page.total ? page.start + 1 : 0}–{page.end} of {page.total} matching records
      </span>
      <label>Rows per page <select aria-label="Rows per page" className="rounded border p-1"
        value={pageSize} onChange={event => { setPageSize(Number(event.target.value) as CollectionPageSize); setRequestedPage(0); }}>
        {COLLECTION_PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <button type="button" className={btnClass} aria-label="First collection page" disabled={page.pageIndex === 0}
        onClick={() => setRequestedPage(0)}>«</button>
      <button type="button" className={btnClass} aria-label="Previous collection page" disabled={page.pageIndex === 0}
        onClick={() => setRequestedPage(page.pageIndex - 1)}>‹</button>
      <span data-testid="collection-page-number">Page {page.pageIndex + 1} of {page.pageCount}</span>
      <button type="button" className={btnClass} aria-label="Next collection page"
        disabled={page.pageIndex >= page.pageCount - 1}
        onClick={() => setRequestedPage(page.pageIndex + 1)}>›</button>
      <button type="button" className={btnClass} aria-label="Last collection page"
        disabled={page.pageIndex >= page.pageCount - 1}
        onClick={() => setRequestedPage(page.pageCount - 1)}>»</button>
    </nav>
    {openRecordId && <CollectionRecordDetails data={data} sources={sources} recordId={openRecordId}
      readOnly={readOnly} onChange={onChange} onClose={() => setOpenRecordId(null)} />}
  </div>;
}
