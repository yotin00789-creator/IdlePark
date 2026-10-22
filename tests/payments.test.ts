import { beforeAll, describe, expect, it } from "vitest";
import { Client, freshApp, setupAdmin } from "./helpers.js";
import { getDb } from "../server/db.js";

// Every field a person can set must come back from the database exactly as it went in.
describe("payment method and a full round trip of every ledger field", () => {
  let admin: Client;
  let accountA = 0;
  let accountB = 0;
  const year = new Date().getFullYear() + 543;
  const rows = async () => (await admin.get("/data")).json.years.find((y: any) => y.year === year).rows as any[];
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
    accountA = (await admin.post("/accounts", { bank: "ธนาคารตัวอย่าง", number: "000-0-00000-0", holder: "ผู้ทดสอบ", label: "บัญชีรับเงิน", shows: "net" })).json.id;
    accountB = (await admin.post("/accounts", { bank: "ธนาคารสอง", number: "111-1-11111-1", holder: "ผู้ทดสอบ", label: "บัญชีเก็บ", shows: "collect" })).json.id;
  });

  it("cash by default; a transfer names the account; the method stays when only the amount changes", async () => {
    const r = (await admin.post("/ledger/rows", { year, ownerName: "จ่ายหลายแบบ", plate: "1กก 1", monthlyFee: 120000 })).json.row;
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 1, amount: 120000 }] })).status).toBe(200);
    let row = (await rows()).find((x) => x.id === r.id);
    expect([row.payMethods[0], row.payAccounts[0]]).toEqual(["cash", null]);

    await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 2, amount: 120000, method: "transfer", accountId: accountB }] });
    row = (await rows()).find((x) => x.id === r.id);
    expect([row.payMethods[1], row.payAccounts[1]]).toEqual(["transfer", accountB]);

    // only the amount changes: still a transfer into the same account
    await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 2, amount: 100000 }] });
    row = (await rows()).find((x) => x.id === r.id);
    expect([row.payments[1], row.payMethods[1], row.payAccounts[1]]).toEqual([100000, "transfer", accountB]);

    // only the method changes (same amount): recorded, and audited with the account name
    const flip = await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 2, amount: 100000, method: "cash" }] });
    expect(flip.json.changed).toBe(1);
    row = (await rows()).find((x) => x.id === r.id);
    expect([row.payMethods[1], row.payAccounts[1]]).toEqual(["cash", null]); // cash never keeps an account
    const log = (await admin.get("/audit?action=payment")).json.entries.map((e: any) => e.summary).join("\n");
    expect(log).toContain("โอน ธนาคารสอง");
    expect(log).toContain("เงินสด");

    // clearing the money clears the method
    await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 1, amount: null }] });
    row = (await rows()).find((x) => x.id === r.id);
    expect([row.payments[0], row.payMethods[0]]).toEqual([null, null]);

    expect((await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 3, amount: 1, method: "card" }] })).status).toBe(400);
    expect((await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 3, amount: 1, method: "transfer", accountId: 99999 }] })).status).toBe(400);
  });

  it("a deleted bank account leaves the payment as a transfer without an account", async () => {
    const r = (await admin.post("/ledger/rows", { year, ownerName: "บัญชีถูกลบ", plate: "2ขข 2" })).json.row;
    await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 1, amount: 120000, method: "transfer", accountId: accountA }] });
    const db = await getDb();
    await db.query("delete from bank_accounts where id = $1", [accountA]);
    const row = (await rows()).find((x) => x.id === r.id);
    expect([row.payMethods[0], row.payAccounts[0]]).toEqual(["transfer", null]);
  });

  it("a deleted row restores with its payment methods", async () => {
    const r = (await admin.post("/ledger/rows", { year, ownerName: "กู้คืนวิธีจ่าย", plate: "3คค 3" })).json.row;
    await admin.put("/ledger/payments", { changes: [{ rowId: r.id, month: 4, amount: 120000, method: "transfer", accountId: accountB }] });
    await admin.del(`/ledger/rows/${r.id}`);
    const entry = (await admin.get("/audit?action=row.delete")).json.entries.find((e: any) => e.entityId === String(r.id));
    expect((await admin.post(`/audit/${entry.id}/restore`, {})).status).toBe(200);
    const row = (await rows()).find((x) => x.id === r.id);
    expect([row.payments[3], row.payMethods[3], row.payAccounts[3]]).toEqual([120000, "transfer", accountB]);
  });

  it("every field of a row, a customer and a zone survives the trip through the database", async () => {
    const z = (await admin.post("/zones", { name: "โซนเต็มฟิลด์", access: "private", slotIds: ["N01", "N02"], defaultFee: 150000, description: "ทดสอบ" })).json.id;
    const made = await admin.post("/ledger/rows", {
      year, ownerName: "ครบทุกฟิลด์", plate: "9ฮฮ 9", plateProvince: "เชียงใหม่", monthlyFee: 135000, slotId: "N01", zoneId: z,
      vehicleType: "suv", carColor: "#112233", dueDay: 17, startMonth: 3, note: "หมายเหตุ", kind: "normal",
    });
    expect(made.status).toBe(200);
    const id = made.json.row.id;
    await admin.patch(`/ledger/rows/${id}`, { monthlyFee: 140000, feeFrom: 6, endMonth: 11, paidThroughYear: year, paidThroughMonth: 2, needsReview: true });
    const row = (await rows()).find((x) => x.id === id);
    expect(row).toMatchObject({
      ownerName: "ครบทุกฟิลด์", plate: "9ฮฮ 9", plateProvince: "เชียงใหม่", monthlyFee: 135000, feeChanges: [{ month: 6, fee: 140000 }],
      slotId: "N01", zoneId: z, vehicleType: "suv", carColor: "#112233", dueDay: 17, startMonth: 3, endMonth: 11,
      paidThroughYear: year, paidThroughMonth: 2, note: "หมายเหตุ", kind: "normal", needsReview: true, isActive: true, bay: null,
    });
    // the very same values are in the database tables, not only in the API answer
    const db = await getDb();
    const [d] = await db.query("select * from ledger_rows where id = $1", [id]);
    expect(d).toMatchObject({ owner_name: "ครบทุกฟิลด์", plate_province: "เชียงใหม่", monthly_fee: 135000, slot_id: "N01", zone_id: z, vehicle_type: "suv", car_color: "#112233", due_day: 17, start_month: 3, end_month: 11, needs_review: true });
    expect(d.fee_changes).toEqual([{ month: 6, fee: 140000 }]);
    const zone = (await admin.get("/data")).json.zones.find((x: any) => x.id === z);
    expect(zone).toMatchObject({ name: "โซนเต็มฟิลด์", access: "private", slotIds: ["N01", "N02"], description: "ทดสอบ", isActive: true });
    // the customer made for the row is linked, and is the same person everywhere
    const cust = (await admin.get("/data")).json.customers.find((c: any) => c.id === row.customerId);
    expect(cust.name).toBe("ครบทุกฟิลด์");
    expect((await db.query("select count(*)::int as n from ledger_rows where customer_id = $1", [cust.id]))[0].n).toBe(1);
  });
});
