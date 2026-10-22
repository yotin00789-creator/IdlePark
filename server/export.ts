// Builds an .xlsx whose totals are real Excel formulas (SUM, and the "หักแล้ว" subtraction),
// so the file recalculates in Excel to the same numbers the system shows.
import ExcelJS from "exceljs";
import { calcAll } from "../shared/calc.js";
import { THAI_MONTHS_SHORT } from "../shared/thai.js";
import type { YearData } from "../shared/types.js";

const colName = (n: number) => String.fromCharCode(64 + n); // 1 -> A (up to Z)
const baht = (v: number | null) => (v == null ? null : v / 100);

/** [2,3,4,7] -> "C2:C4,C7" */
function ranges(col: string, rows: number[]) {
  const out: string[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j] + 1) j++;
    out.push(i === j ? `${col}${rows[i]}` : `${col}${rows[i]}:${col}${rows[j]}`);
    i = j + 1;
  }
  return out.join(",");
}

export interface YearLayout {
  sheet: string;
  income: number;
  father: number;
  aunt: number;
  expense: number;
  collect: number;
  net: number;
}

export async function buildLedgerWorkbook(years: YearData[]): Promise<{ workbook: ExcelJS.Workbook; layouts: Record<number, YearLayout> }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "สมุดบัญชีที่จอดรถ";
  const calc = calcAll(years);
  const layouts: Record<number, YearLayout> = {};

  for (const y of years) {
    const c = calc.find((x) => x.year === y.year)!;
    const ws = wb.addWorksheet(String(y.year), { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
    ws.columns = [{ width: 18 }, { width: 14 }, ...Array.from({ length: 12 }, () => ({ width: 10 })), { width: 12 }, { width: 10 }];
    ws.addRow(["ชื่อ", "เลขรถ", ...THAI_MONTHS_SHORT, "รวมแถว"]).font = { bold: true };

    const normal = y.rows.filter((r) => r.kind !== "excluded");
    const excluded = y.rows.filter((r) => r.kind === "excluded");
    const rowIndex = new Map<number, number>();
    [...normal, ...excluded].forEach((r, i) => {
      const n = i + 2;
      rowIndex.set(r.id, n);
      const row = ws.addRow([r.ownerName, r.plate, ...r.payments.map(baht)]);
      row.getCell(15).value = { formula: `SUM(C${n}:N${n})`, result: r.payments.reduce<number>((s, p) => s + (p ?? 0), 0) / 100 };
      if (r.kind === "excluded") row.getCell(16).value = "ไม่รวม";
    });

    const last = normal.length + excluded.length + 1;
    const L: YearLayout = { sheet: String(y.year), income: last + 1, father: last + 2, aunt: last + 3, expense: last + 4, collect: last + 5, net: last + 6 };
    layouts[y.year] = L;
    const normalRows = normal.map((r) => rowIndex.get(r.id)!);

    ws.getCell(`A${L.income}`).value = "รวม";
    ws.getCell(`A${L.father}`).value = "ให้พ่อ";
    ws.getCell(`A${L.aunt}`).value = "จ่ายป้า";
    ws.getCell(`A${L.expense}`).value = "ค่าใช้จ่ายรวม";
    ws.getCell(`A${L.collect}`).value = "เก็บเงิน";
    ws.getCell(`A${L.net}`).value = "รวม(หักแล้ว)";
    for (const r of [L.income, L.net]) ws.getCell(`A${r}`).font = { bold: true };

    for (let m = 1; m <= 12; m++) {
      const col = colName(2 + m);
      const mc = c.months[m - 1];
      // income: the rows the system counted this month (honours "ตามไฟล์เดิม" months)
      const legacy = y.overrides.find((o) => o.month === m && o.field === "income_rows" && o.mode === "legacy");
      let counted = normalRows;
      if (legacy) {
        const { from = 0, to = 0 } = legacy.value;
        counted = y.rows
          .filter((r) => (r.sourceRow == null ? r.kind !== "excluded" : r.sourceRow >= from && r.sourceRow <= to))
          .map((r) => rowIndex.get(r.id)!)
          .sort((a, b) => a - b);
      }
      ws.getCell(`${col}${L.income}`).value = { formula: counted.length ? `SUM(${ranges(col, counted)})` : "0", result: mc.income / 100 };
      ws.getCell(`${col}${L.father}`).value = baht(y.items.to_father[m - 1]);
      ws.getCell(`${col}${L.aunt}`).value = baht(y.items.pay_aunt[m - 1]);
      ws.getCell(`${col}${L.expense}`).value = baht(y.items.total_expense[m - 1]);
      ws.getCell(`${col}${L.collect}`).value = baht(y.items.collect[m - 1]);
      const withCollect = !mc.legacyNoCollect;
      ws.getCell(`${col}${L.net}`).value = {
        formula: `(${col}${L.income}-${col}${L.father}-${col}${L.aunt}-${col}${L.expense}${withCollect ? `-${col}${L.collect}` : ""})`,
        result: mc.net / 100,
      };
    }
    const totals: [number, number][] = [
      [L.income, c.totals.income], [L.father, c.totals.toFather], [L.aunt, c.totals.payAunt],
      [L.expense, c.totals.totalExpense], [L.collect, c.totals.collect], [L.net, c.totals.net],
    ];
    for (const [r, v] of totals) ws.getCell(`O${r}`).value = { formula: `SUM(C${r}:N${r})`, result: v / 100 };
    ws.getCell(`P${L.net}`).value = "← รวมทั้งปี";
    for (const row of ws.getRows(2, L.net) ?? []) row.eachCell((cell, n) => { if (n >= 3 && n <= 15) cell.numFmt = "#,##0.00;[Red]-#,##0.00"; });
  }

  // Running balance across years, chained by formulas like the original "ยอดคงเหลือทั้งหมด".
  const sum = wb.addWorksheet("สรุปรายปี");
  sum.columns = [{ width: 12 }, { width: 18 }, { width: 18 }, { width: 22 }];
  sum.addRow(["ปี (พ.ศ.)", "รวมทั้งปี", "รวม(หักแล้ว)", "ยอดคงเหลือทั้งหมด"]).font = { bold: true };
  calc.forEach((c, i) => {
    const L = layouts[c.year];
    const r = i + 2;
    sum.addRow([c.year]);
    sum.getCell(`B${r}`).value = { formula: `'${L.sheet}'!O${L.income}`, result: c.totals.income / 100 };
    sum.getCell(`C${r}`).value = { formula: `'${L.sheet}'!O${L.net}`, result: c.totals.net / 100 };
    sum.getCell(`D${r}`).value = { formula: i === 0 ? `C${r}` : `D${r - 1}+C${r}`, result: c.cumulative / 100 };
    for (const k of ["B", "C", "D"]) sum.getCell(`${k}${r}`).numFmt = "#,##0.00;[Red]-#,##0.00";
  });
  return { workbook: wb, layouts };
}
