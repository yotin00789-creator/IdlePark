import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import EmptyState from "@/components/app/EmptyState";
import PageHeader from "@/components/app/PageHeader";
import UserAvatar from "@/components/app/UserAvatar";
import PageMeta from "@/components/common/PageMeta";
import { SearchGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { dataStore } from "@/lib/dataStore";
import { toast } from "@/lib/toast";
import ThaiDateRangePicker from "@/components/app/ThaiDateRangePicker";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/session";
import { cn } from "@/utils";
import { Fragment, useCallback, useEffect, useState } from "react";

interface Entry {
  id: number;
  at: string;
  userId: number | null;
  userEmail: string;
  userName: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  status: "ok" | "failed" | "denied";
  restorable?: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "เข้าสู่ระบบ", "auth.login_failed": "เข้าสู่ระบบไม่สำเร็จ", "auth.logout": "ออกจากระบบ", "auth.setup": "ตั้งค่าครั้งแรก", "auth.password_ok": "ผ่านรหัสผ่าน (รอ MFA)", "auth.mfa_failed": "ยืนยัน MFA ไม่สำเร็จ", "auth.forgot": "ขอตั้งรหัสผ่านใหม่", "auth.password_reset": "ตั้งรหัสผ่านใหม่",
  "payment.update": "แก้ยอดรายรับ", "item.update": "แก้ยอดสรุปเดือน", "row.create": "เพิ่มผู้เช่า", "row.update": "แก้ไขผู้เช่า", "row.delete": "ลบแถวผู้เช่า", "year.copy": "สร้างปีใหม่",
  "customer.create": "เพิ่มลูกค้า", "customer.update": "แก้ไขลูกค้า", "customer.delete": "ลบลูกค้า", "zone.create": "เพิ่มโซน", "zone.update": "แก้ไขโซน", "zone.delete": "ลบโซน", "row.restore": "กู้คืนแถวผู้เช่า", "zone.restore": "กู้คืนโซน", "customer.restore": "กู้คืนลูกค้า",
  "account.create": "เพิ่มบัญชี", "account.update": "แก้ไขบัญชี", "account.delete": "ลบบัญชี", "account.reveal": "ดูเลขบัญชีเต็ม", "settings.update": "แก้ไขตั้งค่า", "formula.mode": "เปลี่ยนโหมดสูตร",
  "savings.update": "แก้เงินเก็บพ่อ (รายวัน)", "savings.item": "แก้เงินเก็บพ่อ (ค่าใช้จ่าย/บัตร)",
  "user.invite": "เชิญผู้ใช้", "user.resend_invite": "ส่งคำเชิญซ้ำ", "user.send_reset": "ส่งลิงก์ตั้งรหัสผ่าน", "user.update": "แก้ไขผู้ใช้", "user.delete_invite": "ยกเลิกคำเชิญ", "user.reset_mfa": "รีเซ็ต MFA", "user.accept_invite": "ผู้ใช้ตั้งรหัสผ่านครั้งแรก",
  "mail.test": "ส่งอีเมลทดสอบ", "mfa.enable": "เปิด MFA", "mfa.disable": "ปิด MFA", "mfa.recovery_regenerate": "สร้างรหัสกู้คืนใหม่",
  "profile.update": "แก้ไขโปรไฟล์", "profile.avatar_set": "เปลี่ยนรูปโปรไฟล์", "profile.avatar_remove": "ลบรูปโปรไฟล์", "profile.password_change": "เปลี่ยนรหัสผ่าน",
  "reminder.run": "สั่งแจ้งเตือนค้างชำระ", "reminder.cron": "แจ้งเตือนอัตโนมัติ",
  "slot.kind": "ตั้งชนิดช่อง", "row.unplace": "เอารถออกจากผัง", "year.auto": "สร้างปีใหม่อัตโนมัติ", "data.revert": "ย้อนข้อมูล", "backup.auto": "สำรองข้อมูลอัตโนมัติ",
};
const GROUPS: [string, string][] = [["", "ทุกหมวด"], ["auth", "เข้าสู่ระบบ"], ["payment", "ยอดรายรับ"], ["item", "ยอดสรุปเดือน"], ["row", "ผู้เช่า/แถว"], ["customer", "ลูกค้า"], ["zone", "โซน"], ["user", "ผู้ใช้"], ["mfa", "MFA"], ["profile", "โปรไฟล์"], ["account", "บัญชีรับเงิน"], ["settings", "ตั้งค่า"], ["formula", "สูตร"], ["savings", "เงินเก็บพ่อ"], ["reminder", "แจ้งเตือน"], ["mail", "อีเมล"]];

const tone = (a: string): "primary" | "success" | "warning" | "error" | "info" | "light" =>
  a.startsWith("auth.login_failed") || a.endsWith("failed") ? "error" : a.startsWith("payment") || a.startsWith("item") || a.startsWith("savings") ? "primary" : a.endsWith("delete") || a.includes("disable") || a.includes("reset") ? "warning" : a.startsWith("auth") ? "light" : a.startsWith("user") ? "info" : "success";

const input = "app-input h-10 w-auto";

export default function AuditLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [f, setF] = useState({ q: "", action: "", user: "", status: "", from: "", to: "" });

  const query = useCallback((before?: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    if (before) p.set("before", String(before));
    return `/audit?${p}`;
  }, [f]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setLoading(true);
      api.get<{ entries: Entry[]; hasMore: boolean; users: string[] }>(query())
        .then((r) => { setEntries(r.entries); setHasMore(r.hasMore); setUsers(r.users); setError(null); })
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const [restoring, setRestoring] = useState<number | null>(null);
  const restore = async (e: Entry) => {
    setRestoring(e.id);
    try {
      const r = await api.post<{ ok: boolean; note: string; summary: string }>(`/audit/${e.id}/restore`, {});
      toast.success("กู้คืนแล้ว", r.note ? `${r.summary} — ${r.note}` : r.summary);
      setEntries((list) => list.map((x) => (x.id === e.id ? { ...x, restorable: false } : x)));
      void dataStore.load(true);
    } catch (err) {
      toast.error("กู้คืนไม่ได้", errorMessage(err));
    } finally {
      setRestoring(null);
    }
  };

  const more = async () => {
    const last = entries.at(-1);
    if (!last) return;
    const r = await api.get<{ entries: Entry[]; hasMore: boolean }>(query(last.id));
    setEntries((e) => [...e, ...r.entries]);
    setHasMore(r.hasMore);
  };

  return (
    <>
      <PageMeta title="ประวัติการใช้งาน | IdlePark" description="ใครทำอะไร เมื่อไร อย่างไร" />
      <PageHeader title="ประวัติการใช้งาน (Audit log)" description="บันทึกทุกการแก้ไขตัวเลข การเข้าสู่ระบบ และการเปลี่ยนแปลงผู้ใช้ — ใคร ทำอะไร เมื่อไร และเปลี่ยนจากอะไรเป็นอะไร" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 md:max-w-xs">
          <SearchGlyph className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <input type="search" aria-label="ค้นหาในประวัติ" placeholder="ค้นหา เช่น ชื่อผู้เช่า อีเมล" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} className="app-input h-10 ps-9" />
        </div>
        <select aria-label="หมวดการกระทำ" className={input} value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}>{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select aria-label="ผู้ทำรายการ" className={input} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}><option value="">ทุกคน</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <select aria-label="ผลลัพธ์" className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">ทุกผลลัพธ์</option><option value="ok">สำเร็จ</option><option value="failed">ไม่สำเร็จ</option></select>
        <ThaiDateRangePicker label="ช่วงวันที่" value={{ from: f.from, to: f.to }} onChange={(r) => setF({ ...f, from: r.from, to: r.to })} className="w-full sm:w-[17.5rem]" />
      </div>
      <Card bodyClassName="p-0">
        {error ? <EmptyState title={error} /> : loading && !entries.length ? <EmptyState title="กำลังโหลด…" /> : entries.length === 0 ? <EmptyState title="ไม่พบรายการ" body="ลองเปลี่ยนตัวกรอง" /> : (
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full min-w-3xl">
              <thead><tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"><th className="app-th">เมื่อไร</th><th className="app-th">ใคร</th><th className="app-th">ทำอะไร</th><th className="app-th">รายละเอียด</th><th className="app-th" /></tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr className={cn("align-top hover:bg-gray-50 dark:hover:bg-white/3", open === e.id && "bg-gray-50 dark:bg-white/3")}>
                      <td className="app-td whitespace-nowrap text-theme-xs text-gray-500">{formatDateTime(e.at)}</td>
                      <td className="app-td">
                        <span className="flex items-center gap-2"><UserAvatar id={e.userId ?? 0} name={e.userName || e.userEmail || "ระบบ"} hasAvatar={false} version={0} size={24} />
                          <span className="leading-tight"><span className="block text-theme-sm text-gray-800 dark:text-white/90">{e.userName || e.userEmail || "ไม่ทราบ"}</span><span className="block text-[11px] text-gray-500 dark:text-gray-400">{ROLE_LABEL[e.role as keyof typeof ROLE_LABEL] ?? e.role}</span></span></span>
                      </td>
                      <td className="app-td whitespace-nowrap"><Badge size="sm" color={tone(e.action)}>{ACTION_LABEL[e.action] ?? e.action}</Badge>{e.status !== "ok" && <span className="ms-1.5 text-theme-xs text-error-600">ไม่สำเร็จ</span>}</td>
                      <td className="app-td max-w-md text-theme-sm">{e.summary}{e.restorable && <button disabled={restoring === e.id} onClick={() => restore(e)} className="mt-1.5 block rounded-lg border border-gray-300 px-2.5 py-1 text-theme-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5">{restoring === e.id ? "กำลังกู้คืน…" : "กู้คืนรายการนี้"}</button>}</td>
                      <td className="app-td text-end"><button onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="text-theme-xs font-medium text-link">{open === e.id ? "ซ่อน" : "รายละเอียด"}</button></td>
                    </tr>
                    {open === e.id && (
                      <tr className="bg-gray-50 dark:bg-white/3"><td colSpan={5} className="px-5 pt-1 pb-4">
                        <div className="grid gap-4 text-theme-xs md:grid-cols-2">
                          <dl className="space-y-1">
                            <Row k="รหัสรายการ" v={`#${e.id}`} /><Row k="อีเมล" v={e.userEmail || "—"} /><Row k="ข้อมูลที่เกี่ยวข้อง" v={`${e.entity || "—"} ${e.entityId}`} /><Row k="วิธีเรียก" v={`${e.method ?? ""} ${e.path ?? ""}`} /><Row k="IP" v={e.ip ?? "—"} /><Row k="เบราว์เซอร์" v={(e.userAgent ?? "—").slice(0, 80)} />
                          </dl>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Json title="ก่อนแก้" v={e.before} /><Json title="หลังแก้" v={e.after} />
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && <div className="border-t border-gray-100 p-4 text-center dark:border-gray-800"><Button variant="outline" onClick={more}>โหลดเพิ่ม</Button></div>}
      </Card>
    </>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex gap-3"><dt className="w-28 shrink-0 text-gray-500 dark:text-gray-400">{k}</dt><dd className="break-all text-gray-700 dark:text-gray-300">{v}</dd></div>;
function Json({ title, v }: { title: string; v: unknown }) {
  return (
    <div>
      <p className="mb-1 text-gray-500 dark:text-gray-400">{title}</p>
      <pre className="custom-scrollbar max-h-40 overflow-auto rounded-md border border-gray-200 bg-white p-2 font-mono text-[11px] leading-4 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">{v == null ? "—" : JSON.stringify(v, null, 2)}</pre>
    </div>
  );
}
