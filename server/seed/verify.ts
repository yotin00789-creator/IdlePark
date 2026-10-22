// Compares the calc engine with every value Excel had cached for the formulas.
import { calcAll, calcSavings } from "../../shared/calc.js";
import type { CalcOverride, YearData } from "../../shared/types.js";
import type { ParsedWorkbook } from "./parseWorkbook.js";

export const DEFAULT_FEE = 120000; // 1,200 baht in satang

export function toYearData(p: ParsedWorkbook["years"][number], mode: "legacy" | "standard"): YearData {
  let id = 0;
  return {
    year: p.year,
    rows: p.rows.map((r) => ({
      id: ++id,
      year: p.year,
      sortOrder: r.sortOrder,
      customerId: null,
      ownerName: r.ownerName,
      plate: r.plate,
      plateProvince: "",
      slotId: null,
      vehicleType: null,
      carColor: null,
      bay: null,
      dueDay: null,
      zoneId: null,
      kind: r.kind,
      bulkCount: 1,
      sourceRow: r.sourceRow,
      billing: "monthly" as const,
      isOwner: false,
      monthlyFee: DEFAULT_FEE,
      feeChanges: [],
      paidThroughYear: r.paidThroughYear,
      paidThroughMonth: r.paidThroughMonth,
      startMonth: 1,
      endMonth: null,
      note: r.note,
      needsReview: r.needsReview,
      isActive: true,
      payments: r.payments,
      payMethods: Array(12).fill(null),
      payAccounts: Array(12).fill(null),
    })),
    items: p.items,
    overrides: p.overrides.map(
      (o, i): CalcOverride => ({
        id: i + 1,
        year: p.year,
        month: o.month,
        field: o.field,
        mode,
        value: o.value,
        note: o.note,
      }),
    ),
  };
}

export interface Diff {
  where: string;
  expected: number | null;
  actual: number;
}

export function compareWithExcel(wb: ParsedWorkbook, mode: "legacy" | "standard" = "legacy") {
  const diffs: Diff[] = [];
  let checked = 0;
  const check = (where: string, expected: number | null, actual: number) => {
    if (expected == null) return;
    checked++;
    if (expected !== actual) diffs.push({ where, expected, actual });
  };

  const calc = calcAll(wb.years.map((y) => toYearData(y, mode)));
  for (const y of wb.years) {
    const c = calc.find((x) => x.year === y.year)!;
    y.expected.income.forEach((v, i) => check(`${y.year} รวม เดือน ${i + 1}`, v, c.months[i].income));
    check(`${y.year} รวมทั้งปี`, y.expected.incomeTotal, c.totals.income);
    y.expected.net.forEach((v, i) => check(`${y.year} รวม(หักแล้ว) เดือน ${i + 1}`, v, c.months[i].net));
    check(`${y.year} รวม(หักแล้ว) ทั้งปี`, y.expected.netTotal, c.totals.net);
    check(`${y.year} ให้พ่อ`, y.expected.itemTotals.to_father, c.totals.toFather);
    check(`${y.year} จ่ายป้า`, y.expected.itemTotals.pay_aunt, c.totals.payAunt);
    check(`${y.year} ค่าใช้จ่ายรวม`, y.expected.itemTotals.total_expense, c.totals.totalExpense);
    check(`${y.year} เก็บเงิน`, y.expected.itemTotals.collect, c.totals.collect);
    check(`${y.year} ยอดคงเหลือทั้งหมด`, y.expected.cumulative, c.cumulative);
  }
  for (const s of wb.savings) {
    const c = calcSavings({ year: s.year, days: s.days, expense: s.expense, card: s.card });
    s.expected.monthRemain.forEach((v, i) => check(`เงินเก็บพ่อ ${s.year} เดือน ${i + 1}`, v, c.monthRemain[i]));
    check(`เงินเก็บพ่อ ${s.year} ยอดเหลือทั้งปี`, s.expected.yearRemain, c.yearRemain);
  }
  const errors = [
    ...wb.years.flatMap((y) => y.expected.formulaErrors),
    ...wb.savings.flatMap((s) => s.expected.formulaErrors),
  ];
  return { checked, diffs, errors, calc };
}
