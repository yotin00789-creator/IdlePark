import Button from "@/components/app/Button";
import ComboField from "@/components/app/ComboField";
import { SelectField, TextAreaField, TextField, Toggle } from "@/components/app/Field";
import Sheet from "@/components/app/Sheet";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useData } from "@/lib/dataStore";
import { parseBaht, THAI_MONTHS, THAI_MONTHS_SHORT, formatBaht } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useState } from "react";
import { cn } from "@/utils";
import { isStorageSlot, vehicleLabel } from "../../../shared/lot";
import VehicleLotFields, { DueDayField, RentKindPicker, type LotFieldsValue } from "./VehicleLotFields";
import { currentFee, feeSteps } from "../../../shared/calc";
import type { LedgerRow, RowKind } from "../../../shared/types";

interface RowSheetProps {
  year: number;
  row: LedgerRow | null; // null = add a new tenant
  open: boolean;
  onClose: () => void;
  canDelete: boolean;
  presetName?: string; // when adding a vehicle for an existing customer
  presetSlot?: string; // when adding a car from an empty slot on the 3D map
  presetZone?: number; // ...or a bike from a motorcycle zone
}

const KIND: Record<RowKind, string> = { normal: "ปกติ (นับในยอดรวม)", excluded: "ไม่รวม (แสดงไว้แต่ไม่นับยอด)", bulk: "ยอดรวมหลายคัน" };

export default function RowSheet(props: RowSheetProps) {
  // remount on target change so the form starts from the row's current values
  return <RowForm key={`${props.open}-${props.row?.id ?? "new"}`} {...props} />;
}

function RowForm({ year, row, open, onClose, canDelete, presetName, presetSlot, presetZone }: RowSheetProps) {
  const { data } = useData();
  const [name, setName] = useState(row?.ownerName ?? presetName ?? "");
  const [plate, setPlate] = useState(row?.plate ?? "");
  const [lot, setLot] = useState<LotFieldsValue>({
    slotId: row?.slotId ?? presetSlot ?? "",
    vehicleType: row?.vehicleType ?? (presetZone ? "motorcycle" : ""),
    carColor: row?.carColor ?? "",
    plateProvince: row?.plateProvince ?? "",
    zoneId: String(row?.zoneId ?? presetZone ?? ""),
    dueDay: row?.dueDay ? String(row.dueDay) : "",
  });
  const storage = isStorageSlot(lot.slotId);
  const startFee = row && data ? currentFee(row, data.today) : (data?.settings.monthlyFeeDefault ?? 120000);
  const [fee, setFee] = useState(formatBaht(startFee).replace(/,/g, ""));
  const [feeFrom, setFeeFrom] = useState(String(row && data && row.year === data.today.year ? data.today.month : 1)); // the month a new price starts
  const [kind, setKind] = useState<RowKind>(row?.kind ?? "normal");
  const [startMonth, setStartMonth] = useState(String(row?.startMonth ?? 1));
  const [endMonth, setEndMonth] = useState(String(row?.endMonth ?? ""));
  const [ptYear, setPtYear] = useState(String(row?.paidThroughYear ?? ""));
  const [ptMonth, setPtMonth] = useState(String(row?.paidThroughMonth ?? ""));
  const [note, setNote] = useState(row?.note ?? "");
  const [active, setActive] = useState(row?.isActive ?? true);
  const [review, setReview] = useState(row?.needsReview ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [adoptId, setAdoptId] = useState<number | null>(null); // adding a vehicle for a customer who already has one without a slot: use that one
  if (!data) return null;

  // the customer's vehicles that are not on the map yet: pick one of them instead of creating a duplicate
  const sameCustomer = data.customers.find((c) => c.name === name.trim());
  const waiting = row || !sameCustomer ? [] : (data.years.find((y) => y.year === year)?.rows ?? []).filter((r) => r.customerId === sameCustomer.id && r.isActive && r.kind !== "excluded" && !r.slotId);
  const adopt = (r: LedgerRow | null) => {
    setAdoptId(r?.id ?? null);
    if (!r) return;
    setPlate(r.plate);
    setFee(formatBaht(currentFee(r, data.today)).replace(/,/g, ""));
    setStartMonth(String(r.startMonth));
    setLot((v) => ({ ...v, vehicleType: r.vehicleType ?? "", carColor: r.carColor ?? "", plateProvince: r.plateProvince, dueDay: r.dueDay ? String(r.dueDay) : "", zoneId: String(r.zoneId ?? v.zoneId) }));
  };

  const save = async () => {
    const feeParsed = parseBaht(fee);
    if (!name.trim()) return setError("กรุณากรอกชื่อผู้เช่า");
    if (feeParsed === "invalid" || feeParsed == null || feeParsed <= 0) return setError(`${storage ? "ค่าเช่าต่อปี" : "ค่าเช่าต่อเดือน"}ต้องเป็นตัวเลขมากกว่า 0`);
    setBusy(true);
    setError(null);
    const body = {
      ownerName: name.trim(),
      plate: plate.trim() || (storage ? "คลังเก็บของ" : ""),
      plateProvince: storage ? "" : lot.plateProvince.trim(),
      slotId: lot.slotId || null,
      vehicleType: storage ? null : lot.vehicleType || null,
      carColor: storage ? null : lot.carColor || null,
      zoneId: lot.zoneId ? Number(lot.zoneId) : null,
      dueDay: lot.dueDay ? Number(lot.dueDay) : null,
      monthlyFee: feeParsed,
      ...(row && feeParsed !== startFee ? { feeFrom: storage ? 1 : Number(feeFrom) } : {}),
      kind,
      startMonth: Number(startMonth),
      endMonth: endMonth ? Number(endMonth) : null,
      paidThroughYear: ptMonth ? Number(ptYear || year) : null,
      paidThroughMonth: ptMonth ? Number(ptMonth) : null,
      note,
      isActive: active,
      needsReview: review,
    };
    try {
      const target = row?.id ?? adoptId; // an existing vehicle (edit, or chosen from the customer's vehicles) is updated; otherwise a new one is added
      const res = target ? await api.patch<{ row: LedgerRow }>(`/ledger/rows/${target}`, { ...body, ...(adoptId && !row ? { swap: true } : {}) }) : await api.post<{ row: LedgerRow }>("/ledger/rows", { ...body, year });
      dataStore.mergeRow(res.row); // the 3D map and every page change now; the reload below confirms it
      void dataStore.load(true);
      toast.success(row ? "บันทึกแล้ว" : adoptId ? "กำหนดรถลงช่องแล้ว" : "เพิ่มผู้เช่าแล้ว");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const res = await api.del<{ auditId: number | null }>(`/ledger/rows/${row.id}`);
      await dataStore.load(true);
      const auditId = res.auditId;
      toast.success("ลบแถวแล้ว", `${row.ownerName}${row.plate ? ` (${row.plate})` : ""} — ถ้าลบผิด กด “เลิกทำ”`, auditId == null ? undefined : {
        label: "เลิกทำ",
        run: () => {
          api.post<{ note?: string }>(`/audit/${auditId}/restore`, {})
            .then(async (r) => {
              await dataStore.load(true);
              toast.success("กู้คืนแล้ว", r.note || `${row.ownerName} กลับมาพร้อมยอดชำระเดิม`);
            })
            .catch((e) => toast.error("กู้คืนไม่ได้", errorMessage(e)));
        },
      });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const feeParsedNow = parseBaht(fee);
  const priceChanged = feeParsedNow !== "invalid" && feeParsedNow != null && feeParsedNow > 0 && feeParsedNow !== startFee;
  const steps = row ? feeSteps(row) : [];
  const customers = data.customers.filter((c) => c.isActive);
  const thisYear = data.years.find((y) => y.year === year)?.rows ?? [];
  const nameOptions = customers.map((c) => {
    const mine = thisYear.filter((r) => r.customerId === c.id && r.kind !== "excluded");
    const plates = mine.map((r) => r.plate).filter(Boolean).join(" · ");
    return { value: c.name, sub: mine.length ? `${mine.length} คัน${plates ? ` · ${plates}` : ""}` : c.phone || undefined };
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={row ? "แก้ไขผู้เช่า" : "เพิ่มผู้เช่า"}
      description={row ? `ปี ${row.year}${row.sourceRow ? ` · แถวที่ ${row.sourceRow} ของชีตเดิม` : ""}` : `ปี ${year}`}
      footer={
        confirmDel ? (
          <>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>ไม่ลบ</Button>
            <Button variant="danger" loading={busy} onClick={remove}>ยืนยันลบแถวนี้</Button>
          </>
        ) : (
          <>
            {row && canDelete && <Button variant="ghost" className="!flex-none text-error-600" onClick={() => setConfirmDel(true)}>ลบแถว</Button>}
            <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
            <Button loading={busy} onClick={save}>บันทึก</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {confirmDel && (
          <p role="alert" className="rounded-lg bg-error-50 px-4 py-3 text-theme-sm text-error-700 dark:bg-error-500/10 dark:text-error-400">
            ลบแถวนี้ออกจากสมุดพร้อมยอดชำระของปี {row?.year} ระบบเก็บสำเนาไว้ในประวัติการใช้งาน ผู้ดูแลกู้คืนได้ ถ้าแค่หยุดเก็บ ให้ปิด “ใช้งานอยู่” แทน (ยอดรวมในอดีตจะไม่เปลี่ยน)
          </p>
        )}
        <ComboField label="ชื่อผู้เช่า" value={name} onChange={(v) => { setName(v); setAdoptId(null); }} options={nameOptions} placeholder="เลือกลูกค้าเดิมหรือพิมพ์ชื่อใหม่" newHint={(v) => `ไม่มีลูกค้าชื่อ “${v}” ระบบจะเพิ่มเป็นลูกค้าใหม่`} />
        {waiting.length > 0 && (
          <div className="rounded-lg border border-gold-300 bg-gold-50/60 p-3 dark:border-gold-500/40 dark:bg-gold-500/10">
            <p className="mb-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">{sameCustomer?.name} มีรถที่ยังไม่ได้ลงช่อง เลือกคันที่จะจอดช่องนี้</p>
            <div role="radiogroup" aria-label="เลือกรถของลูกค้า" className="space-y-1.5">
              {waiting.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={adoptId === r.id} onClick={() => adopt(r)} className={cn("flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-start dark:bg-gray-900", adoptId === r.id ? "border-brand-500 ring-2 ring-gold-300/60" : "border-gray-200 dark:border-gray-700")}>
                  <span className="font-medium text-gray-800 dark:text-white/90">{r.plate || "ไม่มีทะเบียน"}</span>
                  <span className="text-theme-xs text-gray-500 dark:text-gray-400">{r.vehicleType ? vehicleLabel(r.vehicleType) : "ไม่ระบุประเภท"} · ยังไม่ระบุช่อง</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={adoptId == null} onClick={() => { setAdoptId(null); setPlate(""); }} className={cn("flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-start dark:bg-gray-900", adoptId == null ? "border-brand-500 ring-2 ring-gold-300/60" : "border-gray-200 dark:border-gray-700")}>
                <span className="font-medium text-gray-800 dark:text-white/90">+ รถคันใหม่</span>
                <span className="text-theme-xs text-gray-500 dark:text-gray-400">เพิ่มเป็นรถอีกคันของลูกค้า</span>
              </button>
            </div>
          </div>
        )}
        <RentKindPicker value={lot} onChange={(patch) => setLot((v) => ({ ...v, ...patch }))} year={year} exceptRowId={row?.id} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label={storage ? "ชื่อรายการ (ไม่บังคับ)" : "ทะเบียนรถ"} value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={storage ? "คลังเก็บของ" : "เช่น 1กข 1234"} />
          <TextField label={storage ? "ค่าเช่าต่อปี (บาท)" : "ค่าเช่าต่อเดือน (บาท)"} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} hint={storage ? "คลังเก็บของจ่ายปีละครั้ง" : row ? undefined : "ตั้งราคาแยกรายคันได้อิสระ"} />
        </div>
        {row && priceChanged && !storage && (
          <div className="rounded-lg border border-gold-300 bg-gold-50/60 p-3 dark:border-gold-500/40 dark:bg-gold-500/10">
            <SelectField label="ใช้ราคาใหม่ตั้งแต่เดือน" value={feeFrom} onChange={(e) => setFeeFrom(e.target.value)} hint={`เดือนก่อนหน้านั้นยังคิดราคาเดิม ไม่เปลี่ยนยอดค้างหรือยอดที่เก็บไปแล้ว${row.year < data.today.year ? " (นี่คือปีที่ผ่านมาแล้ว)" : ""}`}>
              {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m} {row.year}</option>)}
            </SelectField>
          </div>
        )}
        {row && steps.length > 1 && (
          <p className="-mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
            ประวัติราคาปี {row.year}: {steps.map((s, i) => `${i === 0 ? "ต้นปี" : `ตั้งแต่ ${THAI_MONTHS_SHORT[s.from - 1]}`} ${formatBaht(s.fee)}`).join(" → ")} บาท
          </p>
        )}
        <VehicleLotFields value={lot} onChange={(patch) => setLot((v) => ({ ...v, ...patch }))} year={year} exceptRowId={row?.id} />
        <DueDayField value={lot.dueDay} onChange={(v) => setLot((s) => ({ ...s, dueDay: v }))} defaultDay={data.settings.reminders.dueDay} />
        <SelectField label="ประเภทแถว" value={kind} onChange={(e) => setKind(e.target.value as RowKind)}>
          {(Object.keys(KIND) as RowKind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label={storage ? "จ่ายประจำปีในเดือน" : "เริ่มเช่าเดือน"} value={startMonth} onChange={(e) => setStartMonth(e.target.value)} hint={storage ? "เก็บค่าเช่าคลังปีละครั้งในเดือนนี้ ถ้ายังไม่จ่ายระบบแจ้งเตือนจนกว่าจะบันทึกรับเงิน" : "เดือนก่อนหน้านี้ไม่ถูกแจ้งว่าค้าง"}>
            {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </SelectField>
          <SelectField label="สิ้นสุดเดือน" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} hint="เว้นว่างถ้ายังเช่าอยู่">
            <option value="">ยังเช่าอยู่</option>
            {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </SelectField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="จ่ายล่วงหน้าถึงเดือน" value={ptMonth} onChange={(e) => setPtMonth(e.target.value)} hint="ไม่แจ้งเตือนค้างจนถึงเดือนนี้">
            <option value="">ไม่ได้จ่ายล่วงหน้า</option>
            {THAI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </SelectField>
          <TextField label="ปี (พ.ศ.)" inputMode="numeric" value={ptYear} onChange={(e) => setPtYear(e.target.value)} disabled={!ptMonth} placeholder={String(year)} />
        </div>
        <TextAreaField label="หมายเหตุ" value={note} onChange={(e) => setNote(e.target.value)} />
        <Toggle checked={active} onChange={setActive} label="ใช้งานอยู่" hint="ปิดเมื่อเลิกเช่าแล้ว จะไม่ถูกแจ้งเตือนค้างชำระ" />
        <Toggle checked={review} onChange={setReview} label="ทำเครื่องหมายให้ตรวจสอบ" hint="ใช้กับแถวที่ข้อมูลไม่ครบ เช่น ไม่ทราบชื่อ" />
        {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
      </div>
    </Sheet>
  );
}
