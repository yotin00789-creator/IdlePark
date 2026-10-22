import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcSavingsTotal, calcAll, cellStatus, findUnpaid, isPrepaid } from "../shared/calc";
import { parseWorkbook } from "../server/seed/parseWorkbook";
import { compareWithExcel, toYearData } from "../server/seed/verify";

const XLSX = process.env.SEED_XLSX ?? "ที่จอดรถ (1).xlsx";
const hasFile = existsSync(XLSX);

describe.skipIf(!hasFile)("calc engine vs the original Excel", async () => {
  const wb = await parseWorkbook(XLSX);

  it("matches every cached formula value in legacy mode", () => {
    const r = compareWithExcel(wb, "legacy");
    expect(r.diffs).toEqual([]);
    expect(r.checked).toBeGreaterThan(150);
  });

  it("matches the reference table", () => {
    const all = calcAll(wb.years.map((y) => toYearData(y, "legacy")));
    const by = Object.fromEntries(all.map((c) => [c.year, c]));
    const baht = (n: number) => n / 100;
    expect(all.map((c) => [c.year, baht(c.totals.income), baht(c.totals.net), baht(c.cumulative)])).toEqual([
      [2565, 136500, 6765, 6765],
      [2566, 284200, -2194, 4571],
      [2567, 243100, 5429, 10000],
      [2568, 278200, -5500, 4500],
      [2569, 222050, 8100, 12600],
      [2570, 0, 0, 12600],
    ]);
    expect(by[2570].cumulativeStart).toBe(by[2569].cumulative);
  });

  it("savings: 65 = 4,855, 66 = 800, total 5,655 (the Excel cross-sheet cell is broken)", () => {
    const totals = wb.savings.map((s) => calcSavingsTotal([s]) / 100);
    expect(totals).toEqual([4855, 800]);
    expect(calcSavingsTotal(wb.savings) / 100).toBe(5655);
  });

  it("only known formula errors remain in the file", () => {
    const r = compareWithExcel(wb, "legacy");
    expect(r.errors.sort()).toEqual(["2566!S7 #REF!", "เงินเก็บพ่อ66!O36 #ERROR!"].sort());
  });

  it("standard mode removes the legacy quirks", () => {
    const legacy = calcAll(wb.years.map((y) => toYearData(y, "legacy"))).at(-1)!.cumulative;
    const standard = calcAll(wb.years.map((y) => toYearData(y, "standard"))).at(-1)!.cumulative;
    // Jul-66 game row (+2,400), Sep-66 unnamed rows (-2,400), Nov/Dec-68 game row (+2,400)
    expect((legacy - standard) / 100).toBe(2400);
    expect(standard / 100).toBe(10200);
  });

  it("flags unnamed rows for review and records 'paid through'", () => {
    const unnamed = wb.years.flatMap((y) => y.rows.filter((r) => r.ownerName === "ไม่ระบุชื่อ"));
    expect(unnamed.length).toBeGreaterThanOrEqual(4);
    expect(unnamed.every((r) => r.needsReview)).toBe(true);
    const y65 = wb.years.find((y) => y.year === 2565)!;
    const prepaid = y65.rows.filter((r) => r.paidThroughMonth === 2 && r.paidThroughYear === 2566);
    expect(prepaid.length).toBe(7);
  });
});

describe("unpaid detection", () => {
  const row = (over: object = {}) => ({
    id: 1, year: 2569, sortOrder: 0, customerId: null, ownerName: "ก", plate: "1กข 1", plateProvince: "", slotId: null, vehicleType: null, carColor: null, bay: null, dueDay: null, zoneId: null,
    kind: "normal" as const, bulkCount: 1, sourceRow: null, billing: "monthly" as const, monthlyFee: 120000, feeChanges: [], paidThroughYear: null,
    paidThroughMonth: null, startMonth: 1, endMonth: null, note: "", needsReview: false, isActive: true,
    payments: Array(12).fill(null) as (number | null)[], payMethods: Array(12).fill(null), payAccounts: Array(12).fill(null), ...over,
  });
  it("counts empty, zero and partial as unpaid; prepaid and inactive are skipped", () => {
    const full = row({ id: 1, payments: [120000, 120000, 120000, ...Array(9).fill(null)] });
    const partial = row({ id: 2, payments: [120000, 120000, 50000, ...Array(9).fill(null)] });
    const zero = row({ id: 3, payments: [120000, 120000, 0, ...Array(9).fill(null)] });
    const prepaid = row({ id: 4, paidThroughYear: 2569, paidThroughMonth: 6 });
    const off = row({ id: 5, isActive: false });
    const excluded = row({ id: 6, kind: "excluded" });
    const u = findUnpaid([full, partial, zero, prepaid, off, excluded], 2569, 3, 0);
    expect(u.map((x) => [x.row.id, x.due])).toEqual([[2, 70000], [3, 120000]]);
    expect(findUnpaid([prepaid], 2569, 8, 0)).toHaveLength(1);
    expect(isPrepaid(prepaid, 2569, 6)).toBe(true);
    expect(isPrepaid(prepaid, 2569, 7)).toBe(false);
  });
  it("looks back the configured number of months", () => {
    const r = row({ payments: [120000, null, null, ...Array(9).fill(null)] });
    expect(findUnpaid([r], 2569, 3, 0).map((x) => x.month)).toEqual([3]);
    expect(findUnpaid([r], 2569, 3, 2).map((x) => x.month)).toEqual([1, 2, 3].filter((m) => m !== 1));
    expect(findUnpaid([r], 2569, 3, 5).map((x) => x.month)).toEqual([2, 3]);
  });
  it("skips months before the tenancy started or after it ended", () => {
    const r = row({ startMonth: 3, endMonth: 4 });
    expect(findUnpaid([r], 2569, 6, 5).map((x) => x.month)).toEqual([3, 4]);
  });
  it("cell status", () => {
    expect(cellStatus(120000, 120000, false)).toBe("full");
    expect(cellStatus(100, 120000, false)).toBe("partial");
    expect(cellStatus(0, 120000, false)).toBe("zero");
    expect(cellStatus(null, 120000, false)).toBe("empty");
    expect(cellStatus(null, 120000, true)).toBe("future");
  });
});
