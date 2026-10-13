const selectorKeys = ["slideId", "id", "target"] as const;
const updateKeys = ["name", "newName", "html", "layout", "heading", "title", "subtitle", "bullets", "left", "right", "imageUrl", "caption", "items", "steps", "leftTitle", "rightTitle", "text", "author", "columns", "rows", "series", "presenterNotes", "notes", "status", "backgroundColor", "hidden", "transition", "animation"] as const;

function hasSelector(action: Record<string, unknown>): boolean {
  return selectorKeys.some((key) => typeof action[key] === "string" && (action[key] as string).trim());
}

export function validateSlideAction(action: Record<string, unknown>): string | null {
  const type = action.type;
  if (type === "create_slide_deck" && Array.isArray(action.slides) && action.slides.some((slide) => !slide || typeof slide !== "object" || Array.isArray(slide) || !Object.keys(slide).length)) return "create_slide_deck slides must contain non-empty slide objects.";
  if (type === "update_slides" && Array.isArray(action.insert) && action.insert.some((slide) => !slide || typeof slide !== "object" || Array.isArray(slide) || !Object.keys(slide).length)) return "update_slides insert must contain non-empty slide objects.";
  if (type === "add_slide" && (action.copy === true || action.copy === "true") && !hasSelector(action)) return "add_slide copy requires a source slideId, id or target.";
  if ((type === "delete_slide" || type === "duplicate_slide" || type === "update_slide") && !hasSelector(action)) return `${String(type)} requires a slideId, id or target.`;
  if (type === "update_slide" && !updateKeys.some((key) => key in action)) return "update_slide requires at least one slide field to update.";
  if (type === "update_slide" && action.newName !== undefined && action.name === undefined) return "update_slide renames a slide with name; newName is only supported inside update_slides[].";
  if (type === "update_slide_deck" && !["title", "aspectRatio", "theme", "showSlideNumbers"].some((key) => key in action) && !(action.applyToAll === true && action.backgroundColor !== undefined)) return "update_slide_deck requires at least one deck field to update.";
  if (type === "update_slides" && !["slides", "insert", "deleteSlideIds", "slideOrder"].some((key) => key in action)) return "update_slides requires an update, insert, delete or order list.";
  if ((type === "reorder_slides" || type === "update_slides") && Array.isArray(action.slideOrder) && new Set(action.slideOrder).size !== action.slideOrder.length) return `${String(type)}.slideOrder must contain unique slide identifiers.`;
  return null;
}
