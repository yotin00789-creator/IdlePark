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

  it("ending a customer's rent takes their car off the map and frees the slot; coming back needs the slot free", async () => {
    const made = (await admin.post("/customers", { name: "ลูกค้าเลิกเช่า", year: y, vehicles: [{ plate: "END 1", slotId: "W03", vehicleType: "suv", monthlyFee: 120000 }] })).json;
    const onMap = async () => {
      const d = await data();
      return d.years.find((x: any) => x.year === y).rows.filter((r: any) => r.isActive && r.kind === "normal" && r.slotId === "W03");
    };
    expect(await onMap()).toHaveLength(1);
    expect((await admin.patch(`/customers/${made.customer.id}`, { isActive: false })).status).toBe(200);
    expect(await onMap()).toHaveLength(0);
    // the slot is free for someone else straight away
    expect((await admin.post("/ledger/rows", { year: y, ownerName: "คนใหม่", plate: "NEW 1", slotId: "W03" })).status).toBe(200);
    // the earlier customer can no longer silently take it back
    expect((await admin.patch(`/customers/${made.customer.id}`, { isActive: true })).status).toBe(409);
  });

  it("taking a car off the 3D map keeps the ledger row, its payments and the customer", async () => {
    const made = (await admin.post("/customers", { name: "ออกจากผัง", year: y, vehicles: [{ plate: "OFF 1", slotId: "W04", vehicleType: "sedan", monthlyFee: 120000 }] })).json;
    const row = made.rows[0];
    await admin.put("/ledger/payments", { changes: [{ rowId: row.id, month: 1, amount: 120000 }] });
    const res = await admin.post(`/ledger/rows/${row.id}/unplace`, {});
    expect(res.status).toBe(200);
    const d = await data();
    const after = d.years.find((x: any) => x.year === y).rows.find((r: any) => r.id === row.id);
    expect(after).toMatchObject({ slotId: null, plate: "OFF 1", ownerName: "ออกจากผัง", isActive: true, customerId: made.customer.id });
    expect(after.payments[0]).toBe(120000);
    // the slot is free again, and the car can be put back
    expect((await admin.patch(`/ledger/rows/${row.id}`, { slotId: "W04" })).status).toBe(200);
  });

  it("a Private zone is not rented: its vehicles cost nothing and take no payment; paid ones cannot be moved in", async () => {
    const pz = (await admin.post("/zones", { name: "ส่วนตัวทดสอบ", access: "private", slotIds: ["C01", "C02"] })).json.id;
    const made = (await admin.post("/customers", { name: "ในช่องส่วนตัว", year: y, vehicles: [{ plate: "PRV 1", slotId: "C01", vehicleType: "sedan", monthlyFee: 120000 }] })).json;
    expect(made.rows[0]).toMatchObject({ isOwner: true, monthlyFee: 0, zoneId: pz });
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: made.rows[0].id, month: 1, amount: 120000 }] })).status).toBe(400);
    // a tenant who already pays cannot be put there (their payments would drop out of the totals)
    const payer = (await admin.post("/customers", { name: "คนจ่ายเงิน", year: y, vehicles: [{ plate: "PAY 1", slotId: "E01", vehicleType: "sedan", monthlyFee: 120000 }] })).json.rows[0];
    await admin.put("/ledger/payments", { changes: [{ rowId: payer.id, month: 1, amount: 120000 }] });
    expect((await admin.patch(`/ledger/rows/${payer.id}`, { slotId: "C02" })).status).toBe(409);
    // the zone becoming public makes the vehicle a paying one with the default price
    expect((await admin.patch(`/zones/${pz}`, { access: "public" })).status).toBe(200);
    const after = (await data()).years.find((x: any) => x.year === y).rows.find((r: any) => r.id === made.rows[0].id);
    expect(after).toMatchObject({ isOwner: false });
    expect(after.monthlyFee).toBeGreaterThan(0);
  });
});
