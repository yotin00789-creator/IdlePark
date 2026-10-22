import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { SelectField, TextField, Toggle } from "@/components/app/Field";
import TimeField from "@/components/app/TimeField";
import { DownloadGlyph, SendGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useCallback, useEffect, useState } from "react";

interface BackupSettings {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  weekday: number;
  monthDay: number;
  time: string;
  userIds: number[];
  externalEmails: string[];
}
interface Status {
  settings: BackupSettings;
  smtpConfigured: boolean;
  users: { id: number; email: string; name: string; role: string }[];
  logs: { id: number; at: string; kind: "auto" | "manual"; ok: boolean; recipients: string; sizeBytes: number; detail: string }[];
}

const WEEKDAYS = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function BackupCard() {
  const [st, setSt] = useState<Status | null>(null);
  const [s, setS] = useState<BackupSettings | null>(null);
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Status>("/backup/status");
      setSt(r);
      setS((cur) => cur ?? r.settings);
    } catch {
      /* admins only */
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (!st || !s) return null;
  const set = <K extends keyof BackupSettings>(k: K, v: BackupSettings[K]) => setS({ ...s, [k]: v });
  const toggleUser = (id: number) => set("userIds", s.userIds.includes(id) ? s.userIds.filter((x) => x !== id) : [...s.userIds, id]);

  const addEmail = () => {
    const parts = extra.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find((x) => !EMAIL.test(x));
    if (bad) return setError(`อีเมล “${bad}” ไม่ถูกต้อง`);
    setError(null);
    set("externalEmails", [...new Set([...s.externalEmails, ...parts])].slice(0, 10));
    setExtra("");
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      const r = await api.put<{ settings: BackupSettings }>("/backup/settings", s);
      setS(r.settings);
      toast.success(r.settings.enabled ? "เปิดการสำรองข้อมูลอัตโนมัติแล้ว" : "บันทึกการตั้งค่าสำรองข้อมูลแล้ว", r.settings.enabled ? "ไฟล์ Excel จะถูกส่งตามรอบที่ตั้งไว้" : undefined);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(null);
  };
  const runNow = async () => {
    setBusy("run");
    setError(null);
    try {
      await api.put("/backup/settings", s); // send to who is selected now
      const r = await api.post<{ ok: boolean; recipients: string[]; mail?: { error?: string } }>("/backup/run");
      if (r.ok) toast.success("ส่งไฟล์สำรองข้อมูลแล้ว", `ถึง ${r.recipients.join(", ")}`);
      else toast.error("ส่งอีเมลไม่สำเร็จ", r.mail?.error);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(null);
  };

  const count = s.userIds.length + s.externalEmails.length;
  return (
    <Card
      title="สำรองข้อมูลด้วยอีเมล"
      description="ส่งไฟล์ Excel (ทุกปี ลูกค้า รถ โซน) ไปให้ผู้ที่เลือก ไม่มีเลขบัญชีเต็มหรือรหัสผ่าน"
      actions={<Badge size="sm" color={s.enabled ? "success" : "light"}>{s.enabled ? "เปิดอยู่" : "ปิดอยู่"}</Badge>}
    >
      <div className="space-y-5">
        <Toggle checked={s.enabled} onChange={(v) => set("enabled", v)} label="สำรองข้อมูลอัตโนมัติ" hint="ปิดไว้ได้ แล้วกด “สำรองตอนนี้” เมื่อต้องการ" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="ความถี่" value={s.frequency} onChange={(e) => set("frequency", e.target.value as BackupSettings["frequency"])}>
            <option value="daily">ทุกวัน</option><option value="weekly">ทุกสัปดาห์</option><option value="monthly">ทุกเดือน</option>
          </SelectField>
          {s.frequency === "weekly" && (
            <SelectField label="วัน" value={s.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </SelectField>
          )}
          {s.frequency === "monthly" && (
            <SelectField label="วันที่ของเดือน" value={s.monthDay} onChange={(e) => set("monthDay", Number(e.target.value))} hint="เลือกได้ถึงวันที่ 28 เพื่อให้ตรงทุกเดือน">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>วันที่ {d}</option>)}
            </SelectField>
          )}
          <TimeField label="เวลา (เวลาประเทศไทย)" value={s.time} onChange={(v) => set("time", v)} />
        </div>

        <div>
          <p className="mb-1.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">ส่งถึงผู้ใช้ในระบบ</p>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {st.users.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5">
                  <input type="checkbox" checked={s.userIds.includes(u.id)} onChange={() => toggleUser(u.id)} className="size-4 rounded border-gray-300 accent-brand-500" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-theme-sm text-gray-800 dark:text-white/90">{u.name || u.email}</span><span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{u.email}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">หรือกรอกอีเมลอื่น (ภายนอกระบบก็ได้)</p>
          <div className="flex gap-2">
            <TextField label="อีเมล" type="email" value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }} placeholder="name@example.com" wrapperClassName="min-w-0 flex-1" />
            <Button variant="outline" className="mt-[1.65rem]" onClick={addEmail}>เพิ่ม</Button>
          </div>
          {s.externalEmails.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {s.externalEmails.map((m) => (
                <li key={m} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 ps-3 pe-1.5 text-theme-xs text-gray-700 dark:bg-white/10 dark:text-gray-300">
                  {m}
                  <button onClick={() => set("externalEmails", s.externalEmails.filter((x) => x !== m))} aria-label={`เอา ${m} ออก`} className="inline-flex size-5 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10">×</button>
                </li>
              ))}
            </ul>
          )}
          {s.externalEmails.length > 0 && <p className="mt-2 text-theme-xs text-warning-700 dark:text-warning-400">ไฟล์มีข้อมูลส่วนตัวของผู้เช่า ส่งให้เฉพาะคนที่ไว้ใจ</p>}
        </div>

        {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
        {!st.smtpConfigured && <p className="text-theme-xs text-warning-700 dark:text-warning-400">ยังไม่ได้ตั้งค่า SMTP จึงยังส่งอีเมลจริงไม่ได้ (ตอนนี้บันทึกไฟล์ไว้ในโฟลเดอร์ .data/outbox) ดูวิธีตั้งค่าใน README</p>}

        <div className="flex flex-wrap gap-2">
          <Button loading={busy === "save"} onClick={save}>บันทึกการตั้งค่าสำรอง</Button>
          <Button variant="outline" icon={<SendGlyph />} loading={busy === "run"} disabled={count === 0} onClick={runNow}>สำรองตอนนี้</Button>
          <a href="/api/backup/download" className="inline-flex h-11 items-center gap-2 rounded-lg border border-gray-300 px-4 text-base font-medium text-gray-700 hover:bg-gray-50 md:h-10 md:text-theme-sm dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"><DownloadGlyph className="size-4" /> ดาวน์โหลดไฟล์</a>
        </div>

        {st.logs.length > 0 && (
          <div>
            <p className="mb-1.5 text-theme-sm font-medium text-gray-700 dark:text-gray-300">ประวัติการสำรอง</p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
              {st.logs.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-theme-xs">
                  <span className="min-w-0"><span className="block text-gray-800 dark:text-white/90">{formatDateTime(l.at)} · {l.kind === "auto" ? "อัตโนมัติ" : "สั่งเอง"}</span><span className="block truncate text-gray-500 dark:text-gray-400">{l.recipients || l.detail}{l.sizeBytes ? ` · ${Math.ceil(l.sizeBytes / 1024)} KB` : ""}</span></span>
                  <span className={l.ok ? "shrink-0 text-success-600" : "shrink-0 text-error-600"}>{l.ok ? "ส่งแล้ว" : "ไม่สำเร็จ"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
