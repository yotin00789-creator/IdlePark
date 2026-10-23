import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../server/db.js";
import { ensureCurrentYear } from "../server/years.js";
import { bangkokToday } from "../shared/thai.js";
import { Client, freshApp, setupAdmin } from "./helpers.js";

describe("a new year appears by itself", () => {
  let admin: Client;
  const y = bangkokToday().year;
  const ctx = { ip: "", ua: "", req: { method: "GET" }, url: { pathname: "/cron" }, user: null } as any;
  beforeAll(async () => {
    await freshApp();
    admin = await setupAdmin();
  });

  it("copies who is still renting from the last year, once, and says so in the history", async () => {
    await admin.post("/ledger/rows", { year: y, ownerName: "ยังเช่าอยู่", plate: "NEW 1", monthlyFee: 120000 });
    const gone = (await admin.post("/ledger/rows", { year: y, ownerName: "เลิกเช่าแล้ว", plate: "NEW 2", monthlyFee: 120000 })).json.row;
    await admin.patch(`/ledger/rows/${gone.id}`, { isActive: false });
    const db = await getDb();
    const next = y + 1;
    expect(await ensureCurrentYear(ctx, db, next)).toBe(1); // the one who left is not carried over
    expect(await ensureCurrentYear(ctx, db, next)).toBe(0); // and it never copies twice
    const rows = (await admin.get("/data")).json.years.find((x: any) => x.year === next).rows;
    expect(rows.map((r: any) => r.ownerName)).toEqual(["ยังเช่าอยู่"]);
    const log = (await admin.get("/audit?action=year")).json.entries.find((e: any) => e.action === "year.auto");
    expect(log.summary).toContain(`ปี ${next}`);
    // the year that has just ended still holds the one who left, with everything
    expect((await admin.get("/data")).json.years.find((x: any) => x.year === y).rows.some((r: any) => r.ownerName === "เลิกเช่าแล้ว" && !r.isActive)).toBe(true);
  });
});
