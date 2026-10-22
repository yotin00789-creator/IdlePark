// Where a vehicle goes: which slot (or motorcycle bay) and zone, and whether that is allowed.
// One place for every rule so the ledger form, the add-customer form and the 3D map agree.
import { baysIn, bayGrid, isMotorcycle, isSlotId, isStorageSlot, slotLabel } from "../shared/lot.js";
import type { Queryable } from "./db.js";
import { HttpError } from "./http.js";
import { loadStorage } from "./storage.js";

export interface PlacementInput {
  year: number;
  rowId: number | null; // the row being changed (it never blocks itself)
  vehicleType: string | null;
  zoneId: number | null;
  slotId: string | null;
  bay: number | null;
  startMonth: number;
  endMonth: number | null;
  counts: boolean; // active and normal: only these occupy a slot
  cur?: { slot_id: string | null; zone_id: number | null; bay: number | null; vehicle_type: string | null } | null;
}
export interface Placement {
  slot_id: string | null;
  zone_id: number | null;
  bay: number | null;
}

const OVERLAP = "start_month <= $5 and coalesce(end_month, 12) >= $4";

export async function resolvePlacement(q: Queryable, p: PlacementInput): Promise<Placement> {
  const zones = await q.query("select id, name, is_active, slot_ids, moto_capacity, kind, access from zones");
  await loadStorage(q);
  const zoneOfSlot = (slot: string) => zones.find((z) => (z.slot_ids as string[]).includes(slot));
  const moto = isMotorcycle(p.vehicleType);

  const slot = p.slotId;
  let zone = p.zoneId != null ? zones.find((z) => z.id === p.zoneId) : undefined;
  if (p.zoneId != null && !zone) throw new HttpError(400, "ไม่พบโซนที่เลือก");

  if (slot && !isSlotId(slot)) throw new HttpError(400, "ช่องจอดไม่ถูกต้อง");
  if (slot) {
    const owner = zoneOfSlot(slot);
    if (owner) zone = owner; // the slot decides the zone: a vehicle may be put in any slot, it simply belongs to that slot's zone
  }

  // ---- motorcycles: a zone with a motorcycle quota, a free bay in one of its slots
  if (moto) {
    if (!zone) throw new HttpError(400, "มอเตอร์ไซค์ต้องเลือกโซนมอเตอร์ไซค์");
    if (zone.moto_capacity <= 0) throw new HttpError(409, `โซน “${zone.name}” ไม่ได้กำหนดให้จอดมอเตอร์ไซค์`);
    const sameSpot = p.cur && p.cur.zone_id === zone.id && p.cur.vehicle_type === p.vehicleType && p.cur.slot_id === (slot ?? p.cur.slot_id);
    if (!zone.is_active && !sameSpot) throw new HttpError(409, `โซน “${zone.name}” ปิดใช้งานอยู่`);
    if (!p.counts) return { slot_id: slot ?? p.cur?.slot_id ?? null, zone_id: zone.id, bay: p.bay ?? p.cur?.bay ?? null };
    const mine = await q.query(
      `select id, slot_id, bay from ledger_rows
        where year = $1 and zone_id = $2 and vehicle_type = 'motorcycle' and is_active and id <> $3 and ${OVERLAP}`,
      [p.year, zone.id, p.rowId ?? 0, p.startMonth, p.endMonth ?? 12],
    );
    if (mine.length >= zone.moto_capacity) throw new HttpError(409, `โซน “${zone.name}” จอดมอเตอร์ไซค์เต็มแล้ว (${zone.moto_capacity} คัน)`);
    const used = new Set(mine.map((r) => `${r.slot_id}#${r.bay}`));
    const slots = (zone.slot_ids as string[]).filter((id) => bayGrid(id).count > 0);
    const wanted = slot ? [slot] : slots;
    for (const id of wanted) {
      if (!slots.includes(id)) throw new HttpError(409, `${slotLabel(id)} ไม่ได้อยู่ในโซน “${zone.name}”`);
      const n = bayGrid(id).count;
      if (p.bay != null && slot) {
        if (p.bay < 0 || p.bay >= n) throw new HttpError(400, "ตำแหน่งจอดมอเตอร์ไซค์ไม่ถูกต้อง");
        if (used.has(`${id}#${p.bay}`)) throw new HttpError(409, `ตำแหน่งจอดที่ ${p.bay + 1} ในช่อง ${id} มีมอเตอร์ไซค์อยู่แล้ว`);
        return { slot_id: id, zone_id: zone.id, bay: p.bay };
      }
      for (let b = 0; b < n; b++) if (!used.has(`${id}#${b}`)) return { slot_id: id, zone_id: zone.id, bay: b };
    }
    throw new HttpError(409, `โซน “${zone.name}” ไม่มีที่ว่างสำหรับมอเตอร์ไซค์`);
  }

  // ---- a storage shed holds no vehicle, and a parking space is not rented as a shed
  if (slot && isStorageSlot(slot) && p.vehicleType) throw new HttpError(409, `${slotLabel(slot)} เป็นคลังเก็บของ จอดรถไม่ได้ เลือกช่องที่เป็นที่จอดรถ`);

  // ---- everything else (cars, storage): a whole slot, never in a motorcycle zone
  if (zone && zone.moto_capacity > 0) throw new HttpError(409, `โซน “${zone.name}” เป็นโซนมอเตอร์ไซค์ ใส่รถอื่นไม่ได้`);
  if (!slot) return { slot_id: null, zone_id: zone?.id ?? null, bay: null };
  const unchanged = p.cur?.slot_id === slot;
  if (zone && !zone.is_active && !unchanged) throw new HttpError(409, `โซน “${zone.name}” ปิดใช้งานอยู่ เลือกช่องในโซนนี้ไม่ได้`);
  if (p.counts) {
    const [clash] = await q.query(
      `select owner_name, plate from ledger_rows
        where year = $1 and slot_id = $2 and is_active and id <> $3 and ${OVERLAP} limit 1`,
      [p.year, slot, p.rowId ?? 0, p.startMonth, p.endMonth ?? 12],
    );
    if (clash) throw new HttpError(409, `${isStorageSlot(slot) ? slotLabel(slot) : `ช่อง ${slot}`} มี ${clash.owner_name}${clash.plate ? ` (${clash.plate})` : ""} อยู่แล้ว`);
  }
  return { slot_id: slot, zone_id: zone?.id ?? null, bay: null };
}

/** Used by the zone editor: what a zone could hold. */
export const motoRoom = (slotIds: string[]) => baysIn(slotIds);
