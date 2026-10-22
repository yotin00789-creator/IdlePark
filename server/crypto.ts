import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
/** A temporary password people can read from an e-mail: no look-alike characters, always letters + digits. */
export function tempPassword(length = 10): string {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(letters), pick(digits), pick(letters), pick(digits)];
  while (chars.length < length) chars.push(pick(letters + digits));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// --------------------------------------------------------------- secrets

const isProd = () => process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

/** Reads a required secret; development falls back to a fixed local value. */
export function secret(name: "MFA_ENC_KEY" | "SESSION_SECRET"): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (isProd()) throw new Error(`${name} must be set (at least 16 characters)`);
  return `dev-only-${name}-do-not-use-in-production`;
}

// ------------------------------------------------------------- passwords

const scrypt = (pw: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw, salt, len, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) =>
      e ? reject(e) : resolve(k),
    ),
  );

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | null) {
  if (!stored) return false;
  const [kind, saltB64, keyB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  return null;
}

// ------------------------------------------------------- AES-256-GCM box

const key = () => createHash("sha256").update(secret("MFA_ENC_KEY")).digest();

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(boxed: string): string {
  const [v, iv, tag, data] = boxed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

// ---------------------------------------------------------- base32 / TOTP

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20)); // 160 bits

/** RFC 4226 HOTP with SHA-1, 6 digits. */
export function hotp(secretB32: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secretB32)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin =
    ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (nowMs = Date.now(), period = 30) => Math.floor(nowMs / 1000 / period);
export const totp = (secretB32: string, nowMs = Date.now()) =>
  hotp(secretB32, totpStep(nowMs));

/**
 * Verifies a code within ±1 time-step. Returns the matched step, or null.
 * Steps <= lastStep are rejected so a code can never be used twice.
 */
export function verifyTotp(
  secretB32: string,
  code: string,
  lastStep: number,
  nowMs = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(nowMs);
  let matched: number | null = null;
  for (const step of [now - 1, now, now + 1]) {
    // compare all three so timing does not reveal which step matched
    if (safeEqual(hotp(secretB32, step), code) && step > lastStep) matched = step;
  }
  return matched;
}

export const otpauthUri = (secretB32: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}`;

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normalizeRecovery = (c: string) => c.replace(/[\s-]/g, "").toUpperCase();
