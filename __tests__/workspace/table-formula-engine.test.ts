import { describe, expect, it } from "vitest";
import { evaluateTableFormulas, workbookFormulaOptions } from "@/app/workspace/utils/tableFormula";

function table(cells: string[][], formulas: Record<string, string> = {}) {
  const grid = cells.map((row) => row.map(() => undefined as string | undefined));
  for (const [address, formula] of Object.entries(formulas)) {
    grid[Number(address.slice(1)) - 1][address.charCodeAt(0) - 65] = formula;
  }
  return { rows: cells.length, cols: cells[0].length, cells, formulas: grid, mode: "spreadsheet" as const };
}

const value = (data: ReturnType<typeof table>, row: number, col: number) => evaluateTableFormulas(data).values[row][col];

describe("Workspace spreadsheet formula engine", () => {
  const sales = table(
    [["North", "5", ""], ["South", "7", ""], ["North", "3", ""]],
    { C1: "=SUM(B1:B3)", C2: "=SUMIF(A1:A3,\"North\",B1:B3)", C3: "=IF(B1>3,\"big\",\"small\")" },
  );

  it("keeps the original arithmetic and five aggregates working", () => {
    const data = table([["2", "3", ""]], { C1: "=(A1+B1)*2-1", });
    expect(value(data, 0, 2)).toBe("9");
    expect(evaluateTableFormulas(table([["1", "4", ""]], { C1: "=AVERAGE(A1:B1)" })).values[0][2]).toBe("2.5");
  });

  it("supports conditional, text, lookup and rounding functions beyond the old five", () => {
    expect(value(sales, 0, 2)).toBe("15");
    expect(value(sales, 1, 2)).toBe("8");
    expect(value(sales, 2, 2)).toBe("big");
    expect(value(table([["5", "2", ""]], { C1: "=ROUND(A1/B1*1.234,1)" }), 0, 2)).toBe("3.1");
    expect(value(table([["a", "b", ""]], { C1: "=CONCATENATE(A1,\"-\",B1)" }), 0, 2)).toBe("a-b");
    expect(value(table([["k1", "10", ""], ["k2", "20", ""]], { C1: "=VLOOKUP(\"k2\",A1:B2,2,0)" }), 0, 2)).toBe("20");
    expect(value(table([["x", "", "y", ""]], { D1: "=COUNTA(A1:C1)" }), 0, 3)).toBe("2");
  });

  it("reports formula errors with stable codes", () => {
    const divide = evaluateTableFormulas(table([["4", "0", ""]], { C1: "=A1/B1" }));
    expect(divide.errors[0][2]).toBe("#DIV/0!");
    expect(evaluateTableFormulas(table([["1", ""]], { B1: "=NOPE(A1)" })).errors[0][1]).toBe("#NAME?");
    expect(evaluateTableFormulas(table([["1", ""]], { B1: "=A1+Z99" })).errors[0][1]).toBe("#REF!");
    const text = evaluateTableFormulas(table([["abc", ""]], { B1: "=A1*2" }));
    expect(text.errors[0][1]).toBe("#VALUE!");
  });

  it("propagates errors and detects cycles", () => {
    const cycle = evaluateTableFormulas(table([["", ""]], { A1: "=B1+1", B1: "=A1+1" }));
    expect(cycle.errors[0][0]).toBe("#CYCLE!");
    expect(cycle.errors[0][1]).toBe("#CYCLE!");
    const chain = evaluateTableFormulas(table([["1", "0", "", ""]], { C1: "=A1/B1", D1: "=C1+1" }));
    expect(chain.errors[0][3]).toBe("#DIV/0!");
  });

  it("resolves cross-sheet references and rejects cross-sheet cycles", () => {
    const budget = table([["100", ""]], {});
    const main = {
      ...table([["", ""]], { A1: "=Budget!A1*2+SUM(Budget!A1:B1)" }),
      sheets: [
        { id: "s1", name: "Sheet1", data: table([["", ""]], { A1: "=Budget!A1*2+SUM(Budget!A1:B1)" }) },
        { id: "s2", name: "Budget", data: budget },
      ],
      activeSheetId: "s1",
    };
    expect(evaluateTableFormulas(main, workbookFormulaOptions(main)).values[0][0]).toBe("300");
    const loopA = { ...table([["", ""]], { A1: "=Loop!A1" }), sheets: [
      { id: "a", name: "Main", data: table([["", ""]], { A1: "=Loop!A1" }) },
      { id: "b", name: "Loop", data: table([["", ""]], { A1: "=Main!A1" }) },
    ], activeSheetId: "a" };
    expect(evaluateTableFormulas(loopA, workbookFormulaOptions(loopA)).errors[0][0]).toBe("#CYCLE!");
    const missing = { ...table([["", ""]], { A1: "=Nope!A1" }), sheets: [{ id: "a", name: "Main", data: table([["", ""]], {}) }], activeSheetId: "a" };
    expect(evaluateTableFormulas(missing, workbookFormulaOptions(missing)).errors[0][0]).toBe("#REF!");
  });

  it("evaluates a 50x50 sheet quickly", () => {
    const cells = Array.from({ length: 50 }, (_, r) => Array.from({ length: 50 }, (_, c) => (r === 49 || c === 49 ? "" : String(r + c))));
    const formulas: Record<string, string> = {};
    const label = (c: number) => String.fromCharCode(65 + c);
    for (let c = 0; c < 26; c++) formulas[`${label(c)}50`] = `=SUM(${label(c)}1:${label(c)}49)`;
    const started = Date.now();
    const result = evaluateTableFormulas(table(cells, formulas));
    expect(result.values[49][0]).toBe(String(Array.from({ length: 49 }, (_, r) => r).reduce((a, b) => a + b, 0)));
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
