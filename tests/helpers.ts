import { handle } from "../server/index.js";
import { getDb, resetDbCache } from "../server/db.js";
import { sent } from "../server/mail.js";

export const ORIGIN = "http://localhost";

let ipCounter = 10;
export class Client {
  cookie = "";
  ip = `10.0.0.${++ipCounter}`;
  async req(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { origin: ORIGIN, "x-csrf": "1", "x-forwarded-for": this.ip, ...extra };
    if (this.cookie) headers.cookie = this.cookie;
    let payload: any;
    if (body instanceof Uint8Array) payload = body;
    else if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await handle(new Request(`${ORIGIN}/api${path}`, { method, headers, body: payload }));
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(";");
      if (/Max-Age=0/i.test(attrs.join(";"))) this.cookie = "";
      else this.cookie = pair.trim();
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* binary */
    }
    return { status: res.status, json, headers: res.headers, text };
  }
  get = (p: string) => this.req("GET", p);
  post = (p: string, b: unknown = {}) => this.req("POST", p, b);
  put = (p: string, b: unknown = {}) => this.req("PUT", p, b);
  patch = (p: string, b: unknown = {}) => this.req("PATCH", p, b);
  del = (p: string) => this.req("DELETE", p);
}

export const PASSWORD = "Correct-horse-9battery";

/** A clean in-memory database for each test file. */
export async function freshApp() {
  resetDbCache();
  process.env.PGLITE_MEMORY = "1";
  if (process.env.DATABASE_URL) {
    // Running against a real Postgres: wipe the schema so each test file starts clean.
    const { default: pg } = await import("pg");
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query("drop schema public cascade; create schema public");
    await c.end();
  }
  return getDb();
}

export async function setupAdmin(c = new Client(), email = "owner@example.com") {
  const r = await c.post("/auth/setup", { email, firstName: "เจ้าของ", lastName: "บ้าน", password: PASSWORD });
  if (r.status !== 200) throw new Error(`setup failed ${r.status} ${JSON.stringify(r.json)}`);
  return c;
}

/** The temporary password the invitation e-mail carried (read from the captured mail). */
export function tempFor(email: string): string {
  const mail = [...sent].reverse().find((m) => m.to === email.toLowerCase());
  const m = /monospace;letter-spacing:\.14em;color:#[0-9a-f]+">([^<]+)</i.exec(mail?.html ?? "");
  if (!m) throw new Error(`no invitation mail for ${email}`);
  return m[1];
}

/** What an invited person does: sign in with the temporary password, then choose their own. */
export async function acceptInvite(c: Client, email: string, password = PASSWORD) {
  const login = await c.post("/auth/login", { email, password: tempFor(email) });
  if (!login.json?.token) throw new Error(`temp login failed ${login.status} ${JSON.stringify(login.json)}`);
  return c.post(`/auth/token/invite/${login.json.token}`, { password });
}
