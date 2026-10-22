import { beforeAll, describe, expect, it } from "vitest";
import { calcAll, findUnpaid, rentTotals } from "../shared/calc.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

describe("the owner's vehicles: on the map, no rent, nothing to chase", () => {
  let admin: Client;
  const y = bangkokToday().year;
  const data = async () => (await admin.get("/data")).json;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("an owner customer's vehicles cost nothing, are never unpaid, and take no payments", async () => {
    const made = await admin.post("/customers", { name: "เจ้าของบ้าน", isOwner: true, year: y, vehicles: [{ plate: "OWN 1", slotId: "H01", vehicleType: "sedan", monthlyFee: 120000 }, { plate: "คลังเก็บของ", slotId: "K01" }] });
    expect(made.status).toBe(200);
    expect(made.json.customer.isOwner).toBe(true);
    expect(made.json.rows.map((r: any) => [r.isOwner, r.monthlyFee])).toEqual([[true, 0], [true, 0]]);
    const d = await data();
    const rows = d.years.find((x: any) => x.year === y).rows;
    expect(findUnpaid(rows, y, bangkokToday().month, 3)).toEqual([]);
    expect(rentTotals(rows, d.today)).toEqual({ monthly: 0, yearly: 0 });
    // still on the map: the slot is taken, so nobody else can park there
    expect((await admin.post("/ledger/rows", { year: y, ownerName: "คนอื่น", plate: "X 1", slotId: "H01" })).status).toBe(409);
    // no money can be recorded on an owner's vehicle
    const res = await admin.put("/ledger/payments", { changes: [{ rowId: rows[0].id, month: 1, amount: 120000 }] });
    expect(res.status).toBe(400);
    expect(calcAll(d.years).find((c) => c.year === y)!.totals.income).toBe(0);
  });

  it("a vehicle added later for an owner is an owner's too; switching the customer back makes them pay", async () => {
    const owner = (await data()).customers.find((c: any) => c.name === "เจ้าของบ้าน");
    const more = (await admin.post("/ledger/rows", { year: y, ownerName: "เจ้าของบ้าน", customerId: owner.id, plate: "OWN 2", monthlyFee: 150000 })).json.row;
    expect(more).toMatchObject({ isOwner: true, monthlyFee: 0 });
    expect((await admin.patch(`/customers/${owner.id}`, { isOwner: false })).status).toBe(200);
    const rows = (await data()).years.find((x: any) => x.year === y).rows.filter((r: any) => r.customerId === owner.id);
    expect(rows.every((r: any) => !r.isOwner && r.monthlyFee > 0)).toBe(true);
    // and a tenant can be made an owner: their rows turn into owner rows
    await admin.patch(`/customers/${owner.id}`, { isOwner: true });
    expect((await data()).years.find((x: any) => x.year === y).rows.filter((r: any) => r.customerId === owner.id).every((r: any) => r.isOwner)).toBe(true);
  });
});
