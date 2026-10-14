"use client";
import React, { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { dropCollectionCard } from "./collectionKanbanDrop";
import { addRecord, recordTitle,
  type CollectionBlockPayload, type CollectionField, type CollectionRecord } from "../collections/model";
import { btnClass, inputClass, FieldEditor } from "./CollectionFieldEditor";
import { CollectionRecordDetails } from "./CollectionRecordDetails";

interface Props { data: CollectionBlockPayload; rows: CollectionRecord[]; group?: CollectionField;
  titleField?: CollectionField; groupOptions: string[]; readOnly: boolean;
  onChange: (next: CollectionBlockPayload) => void;
  patch: (record: CollectionRecord, field: CollectionField, value: string) => void; }
const columnId = (status: string) => "collection-column:" + status;

function Card({ data, record, titleField, group, groupOptions, readOnly, patch, onOpen }: {
  data: CollectionBlockPayload; record: CollectionRecord; titleField?: CollectionField;
  group?: CollectionField; groupOptions: string[]; readOnly: boolean;
  patch: Props["patch"]; onOpen: (id: string) => void;
}) {
  const drag = useDraggable({ id: record.id, disabled: readOnly || !group });
  return <div ref={drag.setNodeRef} className="mb-2 rounded border bg-white p-2 text-xs shadow-sm dark:bg-slate-800"
    data-testid="collection-kanban-card" data-record-id={record.id}
    style={{ transform: CSS.Translate.toString(drag.transform), opacity: drag.isDragging ? 0.55 : 1 }}>
    <div className="mb-2 flex items-center gap-1">
      <button type="button" aria-label={"Drag " + recordTitle(data, record)} className={btnClass}
        disabled={readOnly || !group} {...drag.attributes} {...drag.listeners}>⠿</button>
      <strong>{recordTitle(data, record)}</strong>
      <button type="button" className={btnClass} aria-label={"Open " + recordTitle(data, record)}
        onClick={() => onOpen(record.id)}>Open</button>
    </div>
    {titleField && <FieldEditor field={titleField} value={record.values[titleField.id] ?? ""}
      readOnly={readOnly} onSet={value => patch(record, titleField, value)} />}
    {group && <select className={inputClass + " mt-1 w-full"} disabled={readOnly}
      aria-label={"Status for " + recordTitle(data, record)} value={record.values[group.id] ?? ""}
      onChange={e => patch(record, group, e.target.value)}>
      <option value="">Unassigned</option>{groupOptions.map(option => <option key={option} value={option}>{option}</option>)}
    </select>}
  </div>;
}

function Column({ status, rows, data, group, titleField, groupOptions, readOnly, onChange, patch, onOpen }:
  Props & { status: string; onOpen: (id: string) => void }) {
  const drop = useDroppable({ id: columnId(status), disabled: readOnly || !group });
  const cards = rows.filter(record => (record.values[group?.id ?? ""] ?? "") === status);
  return <div ref={drop.setNodeRef} data-testid="collection-kanban-column" data-status={status}
    className={"w-52 shrink-0 rounded-lg bg-slate-100 p-2 dark:bg-slate-900 " +
      (drop.isOver ? "ring-2 ring-blue-500" : "")}>
    <div className="mb-2 text-xs font-semibold">{status || "Unassigned"} · {cards.length}</div>
    {cards.map(record => <Card key={record.id} data={data} record={record}
      titleField={titleField} group={group} groupOptions={groupOptions}
      readOnly={readOnly} patch={patch} onOpen={onOpen} />)}
    <button className={btnClass} disabled={readOnly}
      onClick={() => onChange(addRecord(data, group ? { [group.id]: status } : {}))}>+ Card</button>
  </div>;
}

export function CollectionKanbanView(props: Props) {
  const { data, rows, group, groupOptions, readOnly, onChange } = props;
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (readOnly || !group || !over) return;
    const target = groupOptions.concat("").find(status => columnId(status) === over.id);
    const record = data.records.find(item => item.id === active.id);
    if (target === undefined || !record) return;
    const next = dropCollectionCard(data, record.id, group.id, target, readOnly);
    if (next !== data) onChange(next);
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
    <div className="flex h-full min-w-max gap-3" data-testid="collection-kanban">
      {["", ...groupOptions].map(status => <Column key={status} {...props} status={status}
        onOpen={setOpenRecordId} />)}
      {openRecordId && <CollectionRecordDetails data={data} recordId={openRecordId}
        readOnly={readOnly} onChange={onChange} onClose={() => setOpenRecordId(null)} />}
    </div>
  </DndContext>;
}
