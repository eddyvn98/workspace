/** Refuse layout CSS that the slide editor/renderers cannot preserve. */
export function slideHtmlLayoutProblem(html: string): string | undefined {
  for (const attribute of html.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const style = attribute[1] ?? attribute[2];
    if (/(?:^|;)\s*(?:display\s*:\s*(?:inline-)?(?:flex|grid)|position\s*:|float\s*:)/i.test(style)) {
      return "Slide HTML uses unsupported layout CSS. Use layout bar-chart with series [{label,value}], data-table with columns/rows, image-caption with imageUrl, or table-based HTML. Omit html when using a structured layout; flex/grid/position/float cannot survive slide editing and presentation.";
    }
  }
}
