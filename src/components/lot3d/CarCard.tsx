import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import IconButton from "@/components/app/IconButton";
import MonthStrip from "@/components/app/MonthStrip";
import { AlertGlyph, CheckGlyph, ChevronLeftGlyph, ChevronRightGlyph, ClockGlyph, PencilGlyph, PlusGlyph, UserGlyph, XMarkGlyph } from "@/icons";
import type { AppData, Customer } from "@/lib/dataStore";
import { formatBaht, monthName, monthShort } from "@/lib/format";
import { emptyLabel, toneLabel, type LotCar } from "@/lib/lot";
import { cn } from "@/utils";
import { VEHICLE_SIZE, isMotorcycle, isStorageSlot, slotLabel, vehicleLabel } from "../../../shared/lot";
import { useState } from "react";
import { currentFee, isPrepaid, isYearly } from "../../../shared/calc";
import type { LedgerRow } from "../../../shared/types";
import type { SlotDef, ViewMode } from "./LotScene";
import PlateBadge from "./PlateBadge";
import SlotHistory from "./SlotHistory";

interface CarCardProps {
  slot: SlotDef;
  car: LotCar | null;
  data: AppData;
  editable: boolean;
  unplaced: LedgerRow[];
  view: ViewMode;
  onClose: () => void;
  onView: (v: ViewMode) => void;
  onStep: (d: 1 | -1) => void;
  onPay: (car: LotCar) => void;
  onEdit: (row: LedgerRow) => void;
  onEditCustomer: (customer: Customer) => void;
  onAdd: (slotId: string, zoneId?: number) => void;
  onSelectKey: (key: string) => void;
  onAssign: (rowId: number, slotId: string, swap?: boolean) => void;
}

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: "iso", label: "มุมเฉียง" },
  { id: "plate", label: "ป้ายทะเบียน" },
  { id: "side", label: "ด้านข้าง" },
];

const TONE_STYLE = {
  paid: { box: "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500", Icon: CheckGlyph },
  pending: { box: "bg-warning-50 text-warning-800 dark:bg-warning-500/10 dark:text-warning-400", Icon: ClockGlyph },
  late: { box: "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400", Icon: AlertGlyph },
} as const;

export default function CarCard(p: CarCardProps) {
  const { slot, car, data, editable } = p;
  const { today } = data;
  const dueDay = data.settings.reminders.dueDay;
  const storage = slot.kind === "storage";

  return (
    <aside
      aria-label={car ? `รายละเอียด${slotLabel(slot.id)}` : `${slotLabel(slot.id)} (${emptyLabel(data.zones, slot.id)})`}
      className="custom-scrollbar flex max-h-full flex-col overflow-y-auto rounded-t-2xl border border-gray-200 bg-white/96 text-gray-800 shadow-theme-lg backdrop-blur md:rounded-xl dark:border-gray-700 dark:bg-gray-900/95 dark:text-white/90"
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">{slot.zone_th}</p>
          <h2 className="text-base font-semibold">
            {slotLabel(slot.id)} <span className="font-normal text-gray-500 dark:text-gray-400">({slot.id})</span>
          </h2>
        </div>
        <IconButton label="ปิดและกลับไปมุมเฉียง" onClick={p.onClose} className="-me-2 -mt-1.5">
          <XMarkGlyph />
        </IconButton>
      </header>

      {car ? (
        <div className="space-y-4 px-4 pt-3 pb-4">
          <div className="flex justify-center">
            {storage ? (
              <div className="rounded-lg border-2 border-dashed border-gray-300 px-5 py-3 text-center text-xl font-semibold dark:border-gray-600">คลังเก็บของ</div>
            ) : (
              <PlateBadge plate={car.row.plate} province={car.row.plateProvince} />
            )}
          </div>

          <div className="text-center">
            <p className="text-base font-semibold">{car.row.ownerName}</p>
            {car.customer?.phone && (
              <a href={`tel:${car.customer.phone.replace(/[^\d+]/g, "")}`} className="text-theme-sm text-link hover:text-link-hover">
                {car.customer.phone}
              </a>
            )}
          </div>

          <StatusBlock car={car} dueDay={car.row.dueDay ?? dueDay} day={today.day} month={today.month} year={today.year} />

          <div>
            <MonthStrip payments={car.row.payments} row={car.row} year={today.year} today={today} />
            <div className="mt-1 flex justify-between text-theme-xs text-gray-500 dark:text-gray-400" aria-hidden>
              <span>{monthShort(1)}</span><span>{monthShort(6)}</span><span>{monthShort(12)}</span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-theme-sm">
            <Item label={storage ? "ประเภท" : "ประเภทรถ"}>
              {storage ? (
                "คลังเก็บของ"
              ) : (
                <span className="inline-flex items-center gap-2">
                  <span className="size-3.5 rounded-full border border-gray-300 dark:border-gray-600" style={{ background: car.color }} aria-hidden />
                  {car.row.vehicleType ? car.typeLabel : "ยังไม่ระบุ"}
                  {car.row.vehicleType && VEHICLE_SIZE[car.row.vehicleType] && <span className="text-theme-xs font-normal text-gray-500 dark:text-gray-400">{VEHICLE_SIZE[car.row.vehicleType][0].toFixed(1)}×{VEHICLE_SIZE[car.row.vehicleType][1].toFixed(1)} ม.</span>}
                </span>
              )}
            </Item>
            <Item label={isYearly(car.row) ? "ค่าเช่า/ปี" : "ค่าเช่า/เดือน"}><Baht value={currentFee(car.row, today)} dash={false} /> บาท</Item>
            <Item label="นัดชำระ">ทุกวันที่ {car.row.dueDay ?? dueDay}{car.row.dueDay == null && <span className="text-theme-xs font-normal text-gray-500 dark:text-gray-400"> (ค่าเริ่มต้น)</span>}</Item>
            <Item label="เริ่มเช่า">{car.row.startMonth === 1 ? `ต้นปี ${today.year}` : `${monthName(car.row.startMonth)} ${today.year}`}</Item>
            <Item label="จ่ายล่วงหน้าถึง">
              {car.row.paidThroughYear && car.row.paidThroughMonth && isPrepaid(car.row, today.year, today.month) ? `${monthShort(car.row.paidThroughMonth)} ${car.row.paidThroughYear}` : "—"}
            </Item>
          </dl>
          {car.row.note && <p className="rounded-lg bg-gray-50 px-3 py-2 text-theme-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">{car.row.note}</p>}

          <OtherVehicles car={car} slot={slot} data={data} editable={editable} onSelectKey={p.onSelectKey} onAssign={p.onAssign} />
          <SlotHistory data={data} slotId={slot.id} />
          {!storage && <ViewButtons view={p.view} onView={p.onView} />}
          <Stepper onStep={p.onStep} />

          {editable && (
            <div className="flex gap-2">
              {car.tone !== "paid" && car.unpaid.length > 0 && (
                <Button className="flex-1" icon={<CheckGlyph />} onClick={() => p.onPay(car)}>บันทึกรับเงิน</Button>
              )}
              <Button variant="outline" className="flex-1" icon={<PencilGlyph />} onClick={() => p.onEdit(car.row)}>{storage ? "แก้ไข" : "แก้ไขรถ"}</Button>
            </div>
          )}
          {editable && <p className="text-center text-theme-xs text-gray-500 dark:text-gray-400">เพิ่มผิด? กด “{storage ? "แก้ไข" : "แก้ไขรถ"}” เพื่อเปลี่ยนช่อง ชื่อ ทะเบียน หรือลบ (ลบแล้วเลิกทำได้)</p>}
          {editable && car.customer && (
            <Button variant="ghost" className="w-full" icon={<UserGlyph />} onClick={() => p.onEditCustomer(car.customer!)}>ข้อมูลลูกค้า (ชื่อ เบอร์โทร)</Button>
          )}
        </div>
      ) : (
        <EmptySlot {...p} />
      )}
    </aside>
  );
}

function OtherVehicles({ car, slot, data, editable, onSelectKey, onAssign }: { car: LotCar; slot: SlotDef; data: AppData; editable: boolean; onSelectKey: (key: string) => void; onAssign: (rowId: number, slotId: string, swap?: boolean) => void }) {
  const cid = car.row.customerId;
  const others = cid == null ? [] : (data.years.find((y) => y.year === data.today.year)?.rows ?? []).filter((r) => r.customerId === cid && r.id !== car.row.id && r.isActive && r.kind !== "excluded");
  if (!others.length) return null;
  const canSwap = editable && slot.kind !== "storage" && !isMotorcycle(car.row.vehicleType);
  const missingPlate = !car.row.plate && others.some((r) => r.plate);
  return (
    <div>
      <h3 className="mb-1.5 text-theme-xs font-medium text-gray-500 dark:text-gray-400">รถของ {car.row.ownerName} ({others.length + 1} คัน)</h3>
      {missingPlate && <p className="mb-1.5 rounded-lg bg-warning-50 px-3 py-2 text-theme-xs text-warning-800 dark:bg-warning-500/10 dark:text-warning-400">คันที่จอดช่องนี้ยังไม่มีทะเบียน ถ้าเป็นรถคันอื่นของลูกค้า กด “จอดช่องนี้” ที่คันนั้น หรือกด “แก้ไขรถ” เพื่อใส่ทะเบียน</p>}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {others.map((r) => {
          const swappable = canSwap && !isMotorcycle(r.vehicleType) && !isStorageSlot(r.slotId);
          return (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                disabled={!r.slotId}
                onClick={() => r.slotId && onSelectKey(r.bay != null ? `${r.slotId}#${r.bay}` : r.slotId)}
                className="min-w-0 flex-1 text-start text-theme-sm disabled:cursor-default"
              >
                <span className="block font-medium">{r.plate || "ไม่มีทะเบียน"}</span>
                <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{r.slotId ? slotLabel(r.slotId) : "ยังไม่ระบุช่อง"}{r.vehicleType ? ` · ${vehicleLabel(r.vehicleType)}` : ""}</span>
              </button>
              {swappable && (
                <button onClick={() => onAssign(r.id, slot.id, true)} className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1 text-theme-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">
                  {r.slotId ? "สลับช่อง" : "จอดช่องนี้"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function StatusBlock({ car, dueDay, day, month, year }: { car: LotCar; dueDay: number; day: number; month: number; year: number }) {
  const s = TONE_STYLE[car.tone];
  const owed = car.unpaid.reduce((n, u) => n + u.due, 0);
  const months = car.unpaid.map((u) => monthShort(u.month)).join(", ");
  const paidNow = car.row.payments[month - 1];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg px-3 py-2.5", s.box)} role="status">
      <s.Icon className="mt-0.5 size-[18px] shrink-0" />
      <div className="min-w-0 text-theme-sm">
        <p className="font-semibold">{toneLabel[car.tone]}{car.tone === "late" && car.unpaid.length > 1 ? ` ${car.unpaid.length} เดือน` : ""}</p>
        {car.tone === "paid" ? (
          <p>
            เดือน{monthName(month)} {year}
            {paidNow != null && paidNow > 0 ? ` · รับแล้ว ${formatBaht(paidNow)} บาท` : " · จ่ายล่วงหน้าแล้ว"}
          </p>
        ) : (
          <p>
            {car.tone === "pending" ? `ครบกำหนดวันที่ ${dueDay} (วันนี้ ${day})` : `${months}`} · ยังขาด {formatBaht(owed)} บาท
          </p>
        )}
      </div>
    </div>
  );
}

function ViewButtons({ view, onView }: { view: ViewMode; onView: (v: ViewMode) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="มุมกล้อง">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => onView(v.id)}
          aria-pressed={view === v.id}
          className={cn(
            "h-9 rounded-lg border text-theme-xs font-medium",
            view === v.id
              ? "border-brand-500 bg-brand-50 text-brand-600 dark:border-brand-400 dark:bg-brand-500/15 dark:text-brand-300"
              : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5",
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ onStep }: { onStep: (d: 1 | -1) => void }) {
  const cls = "inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-theme-sm text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5";
  return (
    <div className="flex">
      <button onClick={() => onStep(-1)} className={cls}><ChevronLeftGlyph className="size-4" /> คันก่อนหน้า</button>
      <button onClick={() => onStep(1)} className={cls}>คันถัดไป <ChevronRightGlyph className="size-4" /></button>
    </div>
  );
}

function EmptySlot({ slot, data, unplaced, editable, onAdd, onAssign }: CarCardProps) {
  const storage = slot.kind === "storage";
  const zone = data.zones.find((z) => z.slotIds.includes(slot.id));
  const motoZone = zone && zone.motoCapacity > 0 ? zone : null;
  const closed = zone && !zone.isActive;
  const rows = data.years.find((y) => y.year === data.today.year)?.rows ?? [];
  const motos = motoZone ? rows.filter((r) => r.zoneId === motoZone.id && r.isActive && r.kind !== "excluded" && r.vehicleType === "motorcycle").length : 0;
  const [pick, setPick] = useState("");
  return (
    <div className="space-y-4 px-4 pt-3 pb-4">
      <div className={cn("space-y-1 rounded-lg px-3 py-3 text-theme-sm", closed ? "bg-gray-100 text-gray-700 dark:bg-white/8 dark:text-gray-300" : zone?.access === "private" ? "bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300" : "bg-gray-50 text-gray-600 dark:bg-white/5 dark:text-gray-300")}>
        {zone && <p className="font-medium text-gray-800 dark:text-white/90">โซน {zone.name}{zone.access === "private" ? " · Private" : ""}{closed ? " · ปิดใช้งาน" : ""}</p>}
        {motoZone ? (
          <p>โซนมอเตอร์ไซค์ · จอดอยู่ {motos} คัน · ว่าง {Math.max(0, motoZone.motoCapacity - motos)} จาก {motoZone.motoCapacity} คัน</p>
        ) : closed ? (
          <p>{storage ? "คลังเก็บของ" : "ช่องนี้"}ปิดใช้งาน ไม่เปิดให้เช่า · กว้าง {slot.size.width_m.toFixed(1)} × ยาว {slot.size.length_m.toFixed(1)} ม.</p>
        ) : zone?.access === "private" ? (
          <p>ช่องสงวน (Private) ไม่นับเป็นที่ว่างให้เช่า แต่ยังลงรถได้ · กว้าง {slot.size.width_m.toFixed(1)} × ยาว {slot.size.length_m.toFixed(1)} ม.</p>
        ) : (
          <p>{storage ? "คลังเก็บของว่าง" : "ช่องนี้ว่าง"} · กว้าง {slot.size.width_m.toFixed(1)} × ยาว {slot.size.length_m.toFixed(1)} ม.</p>
        )}
      </div>
      {closed ? (
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">โซนนี้ปิดใช้งาน เลือกให้รถคันใหม่ไม่ได้ เปิดใช้งานได้ที่เมนู “โซนที่จอด”</p>
      ) : editable ? (
        <>
          {motoZone ? (
            <Button className="w-full" icon={<PlusGlyph />} disabled={motos >= motoZone.motoCapacity} onClick={() => onAdd(slot.id, motoZone.id)}>{motos >= motoZone.motoCapacity ? "โซนนี้เต็มแล้ว" : "เพิ่มมอเตอร์ไซค์"}</Button>
          ) : (
            <Button className="w-full" icon={<PlusGlyph />} onClick={() => onAdd(slot.id)}>{storage ? "เพิ่มผู้เช่าคลังเก็บของ" : "เพิ่มรถใหม่ในช่องนี้"}</Button>
          )}
          {unplaced.length > 0 && !motoZone && (
            <div>
              <label htmlFor="assign-row" className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">หรือเลือกรถที่ยังไม่ระบุช่อง</label>
              <div className="flex gap-2">
                <select id="assign-row" value={pick} onChange={(e) => setPick(e.target.value)} className="app-input min-w-0 flex-1">
                  <option value="">เลือกรถ…</option>
                  {unplaced.filter((r) => r.vehicleType !== "motorcycle").map((r) => <option key={r.id} value={r.id}>{r.ownerName}{r.plate ? ` · ${r.plate}` : ""}</option>)}
                </select>
                <Button variant="outline" disabled={!pick} onClick={() => onAssign(Number(pick), slot.id)}>ใช้ช่องนี้</Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">คุณดูได้อย่างเดียว ผู้ดูแลหรือผู้แก้ไขเป็นคนกำหนดรถลงช่อง</p>
      )}
      <SlotHistory data={data} slotId={slot.id} />
    </div>
  );
}
