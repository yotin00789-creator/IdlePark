import { beforeAll, describe, expect, it } from "vitest";
import { calcAll, findUnpaid } from "../shared/calc.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

describe("ticking a renter as 'not counted in the books'", () => {
  let admin: Client;
  const y = bangkokToday().year;
  const data = async () => (await admin.get("/data")).json;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("the collection cells keep working, but the money leaves the totals and the reminders; unticking brings it back", async () => {
    const a = (await admin.post("/ledger/rows", { year: y, ownerName: "นับในบัญชี", plate: "EXC 1", monthlyFee: 120000, startMonth: 1 })).json.row;
    const b = (await admin.post("/ledger/rows", { year: y, ownerName: "ไม่นับ", plate: "EXC 2", monthlyFee: 120000, startMonth: 1 })).json.row;
    await admin.put("/ledger/payments", { changes: [{ rowId: a.id, month: 1, amount: 120000 }, { rowId: b.id, month: 1, amount: 120000 }] });
    const income = async () => calcAll((await data()).years).find((c) => c.year === y)!.totals.income;
    expect(await income()).toBe(240000);

    expect((await admin.patch(`/ledger/rows/${b.id}`, { kind: "excluded" })).status).toBe(200);
    expect(await income()).toBe(120000);
    // the cells of an ignored renter still take money
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: b.id, month: 2, amount: 120000 }] })).status).toBe(200);
    expect(await income()).toBe(120000);
    const row = (await data()).years.find((x: any) => x.year === y).rows.find((r: any) => r.id === b.id);
    expect(row.payments.slice(0, 2)).toEqual([120000, 120000]);
    expect(findUnpaid([row], y, 12, 12)).toEqual([]); // nobody is chased for it

    expect((await admin.patch(`/ledger/rows/${b.id}`, { kind: "normal" })).status).toBe(200);
    expect(await income()).toBe(360000);
  });
});
