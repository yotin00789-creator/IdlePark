// Single source of truth for every number in the system. Pure functions only:
// the web app, the API and the tests all import this file.
import type {
  CalcOverride,
  LedgerRow,
  MonthCalc,
  Months,
  SavingsCalc,
  SavingsData,
  YearCalc,
  YearData,
} from "./types.js";

const sum = (values: (number | null | undefined)[]) =>
  values.reduce<number>((acc, v) => acc + (typeof v === "number" ? v : 0), 0);

export const emptyMonths = <T>(value: T): Months<T> =>
  Array.from({ length: 12 }, () => value);

function findOverride(
  overrides: CalcOverride[],
  month: number,
  field: CalcOverride["field"],
) {
  return overrides.find(
    (o) => o.month === month && o.field === field && o.mode === "legacy",
  );
}

/** Rows that the standard formula counts: everything that is not "excluded". */
export const countsInIncome = (row: LedgerRow) => row.kind !== "excluded";

export function monthIncome(
  rows: LedgerRow[],
  overrides: CalcOverride[],
  month: number, // 1..12
): { value: number; legacy: boolean } {
  const m = month - 1;
  const legacy = findOverride(overrides, month, "income_rows");
  if (!legacy) {
    return { value: sum(rows.filter(countsInIncome).map((r) => r.payments[m])), legacy: false };
  }
  // Legacy: Excel summed the rows between from..to of the original sheet,
  // whatever their kind. Rows added later (no source row) still count if normal.
  const { from = 0, to = 0 } = legacy.value;
  const included = rows.filter((r) =>
    r.sourceRow == null ? countsInIncome(r) : r.sourceRow >= from && r.sourceRow <= to,
  );
  return { value: sum(included.map((r) => r.payments[m])), legacy: true };
}

export function calcYear(data: YearData, cumulativeStart = 0): YearCalc {
  const months: Months<MonthCalc> = [];
  for (let m = 1; m <= 12; m++) {
    const i = m - 1;
    const inc = monthIncome(data.rows, data.overrides, m);
    const toFather = data.items.to_father[i] ?? 0;
    const payAunt = data.items.pay_aunt[i] ?? 0;
    const totalExpense = data.items.total_expense[i] ?? 0;
    const collect = data.items.collect[i] ?? 0;
    const noCollect = Boolean(findOverride(data.overrides, m, "skip_collect"));
    const net =
      inc.value - toFather - payAunt - totalExpense - (noCollect ? 0 : collect);
    months.push({
      income: inc.value,
      toFather,
      payAunt,
      totalExpense,
      collect,
      net,
      legacyIncome: inc.legacy,
      legacyNoCollect: noCollect,
    });
  }
  const totals = {
    income: sum(months.map((x) => x.income)),
    toFather: sum(months.map((x) => x.toFather)),
    payAunt: sum(months.map((x) => x.payAunt)),
    totalExpense: sum(months.map((x) => x.totalExpense)),
    collect: sum(months.map((x) => x.collect)),
    net: sum(months.map((x) => x.net)),
  };
  return {
    year: data.year,
    months,
    totals,
    cumulativeStart,
    cumulative: cumulativeStart + totals.net,
  };
}

/** Calculates every year in order, chaining "ยอดคงเหลือทั้งหมด" year to year. */
export function calcAll(years: YearData[]): YearCalc[] {
  const sorted = [...years].sort((a, b) => a.year - b.year);
  const out: YearCalc[] = [];
  let carry = 0;
  for (const y of sorted) {
    const c = calcYear(y, carry);
    out.push(c);
    carry = c.cumulative;
  }
  return out;
}

export function calcSavings(data: SavingsData): SavingsCalc {
  const monthTotal = data.days.map((d) => sum(d));
  const monthRemain = monthTotal.map(
    (t, i) => t - (data.expense[i] ?? 0) - (data.card[i] ?? 0),
  );
  return { year: data.year, monthTotal, monthRemain, yearRemain: sum(monthRemain) };
}

export const calcSavingsTotal = (all: SavingsData[]) =>
  sum(all.map((s) => calcSavings(s).yearRemain));

// ----------------------------------------------------------------- statuses

export type CellStatus = "full" | "partial" | "zero" | "empty" | "future";

export function cellStatus(
  amount: number | null,
  fee: number,
  isFuture: boolean,
): CellStatus {
  if (amount == null) return isFuture ? "future" : "empty";
  if (amount <= 0) return "zero";
  return amount >= fee ? "full" : "partial";
}

export function rowYearTotal(row: LedgerRow) {
  return sum(row.payments);
}

/**
 * A month counts as "paid through" when the row records a prepaid-until month
 * (e.g. "จ่ายถึง กพ ปี 66") that is on or after it.
 */
export function isPrepaid(row: LedgerRow, year: number, month: number) {
  if (row.paidThroughYear == null || row.paidThroughMonth == null) return false;
  return row.paidThroughYear * 12 + row.paidThroughMonth >= year * 12 + month;
}

export interface Unpaid {
  row: LedgerRow;
  month: number;
  paid: number;
  due: number; // satang still outstanding
}

/** What one month costs for this row: the last price change at or before the month, else the starting price. */
export function feeFor(row: Pick<LedgerRow, "monthlyFee" | "feeChanges">, month: number): number {
  let fee = row.monthlyFee;
  let from = 0;
  for (const c of row.feeChanges ?? []) if (c.month <= month && c.month >= from) { fee = c.fee; from = c.month; }
  return fee;
}

/** The price to show for a row "now": this month for the current year, the last month of a past year, the first of a future year. */
export function currentFee(row: Pick<LedgerRow, "monthlyFee" | "feeChanges" | "year">, today: { year: number; month: number }): number {
  return feeFor(row, row.year < today.year ? 12 : row.year === today.year ? today.month : 1);
}

/** The price steps of a row for display: [{ from: 1, fee }, { from: 3, fee }]. */
export function feeSteps(row: Pick<LedgerRow, "monthlyFee" | "feeChanges">): { from: number; fee: number }[] {
  const steps = [{ from: 1, fee: row.monthlyFee }];
  for (const c of [...(row.feeChanges ?? [])].sort((a, b) => a.month - b.month)) steps.push({ from: c.month, fee: c.fee });
  return steps;
}

/**
 * Rows that still owe money for months from (currentMonth - lookback) to
 * currentMonth of `year`. Only active, normal rows count; zero and empty both
 * mean "not paid".
 */
export function findUnpaid(
  rows: LedgerRow[],
  year: number,
  currentMonth: number,
  lookbackMonths: number,
): Unpaid[] {
  const out: Unpaid[] = [];
  const first = Math.max(1, currentMonth - Math.max(0, lookbackMonths));
  for (const row of rows) {
    if (!row.isActive || row.kind === "excluded") continue;
    for (let m = first; m <= currentMonth; m++) {
      if (m < row.startMonth || (row.endMonth != null && m > row.endMonth)) continue;
      if (isPrepaid(row, year, m)) continue;
      const fee = feeFor(row, m); // each month at the price of that month
      if (fee <= 0) continue;
      const paid = row.payments[m - 1] ?? 0;
      if (paid < fee) {
        out.push({ row, month: m, paid, due: fee - paid });
      }
    }
  }
  return out;
}
