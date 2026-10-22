import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { SelectField, TextField, Toggle } from "@/components/app/Field";
import PageHeader from "@/components/app/PageHeader";
import PageMeta from "@/components/common/PageMeta";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useData, type AppData, type ReminderSettings } from "@/lib/dataStore";
import { formatBaht, formatDateTime, formatIsoThai, monthName, parseBaht } from "@/lib/format";
import { toast } from "@/lib/toast";
import BackupCard from "@/components/settings/BackupCard";
import DbStatusCard from "@/components/settings/DbStatusCard";
import TimeField from "@/components/app/TimeField";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import { useCallback, useEffect, useState } from "react";

interface Status {
  smtpConfigured: boolean;
  cronConfigured: boolean;
  today: { year: number; month: number; day: number };
  groups: { year: number; month: number; dueDay: number; count: number; due: number; action: "send" | "wait" | "done"; reason: string; rounds: number; nextDate: string | null; startDate: string }[];
  logs: { year: number; month: number; round: number; sentAt: string; count: number; recipients: string; delivered: boolean; detail: string }[];
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.round(Number(v)) || 0));
const thaiDate = (iso: string | null) => (iso ? formatIsoThai(iso) : "—");

export default function Settings() {
  const { data } = useData();
  return data ? <SettingsForm data={data} /> : null;
}

function SettingsForm({ data }: { data: AppData }) {
  const [fee, setFee] = useState(String(data.settings.monthlyFeeDefault / 100));
  const [r, setR] = useState<ReminderSettings>(data.settings.reminders);
  const [unlimited, setUnlimited] = useState(data.settings.reminders.maxRounds === 0);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetAsk, setResetAsk] = useState(false);
  const [running, setRunning] = useState(false);

  const loadStatus = useCallback(() => api.get<Status>("/reminders/status").then(setStatus).catch(() => {}), []);
  useEffect(() => {
    const t = window.setTimeout(loadStatus, 0);
    return () => window.clearTimeout(t);
  }, [loadStatus]);

  const set = <K extends keyof ReminderSettings>(k: K, v: ReminderSettings[K]) => setR({ ...r, [k]: v });
  const sample = `รถที่นัดชำระวันที่ ${r.dueDay} พ้นวันนั้นแล้วยังไม่จ่าย จะส่งอีเมลแจ้งผู้ดูแลวันที่ ${r.dueDay + 1 + r.firstAfterDays > 31 ? "ของเดือนถัดไป" : r.dueDay + 1 + r.firstAfterDays} เวลา ${r.sendTime.replace(":", ".")} น.${r.intervalDays ? ` แล้วเตือนซ้ำทุก ${r.intervalDays} วัน` : ""}${unlimited ? " จนกว่าจะบันทึกการชำระเงิน" : ` สูงสุด ${r.maxRounds} ครั้ง`} · จ่ายแล้วไม่แจ้ง${r.lookbackMonths ? ` · นับเดือนที่ค้างย้อนหลัง ${r.lookbackMonths} เดือน` : ""}`;

  const save = async () => {
    const f = parseBaht(fee);
    if (f === "invalid" || f == null || f <= 0) return toast.error("ค่าเช่าเริ่มต้นต้องเป็นตัวเลขมากกว่า 0");
    setSaving(true);
    try {
      await api.put("/settings", { monthlyFeeDefault: f, reminders: { ...r, maxRounds: unlimited ? 0 : Math.max(1, r.maxRounds) } });
      await dataStore.load(true);
      await loadStatus();
      toast.success("บันทึกการตั้งค่าแล้ว");
    } catch (e) { toast.error(errorMessage(e)); }
    setSaving(false);
  };

  const run = async (force: boolean) => {
    setRunning(true);
    try {
      const res = await api.post<{ skipped?: string; summary: string; mail?: { ok: boolean; error?: string } }>("/reminders/run", { force });
      if (res.skipped) toast.info(res.skipped);
      else if (res.mail && !res.mail.ok) toast.error(`ส่งอีเมลไม่สำเร็จ: ${res.mail.error ?? ""} (แจ้งเตือนในกระดิ่งแล้ว)`);
      else toast.success(res.summary);
      await loadStatus();
    } catch (e) { toast.error(errorMessage(e)); }
    setRunning(false);
  };

  return (
    <>
      <PageMeta title="ตั้งค่าและแจ้งเตือน | IdlePark" description="ตั้งค่าการแจ้งเตือนค้างชำระและค่าเริ่มต้น" />
      <PageHeader title="ตั้งค่าและแจ้งเตือน" description="กำหนดว่าจะแจ้งผู้ดูแลเมื่อมีผู้เช่าค้างจ่าย เมื่อไร และบ่อยแค่ไหน จนกว่าจะมีคนเข้ามาอัปเดตข้อมูล" actions={<Button loading={saving} onClick={save}>บันทึกการตั้งค่า</Button>} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <Card title="แจ้งเตือนผู้ที่ยังไม่จ่าย" description="ตรวจทุกวันโดยอัตโนมัติ (Vercel Cron) แล้วแจ้งตามตารางที่ตั้งไว้">
            <div className="space-y-5">
              <Toggle checked={r.enabled} onChange={(v) => set("enabled", v)} label="เปิดการแจ้งเตือนอัตโนมัติ" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="วันนัดชำระเริ่มต้นของทุกเดือน" inputMode="numeric" value={String(r.dueDay)} onChange={(e) => set("dueDay", Math.max(1, Math.min(31, num(e.target.value))))} hint="วันที่ 1–31 · แต่ละคันตั้งวันของตัวเองได้ในฟอร์มรถ/ลูกค้า" />
                <TimeField label="เวลาที่ส่งอีเมลแจ้งเตือน (เวลาประเทศไทย)" value={r.sendTime} onChange={(v) => set("sendTime", v)} hint="เช่น 08.00 น. ของวันถัดจากวันนัดชำระ" />
                <TextField label="รอเพิ่มอีกกี่วันก่อนแจ้งครั้งแรก" inputMode="numeric" value={String(r.firstAfterDays)} onChange={(e) => set("firstAfterDays", num(e.target.value))} hint="0 = แจ้งวันถัดจากวันนัดชำระ" />
                <TextField label="แจ้งซ้ำทุกกี่วัน" inputMode="numeric" value={String(r.intervalDays)} onChange={(e) => set("intervalDays", Math.max(1, num(e.target.value)))} />
                <TextField label="ย้อนหลังกี่เดือน" inputMode="numeric" value={String(r.lookbackMonths)} onChange={(e) => set("lookbackMonths", Math.min(11, num(e.target.value)))} hint="นับเดือนก่อนหน้าที่ยังค้างด้วย (0 = เฉพาะเดือนปัจจุบัน)" />
              </div>
              <div className="space-y-3">
                <Toggle checked={unlimited} onChange={(v) => { setUnlimited(v); if (!v && r.maxRounds === 0) set("maxRounds", 3); }} label="แจ้งต่อเนื่องจนกว่าจะบันทึกการชำระ" hint="ปิดเพื่อกำหนดจำนวนครั้งสูงสุด" />
                {!unlimited && <TextField label="จำนวนครั้งสูงสุดต่อเดือน" inputMode="numeric" value={String(r.maxRounds)} onChange={(e) => set("maxRounds", Math.max(1, num(e.target.value)))} wrapperClassName="max-w-xs" />}
              </div>
              <SelectField label="ผู้รับอีเมล" value={r.recipients} onChange={(e) => set("recipients", e.target.value as ReminderSettings["recipients"])} wrapperClassName="max-w-xs">
                <option value="admins">ผู้ดูแลทุกคน</option><option value="admins_editors">ผู้ดูแลและผู้แก้ไข</option>
              </SelectField>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Toggle checked={r.email} onChange={(v) => set("email", v)} label="ส่งอีเมล" hint="ผ่าน Gmail SMTP" />
                <Toggle checked={r.bell} onChange={(v) => set("bell", v)} label="แจ้งที่กระดิ่งในระบบ" />
              </div>
              <p className="rounded-lg bg-brand-25 px-4 py-3 text-theme-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-300"><span className="font-medium">ตัวอย่างตามที่ตั้งไว้: </span>{sample}</p>
            </div>
          </Card>

          <Card title="วันนัดชำระรายคัน" description="บางคันจ่ายวันที่ A บางคันวันที่ B ก็ตั้งได้ในฟอร์มรถ">
            <p className="text-theme-sm text-gray-600 dark:text-gray-400">ถ้าอยากให้ทุกคันกลับมาใช้วันนัดชำระเริ่มต้น (วันที่ {r.dueDay}) กดปุ่มซิงก์ด้านล่าง ส่วนลูกค้าที่มีหลายคัน กดซิงก์ในหน้าข้อมูลลูกค้าได้</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => setResetAsk(true)}>ซิงก์ทุกคันให้ใช้วันเริ่มต้น</Button>
          </Card>

          <BackupCard />

          <Card title="ค่าเริ่มต้น">
            <TextField label="ค่าเช่าต่อคันต่อเดือน (บาท)" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} wrapperClassName="max-w-xs" hint="ใช้กับผู้เช่าที่เพิ่มใหม่ ผู้เช่าเดิมแก้ค่าเช่ารายคนได้ในสมุดรายรับ" />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="สถานะตอนนี้" description={status ? `ข้อมูล ณ ${status.today.day} ${monthName(status.today.month)} ${status.today.year}` : undefined} actions={<Badge size="sm" color={status?.smtpConfigured ? "success" : "warning"}>{status?.smtpConfigured ? "SMTP พร้อม" : "ยังไม่ตั้ง SMTP"}</Badge>}>
            {!status ? <p className="text-theme-sm text-gray-500">กำลังโหลด…</p> : status.groups.length === 0 ? <p className="text-theme-sm text-gray-500">ไม่มีผู้ค้างชำระ</p> : (
              <ul className="space-y-3">
                {status.groups.map((g) => (
                  <li key={`${g.year}-${g.month}`} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="flex justify-between text-theme-sm"><span className="font-medium text-gray-800 dark:text-white/90">{monthName(g.month)} {g.year} · นัดวันที่ {g.dueDay}</span><span className="num text-error-600">ค้าง {g.count} คัน · {formatBaht(g.due)}</span></div>
                    <p className="mt-1 text-theme-xs text-gray-500">{g.action === "send" ? `พร้อมแจ้ง (${g.reason}) ในรอบถัดไป` : g.action === "done" ? g.reason : `${g.reason}${g.nextDate ? ` · แจ้งครั้งต่อไป ${thaiDate(g.nextDate)}` : ""}`} · แจ้งแล้ว {g.rounds} ครั้ง</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={running} onClick={() => run(false)}>รันตามตาราง</Button>
              <Button size="sm" variant="outline" loading={running} onClick={() => run(true)}>ส่งแจ้งเตือนทันที</Button>
            </div>
            {!status?.smtpConfigured && <p className="mt-3 text-theme-xs text-warning-700 dark:text-warning-400">ยังไม่ได้ตั้งค่า SMTP จึงไม่ส่งอีเมล (กระดิ่งยังทำงาน) ดูวิธีตั้งค่าใน README</p>}
          </Card>
          <DbStatusCard />
          <Card title="ประวัติการแจ้งเตือน" bodyClassName="p-0">
            {!status || status.logs.length === 0 ? <p className="px-5 pb-5 text-theme-sm text-gray-500">ยังไม่เคยแจ้ง</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {status.logs.slice(0, 10).map((l, i) => (
                  <li key={i} className="px-5 py-3 text-theme-sm">
                    <div className="flex justify-between"><span className="text-gray-800 dark:text-white/90">{monthName(l.month)} · ครั้งที่ {l.round}</span><span className={l.delivered ? "text-success-600" : "text-error-600"}>{l.delivered ? "ส่งแล้ว" : "ส่งไม่สำเร็จ"}</span></div>
                    <p className="text-theme-xs text-gray-500">{formatDateTime(l.sentAt)} · {l.count} คัน{l.recipients ? ` · ${l.recipients}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={resetAsk}
        title="ให้ทุกคันใช้วันนัดชำระเริ่มต้น?"
        body={`รถทุกคันของปีนี้จะนัดชำระวันที่ ${r.dueDay} ตามค่าเริ่มต้น (วันนัดที่เคยตั้งรายคันจะถูกล้าง)`}
        confirmLabel="ซิงก์ทุกคัน"
        tone="primary"
        onClose={() => setResetAsk(false)}
        onConfirm={async () => {
          try {
            const res = await api.post<{ changed: number }>("/ledger/due-day/reset", {});
            await dataStore.load(true);
            toast.success("ซิงก์วันนัดชำระแล้ว", `${res.changed} คันกลับไปใช้ค่าเริ่มต้น`);
          } catch (e) { toast.error(errorMessage(e)); }
          setResetAsk(false);
        }}
      />
    </>
  );
}
