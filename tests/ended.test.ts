import { beforeAll, describe, expect, it } from "vitest";
import { calcAll, findUnpaid } from "../shared/calc.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

describe("a tenant who stops renting, and comes back", () => {
  let admin: Client;
  const { year: y, month } = bangkokToday();
  const data = async () => (await admin.get("/data")).json;
  const rowOf = async (id: number) => (await data()).years.find((x: any) => x.year === y).rows.find((r: any) => r.id === id);
  const income = async () => calcAll((await data()).years).find((c) => c.year === y)!.totals.income;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("ending the rent keeps everything but frees the slot and stops the chasing; resuming needs the slot free", async () => {
    const made = (await admin.post("/customers", { name: "ผู้เช่าเดิม", year: y, vehicles: [{ plate: "END 7", slotId: "N02", vehicleType: "sedan", monthlyFee: 120000, startMonth: 1 }] })).json;
    const id = made.rows[0].id;
    await admin.put("/ledger/payments", { changes: [{ rowId: id, month: 1, amount: 120000 }, { rowId: id, month: 2, amount: 120000 }] });
    const before = await income();

    // end it: this month is its last
    expect((await admin.patch(`/ledger/rows/${id}`, { isActive: false, endMonth: month })).status).toBe(200);
    const ended = await rowOf(id);
    expect(ended).toMatchObject({ isActive: false, plate: "END 7", customerId: made.customer.id });
    expect(ended.payments.slice(0, 2)).toEqual([120000, 120000]); // what was paid is still there
    expect(await income()).toBe(before); // and still counted in the year
    expect(findUnpaid([ended], y, month, 12)).toEqual([]); // nobody is chased for them
    expect((await data()).customers.some((c: any) => c.id === made.customer.id)).toBe(true);

    // the slot is free for someone else
    const other = (await admin.post("/customers", { name: "คนใหม่", year: y, vehicles: [{ plate: "NEW 7", slotId: "N02", vehicleType: "suv", monthlyFee: 120000 }] })).json.rows[0];
    // so coming back to the same slot is refused until it is free again
    const clash = await admin.patch(`/ledger/rows/${id}`, { isActive: true, endMonth: null });
    expect(clash.status).toBe(409);
    await admin.patch(`/ledger/rows/${other.id}`, { isActive: false, endMonth: month });
    const back = await admin.patch(`/ledger/rows/${id}`, { isActive: true, endMonth: null, startMonth: month });
    expect(back.status).toBe(200);
    expect(await rowOf(id)).toMatchObject({ isActive: true, endMonth: null, startMonth: month, slotId: "N02" });
    expect((await rowOf(id)).payments.slice(0, 2)).toEqual([120000, 120000]);
  });
});
