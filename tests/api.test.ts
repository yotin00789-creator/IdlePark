import { beforeAll, describe, expect, it } from "vitest";
import { totp, hotp, base32Decode, verifyTotp, totpStep } from "../server/crypto.js";
import { sent } from "../server/mail.js";
import { Client, PASSWORD, acceptInvite, freshApp, setupAdmin, tempFor } from "./helpers.js";

let admin: Client;

beforeAll(async () => {
  await freshApp();
});

describe("first-run setup and login", () => {
  it("reports that setup is needed, then creates the first admin once", async () => {
    const anon = new Client();
    expect((await anon.get("/auth/state")).json.needsSetup).toBe(true);
    const bad = await anon.post("/auth/setup", { email: "x@y.com", firstName: "ก", password: "short" });
    expect(bad.status).toBe(400);
    admin = await setupAdmin();
    expect((await admin.get("/auth/me")).json.user.role).toBe("admin");
    const again = await new Client().post("/auth/setup", { email: "z@z.com", firstName: "ข", password: PASSWORD });
    expect(again.status).toBe(403);
    expect((await new Client().get("/auth/state")).json.needsSetup).toBe(false);
  });

  it("rejects bad credentials with a neutral message and locks after 5 failures", async () => {
    const c = new Client();
    await admin.post("/users", { email: "lock@example.com", firstName: "ล็อก", role: "viewer" });
    const wrongPass = await c.post("/auth/login", { email: "lock@example.com", password: "nope-nope-nope1" });
    const unknown = await c.post("/auth/login", { email: "ghost@example.com", password: "nope-nope-nope1" });
    expect(wrongPass.status).toBe(401);
    expect(wrongPass.json.error).toBe(unknown.json.error);
    for (let i = 0; i < 4; i++) await c.post("/auth/login", { email: "lock@example.com", password: "nope-nope-nope1" });
    const locked = await c.post("/auth/login", { email: "lock@example.com", password: PASSWORD });
    expect(locked.status).toBe(429);
  });

  it("blocks state-changing requests that lack the CSRF header or a same-origin Origin", async () => {
    const r1 = await admin.req("POST", "/notifications/read", { all: true }, { "x-csrf": "0" });
    expect(r1.status).toBe(403);
    const r2 = await admin.req("POST", "/notifications/read", { all: true }, { origin: "https://evil.example" });
    expect(r2.status).toBe(403);
  });

  it("requires a session for protected endpoints", async () => {
    expect((await new Client().get("/data")).status).toBe(401);
  });
});

describe("inviting users by email", () => {
  const newUser = new Client();

  it("admin invites a user: pending status, HTML email with a temporary password", async () => {
    sent.length = 0;
    const r = await admin.post("/users", { email: "Mom@Example.com", firstName: "แม่", lastName: "ใจดี", role: "editor" });
    expect(r.status).toBe(200);
    expect(r.json.user.status).toBe("invited");
    expect(r.json.mail.ok).toBe(true);
    expect(r.json.tempPassword).toBeUndefined(); // only shown to the admin when the e-mail failed
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("mom@example.com");
    expect(sent[0].html).toContain("<table");
    expect(sent[0].html).toContain("#F2C200");
    expect(sent[0].html).toContain("รหัสผ่านชั่วคราว");
    expect(tempFor("mom@example.com")).toMatch(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{10}$/);
    expect((await admin.post("/users", { email: "mom@example.com", firstName: "ก", role: "viewer" })).status).toBe(409);
  });

  it("signing in with the temporary password leads to choosing a new one (no session until then)", async () => {
    expect((await new Client().post("/auth/login", { email: "mom@example.com", password: PASSWORD })).status).toBe(401);
    const login = await newUser.post("/auth/login", { email: "mom@example.com", password: tempFor("mom@example.com") });
    expect(login.status).toBe(200);
    expect(login.json).toMatchObject({ mustChange: true, email: "mom@example.com" });
    expect((await newUser.get("/auth/me")).status).toBe(401); // nothing opened yet
    const token = login.json.token;
    expect((await newUser.post(`/auth/token/invite/${token}`, { password: "short" })).status).toBe(400);
    const ok = await newUser.post(`/auth/token/invite/${token}`, { password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.json.signedIn).toBe(true);
    expect((await newUser.get("/auth/me")).json.user.role).toBe("editor");
    expect((await new Client().get(`/auth/token/invite/${token}`)).status).toBe(410); // single use
    // the temporary password is dead now
    expect((await new Client().post("/auth/login", { email: "mom@example.com", password: tempFor("mom@example.com") })).status).toBe(401);
  });

  it("role limits are enforced on the server", async () => {
    expect((await newUser.get("/users")).status).toBe(403);
    expect((await newUser.get("/audit")).status).toBe(403);
    expect((await newUser.put("/settings", { monthlyFeeDefault: 100000 })).status).toBe(403);
    expect((await newUser.get("/data")).status).toBe(200);
  });

  it("the bell shows that the invited user joined", async () => {
    const n = await admin.get("/notifications");
    expect(n.json.items.some((i: any) => i.kind === "user_joined")).toBe(true);
    expect(n.json.unread).toBeGreaterThan(0);
    await admin.post("/notifications/read", { all: true });
    expect((await admin.get("/notifications")).json.unread).toBe(0);
  });

  it("cannot demote or disable the last admin; can disable others (sessions end)", async () => {
    const list = (await admin.get("/users")).json.users;
    const me = list.find((u: any) => u.email === "owner@example.com");
    const mom = list.find((u: any) => u.email === "mom@example.com");
    expect((await admin.patch(`/users/${me.id}`, { role: "viewer" })).status).toBe(400);
    expect((await admin.patch(`/users/${me.id}`, { isActive: false })).status).toBe(400);
    expect((await admin.patch(`/users/${mom.id}`, { isActive: false })).status).toBe(200);
    expect((await newUser.get("/auth/me")).status).toBe(401);
    expect((await new Client().post("/auth/login", { email: "mom@example.com", password: PASSWORD })).status).toBe(401);
    expect((await admin.patch(`/users/${mom.id}`, { isActive: true, role: "viewer" })).status).toBe(200);
  });

  it("forgot-password sends a reset email without revealing whether the account exists", async () => {
    sent.length = 0;
    const a = await new Client().post("/auth/forgot", { email: "mom@example.com" });
    const b = await new Client().post("/auth/forgot", { email: "nobody@example.com" });
    expect(a.json.message).toBe(b.json.message);
    expect(sent).toHaveLength(1);
    const link = /reset-password\?token=([\w-]+)/.exec(sent[0].html)![1];
    const c = new Client();
    const r = await c.post(`/auth/token/reset/${link}`, { password: "Another-pass-2024x" });
    expect(r.status).toBe(200);
    expect(r.json.signedIn).toBe(false); // the person signs in again with the new password
    expect((await c.get("/auth/me")).status).toBe(401);
    expect((await new Client().post("/auth/login", { email: "mom@example.com", password: "Another-pass-2024x" })).status).toBe(200);
  });
});

describe("profile: name, picture, password", () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

  it("edits first/last name; email and role stay read-only for the user", async () => {
    const r = await admin.patch("/profile", { firstName: "สมชาย", lastName: "ใจดี", role: "viewer", email: "hack@x.com" });
    expect(r.json.user.firstName).toBe("สมชาย");
    expect(r.json.user.email).toBe("owner@example.com");
    expect(r.json.user.role).toBe("admin");
    expect((await admin.patch("/profile", { firstName: " " })).status).toBe(400);
  });

  it("uploads a picture, serves it, and the replaced picture is gone from the database", async () => {
    const first = await admin.req("PUT", "/profile/avatar", new Uint8Array(png), { "content-type": "image/png" });
    expect(first.status).toBe(200);
    const v1 = first.json.user.avatarVersion;
    const id = first.json.user.id;
    const got = await admin.get(`/users/${id}/avatar`);
    expect(got.headers.get("content-type")).toBe("image/png");

    const second = await admin.req("PUT", "/profile/avatar", new Uint8Array(jpg));
    expect(second.json.user.avatarVersion).toBe(v1 + 1);
    const again = await admin.get(`/users/${id}/avatar`);
    expect(again.headers.get("content-type")).toBe("image/jpeg");
    const { getDb } = await import("../server/db.js");
    const db = await getDb();
    const rows = await db.query("select count(*)::int as n, sum(length(avatar))::int as bytes from users where avatar is not null and id = $1", [id]);
    expect(rows[0]).toEqual({ n: 1, bytes: jpg.length }); // exactly one picture, the new one

    expect((await admin.req("PUT", "/profile/avatar", new Uint8Array(Buffer.from("<svg onload=alert(1)>")))).status).toBe(415);
    expect((await admin.req("PUT", "/profile/avatar", new Uint8Array(Buffer.alloc(1_600_000, 1)))).status).toBe(413);

    const del = await admin.del("/profile/avatar");
    expect(del.json.user.hasAvatar).toBe(false);
    expect((await admin.get(`/users/${id}/avatar`)).status).toBe(404);
  });

  it("changes the password only with the current one", async () => {
    expect((await admin.post("/profile/password", { current: "wrong-password-1", next: "Brand-new-pass-77" })).status).toBe(400);
    expect((await admin.post("/profile/password", { current: PASSWORD, next: "Brand-new-pass-77" })).status).toBe(200);
    expect((await new Client().post("/auth/login", { email: "owner@example.com", password: "Brand-new-pass-77" })).status).toBe(200);
    expect((await admin.post("/profile/password", { current: "Brand-new-pass-77", next: PASSWORD })).status).toBe(200);
  });
});

describe("MFA (TOTP)", () => {
  const user = new Client();
  let secret = "";
  let recovery: string[] = [];

  it("RFC 6238 test vector", () => {
    const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // ASCII "12345678901234567890"
    expect(base32Decode(rfcSecret).toString()).toBe("12345678901234567890");
    expect(hotp(rfcSecret, Math.floor(59 / 30))).toBe("287082");
    expect(totp(rfcSecret, 1111111109 * 1000)).toBe("081804");
    expect(totp(rfcSecret, 20000000000 * 1000)).toBe("353130");
  });

  it("enrols with password + code, shows recovery codes once", async () => {
    await admin.post("/users", { email: "mfa@example.com", firstName: "เอ็มเอฟเอ", lastName: "", role: "viewer" });
    await acceptInvite(user, "mfa@example.com");
    expect((await user.post("/profile/mfa/start", { password: "wrong" })).status).toBe(400);
    const start = await user.post("/profile/mfa/start", { password: PASSWORD });
    expect(start.json.qr).toMatch(/^data:image\/png;base64,/);
    secret = start.json.secret.replace(/\s/g, "");
    expect((await user.post("/profile/mfa/confirm", { code: "000000" })).status).toBe(400);
    const done = await user.post("/profile/mfa/confirm", { code: totp(secret) });
    expect(done.status).toBe(200);
    recovery = done.json.recoveryCodes;
    expect(recovery).toHaveLength(10);
    expect((await user.get("/auth/me")).json.user.mfaEnabled).toBe(true);
  });

  it("login needs the second step; pending session cannot read data", async () => {
    const c = new Client();
    const step1 = await c.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    expect(step1.json.mfaRequired).toBe(true);
    expect((await c.get("/data")).status).toBe(401);
    expect((await c.get("/auth/me")).status).toBe(401);
    expect((await c.post("/auth/mfa", { code: "123456" })).status).toBe(401);
  });

  it("accepts a valid code once; the same code cannot be replayed; +/-1 step is accepted", async () => {
    const now = Date.now();
    const sec = secret;
    const lastStep = 0;
    expect(verifyTotp(sec, hotp(sec, totpStep(now) - 1), lastStep, now)).toBe(totpStep(now) - 1);
    expect(verifyTotp(sec, hotp(sec, totpStep(now) - 2), lastStep, now)).toBeNull();
    expect(verifyTotp(sec, hotp(sec, totpStep(now)), totpStep(now), now)).toBeNull(); // replay

    // wait for a fresh step relative to the enrolment code, via a future-step code
    const c = new Client();
    await c.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    const next = hotp(sec, totpStep() + 1); // within the +1 window and newer than the enrolment step
    const ok = await c.post("/auth/mfa", { code: next });
    expect(ok.status).toBe(200);
    expect((await c.get("/data")).status).toBe(200);

    const c2 = new Client();
    await c2.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    expect((await c2.post("/auth/mfa", { code: next })).status).toBe(401); // replay rejected
  });

  it("recovery codes work exactly once", async () => {
    const c = new Client();
    await c.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    expect((await c.post("/auth/mfa", { recovery: recovery[0] })).status).toBe(200);
    const c2 = new Client();
    await c2.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    expect((await c2.post("/auth/mfa", { recovery: recovery[0] })).status).toBe(401);
  });

  it("disabling needs password and a valid second factor; admin can reset MFA for lost phones", async () => {
    expect((await user.post("/profile/mfa/disable", { password: PASSWORD, code: "000000" })).status).toBe(400);
    const list = (await admin.get("/users")).json.users;
    const target = list.find((u: any) => u.email === "mfa@example.com");
    const me = list.find((u: any) => u.email === "owner@example.com");
    expect((await admin.post(`/users/${me.id}/reset-mfa`)).status).toBe(400); // not your own: another admin does that
    const reset = await admin.post(`/users/${target.id}/reset-mfa`);
    expect(reset.status).toBe(200);
    expect((await admin.post(`/users/${target.id}/reset-mfa`)).status).toBe(409); // already off
    expect((await admin.get("/audit")).json.entries.some((e: any) => e.action === "user.reset_mfa" && e.summary.includes("บังคับปิด MFA"))).toBe(true);
    const c = new Client();
    const r = await c.post("/auth/login", { email: "mfa@example.com", password: PASSWORD });
    expect(r.json.mfaRequired).toBeUndefined();
    expect((await c.get("/data")).status).toBe(200);
  });
});

describe("session lifetime", () => {
  it("expires after 30 minutes idle and after 12 hours absolute", async () => {
    const { getDb } = await import("../server/db.js");
    const db = await getDb();
    const c = new Client();
    await c.post("/auth/login", { email: "owner@example.com", password: PASSWORD });
    expect((await c.get("/data")).status).toBe(200);
    await db.query("update sessions set last_seen_at = now() - interval '31 minutes'");
    expect((await c.get("/data")).status).toBe(401);

    const d = new Client();
    await d.post("/auth/login", { email: "owner@example.com", password: PASSWORD });
    await db.query("update sessions set created_at = now() - interval '13 hours'");
    expect((await d.get("/data")).status).toBe(401);
  });
});
