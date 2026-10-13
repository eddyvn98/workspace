"use client";
import React from "react";
import { viewFilters, viewSorts, type CollectionField, type CollectionView } from "../collections/model";
import { btnClass, inputClass } from "./CollectionFieldEditor";

interface Props {
  view: CollectionView;
  fields: CollectionField[];
  readOnly: boolean;
  onChange: (patch: Partial<CollectionView>) => void;
}
export function CollectionViewConditions({ view, fields, readOnly, onChange }: Props) {
  const filters = viewFilters(view);
  const sorts = viewSorts(view);
  const setFilters = (next: typeof filters) => onChange({ filters: next, filter: undefined });
  const setSorts = (next: typeof sorts) => onChange({ sorts: next, sort: undefined });
  const availableFilter = fields.find(field => !filters.some(item => item.fieldId === field.id));
  const availableSort = fields.find(field => !sorts.some(item => item.fieldId === field.id));
  return <div className="space-y-2" data-testid="collection-view-conditions">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <strong>Filters (match all)</strong>
        <button className={btnClass} disabled={readOnly || !availableFilter || filters.length >= 20}
          onClick={() => availableFilter && setFilters([...filters, { fieldId: availableFilter.id, value: "" }])}>+ Filter</button>
      </div>
      {filters.map((entry, index) => <div className="flex flex-wrap items-center gap-1" key={index}>
        <select aria-label={"Filter field " + (index + 1)} className={inputClass} value={entry.fieldId}
          disabled={readOnly} onChange={e => {
            const next = filters.map((item, i) => i === index ? { fieldId: e.target.value, value: "" } : item);
            if (new Set(next.map(item => item.fieldId)).size === next.length) setFilters(next);
          }}>
          {fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select>
        <input aria-label={"Filter value " + (index + 1)} className={inputClass} placeholder="Enter value to apply filter"
          disabled={readOnly} value={entry.value} onChange={e => setFilters(filters.map((item, i) =>
            i === index ? { ...item, value: e.target.value } : item))} />
        {!entry.value.trim() && <span className="text-slate-500" role="status">Inactive until value is entered</span>}
        <button aria-label={"Remove filter " + (index + 1)} className={btnClass} disabled={readOnly}
          onClick={() => setFilters(filters.filter((_, i) => i !== index))}>×</button>
      </div>)}
    </div>
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <strong>Sorts (ordered priority)</strong>
        <button className={btnClass} disabled={readOnly || !availableSort || sorts.length >= 20}
          onClick={() => availableSort && setSorts([...sorts, { fieldId: availableSort.id, direction: "asc" }])}>+ Sort</button>
      </div>
      {sorts.map((entry, index) => <div className="flex flex-wrap items-center gap-1" key={index}>
        <span>{index + 1}.</span>
        <select aria-label={"Sort field " + (index + 1)} className={inputClass} value={entry.fieldId}
          disabled={readOnly} onChange={e => {
            const next = sorts.map((item, i) => i === index ? { ...item, fieldId: e.target.value } : item);
            if (new Set(next.map(item => item.fieldId)).size === next.length) setSorts(next);
          }}>
          {fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select>
        <select aria-label={"Sort direction " + (index + 1)} className={inputClass} value={entry.direction}
          disabled={readOnly} onChange={e => setSorts(sorts.map((item, i) => i === index ?
            { ...item, direction: e.target.value as "asc" | "desc" } : item))}>
          <option value="asc">Ascending</option><option value="desc">Descending</option>
        </select>
        <button aria-label={"Move sort up " + (index + 1)} className={btnClass}
          disabled={readOnly || index === 0} onClick={() => {
            const next = [...sorts]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setSorts(next);
          }}>↑</button>
        <button aria-label={"Remove sort " + (index + 1)} className={btnClass} disabled={readOnly}
          onClick={() => setSorts(sorts.filter((_, i) => i !== index))}>×</button>
      </div>)}
    </div>
  </div>;
}
