import { describe, expect, it } from "vitest";
import { addField, createCollection, removeField, updateView, visibleRecords } from "@/app/workspace/collections/model";
import { formFields, submitCollectionForm } from "@/app/workspace/collections/collectionForm";
import { validateCollectionAction, validateCollectionTarget } from "@/lib/workspace-agent/collectionActionValidation";

describe("Collection Form and configurable Gallery", () => {
  const setup = () => {
    let data = createCollection();
    data = addField(data, "Cost", "number");
    const form = data.views.find(view => view.kind === "form")!;
    const gallery = data.views.find(view => view.kind === "gallery")!;
    const cost = data.fields.find(field => field.name === "Cost")!;
    return { data, form, gallery, cost };
  };
  it("accepts a valid submission into canonical records visible in every view", () => {
    const { data, form, cost } = setup();
    const titleId = data.fields[0].id;
    const submitted = submitCollectionForm(data, form, { [titleId]: "Plan", [cost.id]: "123" });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(data.records).toHaveLength(0);
    expect(submitted.data.records).toHaveLength(1);
    const savedId = submitted.data.records[0].id;
    expect(visibleRecords(submitted.data, submitted.data.views[0])[0].id).toBe(savedId);
    expect(visibleRecords(submitted.data, form)[0].values[cost.id]).toBe("123");
  });
  it("rejects required, invalid select, relation and number values without mutation", () => {
    const { data, form, cost } = setup();
    const titleId = data.fields[0].id, statusId = data.fields[1].id;
    expect(submitCollectionForm(data, form, {}) .ok).toBe(false);
    expect(submitCollectionForm(data, form, { [titleId]: "X", [cost.id]: "Infinity" }).ok).toBe(false);
    expect(submitCollectionForm(data, form, { [titleId]: "X", [statusId]: "Invented" }).ok).toBe(false);
    const withRelation = addField(data, "Related", "relation");
    const related = withRelation.fields.find(field => field.name === "Related")!;
    expect(submitCollectionForm(withRelation, form, { [titleId]: "X", [related.id]: "not-a-record" }).ok).toBe(false);
    expect(data.records).toHaveLength(0);
  });
  it("ignores hidden values and removes deleted fields from both view configs", () => {
    const { data, form, gallery, cost } = setup();
    const title = data.fields[0].id;
    let next = updateView(data, form.id, { formFieldIds: [title], formRequiredFieldIds: [title] });
    next = updateView(next, gallery.id, { galleryFieldIds: [cost.id] });
    expect(formFields(next, next.views.find(v => v.id === form.id)!)).toHaveLength(1);
    const result = submitCollectionForm(next, next.views.find(v => v.id === form.id)!,
      { [title]: "Visible", [cost.id]: "999" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.records[0].values[cost.id]).toBeUndefined();
    const removed = removeField(result.data, cost.id);
    expect(removed.views.find(v => v.id === gallery.id)?.galleryFieldIds).toEqual([]);
  });
  it("validates AI configuration and accepts form as a view kind", () => {
    const { data, form, cost } = setup();
    expect(validateCollectionAction({ type: "add_collection_view", blockId: "c", viewId: "new",
      name: "Intake", kind: "form" })).toBeNull();
    const board = { blocks: { c: { type: "collection", data } } };
    expect(validateCollectionTarget({ type: "configure_collection_view", blockId: "c",
      viewId: form.id, formFieldIds: [data.fields[0].id], formRequiredFieldIds: [data.fields[0].id] },
      board as never)).toBeNull();
    expect(validateCollectionTarget({ type: "configure_collection_view", blockId: "c",
      viewId: form.id, formFieldIds: [data.fields[0].id], formRequiredFieldIds: [cost.id] },
      board as never)).toMatch(/visible/i);
    expect(validateCollectionTarget({ type: "configure_collection_view", blockId: "c",
      viewId: form.id, formFieldIds: [data.fields[0].id, data.fields[0].id] },
      board as never)).toMatch(/duplicate/i);
  });
});
