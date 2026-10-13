declare module "@fortune-sheet/formula-parser" {
	export interface FormulaCellRef {
		label: string;
		row: { index: number };
		column: { index: number };
		sheetName?: string;
	}
	export interface FormulaParseResult { error: string | null; result: unknown }
	export class Parser {
		on(event: "callCellValue", handler: (cell: FormulaCellRef, options: unknown, done: (value: unknown) => void) => void): void;
		on(event: "callRangeValue", handler: (start: FormulaCellRef, end: FormulaCellRef, options: unknown, done: (value: unknown[][]) => void) => void): void;
		parse(expression: string): FormulaParseResult;
	}
}
