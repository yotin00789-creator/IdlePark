import Button from "@/components/app/Button";
import PasswordField from "@/components/app/PasswordField";
import PageMeta from "@/components/common/PageMeta";
import { api, ApiError, errorMessage } from "@/lib/api";
import { auth } from "@/lib/session";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import AuthLayout from "./AuthPageLayout";

// Shared by /accept-invite (new user) and /reset-password (forgotten password).
export default function TokenPassword({ kind }: { kind: "invite" | "reset" }) {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ email: string; name: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const invalid = token ? failed : "ไม่พบลิงก์ กรุณาเปิดลิงก์จากอีเมลอีกครั้ง";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get(`/auth/token/${kind}/${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch((e) => setFailed(e instanceof ApiError ? e.message : "ตรวจสอบลิงก์ไม่สำเร็จ"));
  }, [kind, token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("รหัสผ่านสองช่องไม่ตรงกัน");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ signedIn: boolean }>(`/auth/token/${kind}/${encodeURIComponent(token)}`, { password });
      if (r.signedIn) {
        await auth.refresh();
        navigate("/", { replace: true });
      } else setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const title = kind === "invite" ? "ตั้งรหัสผ่านเพื่อเริ่มใช้งาน" : "ตั้งรหัสผ่านใหม่";

  if (invalid) {
    return (
      <AuthLayout title="ลิงก์ใช้ไม่ได้" description={invalid} footer={<Link to="/signin" className="text-link">กลับไปหน้าเข้าสู่ระบบ</Link>}>
        <PageMeta title="ลิงก์ใช้ไม่ได้ | IdlePark" description={invalid} />
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">ลิงก์ใช้ได้ครั้งเดียวและมีอายุจำกัด ให้ผู้ดูแลส่งคำเชิญใหม่ หรือกด “ลืมรหัสผ่าน” ที่หน้าเข้าสู่ระบบ</p>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="ตั้งรหัสผ่านเรียบร้อย" description="กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่">
        <Link to="/signin" className="block"><Button className="w-full">ไปหน้าเข้าสู่ระบบ</Button></Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={title} description={info ? `${info.name ? `${info.name} · ` : ""}${info.email}` : "กำลังตรวจสอบลิงก์…"}>
      <PageMeta title={`${title} | IdlePark`} description={title} />
      <form onSubmit={submit} className="space-y-4">
        <PasswordField label="รหัสผ่านใหม่" hint="อย่างน้อย 12 ตัวอักษร มีทั้งตัวอักษรและตัวเลข" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />
        <PasswordField label="ยืนยันรหัสผ่าน" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
        <Button type="submit" className="w-full" loading={busy} disabled={!info}>{kind === "invite" ? "ตั้งรหัสผ่านและเข้าสู่ระบบ" : "บันทึกรหัสผ่านใหม่"}</Button>
      </form>
    </AuthLayout>
  );
}
