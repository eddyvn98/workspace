"use client";
import React from "react";
import { newId, type CollectionBlockPayload, type CollectionField } from "../collections/model";
import { automationWritable } from "../collections/collectionAutomations";
import { SCHEDULE_TIMEZONES, validScheduledRule, type CollectionScheduledRule,
  type ScheduleTimeZone } from "../collections/collectionSchedules";
import { btnClass, emptyValueClass, hintClass, inputClass } from "./CollectionFieldEditor";

interface Props { data: CollectionBlockPayload; readOnly: boolean;
  onChange: (data: CollectionBlockPayload) => void; }
const initialValue = (field: CollectionField) =>
  field.type === "select" ? field.options?.[0] ?? "" : field.type === "checkbox" ? "false" : "";

export function CollectionScheduledAutomationSettings({ data, readOnly, onChange }: Props) {
  const rules = data.scheduledAutomations ?? [];
  const targets = data.fields.filter(automationWritable);
  const conditions = targets;
  const write = (updated: CollectionScheduledRule[]) =>
    onChange({ ...data, scheduledAutomations: updated });
  const edit = (id: string, patch: Partial<CollectionScheduledRule>, resetRun = true) =>
    write(rules.map(rule => rule.id === id
      ? { ...rule, ...patch, ...(resetRun ? { lastRunDay: undefined } : {}) } : rule));
  const add = () => {
    const field = targets.find(item => item.type === "select") ?? targets[0];
    if (!field || rules.length >= 20) return;
    write([...rules, { id: newId(), name: "Daily rule", enabled: false,
      hour: 9, minute: 0, timeZone: "Asia/Ho_Chi_Minh",
      targetFieldId: field.id, targetValue: initialValue(field) }]);
  };
  const valueEditor = (field: CollectionField | undefined, value: string,
    set: (value: string) => void, label: string) => {
    if (field?.type === "select" || field?.type === "checkbox") {
      const options = field.type === "select" ? field.options ?? [] : ["false", "true"];
      return <select className={inputClass + (!value ? " " + emptyValueClass : "")} aria-label={label} disabled={readOnly}
        value={value} onChange={event => set(event.target.value)}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>;
    }
    return <input aria-label={label} className={inputClass + (field?.type === "date" && !value ? " " + emptyValueClass : "")} disabled={readOnly}
      type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : "text"}
      maxLength={2000} value={value} onChange={event => set(event.target.value)} />;
  };
  return <section className="space-y-2 border-b border-slate-200 py-3 dark:border-slate-700" data-testid="collection-scheduled-automations">
    <div className="flex items-center gap-2">
      <strong>Daily scheduled rules</strong>
      <button type="button" className={btnClass} disabled={readOnly || !targets.length || rules.length >= 20}
        onClick={add}>+ Daily rule</button>
    </div>
    <p className={hintClass}>Rules run once per local day, at or after the chosen time, when the secured server
      scheduler is configured. They modify fields only; they never send messages or webhooks.</p>
    {rules.map(rule => {
      const target = targets.find(field => field.id === rule.targetFieldId);
      const match = conditions.find(field => field.id === rule.matchFieldId);
      return <div key={rule.id} className="space-y-2 border-l-2 border-slate-200 py-2 pl-3 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1"><input type="checkbox"
            aria-label={"Enable daily rule " + rule.name} checked={rule.enabled}
            disabled={readOnly || !validScheduledRule(data, rule)}
            onChange={event => edit(rule.id, { enabled: event.target.checked }, false)} />Enabled</label>
          <input aria-label="Daily rule name" className={inputClass} value={rule.name}
            maxLength={80} disabled={readOnly}
            onChange={event => edit(rule.id, { name: event.target.value }, false)} />
          <label>Time <input className={inputClass + " w-14"} aria-label="Scheduled hour"
            type="number" min={0} max={23} disabled={readOnly} value={rule.hour}
            onChange={event => edit(rule.id, { hour: Math.min(23, Math.max(0, Number(event.target.value))) })} />
          :<input className={inputClass + " w-14"} aria-label="Scheduled minute"
            type="number" min={0} max={59} disabled={readOnly} value={rule.minute}
            onChange={event => edit(rule.id, { minute: Math.min(59, Math.max(0, Number(event.target.value))) })} /></label>
          <select aria-label="Scheduled timezone" className={inputClass} disabled={readOnly}
            value={rule.timeZone}
            onChange={event => edit(rule.id, { timeZone: event.target.value as ScheduleTimeZone })}>
            {SCHEDULE_TIMEZONES.map(zone => <option key={zone}>{zone}</option>)}
          </select>
          <button type="button" className={btnClass} disabled={readOnly}
            onClick={() => write(rules.filter(item => item.id !== rule.id))}>Delete rule</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label>When record field
            <select aria-label="Scheduled matching field" disabled={readOnly} className={inputClass}
              value={rule.matchFieldId ?? ""}
              onChange={event => edit(rule.id, { matchFieldId: event.target.value || undefined,
                matchEquals: "" })}>
              <option value="">All records</option>
              {conditions.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>
          {!!match && valueEditor(match, rule.matchEquals ?? "",
            value => edit(rule.id, { matchEquals: value }), "Scheduled match value")}
          <label>Set
            <select aria-label="Scheduled target field" disabled={readOnly} className={inputClass}
              value={rule.targetFieldId}
              onChange={event => {
                const field = targets.find(item => item.id === event.target.value);
                if (field) edit(rule.id, { targetFieldId: field.id, targetValue: initialValue(field) });
              }}>
              {targets.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>
          {valueEditor(target, rule.targetValue, value => edit(rule.id, { targetValue: value }),
            "Scheduled target value")}
        </div>
        <p className={hintClass}>
          Last committed run: {rule.lastRunDay ?? "Never"}.
          {!validScheduledRule(data, rule) ? " Configuration is invalid; execution disabled." : ""}
        </p>
      </div>;
    })}
  </section>;
}
