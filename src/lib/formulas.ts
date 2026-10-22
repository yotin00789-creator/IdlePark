// Explains where a calculated number comes from: the original Excel formula, the
// values that went in, and the result. Display-only; the numbers come from shared/calc.
import { formatBaht } from "../../shared/thai";
import type { YearCalc, YearData } from "../../shared/types";

export interface FormulaExplain {
  title: string;
  excel: string | null;
  note?: string;
  inputs: { label: string; value: string }[];
  result: string;
  legacy?: string;
}

const col = (month: number) => String.fromCharCode(66 + month); // 1 -> C
const money = (v: number) => formatBaht(v);

/** Excel row layout of the original sheets: summary rows follow the last tenant row. */
export function summaryRows(y: YearData) {
  const src = y.rows.map((r) => r.sourceRow).filter((n): n is number => n != null);
  if (!src.length) return null;
  const income = Math.max(...src) + 1;
  const lastNormal = Math.max(...y.rows.filter((r) => r.kind !== "excluded" && r.sourceRow != null).map((r) => r.sourceRow!));
  return { first: 3, lastNormal, income, father: income + 1, aunt: income + 2, expense: income + 3, collect: income + 4, net: income + 5 };
}

export type SummaryField = "income" | "net";

export function explainMonth(y: YearData, c: YearCalc, month: number, field: SummaryField): FormulaExplain {
  const m = c.months[month - 1];
  const rows = summaryRows(y);
  const L = col(month);
  const override = y.overrides.find((o) => o.month === month && o.field === (field === "income" ? "income_rows" : "skip_collect") && o.mode === "legacy");

  if (field === "income") {
    const range = override
      ? `${L}${override.value.from}:${L}${override.value.to}`
      : rows
        ? `${L}${rows.first}:${L}${rows.lastNormal}`
        : null;
    return {
      title: `รวมรายรับเดือน (เดือน ${month})`,
      excel: range ? `=SUM(${range})` : null,
      note: "ผลรวมยอดที่เก็บได้ของทุกแถวผู้เช่าในเดือนนี้ ไม่นับแถว “ไม่รวม”",
      inputs: [{ label: "จำนวนแถวที่นับ", value: `${y.rows.filter((r) => r.kind !== "excluded").length} แถว` }],
      result: money(m.income),
      legacy: override ? override.note || "เดือนนี้ใช้สูตรตามไฟล์เดิม (ต่างจากมาตรฐาน)" : undefined,
    };
  }
  const withCollect = !m.legacyNoCollect;
  return {
    title: `รวม(หักแล้ว) เดือน ${month}`,
    excel: rows
      ? `=(${L}${rows.income}-${L}${rows.father}-${L}${rows.aunt}-${L}${rows.expense}${withCollect ? `-${L}${rows.collect}` : ""})`
      : null,
    note: withCollect ? "รวม − ให้พ่อ − จ่ายป้า − ค่าใช้จ่ายรวม − เก็บเงิน" : "รวม − ให้พ่อ − จ่ายป้า − ค่าใช้จ่ายรวม (ไม่หักเก็บเงิน)",
    inputs: [
      { label: "รวม", value: money(m.income) },
      { label: "ให้พ่อ", value: money(m.toFather) },
      { label: "จ่ายป้า", value: money(m.payAunt) },
      { label: "ค่าใช้จ่ายรวม", value: money(m.totalExpense) },
      { label: "เก็บเงิน", value: withCollect ? money(m.collect) : `${money(m.collect)} (ไม่หัก)` },
    ],
    result: money(m.net),
    legacy: m.legacyNoCollect ? "เดือนนี้ใช้สูตรตามไฟล์เดิม: ไม่หักช่อง “เก็บเงิน”" : undefined,
  };
}

export function explainTotal(c: YearCalc, label: string, value: number, rowLabel: string): FormulaExplain {
  return {
    title: `${label} ทั้งปี ${c.year}`,
    excel: "=SUM(C:N) ของแถว " + rowLabel,
    note: "บวกครบ 12 เดือน",
    inputs: [],
    result: money(value),
  };
}

export function explainCumulative(c: YearCalc): FormulaExplain {
  return {
    title: `ยอดคงเหลือทั้งหมด สิ้นปี ${c.year}`,
    excel: "=SUM(ยอดปีก่อน, รวม(หักแล้ว) ทั้งปีนี้)",
    note: "ยอดสะสมของปีก่อน + รวม(หักแล้ว) ทั้งปีนี้",
    inputs: [
      { label: "ยอดสะสมสิ้นปีก่อน", value: money(c.cumulativeStart) },
      { label: `รวม(หักแล้ว) ปี ${c.year}`, value: money(c.totals.net) },
    ],
    result: money(c.cumulative),
  };
}
