// Turns the ledger into what the 3D lot shows: one car per rented slot, coloured by
// this month's rent status. No new numbers here: it only reads shared/calc.
import { findUnpaid, type Unpaid } from "../../shared/calc";
import { VEHICLE_TYPES, bayGrid, isSlotId, isStorageSlot, vehicleLabel } from "../../shared/lot";
import { daysInMonth } from "../../shared/thai";
import type { LedgerRow } from "../../shared/types";
import type { AppData, Customer, Zone } from "./dataStore";
import type { CarInput, PadTone } from "@/components/lot3d/LotScene";

export type RentTone = "paid" | "pending" | "late" | "owner";

export interface LotCar {
  key: string; // slot id, or "N04#2" for a motorcycle bay
  row: LedgerRow;
  slotId: string;
  tone: RentTone;
  unpaid: Unpaid[];
  customer: Customer | null;
  typeLabel: string;
  color: string;
}

export const FALLBACK_COLOR = "#9aa3ad";

export const toneLabel: Record<PadTone, string> = {
  empty: "ว่าง",
  closed: "ปิดใช้งาน",
  private: "Private",
  paid: "ชำระแล้ว",
  pending: "รอชำระ",
  late: "ค้างชำระ",
  owner: "เจ้าของ",
};

/** What an empty slot is, from its zone: free to rent, reserved (Private) or closed. */
export type SlotStatus = "free" | "private" | "closed";
export function slotStatus(zones: Zone[], slotId: string): { status: SlotStatus; zone: Zone | null } {
  const zone = zones.find((z) => z.slotIds.includes(slotId)) ?? null;
  return { zone, status: !zone ? "free" : !zone.isActive ? "closed" : zone.access === "private" ? "private" : "free" };
}
/** One short phrase for an empty slot, so "closed" never reads as "vacant". */
export function emptyLabel(zones: Zone[], slotId: string): string {
  const { status, zone } = slotStatus(zones, slotId);
  if (status === "closed") return "ปิดใช้งาน ไม่เปิดให้เช่า";
  if (status === "private") return "Private สงวนไว้ ไม่ให้เช่า";
  return zone && zone.motoCapacity > 0 ? "โซนมอเตอร์ไซค์" : "ว่าง";
}

/** Rows that currently hold a slot: active, counted, and renting this month. */
export function rentedRows(data: AppData): LedgerRow[] {
  const { year, month } = data.today;
  const rows = data.years.find((y) => y.year === year)?.rows ?? [];
  return rows.filter((r) => r.isActive && r.kind !== "bulk" && r.startMonth <= month && (r.endMonth == null || r.endMonth >= month));
}

export function buildLotCars(data: AppData): LotCar[] {
  const { year, month, day } = data.today;
  const { dueDay, lookbackMonths } = data.settings.reminders;
  const lastDay = daysInMonth(year, month);
  const customers = new Map(data.customers.map((c) => [c.id, c]));
  const out: LotCar[] = [];
  for (const row of rentedRows(data)) {
    if (!row.slotId || !isSlotId(row.slotId)) continue;
    const unpaid = findUnpaid([row], year, month, lookbackMonths);
    const due = Math.min(row.dueDay ?? dueDay, lastDay); // each vehicle has its own due day
    const late = unpaid.some((u) => u.month < month || (u.month === month && day > due));
    const tone = row.isOwner ? "owner" : late ? "late" : unpaid.some((u) => u.month === month) ? "pending" : "paid";
    const type = VEHICLE_TYPES.find((t) => t.id === row.vehicleType);
    out.push({
      key: row.bay != null ? `${row.slotId}#${row.bay}` : row.slotId,
      row,
      slotId: row.slotId,
      tone,
      unpaid,
      customer: row.customerId != null ? (customers.get(row.customerId) ?? null) : null,
      typeLabel: isStorageSlot(row.slotId) ? "คลังเก็บของ" : vehicleLabel(row.vehicleType),
      color: row.carColor ?? type?.defaultColor ?? FALLBACK_COLOR,
    });
  }
  return out;
}

export const toCarInputs = (cars: LotCar[]): CarInput[] =>
  cars.map((c) => ({
    key: c.key,
    bay: c.row.bay,
    slotId: c.slotId,
    type: isStorageSlot(c.slotId) ? "storage" : (c.row.vehicleType ?? "sedan"), // storage holds no car model
    color: c.color,
    plate: c.row.plate,
    province: c.row.plateProvince,
    tone: c.tone,
  }));

/** Rented rows that have no slot yet (so they are not on the map). */
export const unplacedRows = (data: AppData) => rentedRows(data).filter((r) => !r.slotId);

/** The marked bays of every motorcycle zone: its slots in order, bay by bay, up to the zone's quota. */
export function motoBays(data: AppData): { slotId: string; bay: number }[] {
  const out: { slotId: string; bay: number }[] = [];
  for (const z of data.zones) {
    if (z.motoCapacity <= 0) continue;
    let left = z.motoCapacity;
    for (const slotId of z.slotIds) {
      for (let bay = 0; bay < bayGrid(slotId).count && left > 0; bay++, left--) out.push({ slotId, bay });
    }
  }
  return out;
}
