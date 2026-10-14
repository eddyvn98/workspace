"use client";
import React from "react";
import { newId, type CollectionBlockPayload } from "../collections/model";
import { automationWritable, type CollectionAutomation } from "../collections/collectionAutomations";
import { btnClass, inputClass } from "./CollectionFieldEditor";
interface Props { data: CollectionBlockPayload; readOnly: boolean;
  onChange: (data: CollectionBlockPayload) => void; }
export function CollectionAutomationSettings({ data, readOnly, onChange }: Props) {
  const rules = data.automations ?? [], fields = data.fields.filter(automationWritable);
  const update = (items: CollectionAutomation[]) => onChange({ ...data, automations: items });
  const edit = (id: string, patch: Partial<CollectionAutomation>) =>
    update(rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule));
  const add = () => {
    const trigger = fields.find(f => f.type === "select") ?? fields[0];
    const target = fields.find(f => f.id !== trigger?.id);
    if (!trigger || !target) return;
    update([...rules, { id: newId(), name: "New rule", enabled: false,
      whenFieldId: trigger.id, whenEquals: trigger.type === "select" ? trigger.options?.[0] ?? "" : "",
      thenFieldId: target.id, thenValue: "" }]);
  };
  const valueEditor = (id: string, value: string, onSet: (v: string) => void) => {
    const field = fields.find(f => f.id === id);
    const choices = field?.type === "select" ? (field.options ?? [])
      : field?.type === "checkbox" ? ["true", "false"] : [];
    return choices.length ? <select className={inputClass} disabled={readOnly} value={value}
      onChange={e => onSet(e.target.value)}>
      <option value="">Empty</option>{choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}
    </select> : <input className={inputClass} disabled={readOnly}
      value={value} maxLength={2000} onChange={e => onSet(e.target.value)} />;
  };
  return <section className="space-y-2 rounded border p-2" data-testid="collection-automations">
    <div className="flex items-center gap-2">
      <strong>Record automations</strong>
      <button className={btnClass} type="button" disabled={readOnly || fields.length < 2 || rules.length >= 20}
        onClick={add}>+ Rule</button>
    </div>
    <p>When a value changes to the trigger, update another field in the same record. Runs for manual and AI edits.</p>
    {rules.map(rule => <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded border p-2">
      <input type="checkbox" aria-label={"Enable rule " + rule.name} disabled={readOnly}
        checked={rule.enabled} onChange={e => edit(rule.id, { enabled: e.target.checked })} />
      <input className={inputClass} aria-label="Rule name" value={rule.name} disabled={readOnly} maxLength={80}
        onChange={e => edit(rule.id, { name: e.target.value })} />
      <span>When</span>
      <select className={inputClass} aria-label="Trigger field" value={rule.whenFieldId} disabled={readOnly}
        onChange={e => edit(rule.id, { whenFieldId: e.target.value, whenEquals: "" })}>
        {fields.filter(field => field.id !== rule.thenFieldId).map(field =>
          <option key={field.id} value={field.id}>{field.name}</option>)}
      </select>
      {valueEditor(rule.whenFieldId, rule.whenEquals, value => edit(rule.id, { whenEquals: value }))}
      <span>set</span>
      <select className={inputClass} aria-label="Target field" value={rule.thenFieldId} disabled={readOnly}
        onChange={e => edit(rule.id, { thenFieldId: e.target.value, thenValue: "" })}>
        {fields.filter(field => field.id !== rule.whenFieldId).map(field =>
          <option key={field.id} value={field.id}>{field.name}</option>)}
      </select>
      {valueEditor(rule.thenFieldId, rule.thenValue, value => edit(rule.id, { thenValue: value }))}
      <button className={btnClass} type="button" aria-label={"Delete rule " + rule.name} disabled={readOnly}
        onClick={() => update(rules.filter(item => item.id !== rule.id))}>Remove</button>
    </div>)}
  </section>;
}
