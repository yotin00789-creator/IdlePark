import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import EmptyState from "@/components/app/EmptyState";
import { TextField, Toggle } from "@/components/app/Field";
import PageHeader from "@/components/app/PageHeader";
import Sheet from "@/components/app/Sheet";
import PageMeta from "@/components/common/PageMeta";
import { PlusGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useData, type Zone } from "@/lib/dataStore";
import { canEdit, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { Suspense, lazy, useMemo, useState } from "react";
import RentTotal from "@/components/app/RentTotal";
import { rentTotals } from "../../../shared/calc";
import { SLOT_GROUPS, SLOT_IDS, STORAGE_SLOT, baysIn, bayGrid, isMotorcycle, slotLabel, slotNumber } from "../../../shared/lot";
import type { LedgerRow } from "../../../shared/types";

const SlotPicker3D = lazy(() => import("@/components/lot3d/SlotPicker3D")); // three.js only loads when a zone is opened

const slotShort = (id: string) => (id === STORAGE_SLOT ? "คลัง" : String(slotNumber(id)));

export default function Zones() {
  const { data } = useData();
  const { user } = useAuth();
  const [form, setForm] = useState<{ zone: Zone | null } | null>(null);
  const editable = canEdit(user);
  const year = data?.today.year ?? 0;
  const rows = useMemo(() => (data?.years.find((y) => y.year === year)?.rows ?? []).filter((r) => r.isActive && r.kind !== "excluded"), [data, year]);
  if (!data) return null;

  const stat = (z: Zone) => {
    const mine = rows.filter((r) => r.zoneId === z.id);
    const motos = mine.filter((r) => isMotorcycle(r.vehicleType)).length;
    const slotCount = z.slotIds.length;
    const usedSlots = new Set(mine.filter((r) => r.slotId && !isMotorcycle(r.vehicleType)).map((r) => r.slotId)).size;
    return {
      count: mine.length,
      unplaced: motos ? 0 : mine.filter((r) => !r.slotId).length,
      rent: rentTotals(mine, data.today),
      motos,
      used: z.motoCapacity ? motos : usedSlots,
      total: z.motoCapacity ? z.motoCapacity : slotCount || z.capacity || 0,
    };
  };
  const none = rows.filter((r) => r.zoneId == null);
  const noneRent = rentTotals(none, data.today);
  const inZone = new Set(data.zones.flatMap((z) => z.slotIds));
  const free = SLOT_IDS.filter((id) => !inZone.has(id));

  return (
    <>
      <PageMeta title="โซนที่จอด | IdlePark" description="จัดการโซนที่จอดรถ" />
      <PageHeader
        title="โซนที่จอด"
        description="เลือกว่าแต่ละโซนมีช่องไหนบ้าง โซนไหนเป็น Private หรือปิดใช้งาน และจอดมอเตอร์ไซค์ได้กี่คัน"
        actions={editable && <Button icon={<PlusGlyph />} onClick={() => setForm({ zone: null })}>เพิ่มโซน</Button>}
      />
      <Card bodyClassName="p-0">
        {data.zones.length === 0 ? (
          <EmptyState title="ยังไม่มีโซน" body="เพิ่มโซนแล้วเลือกช่องจอดที่อยู่ในโซนนั้น ระบบจะแสดงโซนในผัง 3 มิติและฟอร์มผู้เช่าให้ทันที" />
        ) : (
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full min-w-3xl">
              <thead><tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3">
                <th className="app-th">โซน</th><th className="app-th">ช่องจอด</th><th className="app-th text-end">ใช้อยู่ / ทั้งหมด</th><th className="app-th text-end">ว่าง</th><th className="app-th text-end">ค่าเช่า</th><th className="app-th" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.zones.map((z) => {
                  const s = stat(z);
                  const free = Math.max(0, s.total - s.used);
                  return (
                    <tr key={z.id} className={cn("hover:bg-gray-50 dark:hover:bg-white/3", !z.isActive && "opacity-70")}>
                      <td className="app-td">
                        <span className="font-medium text-gray-800 dark:text-white/90">{z.name}</span>
                        <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">
                          {z.kind === "storage" && <Tag tone="blue">คลังเก็บของ</Tag>}
                          {z.access === "private" && <Tag tone="violet">Private · ไม่คิดเงิน</Tag>}
                          {!z.isActive && <Tag tone="gray">ปิดใช้งาน</Tag>}
                          {z.motoCapacity > 0 && <Tag tone="blue">มอเตอร์ไซค์ {z.motoCapacity} คัน</Tag>}
                        </span>
                        {z.description && <span className="block text-theme-xs text-gray-500">{z.description}</span>}
                      </td>
                      <td className="app-td whitespace-normal">
                        {z.slotIds.length ? <span className="flex max-w-xs flex-wrap gap-1">{z.slotIds.map((id) => <span key={id} className="rounded bg-gray-100 px-1.5 py-px text-theme-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">{slotShort(id)}</span>)}</span> : <span className={z.access === "private" ? "text-warning-600 dark:text-warning-500" : "text-gray-500 dark:text-gray-400"}>{z.access === "private" ? "ยังไม่ได้เลือกช่อง จึงยังไม่มีพื้นสีม่วงบนผัง — กด “แก้ไข” เพื่อเลือก" : "ยังไม่เลือกช่อง"}</span>}
                      </td>
                      <td className="app-td num text-end">{s.used}{s.total ? <span className="text-gray-500 dark:text-gray-400"> / {s.total}</span> : null}{s.unplaced > 0 && <span className="block text-theme-xs font-normal text-gray-500 dark:text-gray-400">อีก {s.unplaced} คันยังไม่ระบุช่อง</span>}</td>
                      <td className={cn("app-td num text-end", s.total && free === 0 ? "text-error-600 dark:text-error-500" : "")}>{s.total ? (z.isActive ? free : "—") : "—"}</td>
                      <td className="app-td text-end"><RentTotal monthly={s.rent.monthly} yearly={s.rent.yearly} /></td>
                      <td className="app-td text-end"><button onClick={() => setForm({ zone: z })} className="text-theme-sm font-medium text-link">{editable ? "แก้ไข" : "ดู"}</button></td>
                    </tr>
                  );
                })}
                {none.length > 0 && (
                  <tr className="bg-gray-50/60 dark:bg-white/2">
                    <td className="app-td whitespace-normal" colSpan={2}>
                      <span className="font-medium text-gray-700 dark:text-gray-300">ผู้เช่าที่ยังไม่ได้เลือกโซน ({none.length} ราย)</span>
                      <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{none.map((r) => `${r.ownerName}${r.plate ? ` (${r.plate})` : ""}`).join(" · ")} — เปิดที่สมุดรายรับหรือผังที่จอด แล้วเลือกช่อง/โซนให้แถวนี้</span>
                    </td>
                    <td className="app-td num text-end">{none.length}</td><td className="app-td text-end">—</td><td className="app-td text-end"><RentTotal monthly={noneRent.monthly} yearly={noneRent.yearly} /></td><td />
                  </tr>
                )}
                {free.length > 0 && (
                  <tr className="bg-gray-50/60 dark:bg-white/2">
                    <td className="app-td whitespace-normal" colSpan={2}>
                      <span className="font-medium text-gray-700 dark:text-gray-300">ช่องที่ยังไม่อยู่ในโซนไหน ({free.length} ช่อง)</span>
                      <span className="mt-1 flex flex-wrap gap-1">{free.map((id) => <span key={id} className="rounded bg-gray-100 px-1.5 py-px text-theme-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">{slotShort(id)}</span>)}</span>
                    </td>
                    <td className="app-td text-end" colSpan={4}><span className="text-theme-xs text-gray-500 dark:text-gray-400">เลือกช่องเหล่านี้ในโซนใดก็ได้</span></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {form && <ZoneSheet zone={form.zone} zones={data.zones} rows={rows} onClose={() => setForm(null)} editable={editable} />}
    </>
  );
}

function Tag({ tone, children }: { tone: "violet" | "gray" | "blue"; children: React.ReactNode }) {
  const t = {
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    gray: "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300",
    blue: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
  }[tone];
  return <span className={cn("rounded-full px-2 py-px text-theme-xs font-medium", t)}>{children}</span>;
}

function ZoneSheet({ zone, zones, rows, onClose, editable }: { zone: Zone | null; zones: Zone[]; rows: LedgerRow[]; onClose: () => void; editable: boolean }) {
  const [name, setName] = useState(zone?.name ?? "");
  const [description, setDescription] = useState(zone?.description ?? "");
  const [access, setAccess] = useState<Zone["access"]>(zone?.access ?? "public");
  const [kind, setKind] = useState<Zone["kind"]>(zone?.kind ?? "parking");
  const storage = kind === "storage";
  const [slotIds, setSlotIds] = useState<string[]>(zone?.slotIds ?? []);
  const [moto, setMoto] = useState(Boolean(zone?.motoCapacity));
  const [motoCap, setMotoCap] = useState(String(zone?.motoCapacity || ""));
  const [active, setActive] = useState(zone?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const ownerOf = (id: string) => zones.find((z) => z.id !== zone?.id && z.slotIds.includes(id));
  const holder = (id: string) => rows.find((r) => r.slotId === id && r.zoneId === zone?.id);
  const taking = slotIds.filter((id) => ownerOf(id));
  const holders = useMemo(() => Object.fromEntries(rows.filter((r) => r.slotId).map((r) => [r.slotId as string, r.ownerName])), [rows]);
  const room = baysIn(slotIds);
  const count = zone ? rows.filter((r) => r.zoneId === zone.id).length : 0;
  const toggle = (id: string) => setSlotIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id].sort((a, b) => SLOT_IDS.indexOf(a as never) - SLOT_IDS.indexOf(b as never))));

  const save = async () => {
    if (!name.trim()) return setError("กรุณากรอกชื่อโซน");
    const cap = moto && !storage ? Number(motoCap) : 0;
    if (moto && !storage && (!cap || cap < 1)) return setError("กรอกจำนวนมอเตอร์ไซค์ที่จอดได้ (อย่างน้อย 1 คัน)");
    setBusy(true);
    setError(null);
    const body = { name, description, kind, access: storage ? "public" : access, slotIds, motoCapacity: cap, isActive: active };
    try {
      if (zone) await api.patch(`/zones/${zone.id}`, body);
      else await api.post("/zones", body);
      await dataStore.load(true);
      toast.success(zone ? "บันทึกโซนแล้ว" : "เพิ่มโซนแล้ว", "ผังที่จอด 3 มิติและฟอร์มผู้เช่าอัปเดตแล้ว");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!zone) return;
    setBusy(true);
    try {
      await api.del(`/zones/${zone.id}`);
      await dataStore.load(true);
      toast.success("ลบโซนแล้ว");
      onClose();
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        wide
        title={zone ? "แก้ไขโซน" : "เพิ่มโซน"}
        description="โซนหนึ่งมีได้หลายช่อง และช่องหนึ่งอยู่ได้โซนเดียว"
        footer={editable ? (<>{zone && <Button variant="ghost" className="!flex-none text-error-600" onClick={() => setConfirm(true)}>ลบ</Button>}<Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>) : <Button variant="outline" onClick={onClose}>ปิด</Button>}
      >
        <div className="space-y-5">
          <TextField label="ชื่อโซน" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
          <TextField label="รายละเอียด" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} placeholder="เช่น ลานด้านหน้าบ้าน" />

          <div>
            <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">ช่องในโซนนี้เป็น</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ประเภทช่อง">
              {([["parking", "ที่จอดรถ", "รถยนต์ / มอเตอร์ไซค์ · จ่ายรายเดือน"], ["storage", "คลังเก็บของ", "ช่องแสดงเป็นโมเดลคลัง · จ่ายปีละครั้ง"]] as const).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={kind === id}
                  disabled={!editable}
                  onClick={() => setKind(id)}
                  className={cn("rounded-lg border px-3 py-2.5 text-start", kind === id ? "border-brand-500 bg-brand-25 dark:bg-brand-500/10" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5")}
                >
                  <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>
                </button>
              ))}
            </div>
            {storage && <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">ช่องที่เลือกด้านล่างจะเป็นคลังเก็บของ ผู้เช่าเลือกช่องนั้นได้เมื่อเพิ่มลูกค้า ผังที่จอด 3 มิติจะวางโมเดลคลังสีดำเทาให้ที่ช่องนั้น (ช่องที่มีรถจอดอยู่ต้องย้ายรถออกก่อน)</p>}
          </div>

          {!storage && <div>
            <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">ชนิดโซน</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="ชนิดโซน">
              {([["public", "ทั่วไป", "ให้เช่าตามปกติ"], ["private", "Private", "สงวนไว้ ไม่คิดค่าเช่า ไม่รับชำระเงิน"]] as const).map(([id, label, hint]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={access === id}
                  disabled={!editable}
                  onClick={() => setAccess(id)}
                  className={cn("rounded-lg border px-3 py-2.5 text-start", access === id ? "border-brand-500 bg-brand-25 dark:bg-brand-500/10" : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5")}
                >
                  <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
                  <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{hint}</span>
                </button>
              ))}
            </div>
            {access === "private" && <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">รถในโซน Private จะไม่มีค่าเช่า ไม่มีวันนัดชำระ ไม่รับชำระเงิน ไม่แจ้งค้างชำระ และไม่นับในยอดรวม</p>}
          </div>}
          <Toggle checked={active} onChange={setActive} disabled={!editable} label="เปิดใช้งาน" hint="ปิดเมื่อไม่ให้ใช้โซนนี้ ช่องในโซนจะถูกแสดงเป็นสีเทา และเลือกให้รถคันใหม่ไม่ได้ (รถที่จอดอยู่ไม่ถูกย้าย)" />

          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">ช่องจอดในโซนนี้ — กดช่องบนผังเพื่อเลือก/เอาออก</span>
              <span className="text-theme-xs text-gray-500 dark:text-gray-400">เลือกแล้ว {slotIds.length} ช่อง</span>
            </div>
            <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />}>
              <SlotPicker3D zones={zones} zoneId={zone?.id ?? null} selected={slotIds} kind={kind} disabled={!editable} onToggle={toggle} holders={holders} />
            </Suspense>
            <p className="mt-3 mb-1.5 text-theme-xs text-gray-500 dark:text-gray-400">หรือเลือกจากรายการ</p>
            <div className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              {SLOT_GROUPS.map((g) => (
                <div key={g.prefix} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-28 shrink-0 text-theme-xs text-gray-500 dark:text-gray-400">{g.label}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {SLOT_IDS.filter((id) => id.startsWith(g.prefix)).map((id) => {
                      const other = ownerOf(id);
                      const on = slotIds.includes(id);
                      const held = holder(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={!editable}
                          aria-pressed={on}
                          title={other ? (on ? `จะย้ายมาจากโซน “${other.name}”` : `อยู่ในโซน “${other.name}” (กดเพื่อย้ายมาโซนนี้)`) : held ? `${held.ownerName} ใช้อยู่` : slotLabel(id)}
                          onClick={() => toggle(id)}
                          className={cn(
                            "h-9 min-w-9 rounded-lg border px-2 text-theme-sm tabular-nums",
                            on ? (other ? "border-gold-500 bg-brand-500 text-on-brand ring-2 ring-gold-400" : "border-brand-500 bg-brand-500 text-on-brand") : other ? "border-dashed border-gray-300 text-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-white/5" : "border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5",
                          )}
                        >
                          {slotShort(id)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {taking.length > 0 ? (
              <p className="mt-2 rounded-lg bg-gold-50 px-3 py-2 text-theme-xs text-gray-700 dark:bg-gold-500/10 dark:text-gray-300">
                จะย้าย {taking.map((id) => `${slotShort(id)} (จากโซน “${ownerOf(id)?.name}”)`).join(", ")} มาโซนนี้ ผู้เช่าในช่องนั้นจะเปลี่ยนเป็นโซนนี้ด้วย
              </p>
            ) : (
              <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">ช่องที่เป็นเส้นประอยู่ในโซนอื่น กดเพื่อย้ายมาโซนนี้ได้ · เลขตรงกับเลขช่องบนผัง 3 มิติ</p>
            )}
          </div>

          {!storage && <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <Toggle checked={moto} onChange={setMoto} disabled={!editable} label="โซนนี้ให้จอดมอเตอร์ไซค์" hint="เป็นโซนมอเตอร์ไซค์: จอดได้เฉพาะมอเตอร์ไซค์ เรียงในช่องที่เลือก ห่างกันไม่ติดกัน" />
            {moto && (
              <div>
                <TextField label="จอดมอเตอร์ไซค์ได้กี่คัน" inputMode="numeric" value={motoCap} onChange={(e) => setMotoCap(e.target.value.replace(/\D/g, ""))} disabled={!editable} wrapperClassName="max-w-xs" error={motoCap && Number(motoCap) > room ? `ช่องที่เลือกจอดได้สูงสุด ${room} คัน` : null} hint={slotIds.length ? `ช่องที่เลือกจอดได้สูงสุด ${room} คัน (${slotIds.filter((id) => bayGrid(id).count).map((id) => `${slotShort(id)}: ${bayGrid(id).count}`).join(", ")})` : "เลือกช่องจอดด้านบนก่อน"} />
                {zone && motoCap && <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">จอดอยู่ {rows.filter((r) => r.zoneId === zone.id && isMotorcycle(r.vehicleType)).length} คัน · เหลือว่าง {Math.max(0, Number(motoCap) - rows.filter((r) => r.zoneId === zone.id && isMotorcycle(r.vehicleType)).length)} คัน</p>}
              </div>
            )}
          </div>}

          {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
        </div>
      </Sheet>
      <ConfirmDialog open={confirm} title="ลบโซน?" body={count ? `โซนนี้มีรถ ${count} คัน ถ้าลบ รถเหล่านั้นจะเปลี่ยนเป็น “ไม่ระบุโซน” (ช่องจอดและข้อมูลการชำระไม่เปลี่ยน)` : "ลบโซนนี้ออกจากระบบ"} confirmLabel="ลบโซน" busy={busy} onConfirm={remove} onClose={() => setConfirm(false)} />
    </>
  );
}

