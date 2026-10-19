import { importXlsx, exportXlsx } from "./xlsx";
import { readCsv } from "./csv";
import type { WorkbookTask, WorkbookResult } from "./workerTypes";
const worker = self as unknown as { onmessage: ((event: MessageEvent<WorkbookTask>) => void) | null; postMessage(value: unknown): void };
worker.onmessage = async ({ data }) => {
  try {
    let result: WorkbookResult;
    if (data.type === "export") result = { type: "export", ...await exportXlsx(data.sheets, data.activeSheetId) };
    else if (data.format === "xlsx") result = { type: "import", value: await importXlsx(data.bytes) };
    else {
      const sheet = { id: "csv-sheet", name: "Sheet1", data: readCsv(new TextDecoder("utf-8", { fatal: true }).decode(data.bytes), data.format === "tsv" ? "\t" : ",") };
      result = { type: "import", value: { sheets: [sheet], activeSheetId: sheet.id, warnings: ["CSV/TSV imports values as text. Formulas and formatting are not included."] } };
    }
    worker.postMessage({ ok: true, result });
  } catch (error) { worker.postMessage({ ok: false, error: error instanceof Error ? error.message : "Workbook processing failed." }); }
};
