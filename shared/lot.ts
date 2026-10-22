// The 3D lot model: slot ids (must match public/3d/slots.json) and vehicle types.
// Pure data, shared by API and web app.

export const SLOT_IDS = [
  "N01", "N02", "N03", "N04", "N05", "N06", "N07",
  "E01", "E02", "E03", "E04", "E05",
  "S01", "S02", "S03", "S04", "S05",
  "C01", "C02",
  "W01", "W02", "W03", "W04",
  "H01", "H02", "H03",
  "K01", // the storage shed: rented like a parking space, but holds no car
] as const;
export type SlotId = (typeof SLOT_IDS)[number];

export const VEHICLE_TYPES = [
  { id: "sedan", label: "รถเก๋ง", defaultColor: "#b3262e" },
  { id: "ev", label: "รถไฟฟ้า (EV)", defaultColor: "#12a89d" },
  { id: "suv", label: "รถ SUV", defaultColor: "#37474f" },
  { id: "pickup", label: "รถกระบะ", defaultColor: "#e9e9e4" },
  { id: "pickupcage", label: "รถกระบะคอก", defaultColor: "#e7e3d7" },
  { id: "van", label: "รถตู้", defaultColor: "#c9ced4" },
  { id: "hatchback", label: "รถเล็ก 5 ประตู", defaultColor: "#e9e9e4" },
  { id: "motorcycle", label: "มอเตอร์ไซค์", defaultColor: "#c0392b" },
] as const;
export type VehicleTypeId = (typeof VEHICLE_TYPES)[number]["id"];

/**
 * The storage shed (คลังเก็บของ) is a slot without a vehicle, rented once a year. K01 is the shed that is built into
 * the model and is always storage; any other slot becomes storage when it belongs to a zone of kind "storage".
 * The set is loaded from the zones (web app: when the data loads; API: when a request reads the zones).
 */
export const STORAGE_SLOT = "K01";
let storageSlots = new Set<string>([STORAGE_SLOT]);
export const setStorageSlots = (ids: Iterable<string>) => {
  storageSlots = new Set<string>([STORAGE_SLOT, ...ids]);
};
export const getStorageSlots = (): string[] => SLOT_IDS.filter((id) => storageSlots.has(id));
export const isStorageSlot = (id: string | null | undefined) => id != null && storageSlots.has(id);
export const slotLabel = (id: string) => (id === STORAGE_SLOT ? "คลังเก็บของ" : isStorageSlot(id) ? `คลังเก็บของ (ช่อง ${slotNumber(id)})` : `ช่อง ${slotNumber(id)}`);

/** Real-world size of each vehicle model (m): length × width. Models are drawn to these sizes, never scaled. */
export const VEHICLE_SIZE: Record<string, readonly [number, number]> = {
  hatchback: [3.85, 1.68], sedan: [4.7, 1.82], ev: [4.75, 1.92], suv: [4.85, 1.95], pickup: [5.32, 1.9], pickupcage: [5.32, 1.9], van: [5.38, 1.95], motorcycle: [1.95, 0.76],
};

export const isSlotId = (v: unknown): v is SlotId => typeof v === "string" && (SLOT_IDS as readonly string[]).includes(v);
export const isVehicleType = (v: unknown): v is VehicleTypeId => VEHICLE_TYPES.some((t) => t.id === v);
export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
export const vehicleLabel = (id: string | null | undefined) => VEHICLE_TYPES.find((t) => t.id === id)?.label ?? "ไม่ระบุประเภท";

/** Slot number as drawn on the map (N01 = 1 … H03 = 26, K01 = 27). */
export const slotNumber = (id: string) => (SLOT_IDS as readonly string[]).indexOf(id) + 1;
export const CAR_COLORS = ["#e9e9e4", "#c9ced4", "#1f2933", "#b3262e", "#2c5fa8", "#12a89d", "#e0c341", "#c26a24", "#5a3d2b", "#8a1f2c", "#37474f"] as const;

// ----------------------------------------------------------------- motorcycles
export const MOTORCYCLE = "motorcycle";
export const isMotorcycle = (type: string | null | undefined) => type === MOTORCYCLE;

/** Width and length (m) of every slot; must match public/3d/slots.json. */
export const SLOT_SIZE: Record<string, readonly [number, number]> = {
  N01: [3.064, 5.6], N02: [3.064, 5.6], N03: [3.064, 5.6], N04: [3.064, 5.6], N05: [3.064, 5.6], N06: [3.064, 5.6], N07: [3.064, 5.6],
  E01: [3.198, 5.6], E02: [3.198, 5.6], E03: [3.198, 5.6], E04: [3.198, 5.6], E05: [3.198, 5.6],
  S01: [3.9, 5.6], S02: [3.9, 5.6], S03: [3.9, 5.6], S04: [3.9, 5.6], S05: [3.9, 5.6],
  C01: [3.9, 5.6], C02: [3.9, 5.6],
  W01: [2.6, 5.6], W02: [2.6, 5.6], W03: [2.6, 5.6], W04: [2.6, 5.6],
  H01: [3.9, 5.6], H02: [3.9, 5.6], H03: [3.9, 5.6],
  K01: [8.28, 2.61],
};

const BAY_W = 1.0; // a motorcycle is 0.76 m wide: this leaves a gap on both sides
const BAY_L = 2.3; // and 1.95 m long

export interface BayGrid {
  cols: number;
  rows: number;
  count: number;
}
/** How many motorcycles fit in a slot without touching. The storage shed holds none. */
export function bayGrid(slotId: string): BayGrid {
  const size = SLOT_SIZE[slotId];
  if (!size || isStorageSlot(slotId)) return { cols: 0, rows: 0, count: 0 };
  const cols = Math.max(1, Math.floor(size[0] / BAY_W));
  const rows = Math.max(1, Math.floor(size[1] / BAY_L));
  return { cols, rows, count: cols * rows };
}
export const baysIn = (slotIds: readonly string[]) => slotIds.reduce((n, id) => n + bayGrid(id).count, 0);

/** Where bay `i` is inside its slot: x across the slot, z along the heading, both from the slot centre (m). */
export function bayOffset(slotId: string, i: number) {
  const size = SLOT_SIZE[slotId];
  const g = bayGrid(slotId);
  if (!size || !g.count) return { x: 0, z: 0 };
  const col = i % g.cols;
  const row = Math.floor(i / g.cols) % g.rows;
  return { x: (col - (g.cols - 1) / 2) * (size[0] / g.cols), z: (row - (g.rows - 1) / 2) * (size[1] / g.rows) };
}

/** Allowed zone access levels. Private zones are reserved (not counted as free). */
export const ZONE_ACCESS = [
  { id: "public", label: "ทั่วไป" },
  { id: "private", label: "ส่วนตัว (Private)" },
] as const;
export type ZoneAccess = (typeof ZONE_ACCESS)[number]["id"];

/** The slots grouped the way they sit on the plan, for pickers. */
export const SLOT_GROUPS = [
  { prefix: "N", label: "แถวบน" },
  { prefix: "E", label: "แถวขวา" },
  { prefix: "S", label: "แถวล่าง" },
  { prefix: "C", label: "เฉียงมุมล่างซ้าย" },
  { prefix: "W", label: "แถวซ้าย" },
  { prefix: "H", label: "หน้าบ้าน" },
  { prefix: "K", label: "คลังเก็บของ" },
] as const;
