import type { RuntimeActionSchema } from "./actionSchema";

const id = { type: "string", minLength: 1, maxLength: 128 } as const;
const text = { type: "string", maxLength: 20_000 } as const;
const strings = { type: "array", maxItems: 100, items: text } as const;
const item = { type: "object", additionalProperties: false, properties: { value: text, number: text, label: text, text } } as const;
const seriesItem = { type: "object", additionalProperties: false, required: ["label", "value"], properties: { label: text, value: { type: "number", minimum: 0, maximum: 1_000_000_000 } } } as const;
const sceneMotion = { type: "object", additionalProperties: false, properties: { kind: { type: "string", enum: ["none","fade","rise","slide","zoom","wipe"] }, trigger: { type: "string", enum: ["with-previous","after-previous","on-click"] }, durationMs: { type: "number", minimum: 100, maximum: 5000 }, delayMs: { type: "number", minimum: 0, maximum: 10000 } } } as const;
const sceneObject = { type: "object", additionalProperties: false, required: ["id","kind","x","y","w","h","rotation"], properties: {
  id, kind: { type: "string", enum: ["text","shape","image"] }, x: { type: "number", minimum: -1280, maximum: 2560 }, y: { type: "number", minimum: -960, maximum: 1920 },
  w: { type: "number", minimum: 8, maximum: 2560 }, h: { type: "number", minimum: 8, maximum: 1920 }, rotation: { type: "number", minimum: -360, maximum: 360 },
  text, src: {type:"string",maxLength:2048}, fill: text, stroke: text, color: text, fontSize:{type:"number",minimum:8,maximum:180}, fontFamily:text,
  fontWeight:{type:"string",enum:["normal","bold"]}, align:{type:"string",enum:["left","center","right"]}, radius:{type:"number",minimum:0,maximum:200},opacity:{type:"number",minimum:0,maximum:1},locked:{type:"boolean"},motion:sceneMotion
} } as const;
const scene = { type: "object", additionalProperties: false, required: ["version","objects"], properties: { version: {type:"integer",const:2}, width:{type:"number"},height:{type:"number"}, objects:{type:"array",maxItems:120,items:sceneObject} } } as const;
const slideFields = {
  scene,
  slideId: id, id, target: id, index: { type: "integer", minimum: 1, maximum: 500 }, name: text, newName: text, afterSlideId: id, position: { type: "integer", minimum: 1, maximum: 60 }, html: text, layout: { type: "string", enum: ["title", "title-bullets", "two-column", "image-caption", "section", "blank", "agenda", "quote", "stats", "process", "comparison", "closing", "data-table", "bar-chart"] },
  heading: text, title: text, subtitle: text, bullets: strings, left: strings, right: strings, imageUrl: { type: "string", maxLength: 2000 }, caption: text,
  items: { type: "array", maxItems: 20, items: item }, steps: { ...strings, maxItems: 20 }, leftTitle: text, rightTitle: text, text, author: text,
  columns: { type: "array", minItems: 1, maxItems: 50, items: text }, rows: { type: "array", minItems: 1, maxItems: 100, items: { type: "array", maxItems: 50, items: text } }, series: { type: "array", minItems: 1, maxItems: 50, items: seriesItem },
  presenterNotes: text, notes: text, status: { type: "string", enum: ["draft", "ready", "complete"] }, backgroundColor: { type: "string", maxLength: 64 }, hidden: { type: "boolean" }, transition: { type: "string", enum: ["none", "fade", "slide", "zoom", "wipe"] }, animation: { type: "string", enum: ["none", "fade", "rise", "slide", "zoom"] },
};
const slide = { type: "object", additionalProperties: false, properties: slideFields } as const;
const singleSlideFields = Object.fromEntries(Object.entries(slideFields).filter(([key]) => key !== "newName"));
const deckId = { type: "string", minLength: 1, maxLength: 128 } as const;
const blockTarget = { blockId: deckId };
const theme = { type: "object", additionalProperties: false, properties: { preset: { type: "string", maxLength: 64 }, backgroundColor: { type: "string", maxLength: 64 }, textColor: { type: "string", maxLength: 64 }, accentColor: { type: "string", maxLength: 64 }, fontFamily: { type: "string", maxLength: 128 }, fontSize: { type: "number", minimum: 8, maximum: 96 } } } as const;

export const WORKSPACE_RUNTIME_SLIDE_ACTION_SCHEMAS: Record<string, RuntimeActionSchema> = {
  create_slide_deck: { type: "object", additionalProperties: false, required: ["type", "slides"], properties: { type: { type: "string", const: "create_slide_deck" }, slides: { type: "array", minItems: 1, maxItems: 60, items: slide }, title: text, aspectRatio: { type: "string", enum: ["16:9", "4:3"] }, theme, x: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, y: { type: "number", minimum: -1_000_000, maximum: 1_000_000 }, afterBlockId: deckId } },
  add_slide: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "add_slide" }, ...blockTarget, ...slideFields, afterSlideId: id, copy: { type: "boolean" } } },
  duplicate_slide: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "duplicate_slide" }, ...blockTarget, slideId: id, id, target: id, afterSlideId: id } },
  delete_slide: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "delete_slide" }, ...blockTarget, slideId: id, id, target: id } },
  reorder_slides: { type: "object", additionalProperties: false, required: ["type", "blockId", "slideOrder"], properties: { type: { type: "string", const: "reorder_slides" }, ...blockTarget, slideOrder: { type: "array", minItems: 1, maxItems: 60, items: id } } },
  update_slide: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "update_slide" }, ...blockTarget, ...singleSlideFields, name: { ...text, description: "The new name for the slide identified by slideId, id or target." } } },
  update_slide_deck: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "update_slide_deck" }, ...blockTarget, title: text, aspectRatio: { type: "string", enum: ["16:9", "4:3"] }, theme, showSlideNumbers: { type: "boolean" }, applyToAll: { type: "boolean" }, backgroundColor: { type: "string", maxLength: 64 } } },
  update_slides: { type: "object", additionalProperties: false, required: ["type", "blockId"], properties: { type: { type: "string", const: "update_slides" }, ...blockTarget, slides: { type: "array", maxItems: 60, items: slide }, insert: { type: "array", maxItems: 60, items: slide }, deleteSlideIds: { type: "array", maxItems: 60, items: id }, slideOrder: { type: "array", maxItems: 60, items: id } } },
};
