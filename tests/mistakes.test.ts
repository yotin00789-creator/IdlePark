import { beforeAll, describe, expect, it } from "vitest";
import { Client, acceptInvite, freshApp, setupAdmin } from "./helpers.js";
import { getDb } from "../server/db.js";

// A car added by mistake (3D map or ledger) can be corrected: renamed, moved, taken off the map, deleted and un-deleted.
describe("fixing a vehicle that was added wrongly", () => {
  let admin: Client;
  let editor: Client;
  const year = new Date().getFullYear() + 543;
  const data = async () => (await admin.get("/data")).json;
  const row = async (id: number) => (await data()).years.find((y: any) => y.year === year).rows.find((r: any) => r.id === id);
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
    await admin.post("/users", { email: "ed@example.com", firstName: "ผู้แก้", role: "editor" });
    editor = new Client();
    await acceptInvite(editor, "ed@example.com");
  });

  it("fixing a typo in the name moves the vehicle to the right customer and removes the empty typo customer", async () => {
    const made = (await editor.post("/ledger/rows", { year, ownerName: "สมชาย ใจดีี", plate: "1กก 1", slotId: "N01", vehicleType: "sedan" })).json.row;
    const typoCustomer = made.customerId;
    const fix = await editor.patch(`/ledger/rows/${made.id}`, { ownerName: "สมชาย ใจดี" });
    expect(fix.status).toBe(200);
    const r = await row(made.id);
    expect(r.ownerName).toBe("สมชาย ใจดี");
    expect(r.customerId).not.toBe(typoCustomer);
    const customers = (await data()).customers;
    expect(customers.find((c: any) => c.id === typoCustomer)).toBeUndefined(); // the typo customer is gone
    expect(customers.find((c: any) => c.id === r.customerId).name).toBe("สมชาย ใจดี");
    // the 3D card reads the customer through the row, so it shows the fixed name
    expect(r.slotId).toBe("N01");
  });

  it("a customer who has contact details is never deleted by a rename", async () => {
    const made = (await admin.post("/ledger/rows", { year, ownerName: "มีเบอร์", plate: "2ขข 2" })).json.row;
    await admin.patch(`/customers/${made.customerId}`, { name: "มีเบอร์", phone: "0800000000" });
    await admin.patch(`/ledger/rows/${made.id}`, { ownerName: "คนอื่น" });
    expect((await data()).customers.some((c: any) => c.id === made.customerId)).toBe(true);
  });

  it("the vehicle can be moved to another slot, or taken off the map without losing its payments", async () => {
    const made = (await admin.post("/ledger/rows", { year, ownerName: "ย้ายช่อง", plate: "3คค 3", slotId: "N02", vehicleType: "suv" })).json.row;
    await admin.put("/ledger/payments", { changes: [{ rowId: made.id, month: 1, amount: 120000 }] });
    expect((await admin.patch(`/ledger/rows/${made.id}`, { slotId: "N03" })).json.row.slotId).toBe("N03");
    expect((await admin.patch(`/ledger/rows/${made.id}`, { slotId: null, vehicleType: null })).json.row).toMatchObject({ slotId: null, vehicleType: null });
    expect((await row(made.id)).payments[0]).toBe(120000);
  });

  it("an editor can undo their own delete right away, but not somebody else's", async () => {
    const made = (await editor.post("/ledger/rows", { year, ownerName: "ลบผิด", plate: "4งง 4" })).json.row;
    const del = await editor.del(`/ledger/rows/${made.id}`);
    expect(del.json.auditId).toBeTruthy();
    const undo = await editor.post(`/audit/${del.json.auditId}/restore`, {});
    expect(undo.status).toBe(200);
    expect((await row(made.id)).ownerName).toBe("ลบผิด");

    const other = (await admin.post("/ledger/rows", { year, ownerName: "ของแอดมิน", plate: "5จจ 5" })).json.row;
    const adminDel = await admin.del(`/ledger/rows/${other.id}`);
    expect((await editor.post(`/audit/${adminDel.json.auditId}/restore`, {})).status).toBe(403);
    // an editor's own delete that is older than 30 minutes needs an admin
    const old = await editor.del(`/ledger/rows/${made.id}`);
    const db = await getDb();
    await db.query("update audit_log set at = now() - interval '2 hours' where id = $1", [old.json.auditId]);
    expect((await editor.post(`/audit/${old.json.auditId}/restore`, {})).status).toBe(403);
    expect((await admin.post(`/audit/${old.json.auditId}/restore`, {})).status).toBe(200);
  });

  it("a customer with several vehicles chooses which one parks where: place one, or swap two", async () => {
    const a = (await admin.post("/ledger/rows", { year, ownerName: "สองคัน", plate: "ก 1", slotId: "E01", vehicleType: "sedan" })).json.row;
    const b = (await admin.post("/ledger/rows", { year, ownerName: "สองคัน", customerId: a.customerId, plate: "ข 2", vehicleType: "suv" })).json.row;
    expect(b.slotId).toBeNull();
    // plain move into a taken slot is refused ...
    expect((await admin.patch(`/ledger/rows/${b.id}`, { slotId: "E01" })).status).toBe(409);
    // ... but "swap" puts the other vehicle in, and the one that was there steps out (no old slot to go to: it is left unplaced)
    const sw = await admin.patch(`/ledger/rows/${b.id}`, { slotId: "E01", swap: true });
    expect(sw.status).toBe(200);
    expect(sw.json.row.slotId).toBe("E01");
    expect((await row(a.id)).slotId).toBeNull();
    // now both are placed: swapping again exchanges their slots
    await admin.patch(`/ledger/rows/${a.id}`, { slotId: "E02" });
    const again = await admin.patch(`/ledger/rows/${a.id}`, { slotId: "E01", swap: true });
    expect(again.status).toBe(200);
    expect([(await row(a.id)).slotId, (await row(b.id)).slotId]).toEqual(["E01", "E02"]);
    const log = (await admin.get("/audit?action=row.update")).json.entries.map((e: any) => e.summary).join("\n");
    expect(log).toContain("ย้ายไปช่อง E02");
    // a swap never reaches into another customer's vehicle
    const other = (await admin.post("/ledger/rows", { year, ownerName: "คนอื่น", plate: "ค 3", slotId: "E03", vehicleType: "sedan" })).json.row;
    expect((await admin.patch(`/ledger/rows/${a.id}`, { slotId: "E03", swap: true })).status).toBe(409);
    expect((await row(other.id)).slotId).toBe("E03");
  });

  it("adding the same car twice is refused (it would start with no payments); a new car starts this month, not in January", async () => {
    const existing = (await admin.post("/ledger/rows", { year, ownerName: "มีอยู่แล้ว", plate: "9ผผ 99" })).json.row;
    await admin.put("/ledger/payments", { changes: [{ rowId: existing.id, month: 1, amount: 120000 }] });
    const dup = await admin.post("/ledger/rows", { year, ownerName: "มีอยู่แล้ว", plate: "9ผผ  99", slotId: "H01", vehicleType: "sedan" });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toContain("มีอยู่แล้วในสมุดรายรับ");
    expect((await data()).years.find((y: any) => y.year === year).rows.filter((r: any) => r.plate.replace(/\s/g, "") === "9ผผ99")).toHaveLength(1);
    // the way to put the existing car on the map keeps its payments
    const placed = await admin.patch(`/ledger/rows/${existing.id}`, { slotId: "H01", vehicleType: "sedan" });
    expect(placed.json.row.slotId).toBe("H01");
    expect((await row(existing.id)).payments[0]).toBe(120000);
    // the storage shed uses a label instead of a plate and is exempt
    expect((await admin.post("/ledger/rows", { year, ownerName: "คลังหนึ่ง", plate: "คลังเก็บของ", slotId: "K01", monthlyFee: 100000 })).status).toBe(200);
  });

  it("a vehicle can be put in any slot, whatever zone it was in: the slot's zone wins; only a taken slot or a repeated plate is refused", async () => {
    const za = (await admin.post("/zones", { name: "โซนเอ", slotIds: ["S01"] })).json.id;
    const zb = (await admin.post("/zones", { name: "โซนบี", slotIds: ["S02"] })).json.id;
    const car = (await admin.post("/ledger/rows", { year, ownerName: "ข้ามโซน", plate: "Z 1", slotId: "S01", vehicleType: "sedan" })).json.row;
    expect(car.zoneId).toBe(za);
    const moved = await admin.patch(`/ledger/rows/${car.id}`, { slotId: "S02" });
    expect(moved.status).toBe(200);
    expect(moved.json.row).toMatchObject({ slotId: "S02", zoneId: zb });
    // a row that already carries another zone is not refused either
    const other = (await admin.post("/ledger/rows", { year, ownerName: "มีโซนเดิม", plate: "Z 2", zoneId: za })).json.row;
    const put = await admin.patch(`/ledger/rows/${other.id}`, { slotId: "S03", zoneId: za });
    expect(put.status).toBe(200);
    // what is still refused: the slot is taken, the plate repeats
    expect((await admin.patch(`/ledger/rows/${other.id}`, { slotId: "S02" })).status).toBe(409);
    expect((await admin.post("/ledger/rows", { year, ownerName: "ซ้ำ", plate: "Z 1" })).status).toBe(409);
  });
});
