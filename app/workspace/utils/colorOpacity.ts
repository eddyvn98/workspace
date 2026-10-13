/**
 * Applies an opacity value to a hex background color — the CSS equivalent
 * of the old app's SVG `fillOpacity` (see svgNodeHelpers.tsx's bgOpacity
 * usage). The new engine renders blocks as HTML/CSS, not SVG, so there's no
 * direct fill-opacity property; converting to rgba() achieves the same
 * "faded background, unaffected text/border" look.
 */
export function applyBackgroundOpacity(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}
