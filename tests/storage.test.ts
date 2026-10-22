import { beforeAll, describe, expect, it } from "vitest";
import { getStorageSlots, isStorageSlot } from "../shared/lot.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

describe("any slot can be a parking space or a storage shed", () => {
  let admin: Client;
  const y = bangkokToday().year;
  const data = async () => (await admin.get("/data")).json;
  const rowsOf = async () => (await data()).years.find((x: any) => x.year === y).rows as any[];
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("turning a slot into a shed moves it into a storage zone (made on first use) and updates the zones", async () => {
    await admin.post("/zones", { name: "โซนเดิม", slotIds: ["W01", "W02"] });
    const res = await admin.put("/slots/W02/kind", { kind: "storage" });
    expect(res.status).toBe(200);
    const d = await data();
    const storage = d.zones.find((z: any) => z.kind === "storage");
    expect(storage).toMatchObject({ name: "คลังเก็บของ", slotIds: ["K01", "W02"] }); // the built-in shed joins the zone too;
    expect(d.zones.find((z: any) => z.name === "โซนเดิม").slotIds).toEqual(["W01"]); // the slot left its old zone
    // a second shed joins the same storage zone
    expect((await admin.put("/slots/W03/kind", { kind: "storage" })).status).toBe(200);
    expect((await data()).zones.find((z: any) => z.kind === "storage").slotIds).toEqual(["K01", "W02", "W03"]);
  });

  it("a shed is rented yearly with no vehicle, once; cars cannot go in, and a shed is chosen by its slot", async () => {
    const made = await admin.post("/customers", { name: "เช่าคลังใหม่", year: y, vehicles: [{ slotId: "W02", monthlyFee: 300000 }] });
    expect(made.status).toBe(200);
    expect(made.json.rows[0]).toMatchObject({ slotId: "W02", billing: "yearly", vehicleType: null });
    expect(isStorageSlot("W02")).toBe(true);
    expect(getStorageSlots()).toContain("W02");
    // a second tenant for the same shed, and a car in a shed, are both refused
    expect((await admin.post("/ledger/rows", { year: y, ownerName: "คนอื่น", slotId: "W02" })).status).toBe(409);
    const car = await admin.post("/ledger/rows", { year: y, ownerName: "คนมีรถ", plate: "STO 1", slotId: "W03", vehicleType: "sedan" });
    expect(car.status).toBe(409);
    expect(car.json.error).toContain("คลังเก็บของ");
    // the other shed is free for another renter
    expect((await admin.post("/ledger/rows", { year: y, ownerName: "คนคลังสอง", slotId: "W03" })).status).toBe(200);
  });

  it("a shed with a renter cannot go back to parking, and a slot with a car cannot become a shed", async () => {
    expect((await admin.put("/slots/W02/kind", { kind: "parking" })).status).toBe(409);
    await admin.post("/ledger/rows", { year: y, ownerName: "คนจอดรถ", plate: "STO 2", slotId: "N02", vehicleType: "suv" });
    expect((await admin.put("/slots/N02/kind", { kind: "storage" })).status).toBe(409);
    // the built-in shed is always storage
    expect((await admin.put("/slots/K01/kind", { kind: "parking" })).status).toBe(409);
    // once the renter is gone the slot is a parking space again
    const rows = await rowsOf();
    const tenant = rows.find((r: any) => r.slotId === "W02");
    await admin.del(`/ledger/rows/${tenant.id}`);
    expect((await admin.put("/slots/W02/kind", { kind: "parking" })).status).toBe(200);
    expect((await data()).zones.find((z: any) => z.kind === "storage").slotIds).toEqual(["K01", "W03"]);
    expect((await admin.post("/ledger/rows", { year: y, ownerName: "รถใหม่", plate: "STO 3", slotId: "W02", vehicleType: "sedan" })).status).toBe(200);
  });

  it("the zone editor can make a zone a storage zone, with the same checks", async () => {
    const z = (await admin.post("/zones", { name: "คลังชุดสอง", kind: "storage", slotIds: ["E05"] })).json.id;
    expect(isStorageSlot("E05")).toBe(true);
    expect((await data()).zones.find((x: any) => x.id === z)).toMatchObject({ kind: "storage", access: "public", motoCapacity: 0 });
    // a slot that holds a car cannot join a storage zone
    expect((await admin.patch(`/zones/${z}`, { slotIds: ["E05", "N02"] })).status).toBe(409);
  });
});
