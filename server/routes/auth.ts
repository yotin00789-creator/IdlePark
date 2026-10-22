import { audit } from "../audit.js";
import {
  decrypt,
  hashPassword,
  normalizeRecovery,
  passwordProblem,
  randomToken,
  tempPassword,
  sha256,
  verifyPassword,
  verifyTotp,
} from "../crypto.js";
import { inviteEmail, resetEmail, appUrl } from "../emailTemplates.js";
import { HttpError, USER_COLUMNS, endSession, isEmail, route, startSession, str, userFromRow, type Ctx } from "../http.js";
import { sendMail } from "../mail.js";
import type { Queryable } from "../db.js";

const WINDOW_MIN = 15;
const MAX_FAILS = 5;
export const INVITE_HOURS = 72;
export const RESET_MINUTES = 60;

// A real scrypt hash of a random value, so unknown emails cost the same time as wrong passwords.
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

async function failures(q: Queryable, key: string) {
  const r = await q.query<{ n: number }>(
    `select count(*)::int as n from login_attempts
      where key = $1 and success = false and at > now() - ($2 || ' minutes')::interval`,
    [key, String(WINDOW_MIN)],
  );
  return r[0].n;
}
const record = (q: Queryable, key: string, success: boolean) =>
  q.query("insert into login_attempts (key, success) values ($1, $2)", [key, success]);

async function guard(c: Ctx, keys: string[]) {
  for (const k of keys) {
    if ((await failures(c.db, k)) >= MAX_FAILS) {
      throw new HttpError(429, `ลองผิดหลายครั้งเกินไป กรุณารอ ${WINDOW_MIN} นาทีแล้วลองใหม่`, {
        retryAfterMinutes: WINDOW_MIN,
      });
    }
  }
}

export async function issueToken(q: Queryable, userId: number, kind: "invite" | "reset", minutes: number) {
  await q.query("update auth_tokens set used_at = now() where user_id = $1 and kind = $2 and used_at is null", [userId, kind]);
  const raw = randomToken(32);
  await q.query(
    `insert into auth_tokens (user_id, kind, token_hash, expires_at)
     values ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [userId, kind, sha256(raw), String(minutes)],
  );
  return raw;
}

async function findToken(q: Queryable, raw: string, kind: "invite" | "reset") {
  const rows = await q.query(
    `select t.id as token_id, ${USER_COLUMNS}, u.password_hash
       from auth_tokens t join users u on u.id = t.user_id
      where t.token_hash = $1 and t.kind = $2 and t.used_at is null and t.expires_at > now() and u.is_active`,
    [sha256(raw), kind],
  );
  return rows[0] ?? null;
}

export const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();

/** Give the user a fresh temporary password, send it by e-mail, and make them choose their own at the next sign-in. */
export async function sendInvite(
  c: Ctx,
  u: { id: number; email: string; firstName: string; lastName: string; role: any },
  inviter: string,
) {
  const temp = tempPassword();
  const hash = await hashPassword(temp);
  await c.db.query("update users set password_hash = $2, must_change_password = true, invited_at = now() where id = $1", [u.id, hash]);
  await c.db.query("delete from sessions where user_id = $1", [u.id]);
  const loginUrl = `${appUrl()}/signin`;
  const mail = await sendMail(
    u.email,
    inviteEmail({ name: fullName(u), email: u.email, role: u.role, inviter, tempPassword: temp, loginUrl, hours: INVITE_HOURS }),
  );
  // the password is shown to the admin only when the e-mail could not be sent, so it can be handed over by other means
  return { link: loginUrl, mail, tempPassword: mail.ok ? undefined : temp };
}

route("GET", "/auth/state", "public", async (c) => {
  const [{ n }] = await c.db.query<{ n: number }>("select count(*)::int as n from users");
  return { needsSetup: n === 0, authenticated: Boolean(c.user && c.sessionStage === "active"), mfaPending: c.sessionStage === "mfa_pending" };
});

route("GET", "/auth/me", "user", async (c) => ({ user: c.user }));

route("POST", "/auth/setup", "public", async (c) => {
  const b = await c.json();
  const email = str(b.email).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, "อีเมลไม่ถูกต้อง");
  const firstName = str(b.firstName, 80);
  const lastName = str(b.lastName, 80);
  if (!firstName) throw new HttpError(400, "กรุณากรอกชื่อ");
  const problem = passwordProblem(String(b.password ?? ""));
  if (problem) throw new HttpError(400, problem);
  const hash = await hashPassword(String(b.password));
  // Claim the "first user" slot atomically.
  const created = await c.db.tx(async (q) => {
    const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from users");
    if (n > 0) throw new HttpError(403, "ตั้งค่าครั้งแรกเสร็จแล้ว กรุณาเข้าสู่ระบบ");
    const r = await q.query(
      `insert into users (email, first_name, last_name, role, password_hash, last_login_at)
       values ($1,$2,$3,'admin',$4, now()) returning ${USER_COLUMNS.replace(/u\./g, "")}`,
      [email, firstName, lastName, hash],
    );
    return r[0];
  });
  await startSession(c, created.id, "active");
  c.user = userFromRow(created);
  await audit(c, { action: "auth.setup", entity: "user", entityId: created.id, summary: `สร้างผู้ดูแลคนแรก ${email}` });
  return { user: c.user };
});

route("POST", "/auth/login", "public", async (c) => {
  const b = await c.json();
  const email = str(b.email).toLowerCase();
  const password = String(b.password ?? "");
  const keys = [`acct:${email}`, `ip:${c.ip}`];
  await guard(c, keys);

  const rows = await c.db.query(
    `select ${USER_COLUMNS}, u.password_hash, u.must_change_password, u.invited_at from users u where lower(u.email) = $1`,
    [email],
  );
  const u = rows[0];
  const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !u.is_active || !ok) {
    for (const k of keys) await record(c.db, k, false);
    await audit(c, {
      action: "auth.login_failed",
      entity: "user",
      summary: `เข้าสู่ระบบไม่สำเร็จ (${email || "ไม่ระบุอีเมล"})`,
      status: "failed",
      actor: { id: u?.id ?? null, email, name: u ? `${u.first_name} ${u.last_name}`.trim() : "", role: u?.role ?? "" },
    });
    throw new HttpError(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
  }
  if (u.must_change_password) {
    const hours = (Date.now() - new Date(u.invited_at ?? 0).getTime()) / 3_600_000;
    if (hours > INVITE_HOURS) throw new HttpError(401, "รหัสผ่านชั่วคราวหมดอายุแล้ว ให้ผู้ดูแลส่งรหัสใหม่ให้");
    // the temporary password proves who this is; a short-lived token lets them choose their own
    const token = await issueToken(c.db, u.id, "invite", 30);
    await record(c.db, `acct:${email}`, true);
    await audit(c, { action: "auth.temp_login", entity: "user", entityId: u.id, summary: `เข้าด้วยรหัสผ่านชั่วคราว รอตั้งรหัสผ่านใหม่ (${email})`, actor: { id: u.id, email, name: `${u.first_name} ${u.last_name}`.trim(), role: u.role } });
    return { mustChange: true, token, email: u.email, name: `${u.first_name} ${u.last_name}`.trim() };
  }
  if (u.mfa_enabled) {
    await startSession(c, u.id, "mfa_pending");
    await audit(c, { action: "auth.password_ok", entity: "user", entityId: u.id, summary: `ใส่รหัสผ่านถูกต้อง รอยืนยัน MFA (${email})`, actor: { id: u.id, email, name: `${u.first_name} ${u.last_name}`.trim(), role: u.role } });
    return { mfaRequired: true };
  }
  await c.db.query("update users set last_login_at = now() where id = $1", [u.id]);
  await startSession(c, u.id, "active");
  c.user = userFromRow(u);
  await record(c.db, `acct:${email}`, true);
  await audit(c, { action: "auth.login", entity: "user", entityId: u.id, summary: `เข้าสู่ระบบ (${email})` });
  return { user: c.user };
});

route("POST", "/auth/mfa", "pending", async (c) => {
  const b = await c.json();
  const user = c.user!;
  await guard(c, [`mfa:${user.id}`]);
  const [row] = await c.db.query("select mfa_secret_enc, mfa_last_step from users where id = $1", [user.id]);
  let ok = false;
  let how = "TOTP";
  if (typeof b.recovery === "string" && b.recovery.trim()) {
    how = "รหัสกู้คืน";
    const hash = sha256(normalizeRecovery(b.recovery));
    const used = await c.db.query(
      "update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id",
      [user.id, hash],
    );
    ok = used.length > 0;
  } else if (row?.mfa_secret_enc) {
    const step = verifyTotp(decrypt(row.mfa_secret_enc), String(b.code ?? "").replace(/\s/g, ""), row.mfa_last_step);
    if (step != null) {
      // conditional update = a code can only be spent once even with parallel requests
      const r = await c.db.query("update users set mfa_last_step = $2 where id = $1 and mfa_last_step < $2 returning id", [user.id, step]);
      ok = r.length > 0;
    }
  }
  if (!ok) {
    await record(c.db, `mfa:${user.id}`, false);
    await audit(c, { action: "auth.mfa_failed", entity: "user", entityId: user.id, summary: `ยืนยัน MFA ไม่สำเร็จ (${how})`, status: "failed" });
    throw new HttpError(401, "รหัสไม่ถูกต้องหรือหมดอายุ");
  }
  await c.db.query("update users set last_login_at = now() where id = $1", [user.id]);
  await startSession(c, user.id, "active");
  await audit(c, { action: "auth.login", entity: "user", entityId: user.id, summary: `เข้าสู่ระบบด้วย MFA (${how})` });
  return { user };
});

route("POST", "/auth/logout", "public", async (c) => {
  if (c.user) await audit(c, { action: "auth.logout", entity: "user", entityId: c.user.id, summary: "ออกจากระบบ" });
  await endSession(c);
  return { ok: true };
});

// ----------------------------------------------------- invite / reset links

route("GET", "/auth/token/:kind/:token", "public", async (c) => {
  const kind = c.params.kind === "reset" ? "reset" : c.params.kind === "invite" ? "invite" : null;
  if (!kind) throw new HttpError(404, "ไม่พบหน้านี้");
  const t = await findToken(c.db, c.params.token, kind);
  if (!t) throw new HttpError(410, "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอให้ผู้ดูแลส่งใหม่");
  return { email: t.email, name: `${t.first_name} ${t.last_name}`.trim() };
});

route("POST", "/auth/token/:kind/:token", "public", async (c) => {
  const kind = c.params.kind === "reset" ? "reset" : c.params.kind === "invite" ? "invite" : null;
  if (!kind) throw new HttpError(404, "ไม่พบหน้านี้");
  const b = await c.json();
  const problem = passwordProblem(String(b.password ?? ""));
  if (problem) throw new HttpError(400, problem);
  const t = await findToken(c.db, c.params.token, kind);
  if (!t) throw new HttpError(410, "ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอให้ผู้ดูแลส่งใหม่");
  const hash = await hashPassword(String(b.password));
  const claimed = await c.db.query(
    "update auth_tokens set used_at = now() where id = $1 and used_at is null returning id",
    [t.token_id],
  );
  if (!claimed.length) throw new HttpError(410, "ลิงก์นี้ถูกใช้ไปแล้ว");
  await c.db.query("update users set password_hash = $2, must_change_password = false where id = $1", [t.id, hash]);
  await c.db.query("delete from sessions where user_id = $1", [t.id]); // sign out everywhere
  const user = userFromRow(t);
  await audit(c, {
    action: kind === "invite" ? "user.accept_invite" : "auth.password_reset",
    entity: "user",
    entityId: t.id,
    summary: kind === "invite" ? `${t.email} ตั้งรหัสผ่านใหม่แทนรหัสชั่วคราวและเข้าร่วมระบบ` : `${t.email} ตั้งรหัสผ่านใหม่`,
    actor: { id: t.id, email: t.email, name: fullName(user), role: t.role },
  });
  if (kind === "invite") {
    await c.db.query(
      `insert into notifications (dedupe_key, kind, title, body, link, severity)
       values ($1,'user_joined',$2,$3,'/users','success') on conflict (dedupe_key) do nothing`,
      [`joined:${t.id}`, `${fullName(user) || t.email} เข้าร่วมระบบแล้ว`, `${t.email} ตั้งรหัสผ่านและพร้อมใช้งาน`],
    );
  }
  // a forgotten password is changed and the person signs in again; a first sign-in carries on into the app
  if (kind === "invite" && !t.mfa_enabled) {
    await c.db.query("update users set last_login_at = now() where id = $1", [t.id]);
    await startSession(c, t.id, "active");
    return { user, signedIn: true };
  }
  return { signedIn: false };
});

route("POST", "/auth/forgot", "public", async (c) => {
  const b = await c.json();
  const email = str(b.email).toLowerCase();
  const reply = { ok: true, message: "ถ้ามีบัญชีนี้ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านไปที่อีเมลแล้ว" };
  if (!isEmail(email)) return reply;
  const key = `forgot:${email}`;
  const recent = await c.db.query<{ n: number }>(
    "select count(*)::int as n from login_attempts where key = $1 and at > now() - interval '1 hour'",
    [key],
  );
  if (recent[0].n >= 3) return reply;
  await record(c.db, key, false);
  const rows = await c.db.query(`select ${USER_COLUMNS} from users u where lower(u.email) = $1`, [email]);
  const u = rows[0];
  if (u && u.is_active) {
    const raw = await issueToken(c.db, u.id, "reset", RESET_MINUTES);
    const link = `${appUrl()}/reset-password?token=${raw}`;
    const mail = await sendMail(u.email, resetEmail({ name: `${u.first_name} ${u.last_name}`.trim(), link, minutes: RESET_MINUTES }));
    await audit(c, {
      action: "auth.forgot",
      entity: "user",
      entityId: u.id,
      summary: `ขอลิงก์ตั้งรหัสผ่านใหม่ (${email}) — ${mail.ok ? "ส่งอีเมลแล้ว" : "ส่งอีเมลไม่สำเร็จ"}`,
      status: mail.ok ? "ok" : "failed",
      actor: { id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}`.trim(), role: u.role },
    });
  }
  return reply;
});
