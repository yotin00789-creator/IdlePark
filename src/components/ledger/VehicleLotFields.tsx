import { SelectField, TextField } from "@/components/app/Field";
import { cn } from "@/utils";
import { useData, type Zone } from "@/lib/dataStore";
import { CAR_COLORS, SLOT_IDS, STORAGE_SLOT, VEHICLE_TYPES, isMotorcycle, isStorageSlot, slotLabel } from "../../../shared/lot";

export interface LotFieldsValue {
  zoneId: string;
  slotId: string;
  vehicleType: string;
  carColor: string;
  plateProvince: string;
  dueDay: string; // "" = the default in settings
}

export const emptyLotFields = (): LotFieldsValue => ({ zoneId: "", slotId: "", vehicleType: "", carColor: "", plateProvince: "", dueDay: "" });

interface Props {
  value: LotFieldsValue;
  onChange: (patch: Partial<LotFieldsValue>) => void;
  year: number;
  exceptRowId?: number; // the row being edited does not block its own slot
  taken?: Map<string, string>; // slots held by other drafts in the same form
}

// Where the vehicle is parked and how it looks on the 3D map. Shared by the ledger row form and the
// add-customer form so both show the same choices, the same zone rules and the same occupancy hints.
export default function VehicleLotFields({ value, onChange, year, exceptRowId, taken }: Props) {
  const { data } = useData();
  const zones = data?.zones ?? [];
  const rows = (data?.years.find((y) => y.year === year)?.rows ?? []).filter((r) => r.isActive && r.kind !== "excluded" && r.id !== exceptRowId);
  const takenBy = new Map<string, string>(taken ?? []);
  for (const r of rows) if (r.slotId && !isMotorcycle(r.vehicleType)) takenBy.set(r.slotId, r.ownerName);

  const moto = isMotorcycle(value.vehicleType);
  const storage = isStorageSlot(value.slotId);
  const zoneOfSlot = (id: string) => zones.find((z) => z.slotIds.includes(id));
  const zone = zones.find((z) => String(z.id) === value.zoneId);
  const slotZone = value.slotId ? zoneOfSlot(value.slotId) : undefined;
  const typeDefault = VEHICLE_TYPES.find((t) => t.id === value.vehicleType)?.defaultColor ?? "#9aa3ad";

  const setType = (t: string) => {
    // switching between motorcycle and everything else resets where it is parked
    const patch: Partial<LotFieldsValue> = { vehicleType: t };
    if (isMotorcycle(t) !== moto) Object.assign(patch, { slotId: "", zoneId: "" });
    onChange(patch);
  };
  const setSlot = (id: string) => {
    const z = id ? zoneOfSlot(id) : undefined;
    onChange({ slotId: id, ...(z ? { zoneId: String(z.id) } : {}) });
  };

  const motoLeft = (z: Zone) => z.motoCapacity - rows.filter((r) => r.zoneId === z.id && isMotorcycle(r.vehicleType)).length;
  const motoZones = zones.filter((z) => z.motoCapacity > 0);
  const carZones = zones.filter((z) => z.motoCapacity === 0);

  return (
    <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <legend className="px-1.5 text-theme-sm font-semibold text-gray-800 dark:text-white/90">ตำแหน่งและรถในผัง 3 มิติ</legend>

      {!storage && (
        <SelectField label="ประเภทรถ" value={value.vehicleType} onChange={(e) => setType(e.target.value)}>
          <option value="">ยังไม่ระบุ</option>
          {VEHICLE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </SelectField>
      )}

      {storage ? null : moto ? (
        <div>
          <SelectField label="โซนมอเตอร์ไซค์" value={value.zoneId} onChange={(e) => onChange({ zoneId: e.target.value, slotId: "" })}>
            <option value="">เลือกโซน…</option>
            {motoZones.map((z) => {
              const left = motoLeft(z);
              return (
                <option key={z.id} value={z.id} disabled={!z.isActive || left <= 0}>
                  {z.name}{z.access === "private" ? " (Private)" : ""} · {z.isActive ? (left > 0 ? `ว่าง ${left} จาก ${z.motoCapacity} คัน` : "เต็ม") : "ปิดใช้งาน"}
                </option>
              );
            })}
          </SelectField>
          {motoZones.length === 0 && <p className="mt-1.5 text-theme-xs text-warning-700 dark:text-warning-400">ยังไม่มีโซนมอเตอร์ไซค์ ไปที่เมนู “โซนที่จอด” แล้วเปิด “โซนนี้ให้จอดมอเตอร์ไซค์”</p>}
          {zone && zone.motoCapacity > 0 && <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">ระบบเลือกตำแหน่งจอดที่ว่างในโซนให้เอง · ว่าง {Math.max(0, motoLeft(zone))} จาก {zone.motoCapacity} คัน</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <SelectField label="ช่องจอด / คลังเก็บของ" value={value.slotId} onChange={(e) => setSlot(e.target.value)}>
            <option value="">ยังไม่ระบุช่อง</option>
            {SLOT_IDS.filter((id) => !isStorageSlot(id)).map((id) => {
              const z = zoneOfSlot(id);
              const closed = z && !z.isActive;
              const motoZone = z && z.motoCapacity > 0;
              const blocked = takenBy.has(id) || motoZone || (closed && id !== value.slotId);
              const note = takenBy.has(id) ? ` · ${takenBy.get(id)}` : motoZone ? " · โซนมอเตอร์ไซค์" : closed ? " · โซนปิดใช้งาน" : z?.access === "private" ? " · Private" : "";
              return (
                <option key={id} value={id} disabled={Boolean(blocked)}>
                  {slotLabel(id)} ({id}){note}
                </option>
              );
            })}
          </SelectField>
          {slotZone ? (
            // the slot decides the zone, so there is nothing to pick: just say which one it is
            <p className="flex flex-wrap items-center gap-x-2 rounded-lg bg-gray-50 px-3 py-2 text-theme-sm text-gray-700 dark:bg-white/5 dark:text-gray-300">
              <span>โซน <b className="font-semibold text-gray-800 dark:text-white/90">{slotZone.name}</b></span>
              {slotZone.access === "private" && <span className="rounded-full bg-violet-50 px-2 py-px text-theme-xs font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Private</span>}
              {!slotZone.isActive && <span className="rounded-full bg-gray-200 px-2 py-px text-theme-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">ปิดใช้งาน</span>}
              <span className="text-theme-xs text-gray-500 dark:text-gray-400">ตามช่องที่เลือก เปลี่ยนที่เมนู “โซนที่จอด”</span>
            </p>
          ) : (
            <SelectField label="โซน" value={value.zoneId} onChange={(e) => onChange({ zoneId: e.target.value })} hint={value.slotId ? "ช่องนี้ยังไม่อยู่ในโซนไหน" : undefined}>
              <option value="">ไม่ระบุโซน</option>
              {carZones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.access === "private" ? " (Private)" : ""}{z.isActive ? "" : " · ปิดใช้งาน"}</option>)}
            </SelectField>
          )}
        </div>
      )}

      {storage ? (
        <p className="text-theme-xs text-gray-500 dark:text-gray-400">คลังเก็บของไม่มีรถ จึงไม่ต้องระบุประเภท สี หรือทะเบียน ค่าเช่าจ่ายปีละครั้ง</p>
      ) : (
        <>
          <TextField label="จังหวัดบนป้ายทะเบียน" value={value.plateProvince} onChange={(e) => onChange({ plateProvince: e.target.value })} placeholder="เช่น กรุงเทพมหานคร" maxLength={40} />
          <div>
            <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">สีรถ</span>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="สีรถ">
              {CAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onChange({ carColor: c })}
                  aria-label={`เลือกสี ${c}`}
                  aria-pressed={value.carColor === c}
                  className={`size-7 rounded-full border ${value.carColor === c ? "ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-gray-900" : "border-gray-300 dark:border-gray-600"}`}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={value.carColor || typeDefault} onChange={(e) => onChange({ carColor: e.target.value })} aria-label="เลือกสีอื่น" className="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5 dark:border-gray-600" />
              {value.carColor && <button type="button" onClick={() => onChange({ carColor: "" })} className="text-theme-xs text-link">ใช้สีมาตรฐาน</button>}
            </div>
          </div>
        </>
      )}
    </fieldset>
  );
}


/** "What is rented": a parking space (car / motorcycle, monthly) or the storage shed (one only, yearly). Once the shed is rented it cannot be picked again. */
export function RentKindPicker({ value, onChange, year, exceptRowId, taken }: Props) {
  const { data } = useData();
  const zones = data?.zones ?? [];
  const rows = (data?.years.find((y) => y.year === year)?.rows ?? []).filter((r) => r.isActive && r.kind !== "excluded" && r.id !== exceptRowId);
  const storageHolder = taken?.get(STORAGE_SLOT) ?? rows.find((r) => isStorageSlot(r.slotId))?.ownerName ?? "";
  const storage = isStorageSlot(value.slotId);
  const zoneOfShed = zones.find((z) => z.slotIds.includes(STORAGE_SLOT));
  return (
      <div>
        <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">สิ่งที่เช่า</span>
        <div role="radiogroup" aria-label="สิ่งที่เช่า" className="grid grid-cols-2 gap-2">
          {([[false, "ที่จอดรถ", "รถยนต์ / มอเตอร์ไซค์ · จ่ายรายเดือน"], [true, "คลังเก็บของ", storageHolder ? `มีผู้เช่าแล้ว: ${storageHolder}` : "มีคลังเดียว · จ่ายปีละครั้ง"]] as const).map(([isStorage, label, hint]) => {
            const blocked = isStorage && Boolean(storageHolder) && !storage;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={storage === isStorage}
                disabled={blocked}
                onClick={() => (isStorage ? onChange({ slotId: STORAGE_SLOT, vehicleType: "", zoneId: String(zoneOfShed?.id ?? "") }) : storage && onChange({ slotId: "", zoneId: "" }))}
                className={cn("rounded-lg border px-3 py-2.5 text-start", storage === isStorage ? "border-brand-500 bg-brand-25 dark:bg-brand-500/10" : "border-gray-200 dark:border-gray-700", blocked ? "cursor-not-allowed opacity-55" : storage !== isStorage && "hover:bg-gray-50 dark:hover:bg-white/5")}
              >
                <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
                <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>
              </button>
            );
          })}
        </div>
      </div>
  );
}

/** "Pays every day N of the month" for one vehicle; empty = the default from settings. */
export function DueDayField({ value, onChange, defaultDay }: { value: string; onChange: (v: string) => void; defaultDay: number }) {
  return (
    <SelectField label="นัดชำระทุกวันที่" value={value} onChange={(e) => onChange(e.target.value)} hint="พ้นวันนี้แล้วยังไม่จ่าย ระบบส่งอีเมลแจ้งเตือนผู้ดูแล">
      <option value="">ค่าเริ่มต้น (วันที่ {defaultDay})</option>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>วันที่ {d}</option>)}
    </SelectField>
  );
}
