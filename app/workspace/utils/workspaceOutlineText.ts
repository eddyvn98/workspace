const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i;

/** Convert rich-text markup to the single-line label shown in Outline. */
export function formatOutlineText(value: string): string {
  const withoutTags = HTML_TAG_PATTERN.test(value)
    ? value.replace(/<\/?[a-z][^>]*>/gi, " ")
    : value;

  return withoutTags.replace(/\s+/g, " ").trim();
}
