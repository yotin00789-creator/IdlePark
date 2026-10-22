import Button from "@/components/app/Button";
import { TextField } from "@/components/app/Field";
import OtpInput from "@/components/app/OtpInput";
import PasswordField from "@/components/app/PasswordField";
import VerifyOverlay from "@/components/auth/VerifyOverlay";
import PageMeta from "@/components/common/PageMeta";
import { ApiError, api, errorMessage } from "@/lib/api";
import { auth, useAuth, type SessionUser } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import AuthLayout from "./AuthPageLayout";

type Pane = "login" | "otp" | "forgot" | "newpw";
const ORDER: Pane[] = ["login", "otp", "forgot", "newpw"];

// What the new-password pane is for: a first sign-in with the temporary password, or a reset link from e-mail.
interface NewPw {
  kind: "temp" | "reset";
  token: string;
  email: string;
  name: string;
}

// One page whose right-hand side slides between: sign in, the 6-digit code, "forgot password" and
// "choose a new password". A correct sign-in plays the green circle -> tick -> sports car, then opens the app.
export default function SignIn({ initialPane = "login" }: { initialPane?: "login" | "forgot" | "reset" }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const next = params.get("next") || "/";
  const resetToken = initialPane === "reset" ? (params.get("token") ?? "") : "";

  const [local, setLocal] = useState<Exclude<Pane, "otp">>(initialPane === "forgot" || (initialPane === "reset" && !resetToken) ? "forgot" : "login");
  const [newPw, setNewPw] = useState<NewPw | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const [error, setError] = useState<string | null>(initialPane === "reset" && !resetToken ? "ไม่พบลิงก์ กรุณาเปิดลิงก์จากอีเมลอีกครั้ง หรือขอลิงก์ใหม่" : null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<null | "checking" | "ok">(null);
  const [sent, setSent] = useState<string | null>(null); // the "we sent you a link" message
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const signedIn = useRef<SessionUser | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const pane: Pane = status === "mfa" ? "otp" : local;
  const focusIn = useCallback((p: Pane, delay = 320) => {
    window.setTimeout(() => root.current?.querySelector<HTMLInputElement>(`[data-pane="${p}"] input`)?.focus(), delay);
  }, []);
  const go = (p: Exclude<Pane, "otp">) => {
    setError(null);
    setNotice(null);
    setLocal(p);
    focusIn(p);
  };

  useEffect(() => {
    if (pane === "otp") focusIn("otp");
  }, [pane, focusIn]);

  // a reset link from the e-mail: check it, then show the new-password pane
  useEffect(() => {
    if (initialPane !== "reset") return;
    if (!resetToken) return;
    api
      .get<{ email: string; name: string }>(`/auth/token/reset/${encodeURIComponent(resetToken)}`)
      .then((r) => {
        setNewPw({ kind: "reset", token: resetToken, email: r.email, name: r.name });
        setLocal("newpw");
        focusIn("newpw", 400);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "ตรวจสอบลิงก์ไม่สำเร็จ");
        setLocal("forgot");
      });
  }, [initialPane, resetToken, focusIn]);

  const enter = useCallback(() => {
    const user = signedIn.current;
    if (!user) return;
    auth.setUser(user);
    toast.success("เข้าสู่ระบบสำเร็จ", `ยินดีต้อนรับ ${user.firstName || user.email}`);
    navigate(next, { replace: true });
  }, [navigate, next]);

  // while the animation plays the session store is still "not signed in", so do not bounce away early
  if (status === "authed" && !verify) return <Navigate to={next} replace />;
  if (status === "setup") return <Navigate to="/setup" replace />;

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api.post<{ mfaRequired?: boolean; user?: SessionUser; mustChange?: boolean; token?: string; email?: string; name?: string }>("/auth/login", { email, password });
      if (r.mfaRequired) auth.setMfaPending();
      else if (r.mustChange && r.token) {
        setNewPw({ kind: "temp", token: r.token, email: r.email ?? email, name: r.name ?? "" });
        setPw1("");
        setPw2("");
        go("newpw");
      } else if (r.user) {
        signedIn.current = r.user;
        setVerify("ok");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const check = async (value?: string) => {
    setBusy(true);
    setError(null);
    setVerify("checking");
    try {
      const r = await api.post<{ user: SessionUser }>("/auth/mfa", useRecovery ? { recovery } : { code: value ?? code });
      signedIn.current = r.user;
      setVerify("ok");
    } catch (err) {
      setVerify(null);
      setError(errorMessage(err));
      setCode("");
      focusIn("otp", 50);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>("/auth/forgot", { email });
      setSent(r.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPw) return;
    if (pw1 !== pw2) return setError("รหัสผ่านสองช่องไม่ตรงกัน");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ signedIn: boolean; user?: SessionUser }>(`/auth/token/${newPw.kind === "temp" ? "invite" : "reset"}/${encodeURIComponent(newPw.token)}`, { password: pw1 });
      setPw1("");
      setPw2("");
      if (r.signedIn && r.user) {
        // first sign-in: straight into the app
        signedIn.current = r.user;
        setVerify("ok");
      } else {
        // reset: back to sign in with the new password
        const message = "ตั้งรหัสผ่านใหม่เรียบร้อย กรอกอีเมลและรหัสผ่านใหม่เพื่อเข้าสู่ระบบ";
        setPassword("");
        setNewPw(null);
        toast.success("ตั้งรหัสผ่านใหม่แล้ว");
        if (initialPane === "reset") navigate("/signin", { replace: true, state: { notice: message } });
        else {
          go("login");
          setNotice(message);
        }
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const idx = ORDER.indexOf(pane);
  const titleOf: Record<Pane, string> = { login: "เข้าสู่ระบบ", otp: "ยืนยันตัวตน", forgot: "ลืมรหัสผ่าน", newpw: "ตั้งรหัสผ่านใหม่" };
  const err = (p: Pane) => (pane === p && error ? <p role="alert" className="text-theme-sm text-error-600 dark:text-error-500">{error}</p> : null);
  const hide = (p: Pane) => ({ "aria-hidden": pane !== p, inert: pane !== p });

  return (
    <AuthLayout footer={pane === "otp" ? <button className="text-link hover:text-link-hover" onClick={() => { setError(null); void auth.signOut(); }}>ใช้บัญชีอื่น</button> : undefined}>
      <PageMeta title={`${titleOf[pane]} | IdlePark`} description="เข้าสู่ระบบสมุดบัญชีที่จอดรถ" />
      <div ref={root} className="relative overflow-hidden">
        <div className="auth-slide flex w-[400%] items-start" style={{ transform: idx ? `translateX(-${idx * 25}%)` : undefined }}>
          {/* 1 · sign in */}
          <section data-pane="login" className="w-1/4 shrink-0 px-1" {...hide("login")}>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white/90">เข้าสู่ระบบ</h1>
            {notice && <p role="status" className="mt-5 rounded-lg bg-success-50 px-4 py-3 text-theme-sm text-success-700 dark:bg-success-500/15 dark:text-success-500">{notice}</p>}
            <form onSubmit={login} className="mt-7 space-y-4">
              <TextField label="อีเมล" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={initialPane === "login"} />
              <PasswordField label="รหัสผ่าน" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              {err("login")}
              <Button type="submit" className="w-full" loading={busy && pane === "login"}>เข้าสู่ระบบ</Button>
              <p className="text-center text-theme-sm">
                <button type="button" onClick={() => { setSent(null); go("forgot"); }} className="text-link hover:text-link-hover">ลืมรหัสผ่าน?</button>
              </p>
            </form>
          </section>

          {/* 2 · the 6-digit code */}
          <section data-pane="otp" className="w-1/4 shrink-0 px-1" {...hide("otp")}>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white/90">ยืนยันตัวตนอีกขั้น</h1>
            <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">{useRecovery ? "กรอกรหัสกู้คืนที่บันทึกไว้ (ใช้ได้ครั้งเดียว)" : "เปิดแอป Authenticator แล้วกรอกรหัส 6 หลัก"}</p>
            <form onSubmit={(e) => { e.preventDefault(); void check(); }} className="mt-7 space-y-5">
              {useRecovery ? (
                <TextField label="รหัสกู้คืน" value={recovery} onChange={(e) => setRecovery(e.target.value)} autoComplete="off" placeholder="XXXXX-XXXXX" />
              ) : (
                <OtpInput value={code} onChange={setCode} onComplete={check} disabled={busy} />
              )}
              {err("otp")}
              <Button type="submit" className="w-full" loading={busy && pane === "otp"}>ยืนยัน</Button>
              <button type="button" className="block w-full text-center text-theme-sm text-gray-500 hover:text-gray-700 dark:text-gray-400" onClick={() => { setUseRecovery((v) => !v); setError(null); }}>
                {useRecovery ? "ใช้รหัสจากแอป Authenticator" : "ใช้รหัสกู้คืนแทน"}
              </button>
            </form>
          </section>

          {/* 3 · forgot password: ask for the e-mail, we send the link */}
          <section data-pane="forgot" className="w-1/4 shrink-0 px-1" {...hide("forgot")}>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white/90">ลืมรหัสผ่าน</h1>
            <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">กรอกอีเมลของคุณ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ (ลิงก์ใช้ได้ 60 นาที ใช้ได้ครั้งเดียว)</p>
            {sent ? (
              <div className="mt-6 space-y-4">
                <p role="status" className="rounded-lg bg-success-50 px-4 py-3 text-theme-sm text-success-700 dark:bg-success-500/15 dark:text-success-500">{sent}</p>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">เปิดอีเมล กดปุ่ม “ตั้งรหัสผ่านใหม่” แล้วกรอกรหัสผ่านใหม่ จากนั้นกลับมาเข้าสู่ระบบ ถ้าไม่เห็นอีเมล ลองดูในกล่องสแปม</p>
                <Button variant="outline" className="w-full" onClick={() => go("login")}>กลับไปเข้าสู่ระบบ</Button>
              </div>
            ) : (
              <form onSubmit={forgot} className="mt-6 space-y-4">
                <TextField label="อีเมล" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus={initialPane === "forgot"} />
                {err("forgot")}
                <Button type="submit" className="w-full" loading={busy && pane === "forgot"}>ส่งลิงก์ตั้งรหัสผ่านใหม่</Button>
                <p className="text-center text-theme-sm"><button type="button" onClick={() => go("login")} className="text-link hover:text-link-hover">กลับไปเข้าสู่ระบบ</button></p>
              </form>
            )}
          </section>

          {/* 4 · choose a new password (temporary password, or reset link) */}
          <section data-pane="newpw" className="w-1/4 shrink-0 px-1" {...hide("newpw")}>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white/90">ตั้งรหัสผ่านใหม่</h1>
            <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">
              {newPw?.kind === "temp" ? "คุณเข้าด้วยรหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านของคุณเอง" : "ตั้งรหัสผ่านใหม่สำหรับบัญชีนี้"}
              {newPw && <span className="mt-1 block font-medium text-gray-700 dark:text-gray-300">{newPw.name ? `${newPw.name} · ` : ""}{newPw.email}</span>}
            </p>
            <form onSubmit={savePassword} className="mt-6 space-y-4">
              <PasswordField label="รหัสผ่านใหม่ (New Password)" hint="อย่างน้อย 12 ตัวอักษร มีทั้งตัวอักษรและตัวเลข" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" required />
              <PasswordField label="ยืนยันรหัสผ่านใหม่ (Confirm Password)" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" required />
              {err("newpw")}
              <Button type="submit" className="w-full" loading={busy && pane === "newpw"} disabled={!newPw}>{newPw?.kind === "temp" ? "บันทึกและเข้าสู่ระบบ" : "บันทึกรหัสผ่านใหม่"}</Button>
              <p className="text-center text-theme-sm"><Link to="/signin" onClick={() => go("login")} className="text-link hover:text-link-hover">ยกเลิก</Link></p>
            </form>
          </section>
        </div>
        {verify && <VerifyOverlay state={verify} onDone={enter} />}
      </div>
    </AuthLayout>
  );
}
