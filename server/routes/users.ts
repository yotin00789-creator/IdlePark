import { audit } from "../audit.js";
import { HttpError, isEmail, route, str, type Ctx } from "../http.js";
import { sendMail } from "../mail.js";
import { appUrl, resetEmail, testEmail } from "../emailTemplates.js";
import { fullName, issueToken, RESET_MINUTES, sendInvite } from "./auth.js";
import { smtpConfigured } from "../mail.js";

const ROLES = ["admin", "editor", "viewer"] as const;
type Role = (typeof ROLES)[number];
const asRole = (v: unknown): Role => {
  if (!ROLES.includes(v as Role)) throw new HttpError(400, "สิทธิ์ไม่ถูกต้อง");
  return v as Role;
};

const publicUser = (r: Record<string, any>) => ({
  id: r.id as number,
  email: r.email as string,
  firstName: r.first_name as string,
  lastName: r.last_name as string,
  role: r.role as Role,
  isActive: r.is_active as boolean,
  status: !r.is_active ? "disabled" : r.must_change_password || !r.password_hash ? "invited" : "active",
  mfaEnabled: r.mfa_enabled as boolean,
  hasAvatar: Boolean(r.avatar_mime),
  avatarVersion: r.avatar_version as number,
  invitedAt: r.invited_at,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
});

const LIST_SQL = `select id, email, first_name, last_name, role, is_active, password_hash is not null as password_hash, must_change_password,
  mfa_enabled, avatar_mime, avatar_version, invited_at, last_login_at, created_at from users`;

async function activeAdmins(c: Ctx, exceptId?: number) {
  const [r] = await c.db.query<{ n: number }>(
    "select count(*)::int as n from users where role = 'admin' and is_active and ($1::int is null or id <> $1::int)",
    [exceptId ?? null],
  );
  return r.n;
}

route("GET", "/users", ["admin"], async (c) => {
  const rows = await c.db.query(`${LIST_SQL} order by created_at`);
  return { users: rows.map(publicUser), smtpConfigured: smtpConfigured() };
});

// Lightweight directory for pickers (names only) — any signed-in user.
route("GET", "/directory", "user", async (c) => {
  const rows = await c.db.query("select id, first_name, last_name, avatar_version, avatar_mime from users where is_active order by first_name");
  return { users: rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), hasAvatar: Boolean(r.avatar_mime), avatarVersion: r.avatar_version })) };
});

route("POST", "/users", ["admin"], async (c) => {
  const b = await c.json();
  const email = str(b.email).toLowerCase();
  if (!isEmail(email)) throw new HttpError(400, "อีเมลไม่ถูกต้อง");
  const firstName = str(b.firstName, 80);
  const lastName = str(b.lastName, 80);
  if (!firstName) throw new HttpError(400, "กรุณากรอกชื่อ");
  const role = asRole(b.role);
  const dup = await c.db.query("select id from users where lower(email) = $1", [email]);
  if (dup.length) throw new HttpError(409, "อีเมลนี้มีผู้ใช้อยู่แล้ว");
  const [u] = await c.db.query(
    `insert into users (email, first_name, last_name, role) values ($1,$2,$3,$4)
     returning id, email, first_name, last_name, role`,
    [email, firstName, lastName, role],
  );
  const inviter = fullName(c.user!) || c.user!.email;
  const invite = await sendInvite(c, { id: u.id, email, firstName, lastName, role }, inviter);
  await audit(c, {
    action: "user.invite",
    entity: "user",
    entityId: u.id,
    summary: `เชิญผู้ใช้ ${email} (${role}) — ${invite.mail.ok ? `ส่งอีเมลแล้ว (${invite.mail.mode})` : `ส่งอีเมลไม่สำเร็จ: ${invite.mail.error}`}`,
    after: { email, firstName, lastName, role },
    status: invite.mail.ok ? "ok" : "failed",
  });
  const [row] = await c.db.query(`${LIST_SQL} where id = $1`, [u.id]);
  return { user: publicUser(row), mail: invite.mail, link: invite.link, tempPassword: invite.tempPassword };
});

route("POST", "/users/:id/resend", ["admin"], async (c) => {
  const id = Number(c.params.id);
  const [u] = await c.db.query("select id, email, first_name, last_name, role, password_hash, must_change_password, is_active from users where id = $1", [id]);
  if (!u || !u.is_active) throw new HttpError(404, "ไม่พบผู้ใช้");
  let mail;
  let link: string;
  let temp: string | undefined;
  const pending = !u.password_hash || u.must_change_password;
  if (pending) {
    const r = await sendInvite(c, { id, email: u.email, firstName: u.first_name, lastName: u.last_name, role: u.role }, fullName(c.user!) || c.user!.email);
    mail = r.mail;
    link = r.link;
    temp = r.tempPassword;
  } else {
    const raw = await issueToken(c.db, id, "reset", RESET_MINUTES);
    link = `${appUrl()}/reset-password?token=${raw}`;
    mail = await sendMail(u.email, resetEmail({ name: `${u.first_name} ${u.last_name}`.trim(), link, minutes: RESET_MINUTES }));
  }
  await audit(c, {
    action: pending ? "user.resend_invite" : "user.send_reset",
    entity: "user",
    entityId: id,
    summary: `${pending ? "ส่งรหัสผ่านชั่วคราวใหม่" : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}ให้ ${u.email} — ${mail.ok ? "ส่งแล้ว" : `ไม่สำเร็จ: ${mail.error}`}`,
    status: mail.ok ? "ok" : "failed",
  });
  return { mail, link, tempPassword: temp };
});

route("PATCH", "/users/:id", ["admin"], async (c) => {
  const id = Number(c.params.id);
  const b = await c.json();
  const [cur] = await c.db.query("select * from users where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบผู้ใช้");
  const next = {
    email: b.email === undefined ? cur.email : str(b.email).toLowerCase(),
    first_name: b.firstName === undefined ? cur.first_name : str(b.firstName, 80),
    last_name: b.lastName === undefined ? cur.last_name : str(b.lastName, 80),
    role: b.role === undefined ? cur.role : asRole(b.role),
    is_active: b.isActive === undefined ? cur.is_active : Boolean(b.isActive),
  };
  if (!isEmail(next.email)) throw new HttpError(400, "อีเมลไม่ถูกต้อง");
  if (!next.first_name) throw new HttpError(400, "กรุณากรอกชื่อ");
  if (next.email !== cur.email) {
    const dup = await c.db.query("select id from users where lower(email) = $1 and id <> $2", [next.email, id]);
    if (dup.length) throw new HttpError(409, "อีเมลนี้มีผู้ใช้อยู่แล้ว");
  }
  const losesAdmin = cur.role === "admin" && cur.is_active && (next.role !== "admin" || !next.is_active);
  if (losesAdmin && (await activeAdmins(c, id)) === 0) {
    throw new HttpError(400, "ต้องมีผู้ดูแลที่ใช้งานอยู่อย่างน้อย 1 คน");
  }
  await c.db.query(
    "update users set email=$2, first_name=$3, last_name=$4, role=$5, is_active=$6 where id=$1",
    [id, next.email, next.first_name, next.last_name, next.role, next.is_active],
  );
  if (!next.is_active || next.role !== cur.role) await c.db.query("delete from sessions where user_id = $1", [id]);
  const pick = (u: any) => ({ email: u.email, firstName: u.first_name, lastName: u.last_name, role: u.role, isActive: u.is_active });
  await audit(c, {
    action: "user.update",
    entity: "user",
    entityId: id,
    summary: `แก้ไขผู้ใช้ ${next.email}`,
    before: pick(cur),
    after: pick(next),
  });
  const [row] = await c.db.query(`${LIST_SQL} where id = $1`, [id]);
  return { user: publicUser(row) };
});

route("DELETE", "/users/:id", ["admin"], async (c) => {
  const id = Number(c.params.id);
  const [u] = await c.db.query("select email, password_hash, must_change_password, last_login_at from users where id = $1", [id]);
  if (!u) throw new HttpError(404, "ไม่พบผู้ใช้");
  if ((u.password_hash && !u.must_change_password) || u.last_login_at) {
    throw new HttpError(400, "ลบได้เฉพาะคำเชิญที่ยังไม่มีใครรับ ถ้าต้องการหยุดใช้งานให้ปิดบัญชีแทน");
  }
  await c.db.query("delete from users where id = $1", [id]);
  await audit(c, { action: "user.delete_invite", entity: "user", entityId: id, summary: `ยกเลิกคำเชิญ ${u.email}` });
  return { ok: true };
});

route("POST", "/users/:id/reset-mfa", ["admin"], async (c) => {
  const id = Number(c.params.id);
  const [u] = await c.db.query("select email, mfa_enabled from users where id = $1", [id]);
  if (!u) throw new HttpError(404, "ไม่พบผู้ใช้");
  if (id === c.user!.id) throw new HttpError(400, "บังคับปิด MFA ของตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นทำให้ หรือปิดเองที่เมนูความปลอดภัยของบัญชี");
  if (!u.mfa_enabled) throw new HttpError(409, "ผู้ใช้นี้ไม่ได้เปิด MFA อยู่");
  await c.db.query("update users set mfa_enabled=false, mfa_secret_enc=null, mfa_pending_enc=null, mfa_last_step=0 where id=$1", [id]);
  await c.db.query("delete from recovery_codes where user_id = $1", [id]);
  await c.db.query("delete from sessions where user_id = $1", [id]);
  await audit(c, { action: "user.reset_mfa", entity: "user", entityId: id, summary: `บังคับปิด MFA ของ ${u.email} (ออกจากระบบทุกอุปกรณ์ ผู้ใช้ต้องเข้ามาตั้งค่า MFA ใหม่เอง)`, before: { mfaEnabled: u.mfa_enabled }, after: { mfaEnabled: false } });
  return { ok: true };
});

route("POST", "/mail/test", ["admin"], async (c) => {
  const b = await c.json().catch(() => ({}));
  const to = str((b as any).to) || c.user!.email;
  if (!isEmail(to)) throw new HttpError(400, "อีเมลไม่ถูกต้อง");
  const r = await sendMail(to, testEmail({ to, by: fullName(c.user!) || c.user!.email }));
  await audit(c, { action: "mail.test", entity: "mail", summary: `ส่งอีเมลทดสอบถึง ${to} — ${r.ok ? `สำเร็จ (${r.mode})` : `ไม่สำเร็จ: ${r.error}`}`, status: r.ok ? "ok" : "failed" });
  return { mail: r, smtpConfigured: smtpConfigured() };
});
