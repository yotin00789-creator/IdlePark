import { beforeAll, describe, expect, it } from "vitest";
import { calcAll, findUnpaid, rentTotals } from "../shared/calc.js";
import { bangkokToday, formatBaht } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

// The numbers the pages show are recomputed here the plain way (loops over raw payments and prices) and compared:
// income, unpaid amounts, rent totals and the cash / transfer split of the report.
describe("independent recount of the figures", () => {
  let admin: Client;
  const today = bangkokToday();
  const y = today.year;
  const M = today.month;
  const upto = Math.min(M, 6); // payments only in months that already happened
  let data: any;
  let ids: Record<string, number> = {};
  let bankA = 0;
  let bankB = 0;

  const pay = (rowId: number, month: number, amount: number, method: "cash" | "transfer", accountId: number | null = null) =>
    admin.put("/ledger/payments", { changes: [{ rowId, month, amount, method, accountId }] });

  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
    bankA = (await admin.post("/accounts", { bank: "ธนาคารเอ", number: "1", holder: "x", label: "หลัก", shows: "net" })).json.id;
    bankB = (await admin.post("/accounts", { bank: "ธนาคารบี", number: "2", holder: "x", label: "รอง", shows: "collect" })).json.id;
    const mk = async (k: string, body: object) => (ids[k] = (await admin.post("/ledger/rows", { year: y, ownerName: `ลูกค้า ${k}`, ...body })).json.row.id);
    await mk("A", { plate: "A", monthlyFee: 120000 });
    await mk("B", { plate: "B", monthlyFee: 150000 });
    await mk("S", { plate: "คลัง", monthlyFee: 300000, slotId: "K01", startMonth: 2 });
    await mk("X", { plate: "X", monthlyFee: 120000, kind: "excluded" });
    await mk("I", { plate: "I", monthlyFee: 120000 });
    await admin.patch(`/ledger/rows/${ids.I}`, { isActive: false });
    await admin.patch(`/ledger/rows/${ids.B}`, { monthlyFee: 180000, feeFrom: 4 }); // from April: 1,800
    for (let m = 1; m <= upto; m++) await pay(ids.A, m, 120000, "cash");
    for (let m = 1; m <= upto; m++) {
      const fee = m >= 4 ? 180000 : 150000;
      await pay(ids.B, m, m === upto && m >= 4 ? Math.round(fee / 2) : fee, m % 2 ? "transfer" : "cash", m % 2 ? (m % 3 ? bankA : bankB) : null);
    }
    if (upto >= 2) await pay(ids.S, 2, 300000, "transfer", bankB);
    await pay(ids.X, 1, 120000, "cash");
    data = (await admin.get("/data")).json;
  });

  const rows = () => data.years.find((x: any) => x.year === y).rows as any[];
  const priceB = (m: number) => (m >= 4 ? 180000 : 150000);

  it("income is the sum of the payments of the counted rows, month by month and in total", () => {
    const calc = calcAll(data.years).find((c) => c.year === y)!;
    for (let m = 1; m <= 12; m++) {
      const expected = rows().filter((r) => r.kind === "normal").reduce((n, r) => n + (r.payments[m - 1] ?? 0), 0);
      expect(calc.months[m - 1].income, `month ${m}`).toBe(expected);
    }
    expect(calc.totals.income).toBe(calc.months.reduce((n, m) => n + m.income, 0));
    // the excluded row's January money is not in the income
    expect(rows().find((r) => r.id === ids.X).payments[0]).toBe(120000);
  });

  it("what is owed matches a plain recount: own price per month, yearly shed from its month, no inactive or excluded rows", () => {
    const L = 2;
    const found = findUnpaid(rows(), y, M, L).map((u) => `${u.row.id}:${u.month}:${u.due}`).sort();
    const expected: string[] = [];
    const owed = (id: number, fee: (m: number) => number, from: number, yearly = false) => {
      const r = rows().find((x) => x.id === id);
      for (let m = yearly ? from : Math.max(1, M - L); m <= M; m++) {
        if (m < from) continue;
        const f = yearly ? (m === from ? fee(m) : 0) : fee(m);
        const paid = r.payments[m - 1] ?? 0;
        if (f > 0 && paid < f) expected.push(`${id}:${m}:${f - paid}`);
      }
    };
    owed(ids.A, () => 120000, 1);
    owed(ids.B, priceB, 1);
    owed(ids.S, () => 300000, 2, true);
    expect(found).toEqual(expected.sort());
  });

  it("rent totals add the monthly fees and the yearly fee separately (nothing is averaged)", () => {
    const active = rows().filter((r) => r.isActive && r.kind !== "excluded");
    const t = rentTotals(active, data.today);
    const bNow = priceB(Math.max(1, Math.min(M, 12)));
    expect(t.monthly).toBe(120000 + bNow);
    expect(t.yearly).toBe(300000);
  });

  it("the report splits cash and transfer exactly as the payments were recorded", async () => {
    const res = await admin.req("GET", `/report?mode=months&from=${y}-1&to=${y}-${M}`);
    expect(res.status).toBe(200);
    let cash = 0;
    let transfer = 0;
    for (const r of rows().filter((x) => x.kind !== "excluded")) {
      r.payments.forEach((v: number | null, i: number) => {
        if (v == null || v <= 0 || i + 1 > M) return;
        if (r.payMethods[i] === "transfer") transfer += v;
        else cash += v;
      });
    }
    const m = /เงินสด <b>([\d,.]+)<\/b> บาท · โอนเข้าบัญชี <b>([\d,.]+)<\/b>/.exec(res.text);
    expect(m, "split line present").toBeTruthy();
    expect(m![1]).toBe(formatBaht(cash));
    expect(m![2]).toBe(formatBaht(transfer));
    if (transfer > 0) expect(res.text).toContain("ธนาคาร");
  });
});
