// A new ledger year starts from the renters of the year before: same people, same vehicles, same slots, the price they pay now.
import { audit } from "./audit.js";
import type { Db, Queryable } from "./db.js";
import type { Ctx } from "./http.js";
import { feeFor } from "../shared/calc.js";
import { bangkokToday } from "../shared/thai.js";

type Actor = { id: number | null; email: string; name: string; role: string };
const SYSTEM: Actor = { id: null, email: "system", name: "ระบบอัตโนมัติ", role: "system" };

/** Copy the renters of `y - 1` into `y` (only people still renting, plus the rows kept as "not counted"). Returns how many, or 0 when there is nothing to do. */
export async function copyYear(c: Ctx, db: Db, y: number, opts: { auto?: boolean } = {}): Promise<number> {
  return db.tx(async (q: Queryable) => {
    // two requests arriving together must not both copy: the second waits, then sees the rows and stops
    await q.query("select pg_advisory_xact_lock(7001)");
    const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from ledger_rows where year = $1", [y]);
    if (n > 0) return 0;
    const prev = await q.query("select * from ledger_rows where year = $1 and (is_active or kind = 'excluded') order by sort_order, id", [y - 1]);
    if (!prev.length) return 0;
    let i = 0;
    for (const r of prev) {
      await q.query(
        `insert into ledger_rows (year, sort_order, customer_id, owner_name, plate, zone_id, kind, bulk_count, monthly_fee, note, slot_id, vehicle_type, car_color, plate_province, due_day, bay, start_month, billing, is_owner)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'',$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [y, i++, r.customer_id, r.owner_name, r.plate, r.zone_id, r.kind, r.bulk_count, feeFor({ monthlyFee: r.monthly_fee, feeChanges: r.fee_changes ?? [] }, 12), r.slot_id, r.vehicle_type, r.car_color, r.plate_province, r.due_day, r.bay, r.billing === "yearly" ? r.start_month : 1, r.billing, r.is_owner], // a yearly row keeps its payment month
      );
    }
    await audit(
      c,
      {
        action: opts.auto ? "year.auto" : "year.copy",
        entity: "year",
        entityId: y,
        summary: opts.auto ? `ขึ้นปีใหม่: ระบบสร้างปี ${y} ให้อัตโนมัติ คัดลอกผู้เช่า ${prev.length} แถวจากปี ${y - 1}` : `คัดลอกผู้เช่า ${prev.length} แถวจากปี ${y - 1} ไปปี ${y}`,
        ...(opts.auto ? { actor: SYSTEM } : {}),
      },
      q,
    );
    return prev.length;
  });
}

/** When the calendar passes 31 December the new year must exist: it is made from the last one the first time anything looks. */
export async function ensureCurrentYear(c: Ctx, db: Db, year = bangkokToday().year): Promise<number> {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from ledger_rows where year = $1", [year]);
  if (n > 0) return 0;
  return copyYear(c, db, year, { auto: true });
}
