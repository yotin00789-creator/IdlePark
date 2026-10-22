import { beforeAll, describe, expect, it } from "vitest";
import { SLOT_IDS, VEHICLE_TYPES, slotLabel, slotNumber } from "../shared/lot.js";
import { Client, acceptInvite, freshApp, setupAdmin } from "./helpers.js";

const YEAR = 2569;
let plateSeq = 0; // every test car gets its own plate (the same plate twice in a year is refused)
const car = (over: object = {}) => ({ year: YEAR, ownerName: "ผู้เช่าทดสอบ", plate: `ท${++plateSeq} ${1000 + plateSeq}`, monthlyFee: 120000, startMonth: 1, ...over });

describe("3D lot: slots and vehicles on ledger rows", () => {
  let admin: Client;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("slot numbers match the map (N01 = 1 … H03 = 26) and every type has a colour", () => {
    expect(SLOT_IDS).toHaveLength(27);
    expect(slotNumber("N01")).toBe(1);
    expect(slotNumber("C02")).toBe(19);
    expect(slotNumber("H03")).toBe(26);
    expect(slotNumber("K01")).toBe(27);
    expect(slotLabel("K01")).toBe("คลังเก็บของ");
    expect(slotLabel("N03")).toBe("ช่อง 3");
    expect(slotNumber("ZZ9")).toBe(0);
    expect(VEHICLE_TYPES.every((t) => /^#[0-9a-f]{6}$/i.test(t.defaultColor))).toBe(true);
  });

  it("saves slot, vehicle type, colour and province and returns them in /data", async () => {
    const r = await admin.post("/ledger/rows", car({ slotId: "N01", vehicleType: "suv", carColor: "#2c5fa8", plateProvince: "นนทบุรี" }));
    expect(r.status).toBe(200);
    expect(r.json.row).toMatchObject({ slotId: "N01", vehicleType: "suv", carColor: "#2c5fa8", plateProvince: "นนทบุรี" });
    const rows = (await admin.get("/data")).json.years.find((y: any) => y.year === YEAR).rows;
    expect(rows.find((x: any) => x.id === r.json.row.id)).toMatchObject({ slotId: "N01", vehicleType: "suv" });
    const log = (await admin.get("/audit?limit=5")).json;
    expect(JSON.stringify(log)).toContain("N01");
  });

  it("refuses an unknown slot, type or colour", async () => {
    expect((await admin.post("/ledger/rows", car({ slotId: "X99" }))).status).toBe(400);
    expect((await admin.post("/ledger/rows", car({ vehicleType: "tank" }))).status).toBe(400);
    expect((await admin.post("/ledger/rows", car({ carColor: "red" }))).status).toBe(400);
    expect((await admin.post("/ledger/rows", car({ carColor: "javascript:1" }))).status).toBe(400);
  });

  it("does not let two active cars share one slot, but allows it after the first leaves", async () => {
    const a = await admin.post("/ledger/rows", car({ ownerName: "คันแรก", slotId: "E01" }));
    expect(a.status).toBe(200);
    const clash = await admin.post("/ledger/rows", car({ ownerName: "คันที่สอง", slotId: "E01" }));
    expect(clash.status).toBe(409);
    expect(clash.json.error ?? clash.text).toContain("E01");

    const b = await admin.post("/ledger/rows", car({ ownerName: "คันที่สอง" }));
    expect((await admin.patch(`/ledger/rows/${b.json.row.id}`, { slotId: "E01" })).status).toBe(409);

    await admin.patch(`/ledger/rows/${a.json.row.id}`, { isActive: false });
    expect((await admin.patch(`/ledger/rows/${b.json.row.id}`, { slotId: "E01" })).status).toBe(200);
    // bringing the first one back must clash now
    expect((await admin.patch(`/ledger/rows/${a.json.row.id}`, { isActive: true })).status).toBe(409);
  });

  it("allows the same slot for tenants whose months do not overlap", async () => {
    const early = await admin.post("/ledger/rows", car({ ownerName: "ครึ่งแรก", slotId: "S01", startMonth: 1 }));
    await admin.patch(`/ledger/rows/${early.json.row.id}`, { endMonth: 6 });
    const late = await admin.post("/ledger/rows", car({ ownerName: "ครึ่งหลัง", slotId: "S01", startMonth: 7 }));
    expect(late.status).toBe(200);
    expect((await admin.post("/ledger/rows", car({ ownerName: "ซ้อนเดือน", slotId: "S01", startMonth: 5 }))).status).toBe(409);
  });

  it("clears a slot with null and keeps other fields when a patch omits them", async () => {
    const r = await admin.post("/ledger/rows", car({ ownerName: "ย้ายช่อง", slotId: "W01", vehicleType: "van", carColor: "#c9ced4" }));
    const id = r.json.row.id;
    const p1 = await admin.patch(`/ledger/rows/${id}`, { note: "ทดสอบ" });
    expect(p1.json.row).toMatchObject({ slotId: "W01", vehicleType: "van", carColor: "#c9ced4" });
    const p2 = await admin.patch(`/ledger/rows/${id}`, { slotId: null });
    expect(p2.json.row.slotId).toBeNull();
    expect(p2.json.row.vehicleType).toBe("van");
  });

  it("copying a year carries the slot and vehicle to the new year", async () => {
    const c = await admin.post("/ledger/years/2570/copy-previous");
    expect(c.status).toBe(200);
    const rows = (await admin.get("/data")).json.years.find((y: any) => y.year === 2570).rows;
    expect(rows.find((x: any) => x.slotId === "N01")).toMatchObject({ vehicleType: "suv", carColor: "#2c5fa8", plateProvince: "นนทบุรี" });
  });

  it("customers can be created with a slot, and a viewer cannot change slots", async () => {
    const r = await admin.post("/customers", { name: "ลูกค้าผัง", year: YEAR, vehicles: [{ plate: "9ขค 9999", slotId: "H01", vehicleType: "ev" }] });
    expect(r.status).toBe(200);
    expect(r.json.rows[0]).toMatchObject({ slotId: "H01", vehicleType: "ev" });
    expect((await admin.post("/customers", { name: "ลูกค้าซ้ำช่อง", year: YEAR, vehicles: [{ plate: "1", slotId: "H01" }] })).status).toBe(409);

    await admin.post("/users", { email: "view@example.com", firstName: "ดู", role: "viewer" });
    const v = new Client();
    await acceptInvite(v, "view@example.com");
    expect((await v.patch(`/ledger/rows/${r.json.rows[0].id}`, { slotId: "H02" })).status).toBe(403);
  });

  it("the storage shed (K01) is rented like a slot: one tenant at a time, no vehicle needed", async () => {
    const a = await admin.post("/ledger/rows", car({ ownerName: "ผู้เช่าคลัง", plate: "คลังเก็บของ", slotId: "K01", monthlyFee: 300000 }));
    expect(a.status).toBe(200);
    expect(a.json.row).toMatchObject({ slotId: "K01", vehicleType: null, monthlyFee: 300000 });
    expect((await admin.post("/ledger/rows", car({ ownerName: "ผู้เช่าคลังคนที่สอง", plate: "", slotId: "K01" }))).status).toBe(409);
    const rows = (await admin.get("/data")).json.years.find((y: any) => y.year === YEAR).rows;
    expect(rows.filter((r: any) => r.slotId === "K01")).toHaveLength(1);
  });
});
