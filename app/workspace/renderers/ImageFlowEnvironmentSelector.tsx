"use client";

import { useMemo } from "react";
import { VisualGridSelector } from "@/components/features/chat/image-preferences/visual-grid-selector";
import type { ImageFlowChoice } from "./imageFlowOptionFields";

const ATMOSPHERE = "Atmosphere";

function readSelections(value: string, options: ImageFlowChoice[]) {
	const selected: Record<string, string> = {};
	const remaining = value.trim();
	let rest = remaining;
	const ordered = [...options].sort((a, b) => b.value.length - a.value.length);
	while (rest) {
		const option = ordered.find((item) => rest === item.value || rest.startsWith(`${item.value}, `));
		if (!option || !option.group) break;
		selected[option.group] = option.value;
		rest = rest === option.value ? "" : rest.slice(option.value.length + 2).trim();
	}
	return { selected, extra: rest };
}

export function ImageFlowEnvironmentSelector({ value, options, disabled, onChange }: {
	value: string;
	options: ImageFlowChoice[];
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	const parsed = useMemo(() => readSelections(value, options), [options, value]);
	const groups = useMemo(() => {
		const found = [...new Set(options.map((option) => option.group).filter((group): group is string => !!group))];
		const order = ["Time of day", "Sky / Weather", "Season", "Lighting", ATMOSPHERE];
		return found.sort((a, b) => order.indexOf(a) - order.indexOf(b));
	}, [options]);
	const updateGroup = (group: string, nextValue: string) => {
		const selected = { ...parsed.selected, [group]: nextValue || undefined };
		const values = groups.map((key) => selected[key]).filter((item): item is string => !!item);
		if (parsed.extra) values.push(parsed.extra);
		onChange(values.join(", "));
	};

	return <fieldset disabled={disabled} className="space-y-2 border-0 p-0">
		<VisualGridSelector value={parsed.selected[ATMOSPHERE] ?? ""} onChange={(next) => updateGroup(ATMOSPHERE, next)} options={options.filter((item) => item.group === ATMOSPHERE)} label="Environment" placeholder="None" className="[&>div:nth-child(2)]:!h-16 [&>div:nth-child(2)>div:first-child>div:first-child]:!h-12 [&>div:nth-child(2)>div:first-child>div:first-child]:!w-12" />
		<div className="grid grid-cols-2 gap-2">
			{groups.filter((group) => group !== ATMOSPHERE).map((group) => <VisualGridSelector
				key={group}
				value={parsed.selected[group] ?? ""}
				onChange={(next) => updateGroup(group, next)}
				options={options.filter((item) => item.group === group)}
				label={group}
				placeholder="None"
				className="[&>div:nth-child(2)]:!h-14 [&>div:nth-child(2)>div:first-child>div:first-child]:!h-10 [&>div:nth-child(2)>div:first-child>div:first-child]:!w-10"
			/>)}
		</div>
	</fieldset>;
}
