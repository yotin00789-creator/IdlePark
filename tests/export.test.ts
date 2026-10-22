import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcAll } from "../shared/calc.js";
import { buildLedgerWorkbook } from "../server/export.js";
import { parseWorkbook } from "../server/seed/parseWorkbook.js";
import { toYearData } from "../server/seed/verify.js";

const XLSX = process.env.SEED_XLSX ?? "ที่จอดรถ (1).xlsx";

// Tiny evaluator for the only formula shapes the export writes: SUM(ranges,cells), (A-B-C...), A+B, 'Sheet'!Cell.
function evaluate(wb: ExcelJS.Workbook, sheet: string, addr: string, depth = 0): number {
  if (depth > 40) throw new Error("formula loop");
  const cell = wb.getWorksheet(sheet)!.getCell(addr);
  const v = cell.value as any;
  if (v && typeof v === "object" && "formula" in v) return evalFormula(wb, sheet, String(v.formula), depth + 1);
  return typeof v === "number" ? v : 0;
}
function cellsIn(a: string, b: string): string[] {
  const m1 = /^([A-Z]+)(\d+)$/.exec(a)!;
  const m2 = /^([A-Z]+)(\d+)$/.exec(b)!;
  const out: string[] = [];
  for (let c = m1[1].charCodeAt(0); c <= m2[1].charCodeAt(0); c++)
    for (let r = Number(m1[2]); r <= Number(m2[2]); r++) out.push(`${String.fromCharCode(c)}${r}`);
  return out;
}
function evalFormula(wb: ExcelJS.Workbook, sheet: string, f: string, depth: number): number {
  const ref = (t: string): number => {
    const x = /^'?([^'!]+)'?!([A-Z]+\d+)$/.exec(t);
    return x ? evaluate(wb, x[1], x[2], depth) : evaluate(wb, sheet, t, depth);
  };
  const sum = /^SUM\((.+)\)$/.exec(f);
  if (sum) {
    return sum[1].split(",").reduce((acc, part) => {
      const [a, b] = part.split(":");
      return acc + (b ? cellsIn(a, b).reduce((s, c) => s + evaluate(wb, sheet, c, depth), 0) : ref(a));
    }, 0);
  }
  if (f === "0") return 0;
  const expr = f.replace(/^\(|\)$/g, "");
  const terms = expr.split(/(?=[+-])/);
  return terms.reduce((acc, t) => {
    const sign = t.startsWith("-") ? -1 : 1;
    return acc + sign * ref(t.replace(/^[+-]/, ""));
  }, 0);
}

describe.skipIf(!existsSync(XLSX))("Excel export recalculates to the system's numbers", async () => {
  const parsed = await parseWorkbook(XLSX);
  const years = parsed.years.map((y) => toYearData(y, "legacy"));
  const calc = calcAll(years);

  it("every total and net cell, evaluated from its formula, equals the engine", async () => {
    const { workbook, layouts } = await buildLedgerWorkbook(years);
    // round-trip through a real .xlsx file so we test what Excel would open
    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    let checked = 0;
    for (const c of calc) {
      const L = layouts[c.year];
      for (let m = 1; m <= 12; m++) {
        const col = String.fromCharCode(66 + m);
        expect(evaluate(wb, L.sheet, `${col}${L.income}`)).toBeCloseTo(c.months[m - 1].income / 100, 2);
        expect(evaluate(wb, L.sheet, `${col}${L.net}`)).toBeCloseTo(c.months[m - 1].net / 100, 2);
        checked += 2;
      }
      expect(evaluate(wb, L.sheet, `O${L.income}`)).toBeCloseTo(c.totals.income / 100, 2);
      expect(evaluate(wb, L.sheet, `O${L.net}`)).toBeCloseTo(c.totals.net / 100, 2);
    }
    // the running balance on the summary sheet chains through formulas
    calc.forEach((c, i) => expect(evaluate(wb, "สรุปรายปี", `D${i + 2}`)).toBeCloseTo(c.cumulative / 100, 2));
    expect(evaluate(wb, "สรุปรายปี", `D${calc.length + 1}`)).toBeCloseTo(12600, 2);
    expect(checked).toBe(calc.length * 24);
  });

  it("contains real formulas, not pasted values", async () => {
    const { workbook, layouts } = await buildLedgerWorkbook(years);
    const L = layouts[2569];
    const ws = workbook.getWorksheet("2569")!;
    expect((ws.getCell(`C${L.income}`).value as any).formula).toMatch(/^SUM\(C2:C\d+\)$/);
    expect((ws.getCell(`C${L.net}`).value as any).formula).toBe(`(C${L.income}-C${L.father}-C${L.aunt}-C${L.expense}-C${L.collect})`);
  });
});
