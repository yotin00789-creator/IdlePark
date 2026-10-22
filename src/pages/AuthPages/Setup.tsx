import Button from "@/components/app/Button";
import { TextField } from "@/components/app/Field";
import PasswordField from "@/components/app/PasswordField";
import PageMeta from "@/components/common/PageMeta";
import { api, errorMessage } from "@/lib/api";
import { auth, useAuth, type SessionUser } from "@/lib/session";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import AuthLayout from "./AuthPageLayout";

export default function Setup() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ email: "", firstName: "", lastName: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === "authed") return <Navigate to="/" replace />;
  if (status === "anon" || status === "mfa") return <Navigate to="/signin" replace />;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password !== f.confirm) return setError("รหัสผ่านสองช่องไม่ตรงกัน");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ user: SessionUser }>("/auth/setup", f);
      auth.setUser(r.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="ตั้งค่าครั้งแรก" description="สร้างบัญชีผู้ดูแลคนแรก หลังจากนี้เพิ่มผู้ใช้คนอื่นได้ที่เมนูผู้ใช้งาน">
      <PageMeta title="ตั้งค่าครั้งแรก | IdlePark" description="สร้างผู้ดูแลคนแรก" />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="ชื่อ" value={f.firstName} onChange={set("firstName")} required autoFocus />
          <TextField label="นามสกุล" value={f.lastName} onChange={set("lastName")} />
        </div>
        <TextField label="อีเมล" type="email" value={f.email} onChange={set("email")} required autoComplete="username" />
        <PasswordField label="รหัสผ่าน" hint="อย่างน้อย 12 ตัวอักษร มีทั้งตัวอักษรและตัวเลข" value={f.password} onChange={set("password")} autoComplete="new-password" required />
        <PasswordField label="ยืนยันรหัสผ่าน" value={f.confirm} onChange={set("confirm")} autoComplete="new-password" required />
        {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>สร้างบัญชีผู้ดูแล</Button>
      </form>
    </AuthLayout>
  );
}
