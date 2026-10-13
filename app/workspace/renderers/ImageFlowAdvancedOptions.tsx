import { SUB_MODES, type MainMode } from "@/stores/useImageSettingsStore";
import type { ImagePayloadInputs } from "@/types/image-generation.types";
import { VisualGridSelector } from "@/components/features/chat/image-preferences/visual-grid-selector";
import { ImageFlowEnvironmentSelector } from "./ImageFlowEnvironmentSelector";
import type { ImageFlowAdvancedLevel, ImageFlowOptionGroup } from "../types/imageFlow";
import { getImageFlowModeLimitation, getModeOptionFields, type ImageFlowField } from "./imageFlowOptionFields";

export function getAvailableOptionGroups(mainMode?: string, subMode?: string): ImageFlowOptionGroup[] {
	return getModeOptionFields(mainMode, subMode).map((field) => field.key);
}

export function getOptionGroupLabel(optionGroup: string | undefined, mainMode?: string, subMode?: string): string {
	if (optionGroup === "custom_text") return "Custom prompt";
	return getModeOptionFields(mainMode, subMode).find((field) => field.key === optionGroup)?.label ?? "Advanced option";
}

function SettingsField({ field, settings, disabled, onChange }: { field?: ImageFlowField; settings: Partial<ImagePayloadInputs>; disabled: boolean; onChange: (patch: Partial<ImagePayloadInputs>) => void }) {
	if (!field) return null;
	const className = "w-full rounded border border-slate-200 bg-white p-1.5 text-[11px] dark:border-slate-700 dark:bg-slate-900";
	const raw = settings[field.key];
	const value = Array.isArray(raw) ? raw.join(", ") : raw == null ? "" : String(raw);
	const options = field.choices ?? [];
	if (field.key === "lighting" && field.label === "Environment") return <fieldset disabled={disabled} className="min-w-0 border-0 p-0"><ImageFlowEnvironmentSelector value={value} options={options} disabled={disabled} onChange={(lighting) => onChange({ lighting })} /></fieldset>;
	const update = (input: string) => {
		const selected = options.find((option) => option.value === input);
		const category = selected?.group;
		let nextValue = input;
		if (field.key === "lighting" && field.multiple) {
			const previous = value.split(",").map((item) => item.trim()).filter(Boolean);
			const next = input.split(",").map((item) => item.trim()).filter(Boolean);
			const additions = next.filter((item) => !previous.includes(item));
			const added = additions[additions.length - 1];
			const addedGroup = options.find((option) => option.value === added)?.group;
			if (added && addedGroup) nextValue = [...next.filter((item) => options.find((option) => option.value === item)?.group !== addedGroup), added].join(", ");
		}
		onChange({ [field.key]: field.key === "custom_seed" ? Number(input) || 0 : nextValue, ...(field.categoryKey && category ? { [field.categoryKey]: category } : {}) });
	};
	if (field.choices) return <fieldset disabled={disabled} className="min-w-0 border-0 p-0">
		<VisualGridSelector value={value} onChange={update} options={options} placeholder={`Choose ${field.label.toLowerCase()}…`} label={field.label} editable={field.editable} multiple={field.multiple} layout={field.layout} className={options.some((option) => option.thumbnail) ? field.multiple ? "[&>div:nth-child(2)]:!h-16 [&>div:nth-child(2)>div:first-child>div:first-child>div:first-child>div:first-child]:!h-12 [&>div:nth-child(2)>div:first-child>div:first-child>div:first-child>div:first-child]:!w-12" : "[&>div:nth-child(2)]:!h-16 [&>div:nth-child(2)>div:first-child>div:first-child]:!h-12 [&>div:nth-child(2)>div:first-child>div:first-child]:!w-12" : undefined} />
	</fieldset>;
	return <fieldset disabled={disabled} className={`min-w-0 border-0 p-0 ${field.multiline ? "col-span-2" : ""}`}><label className="flex flex-col gap-1 text-[11px]">
		{field.label}
		{field.choice ? <select className={className} value={value} onChange={(event) => update(event.target.value)}><option value="">Choose…</option>{field.choice.map((choice) => <option key={choice}>{choice}</option>)}</select> : field.multiline ? <textarea className={className} rows={2} value={value} onChange={(event) => update(event.target.value)} /> : <input className={className} value={value} onChange={(event) => update(event.target.value)} />}
	</label></fieldset>;
}

export function ImageFlowAdvancedOptions({ level, settings, parentSettings, disabled, optionGroup, skipped, manualText, onManualTextChange, onChange }: {
	level: ImageFlowAdvancedLevel;
	settings: Partial<ImagePayloadInputs>;
	parentSettings?: Partial<ImagePayloadInputs>;
	disabled: boolean;
	optionGroup?: ImageFlowOptionGroup;
	skipped?: boolean;
	manualText?: string;
	onManualTextChange?: (value: string) => void;
	onChange: (patch: Partial<ImagePayloadInputs>) => void;
}) {
	const className = "w-full rounded border border-slate-200 bg-white p-1.5 text-xs dark:border-slate-700 dark:bg-slate-900";
	if (level === "mode") return <label className="flex flex-col gap-1 text-xs">Mode
		<select className={className} value={settings.main_mode ?? ""} disabled={disabled} onChange={(event) => onChange({ main_mode: event.target.value as MainMode })}>
			<option value="">Choose a mode…</option>{Object.keys(SUB_MODES).map((mode) => <option key={mode}>{mode}</option>)}
		</select>
	</label>;
	if (level === "submode") {
		const mainMode = parentSettings?.main_mode as MainMode | undefined;
		const subModes = mainMode ? SUB_MODES[mainMode] : [];
		const limitation = getImageFlowModeLimitation(mainMode, settings.sub_mode);
		return <label className="flex flex-col gap-1 text-xs">Submode
			<select className={className} value={settings.sub_mode ?? ""} disabled={disabled || !subModes.length} onChange={(event) => onChange({ sub_mode: event.target.value })}>
				<option value="">Choose a submode…</option>{subModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
			</select>
			{limitation && <span role="status" className="text-[11px] text-amber-700 dark:text-amber-300">{limitation}</span>}
		</label>;
	}
	const selectedField = getModeOptionFields(parentSettings?.main_mode, parentSettings?.sub_mode).find((field) => field.key === optionGroup);
	if (optionGroup === "custom_text") return <label className="flex flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-300">Custom prompt
		<textarea className={className} rows={4} value={manualText ?? ""} disabled={disabled} onChange={(event) => onManualTextChange?.(event.target.value)} placeholder="Write prompt details for this flow…" />
	</label>;
	return <div className="space-y-2">
		<label className="flex flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-300">
			{skipped ? "Add details for this step" : "Add manual details"}
			<textarea className={className} rows={2} value={manualText ?? ""} disabled={disabled} onChange={(event) => onManualTextChange?.(event.target.value)} placeholder="Enter additional instructions…" />
		</label>
		<SettingsField field={selectedField} settings={settings} disabled={disabled || !!skipped} onChange={onChange} />
		{skipped && <p className="text-[10px] text-slate-500">The selected option is skipped; these details will still be used.</p>}
	</div>;
}
