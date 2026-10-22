import { beforeAll, describe, expect, it } from "vitest";
import { bayGrid, baysIn, bayOffset } from "../shared/lot.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

const YEAR = 2569;
const row = (over: object = {}) => ({ year: YEAR, ownerName: "ผู้เช่า", plate: "1กข 1", monthlyFee: 120000, startMonth: 1, ...over });

describe("zones, slots and motorcycles", () => {
  let admin: Client;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });
  const zoneId = async (body: object) => (await admin.post("/zones", body)).json.id as number;
  const zones = async () => (await admin.get("/data")).json.zones as any[];
  const rows = async () => (await admin.get("/data")).json.years.find((y: any) => y.year === YEAR).rows as any[];

  it("motorcycle bays: a 3.06 × 5.6 m slot holds 6 bikes, none closer than 1 m", () => {
    expect(bayGrid("N01")).toEqual({ cols: 3, rows: 2, count: 6 });
    expect(bayGrid("W01").count).toBe(4);
    expect(bayGrid("K01").count).toBe(0);
    expect(baysIn(["N01", "N02", "K01"])).toBe(12);
    const pts = Array.from({ length: 6 }, (_, i) => bayOffset("N01", i));
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
      const dx = Math.abs(pts[a].x - pts[b].x), dz = Math.abs(pts[a].z - pts[b].z);
      expect(dx >= 1.0 || dz >= 2.3).toBe(true); // a bike is 0.76 × 1.95 m: never touching
    }
  });

  it("a zone lists its slots, a slot belongs to one zone only (picking it moves it)", async () => {
    const a = await zoneId({ name: "ลานบน", slotIds: ["N01", "N02", "N03"] });
    expect((await zones()).find((z) => z.id === a)).toMatchObject({ name: "ลานบน", access: "public", slotIds: ["N01", "N02", "N03"], isActive: true });
    const moved = await zoneId({ name: "ย้ายช่อง", slotIds: ["N02"] });
    const all = await zones();
    expect(all.find((z) => z.id === moved).slotIds).toEqual(["N02"]);
    expect(all.find((z) => z.id === a).slotIds).toEqual(["N01", "N03"]); // N02 left the old zone
    expect((await admin.patch(`/zones/${a}`, { slotIds: ["N01", "N02", "N03"] })).status).toBe(200); // and back
    expect((await zones()).find((z) => z.id === moved).slotIds).toEqual([]);
    await admin.del(`/zones/${moved}`);
    expect((await admin.post("/zones", { name: "ช่องผิด", slotIds: ["Z99"] })).status).toBe(400);
    const b = await zoneId({ name: "ส่วนตัว", access: "private", slotIds: ["H01"] });
    expect((await zones()).find((z) => z.id === b).access).toBe("private");
    expect((await admin.patch(`/zones/${b}`, { access: "secret" })).status).toBe(400);
  });

  it("a car in a slot takes the slot's zone, and a closed zone refuses new cars", async () => {
    const r = await admin.post("/ledger/rows", row({ slotId: "N01", vehicleType: "sedan" }));
    expect(r.status).toBe(200);
    expect(r.json.row.zoneId).not.toBeNull();
    const zone = (await zones()).find((z) => z.slotIds.includes("N01"));
    expect(r.json.row.zoneId).toBe(zone.id);
    expect((await admin.patch(`/zones/${zone.id}`, { isActive: false })).status).toBe(200);
    expect((await admin.post("/ledger/rows", row({ ownerName: "ใหม่", slotId: "N02" }))).status).toBe(409);
    // the car already there keeps working
    expect((await admin.patch(`/ledger/rows/${r.json.row.id}`, { note: "ยังอยู่" })).status).toBe(200);
    await admin.patch(`/zones/${zone.id}`, { isActive: true });
    expect((await admin.post("/ledger/rows", row({ ownerName: "ใหม่", slotId: "N02" }))).status).toBe(200);
  });

  it("a slot cannot be taken out of a zone while someone uses it", async () => {
    const zone = (await zones()).find((z) => z.slotIds.includes("N01"));
    const res = await admin.patch(`/zones/${zone.id}`, { slotIds: ["N02", "N03"] });
    expect(res.status).toBe(409);
    expect(res.json.error ?? res.text).toContain("ช่อง");
  });

  it("motorcycle zone: capacity must fit, bikes get separate bays, full means full", async () => {
    expect((await admin.post("/zones", { name: "เกินที่", slotIds: ["N04"], motoCapacity: 7 })).status).toBe(400);
    expect((await admin.post("/zones", { name: "ไม่มีช่อง", motoCapacity: 2 })).status).toBe(400);
    const m = await zoneId({ name: "มอไซค์", slotIds: ["N04"], motoCapacity: 3 });
    const made = [];
    for (let i = 0; i < 3; i++) {
      const r = await admin.post("/ledger/rows", row({ ownerName: `มอไซค์ ${i}`, plate: `${i}มก 1`, vehicleType: "motorcycle", zoneId: m }));
      expect(r.status).toBe(200);
      made.push(r.json.row);
    }
    expect(made.map((x) => x.slotId)).toEqual(["N04", "N04", "N04"]);
    expect(new Set(made.map((x) => x.bay)).size).toBe(3);
    const full = await admin.post("/ledger/rows", row({ ownerName: "คันที่สี่", vehicleType: "motorcycle", zoneId: m }));
    expect(full.status).toBe(409);
    expect(full.json.error ?? full.text).toContain("เต็ม");
    // not a motorcycle zone / not a motorcycle
    expect((await admin.post("/ledger/rows", row({ vehicleType: "motorcycle" }))).status).toBe(400);
    expect((await admin.post("/ledger/rows", row({ vehicleType: "motorcycle", zoneId: (await zones()).find((z) => z.slotIds.includes("N02")).id }))).status).toBe(409);
    expect((await admin.post("/ledger/rows", row({ ownerName: "รถยนต์", vehicleType: "sedan", slotId: "N04" }))).status).toBe(409);
    // editing a bike keeps its bay; moving a bike out frees a place
    const before = made[1];
    const same = await admin.patch(`/ledger/rows/${before.id}`, { note: "x", slotId: before.slotId, vehicleType: "motorcycle", zoneId: m });
    expect(same.json.row.bay).toBe(before.bay);
    await admin.patch(`/ledger/rows/${before.id}`, { isActive: false });
    expect((await admin.post("/ledger/rows", row({ ownerName: "คันที่สี่", vehicleType: "motorcycle", zoneId: m }))).status).toBe(200);
    // the zone editor will not shrink below the bikes already parked
    expect((await admin.patch(`/zones/${m}`, { motoCapacity: 2 })).status).toBe(409);
    expect((await admin.patch(`/zones/${m}`, { motoCapacity: 0 })).status).toBe(409);
    expect((await rows()).filter((r) => r.zoneId === m && r.isActive)).toHaveLength(3);
  });

  it("everything the pages show comes back from the database (nothing lives only in memory)", async () => {
    const { getDb } = await import("../server/db.js");
    const db = await getDb();
    const z = await db.query("select name, access, slot_ids, moto_capacity from zones order by id");
    expect(z.length).toBeGreaterThanOrEqual(3);
    expect(z.find((x) => x.name === "ส่วนตัว")).toMatchObject({ access: "private" });
    const bikes = await db.query("select slot_id, bay from ledger_rows where vehicle_type = 'motorcycle' and is_active");
    expect(bikes.length).toBe(3);
    const audit = await db.query("select action from audit_log where action like 'zone.%' or action like 'row.%'");
    expect(audit.length).toBeGreaterThan(8);
  });

  it("a deleted row stays in the audit log with everything needed to restore it", async () => {
    const made = await admin.post("/ledger/rows", row({ ownerName: "ลบแล้วกู้", plate: "9ฮฮ 9", slotId: "N05", vehicleType: "suv" }));
    const id = made.json.row.id as number;
    const { getDb } = await import("../server/db.js");
    const db = await getDb();
    await db.query("insert into payments (row_id, month, amount) values ($1, 2, 120000) on conflict do nothing", [id]);
    expect((await admin.del(`/ledger/rows/${id}`)).status).toBe(200);
    expect(await db.query("select 1 from ledger_rows where id = $1", [id])).toHaveLength(0);
    const log = (await admin.get("/audit")).json.entries.find((e: any) => e.action === "row.delete" && e.entityId === String(id));
    expect(log).toBeTruthy();
    expect(log.restorable).toBe(true);
    // someone else takes the slot meanwhile: the row still comes back, without the slot
    await admin.post("/ledger/rows", row({ ownerName: "คนใหม่", plate: "1ใน 1", slotId: "N05", vehicleType: "sedan" }));
    const back = await admin.post(`/audit/${log.id}/restore`, {});
    expect(back.status).toBe(200);
    expect(back.json.note).toContain("ไม่ระบุช่อง");
    const r = (await rows()).find((x) => x.id === id);
    expect(r).toMatchObject({ ownerName: "ลบแล้วกู้", plate: "9ฮฮ 9", slotId: null });
    expect((await db.query("select amount from payments where row_id = $1 and month = 2", [id]))[0].amount).toBe(120000);
    expect((await admin.post(`/audit/${log.id}/restore`, {})).status).toBe(409); // not twice
    const after = (await admin.get("/audit")).json.entries;
    expect(after.find((e: any) => e.id === log.id).restorable).toBe(false);
    expect(after.some((e: any) => e.action === "row.restore")).toBe(true);
  });

  it("a deleted zone and customer can be restored too", async () => {
    const z = await zoneId({ name: "โซนชั่วคราว", slotIds: ["E05"] });
    await admin.del(`/zones/${z}`);
    const zl = (await admin.get("/audit")).json.entries.find((e: any) => e.action === "zone.delete" && e.entityId === String(z));
    expect((await admin.post(`/audit/${zl.id}/restore`, {})).status).toBe(200);
    expect((await zones()).find((x) => x.id === z).slotIds).toEqual(["E05"]);
    const c = await admin.post("/customers", { name: "ลูกค้าลบได้", phone: "0800000000" });
    const cid = c.json.id ?? c.json.customer?.id;
    expect((await admin.del(`/customers/${cid}`)).status).toBe(200);
    const cl = (await admin.get("/audit")).json.entries.find((e: any) => e.action === "customer.delete" && e.entityId === String(cid));
    expect((await admin.post(`/audit/${cl.id}/restore`, {})).status).toBe(200);
    expect((await admin.get("/data")).json.customers.some((x: any) => x.name === "ลูกค้าลบได้")).toBe(true);
  });
});
