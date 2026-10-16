"use client";
import React from "react";
import { AGGREGATE_OPERATIONS } from "../collections/collectionFormula";
import { FILTER_OPERATORS, isUnaryFilter, type FilterOperator } from "../collections/collectionFilters";
import { viewFilters, viewSorts, type CollectionField, type CollectionView } from "../collections/model";
import { btnClass, hintClass, inputClass } from "./CollectionFieldEditor";

interface Props { view: CollectionView; fields: CollectionField[]; readOnly: boolean;
  onChange: (patch: Partial<CollectionView>) => void; }
const operatorLabel: Record<FilterOperator, string> = {
  eq: "Equals", neq: "Not equal", contains: "Contains", not_contains: "Does not contain",
  gt: "Greater than", gte: "Greater or equal", lt: "Less than", lte: "Less or equal",
  empty: "Is empty", not_empty: "Is not empty",
};
export function CollectionViewConditions({ view, fields, readOnly, onChange }: Props) {
  const filters = viewFilters(view);
  const sorts = viewSorts(view);
  const setFilters = (next: typeof filters) => onChange({ filters: next, filter: undefined });
  const setSorts = (next: typeof sorts) => onChange({ sorts: next, sort: undefined });
  const availableSort = fields.find(field => !sorts.some(item => item.fieldId === field.id));
  const aggregates = view.aggregations ?? [];
  const availableAggregate = fields.find(field => !aggregates.some(item => item.fieldId === field.id)
    && (field.type === "number" || field.type === "formula"));
  return <div className="space-y-2" data-testid="collection-view-conditions">
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <strong>Filters</strong>
        <select aria-label="Filter logic" className={inputClass} disabled={readOnly}
          value={view.filterLogic ?? "and"}
          onChange={event => onChange({ filterLogic: event.target.value as "and" | "or" })}>
          <option value="and">Match all (AND)</option><option value="or">Match any (OR)</option>
        </select>
        <button className={btnClass} disabled={readOnly || !fields.length || filters.length >= 20}
          onClick={() => fields.length && setFilters([...filters, { fieldId: fields[0].id, value: "", operator: "eq" }])}>+ Filter</button>
      </div>
      {filters.map((entry, index) => {
        const operator = entry.operator ?? "eq";
        const field = fields.find(item => item.id === entry.fieldId);
        const allowed = FILTER_OPERATORS.filter(op => !field || ["eq", "neq", "empty", "not_empty"].includes(op)
          || (["gt", "gte", "lt", "lte"].includes(op) ? ["number", "date"].includes(field.type)
            : ["text", "select", "url", "image"].includes(field.type)));
        return <div key={index} className="flex flex-wrap items-center gap-1">
          <select aria-label={"Filter field " + (index + 1)} className={inputClass}
            value={entry.fieldId} disabled={readOnly} onChange={event => setFilters(filters.map((item, i) =>
              i === index ? { fieldId: event.target.value, value: "", operator: "eq" } : item))}>
            {fields.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label={"Filter operator " + (index + 1)} className={inputClass}
            disabled={readOnly} value={operator} onChange={event => setFilters(filters.map((item, i) =>
              i === index ? { ...item, operator: event.target.value as FilterOperator } : item))}>
            {allowed.map(op => <option key={op} value={op}>{operatorLabel[op]}</option>)}
          </select>
          <input aria-label={"Filter value " + (index + 1)} className={inputClass}
            placeholder="Enter value to apply filter" disabled={readOnly || isUnaryFilter(operator)}
            value={entry.value} onChange={event => setFilters(filters.map((item, i) =>
              i === index ? { ...item, value: event.target.value } : item))} />
          {!isUnaryFilter(operator) && !entry.value.trim() &&
            <span className={hintClass} role="status">Inactive until value is entered</span>}
          <button className={btnClass} aria-label={"Remove filter " + (index + 1)} disabled={readOnly}
            onClick={() => setFilters(filters.filter((_, i) => i !== index))}>×</button>
        </div>;
      })}
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
          disabled={readOnly} onChange={event => {
            const next = sorts.map((item, i) => i === index ? { ...item, fieldId: event.target.value } : item);
            if (new Set(next.map(item => item.fieldId)).size === next.length) setSorts(next);
          }}>
          {fields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select>
        <select aria-label={"Sort direction " + (index + 1)} className={inputClass}
          disabled={readOnly} value={entry.direction} onChange={event => setSorts(sorts.map((item, i) =>
            i === index ? { ...item, direction: event.target.value as "asc" | "desc" } : item))}>
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
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <strong>Visible-row totals</strong>
        <button className={btnClass} disabled={readOnly || !availableAggregate || aggregates.length >= 20}
          onClick={() => availableAggregate && onChange({
            aggregations: [...aggregates, { fieldId: availableAggregate.id, operation: "sum" }],
          })}>+ Aggregate</button>
      </div>
      {aggregates.map((item, index) => <div key={item.fieldId} className="flex items-center gap-1">
        <select aria-label={"Aggregate field " + (index + 1)} className={inputClass}
          value={item.fieldId} disabled={readOnly}
          onChange={event => {
            if (aggregates.some(other => other.fieldId === event.target.value)) return;
            onChange({ aggregations: aggregates.map((row, i) => i === index
              ? { ...row, fieldId: event.target.value } : row) });
          }}>
          {fields.filter(field => field.type === "number" || field.type === "formula")
            .map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
        </select>
        <select aria-label={"Aggregate operation " + (index + 1)} className={inputClass}
          value={item.operation} disabled={readOnly}
          onChange={event => onChange({ aggregations: aggregates.map((row, i) => i === index
            ? { ...row, operation: event.target.value as typeof row.operation } : row) })}>
          {AGGREGATE_OPERATIONS.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
        <button className={btnClass} aria-label={"Remove aggregate " + (index + 1)}
          disabled={readOnly} onClick={() => onChange({ aggregations: aggregates.filter((_, i) => i !== index) })}>×</button>
      </div>)}
    </div>
  </div>;
}
