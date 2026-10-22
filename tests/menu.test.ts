import { beforeAll, describe, expect, it } from "vitest";
import { Client, acceptInvite, freshApp, setupAdmin } from "./helpers.js";

describe("hiding menu entries", () => {
  let admin: Client;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("the admin hides entries for everyone; the settings entries can never be hidden; junk is ignored", async () => {
    expect((await admin.get("/data")).json.settings.menu).toEqual({ hidden: [] });
    const r = await admin.put("/settings", { menu: { hidden: ["/reports", "/accounts", "/settings", "/profile/security", "x", "/a/b/c", 5, "/reports"] } });
    expect(r.status).toBe(200);
    expect(r.json.settings.menu.hidden.sort()).toEqual(["/accounts", "/reports"]);
    // another user sees the same setting
    await admin.post("/users", { email: "ed@example.com", firstName: "ผู้แก้", role: "editor" });
    const ed = new Client();
    await acceptInvite(ed, "ed@example.com");
    expect((await ed.get("/data")).json.settings.menu.hidden.sort()).toEqual(["/accounts", "/reports"]);
    expect((await ed.put("/settings", { menu: { hidden: ["/lot"] } })).status).toBe(403); // only the admin changes it
    // other settings saved on their own do not bring the entries back
    await admin.put("/settings", { monthlyFeeDefault: 130000 });
    expect((await admin.get("/data")).json.settings.menu.hidden.sort()).toEqual(["/accounts", "/reports"]);
    // and everything can be shown again
    await admin.put("/settings", { menu: { hidden: [] } });
    expect((await admin.get("/data")).json.settings.menu.hidden).toEqual([]);
  });
});
