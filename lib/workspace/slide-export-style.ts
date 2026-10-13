import sharp from "sharp";

export function slideExportStyle() {
  const colors = new Map<string, Promise<string>>();
  const resolve = (value: string | undefined, fallback: string) => {
    if (!value) return Promise.resolve(fallback);
    if (colors.has(value)) return colors.get(value)!;
    const result = (async () => {
      try {
        const rgb = await sharp({ create: { width: 1, height: 1, channels: 3, background: value } }).raw().toBuffer();
        return rgb.subarray(0, 3).toString("hex").toUpperCase();
      } catch { throw new Error(`Unsupported slide colour: ${value.slice(0, 80)}`); }
    })();
    colors.set(value, result); return result;
  };
  return async (slide: { backgroundColor?: string }, theme: { backgroundColor?: string; textColor?: string; accentColor?: string; fontFamily?: string }) => {
    const [background, fill, accent] = await Promise.all([resolve(slide.backgroundColor || theme.backgroundColor, "FFFFFF"), resolve(theme.textColor, "111827"), resolve(theme.accentColor, "2563EB")]);
    const font = theme.fontFamily?.split(",")[0].trim().replace(/^['"]|['"]$/g, "") || "Arial";
    return { background, fill, accent, font };
  };
}
