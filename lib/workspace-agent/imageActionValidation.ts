type Action = Record<string, unknown>;

export function validateImageAction(action: Action): string | null {
  if (action.type !== "update_image") return null;
  const hasImage = [action.image, action.url].some((value) => typeof value === "string" && value.trim())
    || Array.isArray(action.images) || Number.isInteger(action.removeImageIndex) && Number(action.removeImageIndex) >= 0;
  return hasImage ? null : "update_image requires image, url, images or removeImageIndex.";
}
