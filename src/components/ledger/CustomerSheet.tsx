import { currentFee } from "../../../shared/calc";
import Button from "@/components/app/Button";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import { SelectField, TextAreaField, TextField, Toggle } from "@/components/app/Field";
import PlateChip from "@/components/app/PlateChip";
import Sheet from "@/components/app/Sheet";
import RowSheet from "@/components/ledger/RowSheet";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useData, type Customer } from "@/lib/dataStore";
import { formatBaht, parseBaht, THAI_MONTHS } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useState } from "react";
import { isStorageSlot, slotLabel, vehicleLabel } from "../../../shared/lot";
import type { LedgerRow } from "../../../shared/types";
import VehicleLotFields, { DueDayField, RentKindPicker, emptyLotFields, type LotFieldsValue } from "./VehicleLotFields";

interface VehicleDraft extends LotFieldsValue {
  plate: string;
  fee: string;
  startMonth: string;
}

export default function CustomerSheet({ state, onClose, editable, admin }: { state: { customer: Customer | null } | null; onClose: () => void; editable: boolean; admin: boolean }) {
  const { data } = useData();
  const c = state?.customer ?? null;
  const [name, setName] = useState(c?.name ?? "");
  const [phone, setPhone] = useState(c?.phone ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [note, setNote] = useState(c?.note ?? "");
  const [active, setActive] = useState(c?.isActive ?? true);
  const [vehicles, setVehicles] = useState<VehicleDraft[]>([{ plate: "", fee: String((data?.settings.monthlyFeeDefault ?? 120000) / 100), startMonth: String(data?.today.month ?? 1), ...emptyLotFields() }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowEdit, setRowEdit] = useState<{ row: LedgerRow | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncDay, setSyncDay] = useState("");
  const [syncing, setSyncing] = useState(false);
  if (!data) return null;
  const year = data.today.year;
  const existing = c ? (data.years.find((y) => y.year === year)?.rows ?? []).filter((r) => r.customerId === c.id) : [];

  // switching to the shed clears the fee (it is a yearly amount, not the monthly default) and switching back restores the default
  const setVehicle = (i: number, patch: Partial<VehicleDraft>) =>
    setVehicles((v) => v.map((x, j) => {
      if (j !== i) return x;
      const next = { ...x, ...patch };
      if (patch.slotId !== undefined && isStorageSlot(patch.slotId) !== isStorageSlot(x.slotId)) next.fee = isStorageSlot(patch.slotId) ? "" : String((data?.settings.monthlyFeeDefault ?? 120000) / 100);
      return next;
    }));

  const save = async () => {
    if (!name.trim()) return setError("กรุณากรอกชื่อลูกค้า");
    setBusy(true);
    setError(null);
    try {
      if (c) {
        await api.patch(`/customers/${c.id}`, { name, phone, email, note, isActive: active });
      } else {
        const list = vehicles.filter((v) => v.plate.trim() || v.slotId);
        const fees = list.map((v) => parseBaht(v.fee));
        if (fees.some((f) => f === "invalid" || f == null || f <= 0)) throw new Error("ค่าเช่าต้องเป็นตัวเลขมากกว่า 0");
        await api.post("/customers", {
          name, phone, email, note, year,
          vehicles: list.map((v, i) => ({
            plate: v.plate.trim() || (isStorageSlot(v.slotId) ? "คลังเก็บของ" : ""),
            zoneId: v.zoneId ? Number(v.zoneId) : null,
            dueDay: v.dueDay ? Number(v.dueDay) : null,
            monthlyFee: fees[i],
            startMonth: Number(v.startMonth),
            slotId: v.slotId || null,
            vehicleType: isStorageSlot(v.slotId) ? null : v.vehicleType || null,
            carColor: isStorageSlot(v.slotId) ? null : v.carColor || null,
            plateProvince: isStorageSlot(v.slotId) ? "" : v.plateProvince.trim(),
          })),
        });
      }
      await dataStore.load(true);
      toast.success(c ? "บันทึกแล้ว" : "เพิ่มลูกค้าแล้ว");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // one button: every vehicle of this customer pays on the same day (or all go back to the default)
  const syncDue = async () => {
    if (!c) return;
    setSyncing(true);
    try {
      const r = await api.post<{ changed: number }>(`/customers/${c.id}/sync-due-day`, { dueDay: syncDay ? Number(syncDay) : null, year });
      await dataStore.load(true);
      toast.success("ซิงก์วันนัดชำระแล้ว", `${r.changed} คันของ ${c.name} ${syncDay ? `นัดชำระวันที่ ${syncDay}` : "ใช้ค่าเริ่มต้น"}`);
    } catch (e) {
      setError(errorMessage(e));
    }
    setSyncing(false);
  };

  const remove = async () => {
    if (!c) return;
    setBusy(true);
    try {
      await api.del(`/customers/${c.id}`);
      await dataStore.load(true);
      toast.success("ลบลูกค้าแล้ว");
      onClose();
    } catch (e) {
      setConfirmDelete(false);
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open={Boolean(state) && !rowEdit}
        onClose={onClose}
        wide
        title={c ? c.name : "เพิ่มลูกค้า"}
        description={c ? "ชื่อที่แก้ไขจะเปลี่ยนในสมุดรายรับทุกปี" : `เพิ่มรถของลูกค้าเข้าสมุดรายรับปี ${year} ได้ในขั้นตอนเดียว`}
        footer={editable ? (<>{c && admin && <Button variant="ghost" className="!flex-none text-error-600" onClick={() => setConfirmDelete(true)}>ลบ</Button>}<Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>) : <Button variant="outline" onClick={onClose}>ปิด</Button>}
      >
        <div className="space-y-4">
          <TextField label="ชื่อลูกค้า" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="เบอร์โทร" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!editable} />
            <TextField label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editable} />
          </div>
          <TextAreaField label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} disabled={!editable} />
          {c && <Toggle checked={active} onChange={setActive} disabled={!editable} label="ยังเช่าอยู่" hint={`ปิดเมื่อเลิกเช่า: รถของลูกค้าในปี ${year} จะไม่ถูกแจ้งเตือนค้างชำระ`} />}

          {c ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">รถของลูกค้า ปี {year}</h3>
                {editable && <button onClick={() => setRowEdit({ row: null })} className="text-theme-sm font-medium text-link">+ เพิ่มรถ</button>}
              </div>
              {existing.length === 0 ? <p className="text-theme-sm text-gray-500">ยังไม่มีรถในปีนี้</p> : (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  {existing.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <PlateChip plate={r.plate || "ไม่มีทะเบียน"} />
                          {r.carColor && <span className="size-3 rounded-full border border-gray-300 dark:border-gray-600" style={{ background: r.carColor }} aria-hidden />}
                          <span className="text-theme-xs text-gray-600 dark:text-gray-400">{r.vehicleType ? vehicleLabel(r.vehicleType) : "ไม่ระบุประเภท"}</span>
                        </span>
                        <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
                          {r.slotId ? slotLabel(r.slotId) : "ยังไม่ระบุช่อง"} · {formatBaht(currentFee(r, data.today))} บาท/{isStorageSlot(r.slotId) ? "ปี" : "เดือน"} · นัดชำระวันที่ {r.dueDay ?? data.settings.reminders.dueDay}{r.dueDay == null ? " (เริ่มต้น)" : ""}{!r.isActive && " · เลิกเช่า"}
                        </span>
                      </span>
                      {editable && <button onClick={() => setRowEdit({ row: r })} className="shrink-0 text-theme-sm text-link">แก้ไข</button>}
                    </li>
                  ))}
                </ul>
              )}
              {editable && existing.length > 1 && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <DueDayField value={syncDay} onChange={setSyncDay} defaultDay={data.settings.reminders.dueDay} />
                  </div>
                  <Button variant="outline" size="sm" className="mb-0.5" loading={syncing} onClick={syncDue}>ซิงก์ทุกคัน</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">รถหรือคลังเก็บของที่เช่า (เว้นว่างได้)</h3>
              {vehicles.map((v, i) => (
                <div key={i} className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <RentKindPicker value={v} onChange={(patch) => setVehicle(i, patch)} year={year} taken={new Map(vehicles.flatMap((o, j) => (j !== i && o.slotId ? [[o.slotId, name || "รายการอีกคันในฟอร์มนี้"] as [string, string]] : [])))} />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label={isStorageSlot(v.slotId) ? "ชื่อรายการ (ไม่บังคับ)" : "ทะเบียนรถ"} value={v.plate} onChange={(e) => setVehicle(i, { plate: e.target.value })} placeholder={isStorageSlot(v.slotId) ? "คลังเก็บของ" : "1กข 1234"} />
                    <TextField label={isStorageSlot(v.slotId) ? "ค่าเช่า/ปี (บาท)" : "ค่าเช่า/เดือน (บาท)"} inputMode="decimal" value={v.fee} onChange={(e) => setVehicle(i, { fee: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <DueDayField value={v.dueDay} onChange={(d) => setVehicle(i, { dueDay: d })} defaultDay={data.settings.reminders.dueDay} />
                    <SelectField label={isStorageSlot(v.slotId) ? "จ่ายประจำปีในเดือน" : "เริ่มเช่าเดือน"} value={v.startMonth} onChange={(e) => setVehicle(i, { startMonth: e.target.value })}>
                      {THAI_MONTHS.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}
                    </SelectField>
                  </div>
                  <VehicleLotFields
                    value={v}
                    onChange={(patch) => setVehicle(i, patch)}
                    year={year}
                    taken={new Map(vehicles.flatMap((o, j) => (j !== i && o.slotId ? [[o.slotId, name || "รถอีกคันในฟอร์มนี้"] as [string, string]] : [])))}
                  />
                  {vehicles.length > 1 && <button onClick={() => setVehicles((l) => l.filter((_, j) => j !== i))} className="text-theme-xs text-error-600">ลบรถคันนี้</button>}
                </div>
              ))}
              <button onClick={() => setVehicles((l) => [...l, { plate: "", fee: l[0]?.fee ?? "1200", startMonth: l[0]?.startMonth ?? "1", ...emptyLotFields() }])} className="text-theme-sm font-medium text-link">+ เพิ่มรถอีกคัน</button>
            </div>
          )}
          {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
        </div>
      </Sheet>
      <RowSheet year={year} row={rowEdit?.row ?? null} open={Boolean(rowEdit)} onClose={() => setRowEdit(null)} canDelete={editable} presetName={c?.name} />
      <ConfirmDialog open={confirmDelete} title="ลบลูกค้า?" body={`ลบ ${c?.name ?? ""} ออกจากรายชื่อ (ลบได้เฉพาะลูกค้าที่ไม่มีรายการในสมุดรายรับ)`} confirmLabel="ลบลูกค้า" busy={busy} onConfirm={remove} onClose={() => setConfirmDelete(false)} />
    </>
  );
}
