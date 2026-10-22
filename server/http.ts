// Minimal framework-free HTTP layer on Web Request/Response, so the same code
// runs in Vercel functions, the Vite dev server and the tests.
import { getDb, type Db } from "./db.js";
import { randomToken, sha256 } from "./crypto.js";
import type { Role } from "../shared/types.js";

export class HttpError extends Error {
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  mfaEnabled: boolean;
  avatarVersion: number;
  hasAvatar: boolean;
  lastLoginAt: string | null;
}

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  db: Db;
  user: SessionUser | null;
  sessionId: string | null;
  sessionStage: "active" | "mfa_pending" | null;
  ip: string;
  ua: string;
  secure: boolean;
  json<T = any>(): Promise<T>;
  bytes(): Promise<Buffer>;
  setCookies: string[];
}

type Handler = (c: Ctx) => Promise<unknown>;
type Auth = "public" | "pending" | "user" | Role[];

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
  auth: Auth;
}

const routes: Route[] = [];

export function route(method: string, path: string, auth: Auth, handler: Handler) {
  routes.push({ method, parts: path.split("/").filter(Boolean), handler, auth });
}

export const SESSION_COOKIE = "sid";
export const IDLE_MS = 30 * 60 * 1000;
export const MAX_MS = 12 * 60 * 60 * 1000;
export const MFA_PENDING_MS = 5 * 60 * 1000;

export function cookieHeader(name: string, value: string, c: { secure: boolean }, maxAgeSec: number) {
  return [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
    c.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export const userFromRow = (r: Record<string, any>): SessionUser => ({
  id: r.id,
  email: r.email,
  firstName: r.first_name,
  lastName: r.last_name,
  role: r.role,
  mfaEnabled: r.mfa_enabled,
  avatarVersion: r.avatar_version,
  hasAvatar: Boolean(r.has_avatar ?? r.avatar_mime),
  lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
});

export const USER_COLUMNS =
  "u.id, u.email, u.first_name, u.last_name, u.role, u.mfa_enabled, u.avatar_version, u.avatar_mime, u.last_login_at, u.is_active";

async function loadSession(c: Ctx) {
  const token = readCookie(c.req, SESSION_COOKIE);
  if (!token) return;
  const id = sha256(token);
  const rows = await c.db.query(
    `select s.id, s.stage, s.created_at, s.expires_at, s.last_seen_at, ${USER_COLUMNS}
       from sessions s join users u on u.id = s.user_id where s.id = $1`,
    [id],
  );
  const s = rows[0];
  if (!s) return;
  const now = Date.now();
  const expired =
    new Date(s.expires_at).getTime() < now ||
    now - new Date(s.created_at).getTime() > MAX_MS ||
    (s.stage === "active" && now - new Date(s.last_seen_at).getTime() > IDLE_MS) ||
    !s.is_active;
  if (expired) {
    await c.db.query("delete from sessions where id = $1", [id]);
    return;
  }
  if (s.stage === "active" && now - new Date(s.last_seen_at).getTime() > 60_000) {
    await c.db.query("update sessions set last_seen_at = now() where id = $1", [id]);
  }
  c.user = userFromRow(s);
  c.sessionId = id;
  c.sessionStage = s.stage;
}

/** Creates a fresh session (rotating the id) and sets the cookie. */
export async function startSession(
  c: Ctx,
  userId: number,
  stage: "active" | "mfa_pending",
) {
  if (c.sessionId) await c.db.query("delete from sessions where id = $1", [c.sessionId]);
  const token = randomToken(32);
  const ttl = stage === "active" ? MAX_MS : MFA_PENDING_MS;
  await c.db.query(
    `insert into sessions (id, user_id, stage, expires_at, ip, user_agent)
     values ($1, $2, $3, now() + ($4 || ' milliseconds')::interval, $5, $6)`,
    [sha256(token), userId, stage, String(ttl), c.ip, c.ua.slice(0, 300)],
  );
  c.setCookies.push(cookieHeader(SESSION_COOKIE, token, c, Math.floor(ttl / 1000)));
  c.sessionId = sha256(token);
  c.sessionStage = stage;
}

export async function endSession(c: Ctx) {
  if (c.sessionId) await c.db.query("delete from sessions where id = $1", [c.sessionId]);
  c.setCookies.push(cookieHeader(SESSION_COOKIE, "", c, 0));
  c.sessionId = null;
  c.user = null;
  c.sessionStage = null;
}

function sameOrigin(req: Request, url: URL) {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") === "same-origin";
  try {
    const o = new URL(origin);
    const host = req.headers.get("x-forwarded-host") ?? url.host;
    return o.host === host;
  } catch {
    return false;
  }
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "/").replace(/\/+$/, "") || "/";
  const segs = path.split("/").filter(Boolean);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const c: Ctx = {
    req,
    url,
    params: {},
    db: undefined as unknown as Db,
    user: null,
    sessionId: null,
    sessionStage: null,
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local",
    ua: req.headers.get("user-agent") ?? "",
    secure: proto === "https",
    json: async () => {
      try {
        return (await req.json()) as any;
      } catch {
        throw new HttpError(400, "รูปแบบข้อมูลไม่ถูกต้อง");
      }
    },
    bytes: async () => Buffer.from(await req.arrayBuffer()),
    setCookies: [],
  };

  try {
    let matched: Route | undefined;
    let pathMatched = false;
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      const ok = r.parts.every((p, i) => {
        if (p.startsWith(":")) {
          params[p.slice(1)] = decodeURIComponent(segs[i]);
          return true;
        }
        return p === segs[i];
      });
      if (!ok) continue;
      pathMatched = true;
      if (r.method === req.method) {
        matched = r;
        c.params = params;
        break;
      }
    }
    if (!matched) {
      throw new HttpError(pathMatched ? 405 : 404, pathMatched ? "ไม่รองรับวิธีนี้" : "ไม่พบหน้านี้");
    }

    c.db = await getDb();

    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const cron = matched.auth === "public" && path.startsWith("/cron/");
      if (!cron && (!sameOrigin(req, url) || req.headers.get("x-csrf") !== "1")) {
        throw new HttpError(403, "คำขอไม่ได้มาจากหน้าเว็บของระบบ");
      }
    }

    await loadSession(c);

    const need = matched.auth;
    if (need !== "public") {
      if (!c.user) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
      if (need === "pending") {
        if (c.sessionStage !== "mfa_pending") throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
      } else {
        if (c.sessionStage !== "active") throw new HttpError(401, "กรุณายืนยันตัวตนให้ครบ");
        if (Array.isArray(need) && !need.includes(c.user.role)) {
          throw new HttpError(403, "คุณไม่มีสิทธิ์ทำรายการนี้");
        }
      }
    }

    const out = await matched.handler(c);
    const res =
      out instanceof Response
        ? out
        : new Response(JSON.stringify(out ?? { ok: true }), { status: 200, headers: JSON_HEADERS });
    for (const sc of c.setCookies) res.headers.append("set-cookie", sc);
    return res;
  } catch (e) {
    const res =
      e instanceof HttpError
        ? new Response(JSON.stringify({ error: e.message, ...e.extra }), {
            status: e.status,
            headers: JSON_HEADERS,
          })
        : (console.error("[api]", e),
          new Response(JSON.stringify({ error: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่" }), {
            status: 500,
            headers: JSON_HEADERS,
          }));
    for (const sc of c.setCookies) res.headers.append("set-cookie", sc);
    return res;
  }
}

// --------------------------------------------------------- input helpers

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const intOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
export function reqInt(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v)) throw new HttpError(400, `${what} ไม่ถูกต้อง`);
  return v;
}
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 200;
