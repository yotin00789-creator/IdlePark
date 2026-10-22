import QRCode from "qrcode";
import { audit } from "../audit.js";
import {
  decrypt,
  encrypt,
  hashPassword,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecovery,
  otpauthUri,
  passwordProblem,
  sha256,
  verifyPassword,
  verifyTotp,
} from "../crypto.js";
import { appName } from "../emailTemplates.js";
import { HttpError, route, str, userFromRow, USER_COLUMNS, type Ctx } from "../http.js";
import { fullName } from "./auth.js";

const MAX_AVATAR = 1_500_000;

/** PNG, JPEG or WebP, judged by the file's own bytes (not by the header the client sent). */
export function sniffImage(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

async function reloadUser(c: Ctx) {
  const rows = await c.db.query(`select ${USER_COLUMNS} from users u where u.id = $1`, [c.user!.id]);
  c.user = userFromRow(rows[0]);
  return c.user;
}

route("PATCH", "/profile", "user", async (c) => {
  const b = await c.json();
  const firstName = str(b.firstName, 80);
  const lastName = str(b.lastName, 80);
  if (!firstName) throw new HttpError(400, "กรุณากรอกชื่อ");
  const before = { firstName: c.user!.firstName, lastName: c.user!.lastName };
  await c.db.query("update users set first_name = $2, last_name = $3 where id = $1", [c.user!.id, firstName, lastName]);
  const user = await reloadUser(c);
  await audit(c, { action: "profile.update", entity: "user", entityId: user.id, summary: "แก้ไขชื่อในโปรไฟล์", before, after: { firstName, lastName } });
  return { user };
});

// Replacing the picture overwrites the single stored image, so nothing is left behind.
route("PUT", "/profile/avatar", "user", async (c) => {
  const body = await c.bytes();
  if (!body.length) throw new HttpError(400, "ไม่พบไฟล์รูป");
  if (body.length > MAX_AVATAR) throw new HttpError(413, "รูปใหญ่เกินไป (ไม่เกิน 1.5 MB)");
  const mime = sniffImage(body);
  if (!mime) throw new HttpError(415, "รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP");
  const had = Boolean(c.user!.hasAvatar);
  await c.db.query(
    "update users set avatar = $2, avatar_mime = $3, avatar_version = avatar_version + 1 where id = $1",
    [c.user!.id, body, mime],
  );
  const user = await reloadUser(c);
  await audit(c, {
    action: "profile.avatar_set",
    entity: "user",
    entityId: user.id,
    summary: had ? "เปลี่ยนรูปโปรไฟล์ (ลบรูปเก่าแล้ว)" : "ตั้งรูปโปรไฟล์",
    after: { bytes: body.length, mime },
  });
  return { user };
});

route("DELETE", "/profile/avatar", "user", async (c) => {
  await c.db.query("update users set avatar = null, avatar_mime = null, avatar_version = avatar_version + 1 where id = $1", [c.user!.id]);
  const user = await reloadUser(c);
  await audit(c, { action: "profile.avatar_remove", entity: "user", entityId: user.id, summary: "ลบรูปโปรไฟล์" });
  return { user };
});

route("GET", "/users/:id/avatar", "user", async (c) => {
  const rows = await c.db.query("select avatar, avatar_mime from users where id = $1", [Number(c.params.id)]);
  const r = rows[0];
  if (!r?.avatar) throw new HttpError(404, "ไม่มีรูป");
  return new Response(new Uint8Array(r.avatar), {
    headers: {
      "content-type": r.avatar_mime,
      "cache-control": "private, max-age=31536000, immutable", // url carries ?v=<version>
      "x-content-type-options": "nosniff",
    },
  });
});

route("POST", "/profile/password", "user", async (c) => {
  const b = await c.json();
  const [row] = await c.db.query("select password_hash from users where id = $1", [c.user!.id]);
  if (!(await verifyPassword(String(b.current ?? ""), row.password_hash))) {
    throw new HttpError(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
  }
  const problem = passwordProblem(String(b.next ?? ""));
  if (problem) throw new HttpError(400, problem);
  await c.db.query("update users set password_hash = $2 where id = $1", [c.user!.id, await hashPassword(String(b.next))]);
  await c.db.query("delete from sessions where user_id = $1 and id <> $2", [c.user!.id, c.sessionId]);
  await audit(c, { action: "profile.password_change", entity: "user", entityId: c.user!.id, summary: "เปลี่ยนรหัสผ่าน (ออกจากระบบอุปกรณ์อื่น)" });
  return { ok: true };
});

// ----------------------------------------------------------------- MFA

async function requirePassword(c: Ctx, password: unknown) {
  const [row] = await c.db.query("select password_hash from users where id = $1", [c.user!.id]);
  if (!(await verifyPassword(String(password ?? ""), row.password_hash))) {
    throw new HttpError(400, "รหัสผ่านไม่ถูกต้อง");
  }
}

async function requireSecondFactor(c: Ctx, b: any) {
  const [row] = await c.db.query("select mfa_secret_enc, mfa_last_step from users where id = $1", [c.user!.id]);
  if (typeof b.recovery === "string" && b.recovery.trim()) {
    const r = await c.db.query(
      "update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null returning id",
      [c.user!.id, sha256(normalizeRecovery(b.recovery))],
    );
    if (r.length) return;
  } else if (row?.mfa_secret_enc) {
    const step = verifyTotp(decrypt(row.mfa_secret_enc), String(b.code ?? "").replace(/\s/g, ""), row.mfa_last_step);
    if (step != null) {
      const r = await c.db.query("update users set mfa_last_step = $2 where id = $1 and mfa_last_step < $2 returning id", [c.user!.id, step]);
      if (r.length) return;
    }
  }
  throw new HttpError(400, "รหัสยืนยันไม่ถูกต้องหรือหมดอายุ");
}

async function issueRecoveryCodes(c: Ctx) {
  const codes = newRecoveryCodes(10);
  await c.db.query("delete from recovery_codes where user_id = $1", [c.user!.id]);
  for (const code of codes) {
    await c.db.query("insert into recovery_codes (user_id, code_hash) values ($1, $2)", [c.user!.id, sha256(normalizeRecovery(code))]);
  }
  return codes;
}

route("GET", "/profile/security", "user", async (c) => {
  const [n] = await c.db.query<{ n: number }>(
    "select count(*)::int as n from recovery_codes where user_id = $1 and used_at is null",
    [c.user!.id],
  );
  const sessions = await c.db.query(
    "select id, created_at, last_seen_at, ip, user_agent from sessions where user_id = $1 and stage = 'active' order by last_seen_at desc",
    [c.user!.id],
  );
  return {
    mfaEnabled: c.user!.mfaEnabled,
    recoveryLeft: n.n,
    sessions: sessions.map((s) => ({
      current: s.id === c.sessionId,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      ip: s.ip,
      userAgent: s.user_agent,
    })),
  };
});

route("POST", "/profile/mfa/start", "user", async (c) => {
  if (c.user!.mfaEnabled) throw new HttpError(400, "เปิดใช้ MFA อยู่แล้ว");
  await requirePassword(c, (await c.json()).password);
  const secret = newTotpSecret();
  await c.db.query("update users set mfa_pending_enc = $2 where id = $1", [c.user!.id, encrypt(secret)]);
  const uri = otpauthUri(secret, c.user!.email, appName());
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 224 });
  return { secret: secret.match(/.{1,4}/g)!.join(" "), qr, uri };
});

route("POST", "/profile/mfa/confirm", "user", async (c) => {
  const b = await c.json();
  const [row] = await c.db.query("select mfa_pending_enc from users where id = $1", [c.user!.id]);
  if (!row?.mfa_pending_enc) throw new HttpError(400, "กรุณาเริ่มตั้งค่า MFA ใหม่");
  const secret = decrypt(row.mfa_pending_enc);
  const step = verifyTotp(secret, String(b.code ?? "").replace(/\s/g, ""), 0);
  if (step == null) throw new HttpError(400, "รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง");
  await c.db.query(
    "update users set mfa_enabled = true, mfa_secret_enc = $2, mfa_pending_enc = null, mfa_last_step = $3 where id = $1",
    [c.user!.id, encrypt(secret), step],
  );
  const codes = await issueRecoveryCodes(c);
  await audit(c, { action: "mfa.enable", entity: "user", entityId: c.user!.id, summary: "เปิดใช้ MFA (TOTP)" });
  await reloadUser(c);
  return { recoveryCodes: codes };
});

route("POST", "/profile/mfa/disable", "user", async (c) => {
  const b = await c.json();
  if (!c.user!.mfaEnabled) throw new HttpError(400, "ยังไม่ได้เปิด MFA");
  await requirePassword(c, b.password);
  await requireSecondFactor(c, b);
  await c.db.query("update users set mfa_enabled = false, mfa_secret_enc = null, mfa_pending_enc = null, mfa_last_step = 0 where id = $1", [c.user!.id]);
  await c.db.query("delete from recovery_codes where user_id = $1", [c.user!.id]);
  await c.db.query("delete from sessions where user_id = $1 and id <> $2", [c.user!.id, c.sessionId]);
  await audit(c, { action: "mfa.disable", entity: "user", entityId: c.user!.id, summary: "ปิด MFA (ออกจากระบบอุปกรณ์อื่นทั้งหมด)" });
  await reloadUser(c);
  return { ok: true };
});

route("POST", "/profile/mfa/recovery", "user", async (c) => {
  const b = await c.json();
  if (!c.user!.mfaEnabled) throw new HttpError(400, "ยังไม่ได้เปิด MFA");
  await requirePassword(c, b.password);
  await requireSecondFactor(c, b);
  const codes = await issueRecoveryCodes(c);
  await audit(c, { action: "mfa.recovery_regenerate", entity: "user", entityId: c.user!.id, summary: "สร้างรหัสกู้คืน MFA ชุดใหม่" });
  return { recoveryCodes: codes };
});

export { fullName };
