"use client";
import React, { useMemo } from "react";
import type { CollectionBlockPayload, CollectionSources } from "../collections/model";
import { diagnoseCollectionRelations, repairCollectionRelations } from "../collections/collectionDiagnostics";
import { btnClass } from "./CollectionFieldEditor";
interface Props { data: CollectionBlockPayload; sources: CollectionSources;
  readOnly: boolean; onChange: (value: CollectionBlockPayload) => void; }
export function CollectionIntegrityPanel({ data, sources, readOnly, onChange }: Props) {
  const problems = useMemo(() => diagnoseCollectionRelations(data, sources), [data, sources]);
  const missingSources = data.fields.filter(field => field.type === "relation" &&
    field.relationTargetBlockId && !sources[field.relationTargetBlockId]);
  if (!problems.length && !missingSources.length) return <p data-testid="collection-integrity">
    Data links: no dangling references detected.</p>;
  return <section data-testid="collection-integrity" className="space-y-2 rounded border p-2">
    <strong>Data integrity</strong>
    <p>{problems.length} record-field links reference missing records.
      {missingSources.length > 0 ? " Some source Collections are unavailable on this board." : ""}</p>
    {missingSources.map(field => <p key={field.id}>Missing source for {field.name}: {field.relationTargetBlockId}</p>)}
    <button type="button" className={btnClass} disabled={readOnly || !problems.length}
      onClick={() => {
        if (window.confirm("Remove missing relation IDs? Existing valid links will be kept.")) {
          onChange(repairCollectionRelations(data, sources));
        }
      }}>Repair dangling links</button>
  </section>;
}
