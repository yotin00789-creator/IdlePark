import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { TextField } from "@/components/app/Field";
import OtpInput from "@/components/app/OtpInput";
import PageHeader from "@/components/app/PageHeader";
import PasswordField from "@/components/app/PasswordField";
import Sheet from "@/components/app/Sheet";
import PageMeta from "@/components/common/PageMeta";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { auth, useUser } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useCallback, useEffect, useState } from "react";

interface SecurityInfo {
  mfaEnabled: boolean;
  recoveryLeft: number;
  sessions: { current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null }[];
}

type Flow = null | "enable" | "disable" | "recovery";

export default function Security() {
  const user = useUser();
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const load = useCallback(() => api.get<SecurityInfo>("/profile/security").then(setInfo).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageMeta title="ความปลอดภัยของบัญชี | IdlePark" description="รหัสผ่านและการยืนยันตัวตนสองขั้น" />
      <PageHeader title="ความปลอดภัยของบัญชี" description="เปลี่ยนรหัสผ่าน เปิด/ปิด MFA และดูอุปกรณ์ที่เข้าสู่ระบบอยู่" />
      <div className="mx-auto max-w-2xl space-y-4">
        <PasswordCard />
        <Card title="การยืนยันตัวตนสองขั้น (MFA)" description="ใช้แอป Google Authenticator, Microsoft Authenticator, Authy หรือ 1Password" actions={<Badge size="sm" color={user.mfaEnabled ? "success" : "light"}>{user.mfaEnabled ? "เปิดอยู่" : "ปิดอยู่"}</Badge>}>
          {user.mfaEnabled ? (
            <>
              <p className="text-theme-sm text-gray-600 dark:text-gray-400">ทุกครั้งที่เข้าสู่ระบบ ต้องกรอกรหัส 6 หลักจากแอป · รหัสกู้คืนที่ยังใช้ได้: <span className="num font-medium">{info?.recoveryLeft ?? "…"}</span> ชุด</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setFlow("recovery")}>สร้างรหัสกู้คืนใหม่</Button>
                <Button variant="outline" size="sm" className="text-error-600" onClick={() => setFlow("disable")}>ปิด MFA</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-theme-sm text-gray-600 dark:text-gray-400">เพิ่มความปลอดภัยอีกชั้น ต่อให้มีคนรู้รหัสผ่านก็เข้าไม่ได้ ใช้เวลาตั้งค่าไม่ถึงนาที</p>
              <Button className="mt-4" onClick={() => setFlow("enable")}>เปิดใช้ MFA</Button>
            </>
          )}
        </Card>
        <Card title="อุปกรณ์ที่เข้าสู่ระบบอยู่" bodyClassName="p-0">
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {(info?.sessions ?? []).map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-theme-sm">
                <div className="min-w-0"><p className="truncate text-gray-800 dark:text-white/90">{(s.userAgent ?? "ไม่ทราบอุปกรณ์").slice(0, 60)}</p><p className="text-theme-xs text-gray-500">ใช้ล่าสุด {formatDateTime(s.lastSeenAt)}{s.ip ? ` · ${s.ip}` : ""}</p></div>
                {s.current && <Badge size="sm" color="success">เครื่องนี้</Badge>}
              </li>
            ))}
            {info && info.sessions.length === 0 && <li className="px-5 py-4 text-theme-sm text-gray-500">ไม่มีข้อมูล</li>}
          </ul>
        </Card>
      </div>
      {flow === "enable" && <EnableFlow onClose={() => setFlow(null)} onDone={() => { void auth.refresh(); void load(); }} />}
      {flow === "disable" && <ConfirmFlow kind="disable" onClose={() => setFlow(null)} onDone={() => { void auth.refresh(); void load(); toast.success("ปิด MFA แล้ว"); }} />}
      {flow === "recovery" && <ConfirmFlow kind="recovery" onClose={() => setFlow(null)} onDone={() => void load()} />}
    </>
  );
}

function PasswordCard() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== again) return setError("รหัสผ่านใหม่สองช่องไม่ตรงกัน");
    setBusy(true);
    setError(null);
    try {
      await api.post("/profile/password", { current: cur, next });
      toast.success("เปลี่ยนรหัสผ่านแล้ว (ออกจากระบบอุปกรณ์อื่น)");
      setCur(""); setNext(""); setAgain("");
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };
  return (
    <Card title="เปลี่ยนรหัสผ่าน">
      <form onSubmit={submit} className="space-y-4">
        <PasswordField label="รหัสผ่านปัจจุบัน" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PasswordField label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร มีตัวอักษรและตัวเลข" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
          <PasswordField label="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </div>
        {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
        <div className="flex justify-end"><Button type="submit" loading={busy}>เปลี่ยนรหัสผ่าน</Button></div>
      </form>
    </Card>
  );
}

function RecoveryCodes({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`รหัสกู้คืน MFA (ใช้ได้ครั้งละ 1 รหัส)\n\n${text}\n`], { type: "text/plain" }));
    a.download = "recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Sheet open onClose={() => saved && onClose()} title="บันทึกรหัสกู้คืน" description="แสดงครั้งเดียวเท่านั้น ใช้เข้าสู่ระบบเมื่อโทรศัพท์หายหรือเปิดแอปไม่ได้" footer={<Button disabled={!saved} onClick={onClose}>เสร็จสิ้น</Button>}>
      <ul className="grid grid-cols-2 gap-2 font-mono text-theme-sm">{codes.map((c) => <li key={c} className="rounded-md bg-gray-50 px-3 py-2 text-center tracking-wider dark:bg-white/5">{c}</li>)}</ul>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("คัดลอกแล้ว"))}>คัดลอก</Button>
        <Button variant="outline" size="sm" onClick={download}>ดาวน์โหลด</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>พิมพ์</Button>
      </div>
      <label className="mt-5 flex items-center gap-2.5 text-theme-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="size-4 rounded border-gray-300" /> ฉันบันทึกรหัสกู้คืนแล้ว</label>
    </Sheet>
  );
}

function EnableFlow({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"password" | "scan" | "codes">("password");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<{ secret: string; qr: string; uri: string } | null>(null);
  const [qrImg, setQrImg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ secret: string; qr: string; uri: string }>("/profile/mfa/start", { password });
      setQr(r);
      setStep("scan");
      // draw the QR in the browser from the otpauth link (nothing depends on the server image)
      try {
        const QR = (await import("qrcode")).default;
        setQrImg(await QR.toDataURL(r.uri, { margin: 2, width: 280, errorCorrectionLevel: "M" }));
      } catch {
        setQrImg(r.qr);
      }
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };
  const confirm = async (value = code) => {
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ recoveryCodes: string[] }>("/profile/mfa/confirm", { code: value });
      setCodes(r.recoveryCodes); setStep("codes"); onDone();
    } catch (err) { setError(errorMessage(err)); setCode(""); }
    setBusy(false);
  };

  if (step === "codes") return <RecoveryCodes codes={codes} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title="เปิดใช้ MFA" description={step === "password" ? "ขั้นที่ 1 จาก 2: ยืนยันรหัสผ่าน" : "ขั้นที่ 2 จาก 2: สแกนแล้วกรอกรหัส"}
      footer={step === "password" ? <><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={() => start()}>ต่อไป</Button></> : <><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} disabled={code.length !== 6} onClick={() => confirm()}>ยืนยันและเปิดใช้</Button></>}>
      {step === "password" ? (
        <form onSubmit={start} className="space-y-4">
          <PasswordField label="รหัสผ่านของคุณ" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
        </form>
      ) : (
        <div className="space-y-5">
          <p className="text-theme-sm text-gray-600 dark:text-gray-400">เปิดแอป Authenticator แล้วสแกน QR นี้ (หรือกรอกคีย์สำรองด้วยมือ)</p>
          <div className="mx-auto grid size-[17.5rem] max-w-full place-items-center rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700">
            {qrImg ? <img src={qrImg} alt="QR code สำหรับตั้งค่า MFA" width={280} height={280} className="size-full" /> : <span className="text-theme-sm text-gray-500">กำลังสร้าง QR…</span>}
          </div>
          {qr && <a href={qr.uri} className="block text-center text-theme-sm text-link hover:text-link-hover">เปิดในแอป Authenticator บนเครื่องนี้</a>}
          {qr && <TextField label="คีย์สำรอง" readOnly value={qr.secret} onFocus={(e) => e.target.select()} className="font-mono tracking-wider" />}
          <div><p className="mb-2 text-theme-sm font-medium text-gray-700 dark:text-gray-300">รหัส 6 หลักจากแอป</p><OtpInput value={code} onChange={setCode} onComplete={confirm} disabled={busy} /></div>
          {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}

function ConfirmFlow({ kind, onClose, onDone }: { kind: "disable" | "recovery"; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body = { password, ...(useRecovery ? { recovery } : { code }) };
      if (kind === "disable") { await api.post("/profile/mfa/disable", body); onDone(); onClose(); }
      else { const r = await api.post<{ recoveryCodes: string[] }>("/profile/mfa/recovery", body); setCodes(r.recoveryCodes); onDone(); }
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  if (codes) return <RecoveryCodes codes={codes} onClose={onClose} />;
  return (
    <Sheet open onClose={onClose} title={kind === "disable" ? "ปิด MFA" : "สร้างรหัสกู้คืนใหม่"} description="ยืนยันด้วยรหัสผ่านและรหัสจากแอป" footer={<><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button variant={kind === "disable" ? "danger" : "primary"} loading={busy} onClick={submit}>{kind === "disable" ? "ปิด MFA" : "สร้างรหัสใหม่"}</Button></>}>
      <div className="space-y-4">
        <PasswordField label="รหัสผ่านของคุณ" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {useRecovery ? <TextField label="รหัสกู้คืน" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="XXXXX-XXXXX" /> : <div><p className="mb-2 text-theme-sm font-medium text-gray-700 dark:text-gray-300">รหัส 6 หลักจากแอป</p><OtpInput value={code} onChange={setCode} /></div>}
        <button type="button" onClick={() => setUseRecovery((v) => !v)} className="text-theme-sm text-link">{useRecovery ? "ใช้รหัสจากแอปแทน" : "ใช้รหัสกู้คืนแทน"}</button>
        {kind === "disable" && <p className="rounded-lg bg-warning-50 px-3 py-2 text-theme-xs text-warning-800 dark:bg-warning-500/10 dark:text-warning-400">การปิด MFA จะออกจากระบบอุปกรณ์อื่นทั้งหมด และถูกบันทึกในประวัติการใช้งาน</p>}
        {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
      </div>
    </Sheet>
  );
}
