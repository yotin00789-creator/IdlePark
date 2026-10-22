import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import { SelectField, TextField } from "@/components/app/Field";
import PageHeader from "@/components/app/PageHeader";
import Sheet from "@/components/app/Sheet";
import UserAvatar from "@/components/app/UserAvatar";
import PageMeta from "@/components/common/PageMeta";
import { UserPlusGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { ROLE_LABEL, fullName, useAuth, type Role } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useCallback, useEffect, useState } from "react";

interface UserRow {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  status: "invited" | "active" | "disabled";
  mfaEnabled: boolean;
  hasAvatar: boolean;
  avatarVersion: number;
  invitedAt: string | null;
  lastLoginAt: string | null;
}
interface MailResult { ok: boolean; mode: string; error?: string }

const ROLE_HINT: Record<Role, string> = { admin: "จัดการผู้ใช้ ตั้งค่า ดูประวัติ และแก้ไขข้อมูลได้ทุกอย่าง", editor: "บันทึกและแก้ไขยอด ลูกค้า โซน", viewer: "ดูข้อมูลได้อย่างเดียว" };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [smtp, setSmtp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<{ user: UserRow | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "mfa" | "cancel" | "disable"; user: UserRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ users: UserRow[]; smtpConfigured: boolean }>("/users");
      setUsers(r.users);
      setSmtp(r.smtpConfigured);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const resend = async (u: UserRow) => {
    try {
      const r = await api.post<{ mail: MailResult; link: string; tempPassword?: string }>(`/users/${u.id}/resend`);
      if (r.mail.ok) toast.success(`ส่งอีเมลถึง ${u.email} แล้ว`, u.status === "invited" ? "รหัสผ่านชั่วคราวใหม่ใช้แทนรหัสเดิม" : undefined);
      else {
        toast.error(`ส่งอีเมลไม่สำเร็จ: ${r.mail.error ?? ""}`);
        if (r.tempPassword) { await navigator.clipboard?.writeText(r.tempPassword).catch(() => {}); toast.info("คัดลอกรหัสผ่านชั่วคราวไว้ให้แล้ว", "ส่งให้ผู้ใช้เองได้ (แสดงครั้งนี้ครั้งเดียว)"); }
      }
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "mfa") await api.post(`/users/${confirm.user.id}/reset-mfa`);
      if (confirm.kind === "cancel") await api.del(`/users/${confirm.user.id}`);
      if (confirm.kind === "disable") await api.patch(`/users/${confirm.user.id}`, { isActive: !confirm.user.isActive });
      toast.success("ดำเนินการแล้ว");
      await load();
    } catch (e) { toast.error(errorMessage(e)); }
    setBusy(false);
    setConfirm(null);
  };

  const testMail = async () => {
    setTesting(true);
    try {
      const r = await api.post<{ mail: MailResult }>("/mail/test", {});
      if (r.mail.ok) toast.success(r.mail.mode === "smtp" ? "ส่งอีเมลทดสอบแล้ว ตรวจกล่องจดหมายของคุณ" : "โหมดทดสอบ: บันทึกอีเมลไว้ที่ .data/outbox");
      else toast.error(`ส่งไม่สำเร็จ: ${r.mail.error ?? ""}`);
    } catch (e) { toast.error(errorMessage(e)); }
    setTesting(false);
  };

  const badge = (u: UserRow) => u.status === "active" ? <Badge size="sm" color="success">ใช้งานอยู่</Badge> : u.status === "invited" ? <Badge size="sm" color="warning">รอตั้งรหัสผ่านใหม่</Badge> : <Badge size="sm" color="light">ปิดบัญชี</Badge>;

  return (
    <>
      <PageMeta title="ผู้ใช้งาน | IdlePark" description="เพิ่มและจัดการผู้ใช้" />
      <PageHeader title="ผู้ใช้งาน" description="เพิ่มผู้ใช้ด้วยอีเมล ชื่อ และนามสกุล ระบบส่งรหัสผ่านชั่วคราวทางอีเมล ผู้ใช้เข้าสู่ระบบแล้วตั้งรหัสผ่านใหม่ของตัวเอง" actions={<Button icon={<UserPlusGlyph />} onClick={() => setSheet({ user: null })}>เพิ่มผู้ใช้</Button>} />

      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-theme-sm ${smtp ? "bg-success-50 text-success-800 dark:bg-success-500/10 dark:text-success-400" : "bg-warning-50 text-warning-800 dark:bg-warning-500/10 dark:text-warning-400"}`}>
        <p>{smtp ? "เชื่อมต่อ Gmail SMTP แล้ว: อีเมลคำเชิญและแจ้งเตือนจะส่งจริง" : "ยังไม่ได้ตั้งค่า SMTP (SMTP_USER / SMTP_PASS) — อีเมลจะไม่ถูกส่ง แต่ระบบแสดงรหัสผ่านชั่วคราวให้คัดลอกไปส่งเองได้"}</p>
        <Button size="sm" variant="outline" loading={testing} onClick={testMail}>ส่งอีเมลทดสอบถึงฉัน</Button>
      </div>

      <Card bodyClassName="p-0">
        {loading ? <p className="p-6 text-theme-sm text-gray-500">กำลังโหลด…</p> : (
          <>
            <div className="hidden md:block">
              <table className="w-full">
                <thead><tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3"><th className="app-th">ผู้ใช้</th><th className="app-th">สิทธิ์</th><th className="app-th">สถานะ</th><th className="app-th">MFA</th><th className="app-th">เข้าใช้ล่าสุด</th><th className="app-th" /></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-white/3">
                      <td className="app-td"><span className="flex items-center gap-3"><UserAvatar id={u.id} name={fullName(u) || u.email} hasAvatar={u.hasAvatar} version={u.avatarVersion} /><span className="leading-tight"><span className="block font-medium text-gray-800 dark:text-white/90">{fullName(u) || "—"}{u.id === me?.id && <span className="ms-1.5 text-theme-xs font-normal text-gray-500 dark:text-gray-400">(คุณ)</span>}</span><span className="block text-theme-xs text-gray-500">{u.email}</span></span></span></td>
                      <td className="app-td">{ROLE_LABEL[u.role]}</td>
                      <td className="app-td">{badge(u)}</td>
                      <td className="app-td">{u.mfaEnabled ? <Badge size="sm" color="info">เปิด</Badge> : <span className="text-gray-500 dark:text-gray-400">ปิด</span>}</td>
                      <td className="app-td text-theme-xs text-gray-500">{u.lastLoginAt ? relativeTime(u.lastLoginAt) : u.invitedAt ? `เชิญเมื่อ ${formatDateTime(u.invitedAt)}` : "—"}</td>
                      <td className="app-td text-end"><button onClick={() => setSheet({ user: u })} className="text-theme-sm font-medium text-link">จัดการ</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {users.map((u) => (
                <li key={u.id}><button onClick={() => setSheet({ user: u })} className="flex w-full items-center gap-3 px-4 py-3.5 text-start"><UserAvatar id={u.id} name={fullName(u) || u.email} hasAvatar={u.hasAvatar} version={u.avatarVersion} size={40} /><span className="min-w-0 flex-1"><span className="block truncate text-base font-medium text-gray-800 dark:text-white/90">{fullName(u) || u.email}</span><span className="block truncate text-theme-xs text-gray-500">{u.email} · {ROLE_LABEL[u.role]}</span></span>{badge(u)}</button></li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {sheet && <UserSheet user={sheet.user} self={sheet.user?.id === me?.id} onClose={() => setSheet(null)} onSaved={load} onAction={(kind, u) => { setSheet(null); if (kind === "resend") void resend(u); else setConfirm({ kind, user: u }); }} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.kind === "disable" && confirm.user.isActive === false ? "primary" : "danger"}
        title={confirm?.kind === "mfa" ? "บังคับปิด MFA?" : confirm?.kind === "cancel" ? "ยกเลิกคำเชิญ?" : confirm?.user.isActive ? "ปิดบัญชีผู้ใช้?" : "เปิดบัญชีผู้ใช้อีกครั้ง?"}
        body={confirm?.kind === "mfa" ? `ปิด MFA ของ ${confirm.user.email} ทันทีและออกจากระบบทุกอุปกรณ์ ผู้ใช้เข้าสู่ระบบด้วยรหัสผ่านได้เลย แล้วไปตั้งค่า MFA ใหม่เองที่เมนูความปลอดภัยของบัญชี (ใช้เมื่อเครื่องหรือแอปหาย) การกระทำนี้ถูกบันทึกในประวัติ` : confirm?.kind === "cancel" ? `ลบคำเชิญของ ${confirm.user.email} ที่ยังไม่มีใครรับ` : confirm?.user.isActive ? `${confirm.user.email} จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดบัญชีอีกครั้ง ประวัติเดิมยังอยู่` : `${confirm?.user.email} จะเข้าสู่ระบบได้อีกครั้ง`}
        confirmLabel="ยืนยัน"
        busy={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

interface UserSheetProps {
  user: UserRow | null;
  self: boolean;
  onClose: () => void;
  onSaved: () => void;
  onAction: (kind: "resend" | "mfa" | "cancel" | "disable", u: UserRow) => void;
}

function UserSheet({ user, self, onClose, onSaved, onAction }: UserSheetProps) {
  const [email, setEmail] = useState(user?.email ?? "");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ mail: MailResult; link: string; tempPassword?: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api.patch(`/users/${user.id}`, { email, firstName, lastName, role });
        toast.success("บันทึกแล้ว");
        onSaved();
        onClose();
      } else {
        const r = await api.post<{ mail: MailResult; link: string; tempPassword?: string }>("/users", { email, firstName, lastName, role });
        setResult({ mail: r.mail, link: r.link, tempPassword: r.tempPassword });
        onSaved();
      }
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  if (result) {
    return (
      <Sheet open onClose={onClose} title={result.mail.ok ? "ส่งรหัสผ่านชั่วคราวแล้ว" : "สร้างผู้ใช้แล้ว แต่ส่งอีเมลไม่สำเร็จ"} footer={<Button onClick={onClose}>เสร็จสิ้น</Button>}>
        <ol className="space-y-2 text-theme-sm text-gray-600 dark:text-gray-400">
          <li>{result.mail.ok ? (result.mail.mode === "smtp" ? `1. ส่งอีเมลที่มีรหัสผ่านชั่วคราวไปที่ ${email} แล้ว (ใช้ได้ 72 ชั่วโมง)` : "1. โหมดทดสอบ (ยังไม่ได้ตั้งค่า SMTP): อีเมลถูกบันทึกเป็นไฟล์ HTML ในโฟลเดอร์ .data/outbox") : `1. ส่งอีเมลไม่สำเร็จ: ${result.mail.error ?? "ไม่ทราบสาเหตุ"} ส่งรหัสด้านล่างให้ผู้ใช้เองได้`}</li>
          <li>2. ผู้ใช้เปิดหน้าเข้าสู่ระบบ กรอกอีเมลกับรหัสผ่านชั่วคราว</li>
          <li>3. ระบบสลับไปให้ตั้งรหัสผ่านใหม่และยืนยันรหัสผ่าน แล้วเข้าใช้งานได้ทันที</li>
        </ol>
        {result.tempPassword && (
          <div className="mt-4 rounded-lg border border-dashed border-gold-400 bg-gold-50/60 p-4 text-center dark:bg-gold-500/10">
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">รหัสผ่านชั่วคราว (แสดงครั้งนี้ครั้งเดียว)</p>
            <p className="num mt-1 font-mono text-2xl font-bold tracking-[0.14em] text-gray-900 dark:text-white/90">{result.tempPassword}</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(result.tempPassword!).then(() => toast.success("คัดลอกรหัสแล้ว"))}>คัดลอกรหัส</Button>
          </div>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={user ? "จัดการผู้ใช้" : "เพิ่มผู้ใช้"}
      description={user ? user.email : "ระบบจะส่งรหัสผ่านชั่วคราวไปที่อีเมลนี้"}
      footer={<><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>{user ? "บันทึก" : "ส่งรหัสผ่านชั่วคราว"}</Button></>}
    >
      <div className="space-y-4">
        <TextField label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={Boolean(user) && user?.status !== "invited"} hint={user && user.status !== "invited" ? "อีเมลของผู้ที่ตั้งรหัสผ่านแล้วเปลี่ยนไม่ได้" : undefined} />
        <div className="grid grid-cols-2 gap-4"><TextField label="ชื่อ" value={firstName} onChange={(e) => setFirstName(e.target.value)} /><TextField label="นามสกุล" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
        <SelectField label="สิทธิ์ (Role)" value={role} onChange={(e) => setRole(e.target.value as Role)} hint={ROLE_HINT[role]} disabled={self}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </SelectField>
        {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
        {user && (
          <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">การดำเนินการอื่น</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onAction("resend", user)}>{user.status === "invited" ? "ส่งรหัสผ่านชั่วคราวใหม่" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}</Button>
              {user.mfaEnabled && !self && <Button size="sm" variant="outline" onClick={() => onAction("mfa", user)}>บังคับปิด MFA</Button>}
              {user.status === "invited" && <Button size="sm" variant="outline" onClick={() => onAction("cancel", user)}>ยกเลิกคำเชิญ</Button>}
              {!self && user.status !== "invited" && <Button size="sm" variant="outline" onClick={() => onAction("disable", user)}>{user.isActive ? "ปิดบัญชี" : "เปิดบัญชี"}</Button>}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
