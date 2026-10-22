import { beforeAll, describe, expect, it } from "vitest";
import { currentFee, feeFor, feeSteps, findUnpaid } from "../shared/calc.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

const base = { monthlyFee: 120000, feeChanges: [{ month: 3, fee: 150000 }, { month: 9, fee: 100000 }] };

describe("price changes keep the months before them", () => {
  it("each month has the price of that month", () => {
    expect([1, 2, 3, 8, 9, 12].map((m) => feeFor(base, m))).toEqual([120000, 120000, 150000, 150000, 100000, 100000]);
    expect(feeFor({ monthlyFee: 120000, feeChanges: [] }, 7)).toBe(120000);
    expect(feeSteps(base)).toEqual([{ from: 1, fee: 120000 }, { from: 3, fee: 150000 }, { from: 9, fee: 100000 }]);
    expect(currentFee({ ...base, year: 2569 }, { year: 2569, month: 5 })).toBe(150000);
    expect(currentFee({ ...base, year: 2568 }, { year: 2569, month: 5 })).toBe(100000); // a past year: its last price
  });

  it("what is owed per month follows the price of that month", () => {
    const row: any = { ...base, year: 2569, isActive: true, kind: "normal", startMonth: 1, endMonth: null, paidThroughYear: null, paidThroughMonth: null, payments: [120000, 120000, 120000, null, null, null, null, null, null, null, null, null] };
    const unpaid = findUnpaid([row], 2569, 4, 3);
    expect(unpaid.map((u) => [u.month, u.due])).toEqual([[3, 30000], [4, 150000]]);
  });
});

describe("price change API", () => {
  let admin: Client;
  const y = bangkokToday().year;
  const rows = async (year = y) => (await admin.get("/data")).json.years.find((x: any) => x.year === year)?.rows as any[];
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("a new price starts from the chosen month and earlier months keep theirs", async () => {
    const made = await admin.post("/ledger/rows", { year: y, ownerName: "ราคาไม่เท่ากัน", plate: "1กก 1", monthlyFee: 120000 });
    const id = made.json.row.id;
    const r = await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 150000, feeFrom: 4 });
    expect(r.status).toBe(200);
    expect(r.json.row).toMatchObject({ monthlyFee: 120000, feeChanges: [{ month: 4, fee: 150000 }] });
    // a later change replaces the ones from that month on; the same price twice adds nothing
    const r2 = await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 100000, feeFrom: 7 });
    expect(r2.json.row.feeChanges).toEqual([{ month: 4, fee: 150000 }, { month: 7, fee: 100000 }]);
    const r3 = await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 90000, feeFrom: 5 });
    expect(r3.json.row.feeChanges).toEqual([{ month: 4, fee: 150000 }, { month: 5, fee: 90000 }]);
    expect((await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 120000, feeFrom: 4 })).json.row.feeChanges).toEqual([]); // back to the earlier price: nothing to remember
    // from January = the starting price itself
    const r5 = await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 130000, feeFrom: 1 });
    expect(r5.json.row).toMatchObject({ monthlyFee: 130000, feeChanges: [] });
    const log = (await admin.get("/audit")).json.entries.find((e: any) => e.action === "row.update" && e.summary.includes("ราคา"));
    expect(log.summary).toContain("เดือนก่อนหน้าไม่เปลี่ยน");
  });

  it("vehicles of one customer can have different prices, and the next year continues at the new price", async () => {
    const a = (await admin.post("/ledger/rows", { year: y, ownerName: "สองคัน", plate: "2ขข 2", monthlyFee: 120000 })).json.row;
    const b = (await admin.post("/ledger/rows", { year: y, ownerName: "สองคัน", plate: "2ขข 3", monthlyFee: 90000, customerId: a.customerId })).json.row;
    expect([a.monthlyFee, b.monthlyFee]).toEqual([120000, 90000]);
    await admin.post(`/ledger/years/${y + 1}/copy-previous`, {});
    await admin.patch(`/ledger/rows/${a.id}`, { monthlyFee: 140000, feeFrom: 6 });
    const next = await rows(y + 1);
    expect(next.find((r) => r.plate === "2ขข 2").monthlyFee).toBe(140000);
    expect(next.find((r) => r.plate === "2ขข 3").monthlyFee).toBe(90000);
    expect((await rows()).find((r) => r.plate === "2ขข 2")).toMatchObject({ monthlyFee: 120000, feeChanges: [{ month: 6, fee: 140000 }] });
  });
});

describe("the storage shed is paid once a year", () => {
  const shed: any = { id: 1, year: 2569, slotId: "K01", monthlyFee: 600000, feeChanges: [], startMonth: 3, endMonth: null, isActive: true, kind: "normal", paidThroughYear: null, paidThroughMonth: null, payments: Array(12).fill(null) };

  it("owes the whole fee in its payment month and nothing in the other months", () => {
    expect([1, 2, 3, 4, 12].map((m) => feeFor(shed, m))).toEqual([0, 0, 600000, 0, 0]);
    expect(currentFee(shed, { year: 2569, month: 7 })).toBe(600000);
  });

  it("stays unpaid from the payment month until it is paid, however far back that was", () => {
    // October, 2 months of look-back: a monthly row would not look back to March, the yearly one does
    expect(findUnpaid([shed], 2569, 10, 2).map((u) => [u.month, u.due])).toEqual([[3, 600000]]);
    expect(findUnpaid([shed], 2569, 2, 2)).toEqual([]); // not yet due in February
    const paid = { ...shed, payments: shed.payments.map((_: any, i: number) => (i === 2 ? 600000 : null)) };
    expect(findUnpaid([paid], 2569, 10, 2)).toEqual([]);
    const part = { ...shed, payments: shed.payments.map((_: any, i: number) => (i === 2 ? 200000 : null)) };
    expect(findUnpaid([part], 2569, 10, 2).map((u) => [u.month, u.due])).toEqual([[3, 400000]]);
  });

  it("a monthly row is unaffected, and the next year keeps the shed's payment month", async () => {
    const monthly = { ...shed, slotId: "N01" };
    expect(feeFor(monthly, 5)).toBe(600000);
    await freshApp();
    const admin = await setupAdmin();
    const y = bangkokToday().year;
    const made = (await admin.post("/ledger/rows", { year: y, ownerName: "เช่าคลัง", plate: "คลัง", slotId: "K01", monthlyFee: 600000, startMonth: 5 })).json.row;
    expect(made.startMonth).toBe(5);
    await admin.post(`/ledger/years/${y + 1}/copy-previous`, {});
    const next = (await admin.get("/data")).json.years.find((x: any) => x.year === y + 1).rows.find((r: any) => r.slotId === "K01");
    expect(next).toMatchObject({ startMonth: 5, monthlyFee: 600000 });
  });
});
