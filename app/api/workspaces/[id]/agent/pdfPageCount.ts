/**
 * Server-safe PDF page counting for the agent file commands. Never throws:
 * a corrupt or unreadable buffer yields null so callers can degrade.
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number | null> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const info = await parser.getInfo();
      return Number.isInteger(info.total) && info.total > 0 ? info.total : null;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  } catch {
    return null;
  }
}

/** Runs async work over items with at most `limit` in flight, keeping result order. */
export async function mapWithLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}
