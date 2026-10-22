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
});
