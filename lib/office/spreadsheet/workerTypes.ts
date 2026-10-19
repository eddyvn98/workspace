import type { TableWorkbookSheet } from "@/app/workspace/types/table";
import type { WorkbookImport } from "./xlsx";
export type WorkbookTask =
  | { type: "import"; bytes: Uint8Array; format: "xlsx" | "csv" | "tsv" | "native" }
  | { type: "export"; sheets: TableWorkbookSheet[]; activeSheetId: string };
export type WorkbookResult =
  | { type: "import"; value: WorkbookImport }
  | { type: "export"; bytes: Uint8Array; warnings: string[] };
