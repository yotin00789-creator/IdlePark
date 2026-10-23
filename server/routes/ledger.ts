import { audit } from "../audit.js";
import { feeFor } from "../../shared/calc.js";
import { THAI_MONTHS, bangkokToday } from "../../shared/thai.js";
import { getSettings, sanitizeMenu, sanitizeReminders, setSetting } from "../settings.js";
import { decrypt, encrypt } from "../crypto.js";
import { loadSavings, loadYears, rowFromDb } from "../data.js";
import type { Queryable } from "../db.js";
import { HttpError, intOrNull, route, str } from "../http.js";
import { resolvePlacement } from "../placement.js";
import { loadStorage } from "../storage.js";
import { copyYear, ensureCurrentYear } from "../years.js";
import { STORAGE_SLOT, setStorageSlots, baysIn, isHexColor, isMotorcycle, isSlotId, isStorageSlot, isVehicleType, slotLabel } from "../../shared/lot.js";

const EDIT = ["admin", "editor"] as const;
const ADMIN = ["admin"] as const;
const MAX_SATANG = 1_000_000_000; // 10 million baht

function money(v: unknown, what = "จำนวนเงิน"): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || Math.abs(v) > MAX_SATANG) {
    throw new HttpError(400, `${what}ไม่ถูกต้อง`);
  }
  return v;
}
const month = (v: unknown) => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 12) throw new HttpError(400, "เดือนไม่ถูกต้อง");
  return v;
};
const year = (v: unknown) => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 2500 || v > 2700) throw new HttpError(400, "ปีไม่ถูกต้อง (ใช้ พ.ศ.)");
  return v;
};
const baht = (satang: number | null) => (satang == null ? "ว่าง" : `${(satang / 100).toLocaleString("en-US")} บาท`);
const ITEM_LABEL: Record<string, string> = {
  to_father: "ให้พ่อ",
  pay_aunt: "จ่ายป้า",
  total_expense: "ค่าใช้จ่ายรวม",
  collect: "เก็บเงิน",
};

const maskAccount = (n: string) => (n.length <= 4 ? n : `${"•".repeat(Math.max(0, n.replace(/-/g, "").length - 4))}${n.slice(-4)}`);

// ------------------------------------------------------------------ data

route("GET", "/data", "user", async (c) => {
  const today = bangkokToday();
  await ensureCurrentYear(c, c.db, today.year); // after 31 December the new year is already there
  const [years, sv, customers, zones, accounts, settings, lastRun] = await Promise.all([
    loadYears(c.db, [today.year]),
    loadSavings(c.db),
    c.db.query("select * from customers order by name"),
    c.db.query("select * from zones order by sort_order, id"),
    c.db.query("select id, bank, number_enc, holder, label, shows, sort_order from bank_accounts order by sort_order, id"),
    getSettings(c.db),
    c.db.query("select max(sent_at) as at from reminder_log"),
  ]);
  setStorageSlots(zones.filter((r) => r.kind === "storage").flatMap((r) => r.slot_ids as string[]));
  return {
    today,
    years,
    savings: sv.savings,
    savingsNotes: sv.notes,
    customers: customers.map((r) => ({ id: r.id, name: r.name, phone: r.phone, email: r.email, note: r.note, isActive: r.is_active, isOwner: Boolean(r.is_owner) })),
    zones: zones.map((r) => ({ id: r.id, name: r.name, description: r.description, access: r.access, kind: r.kind, slotIds: r.slot_ids ?? [], motoCapacity: r.moto_capacity, capacity: r.capacity, defaultFee: r.default_fee, sortOrder: r.sort_order, isActive: r.is_active })),
    accounts: accounts.map((r) => ({ id: r.id, bank: r.bank, masked: maskAccount(decrypt(r.number_enc)), holder: r.holder, label: r.label, shows: r.shows })),
    settings,
    lastReminderAt: lastRun[0]?.at ?? null,
  };
});

route("GET", "/reference", "user", async (c) => {
  const [r] = await c.db.query("select value from settings where key = 'excelReference'");
  return { reference: r?.value ?? null };
});

// -------------------------------------------------------------- payments

route("PUT", "/ledger/payments", EDIT as any, async (c) => {
  const b = await c.json();
  const changes: any[] = Array.isArray(b.changes) ? b.changes : [];
  if (!changes.length) return { ok: true, changed: 0 };
  if (changes.length > 600) throw new HttpError(400, "แก้ไขพร้อมกันได้ไม่เกิน 600 ช่อง");
  const parsed = changes.map((x) => {
    if (x.method !== undefined && x.method !== "cash" && x.method !== "transfer") throw new HttpError(400, "วิธีรับเงินไม่ถูกต้อง");
    return { rowId: Number(x.rowId), month: month(x.month), amount: money(x.amount), method: x.method as "cash" | "transfer" | undefined, accountId: x.accountId == null ? null : Number(x.accountId) };
  });
  let changed = 0;
  await c.db.tx(async (q) => {
    const accounts = new Map((await q.query("select id, bank, label from bank_accounts")).map((a) => [a.id as number, `${a.bank} ${a.label}`.trim()]));
    const methodText = (m: string | null, acc: number | null) => (m == null ? "" : m === "cash" ? " (เงินสด)" : ` (โอน${acc != null && accounts.has(acc) ? ` ${accounts.get(acc)}` : ""})`);
    for (const ch of parsed) {
      const [row] = await q.query("select id, year, owner_name, plate, is_owner from ledger_rows where id = $1", [ch.rowId]);
      if (!row) throw new HttpError(404, "ไม่พบแถวที่แก้ไข");
      if (row.is_owner && (ch.amount ?? 0) > 0) throw new HttpError(400, `${row.owner_name} ไม่คิดเงิน (เจ้าของหรืออยู่ช่องส่วนตัว Private) จึงบันทึกยอดชำระไม่ได้`);
      const [prev] = await q.query("select amount, method, account_id from payments where row_id = $1 and month = $2", [ch.rowId, ch.month]);
      const before = prev ? (prev.amount as number | null) : null;
      // the method stays as it was unless the caller says otherwise; a transfer may name the account, cash never does
      const method = ch.method ?? (prev?.method as string | undefined) ?? "cash";
      let accountId: number | null = method === "transfer" ? (ch.method ? ch.accountId : (prev?.account_id ?? null)) : null;
      if (accountId != null && !accounts.has(accountId)) throw new HttpError(400, "ไม่พบบัญชีที่เลือก");
      if (method === "transfer" && accountId == null && accounts.size === 1) accountId = [...accounts.keys()][0];
      const sameMethod = !prev || (prev.method === method && (prev.account_id ?? null) === accountId);
      if (before === ch.amount && sameMethod) continue;
      await q.query(
        `insert into payments (row_id, month, amount, method, account_id, updated_by) values ($1,$2,$3,$4,$5,$6)
         on conflict (row_id, month) do update set amount = excluded.amount, method = excluded.method, account_id = excluded.account_id, updated_at = now(), updated_by = excluded.updated_by`,
        [ch.rowId, ch.month, ch.amount, method, accountId, c.user!.id],
      );
      changed++;
      const hasMoney = ch.amount != null;
      await audit(c, {
        action: "payment.update",
        entity: "payment",
        entityId: `${ch.rowId}:${ch.month}`,
        summary: `${row.owner_name}${row.plate ? ` (${row.plate})` : ""} ${THAI_MONTHS[ch.month - 1]} ${row.year}: ${baht(before)}${prev && before != null ? methodText(prev.method, prev.account_id) : ""} → ${baht(ch.amount)}${hasMoney ? methodText(method, accountId) : ""}`,
        before: { amount: before, method: prev?.method ?? null, accountId: prev?.account_id ?? null },
        after: { amount: ch.amount, method, accountId },
      }, q);
    }
  });
  return { ok: true, changed };
});

route("PUT", "/ledger/items", EDIT as any, async (c) => {
  const b = await c.json();
  const changes: any[] = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > 200) throw new HttpError(400, "แก้ไขพร้อมกันได้ไม่เกิน 200 ช่อง");
  let changed = 0;
  await c.db.tx(async (q) => {
    for (const x of changes) {
      const y = year(x.year);
      const m = month(x.month);
      if (!(x.kind in ITEM_LABEL)) throw new HttpError(400, "ชนิดรายการไม่ถูกต้อง");
      const amount = money(x.amount);
      const [prev] = await q.query("select amount from year_items where year=$1 and month=$2 and kind=$3", [y, m, x.kind]);
      const before = prev ? (prev.amount as number | null) : null;
      if (before === amount) continue;
      await q.query(
        `insert into year_items (year, month, kind, amount) values ($1,$2,$3,$4)
         on conflict (year, month, kind) do update set amount = excluded.amount`,
        [y, m, x.kind, amount],
      );
      changed++;
      await audit(c, {
        action: "item.update",
        entity: "year_item",
        entityId: `${y}:${m}:${x.kind}`,
        summary: `${ITEM_LABEL[x.kind]} ${THAI_MONTHS[m - 1]} ${y}: ${baht(before)} → ${baht(amount)}`,
        before: { amount: before },
        after: { amount },
      }, q);
    }
  });
  return { ok: true, changed };
});

// ------------------------------------------------------------------ rows

/** slot / vehicle / due-day fields from a request body; `undefined` keeps the current value. */
function lotFields(b: any, cur?: Record<string, any>) {
  const slot = b.slotId === undefined ? (cur?.slot_id ?? null) : b.slotId === null || b.slotId === "" ? null : b.slotId;
  if (slot !== null && !isSlotId(slot)) throw new HttpError(400, "ช่องจอดไม่ถูกต้อง");
  const type = b.vehicleType === undefined ? (cur?.vehicle_type ?? null) : b.vehicleType === null || b.vehicleType === "" ? null : b.vehicleType;
  if (type !== null && !isVehicleType(type)) throw new HttpError(400, "ประเภทรถไม่ถูกต้อง");
  const color = b.carColor === undefined ? (cur?.car_color ?? null) : b.carColor === null || b.carColor === "" ? null : b.carColor;
  if (color !== null && !isHexColor(color)) throw new HttpError(400, "สีรถไม่ถูกต้อง");
  const province = b.plateProvince === undefined ? (cur?.plate_province ?? "") : str(b.plateProvince, 40);
  return { slot_id: slot as string | null, vehicle_type: type as string | null, car_color: color as string | null, plate_province: province, due_day: dueDay(b.dueDay, cur?.due_day ?? null) };
}

/** 1..31, or null for "use the default"; `undefined` keeps the current value. */
function dueDay(v: unknown, keep: number | null): number | null {
  if (v === undefined) return keep;
  if (v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 31) throw new HttpError(400, "วันนัดชำระต้องเป็นวันที่ 1–31");
  return v;
}

async function ensureCustomer(q: Queryable, name: string): Promise<number> {
  const found = await q.query("select id from customers where name = $1", [name]);
  if (found[0]) return found[0].id;
  const [created] = await q.query("insert into customers (name) values ($1) returning id", [name]);
  return created.id;
}

/** Insert one ledger row after the placement rules agree; shared by the ledger form and add-customer. */
/** monthly or yearly: what the form says, else yearly for the storage shed and monthly for everything else. */
const billingOf = (b: any, slotId: string | null | undefined) => (b?.billing === "yearly" || b?.billing === "monthly" ? (b.billing as string) : isStorageSlot(slotId) ? "yearly" : "monthly");

// a row is a car (or a bike) when it has a vehicle type or a real plate; otherwise it is someone renting a shed
const CAR_ROW = "(vehicle_type is not null or (plate <> '' and plate <> 'คลังเก็บของ'))";

/** A vehicle costs nothing when its customer is the owner, or when it stands in a Private zone (reserved, never rented). */
async function noRent(q: Queryable, customerId: number | null, zoneId: number | null): Promise<boolean> {
  const [r] = await q.query<{ v: boolean }>(
    "select (coalesce((select is_owner from customers where id = $1), false) or coalesce((select access = 'private' from zones where id = $2), false)) as v",
    [customerId, zoneId],
  );
  return Boolean(r?.v);
}

/** A row that stops being free (left the Private zone / owner) and has no price yet starts at the default price. */
async function syncZoneNoRent(q: Queryable, zoneId: number) {
  const settings = await getSettings(q);
  const y = bangkokToday().year;
  await q.query(
    `update ledger_rows r set is_owner = w.v, monthly_fee = case when not w.v and r.monthly_fee = 0 then $3 else r.monthly_fee end
       from (select r2.id, (coalesce(c.is_owner, false) or z.access = 'private') as v
               from ledger_rows r2 join zones z on z.id = r2.zone_id left join customers c on c.id = r2.customer_id
              where r2.zone_id = $1 and r2.year >= $2) w
      where w.id = r.id and r.is_owner is distinct from w.v`,
    [zoneId, y, settings.monthlyFeeDefault],
  );
}

/** The same plate twice in one year is almost always the same car added twice (which would start it with no payments). */
async function refuseDuplicatePlate(q: Queryable, year: number, plate: string, slotId: string | null) {
  const norm = plate.replace(/\s+/g, "").toUpperCase();
  await loadStorage(q);
  if (!norm || isStorageSlot(slotId)) return;
  const [dup] = await q.query(
    "select id, owner_name, slot_id from ledger_rows where year = $1 and replace(upper(plate), ' ', '') = $2 limit 1",
    [year, norm],
  );
  if (dup) throw new HttpError(409, `ทะเบียน ${plate} มีอยู่แล้วในสมุดรายรับปี ${year} (${dup.owner_name}${dup.slot_id ? ` · ${slotLabel(dup.slot_id)}` : " · ยังไม่ระบุช่อง"}) เลือกรถคันเดิมแทนการเพิ่มใหม่ เพื่อไม่ให้ยอดชำระเดิมหาย`);
}

async function insertRow(q: Queryable, f: { year: number; customerId: number; ownerName: string; plate: string; zoneId: number | null; kind: string; bulkCount: number; fee: number; startMonth: number; note: string; body: any }) {
  const lot = lotFields(f.body);
  await refuseDuplicatePlate(q, f.year, f.plate, lot.slot_id);
  const place = await resolvePlacement(q, {
    year: f.year, rowId: null, vehicleType: lot.vehicle_type, zoneId: f.zoneId, slotId: lot.slot_id,
    bay: f.body.bay == null ? null : Number(f.body.bay), startMonth: f.startMonth, endMonth: null, counts: true,
  });
  const owner = await noRent(q, f.customerId, place.zone_id); // an owner's vehicle, or one in a Private zone, never costs anything
  const [{ n }] = await q.query<{ n: number }>("select coalesce(max(sort_order), -1)::int + 1 as n from ledger_rows where year = $1", [f.year]);
  const [r] = await q.query(
    `insert into ledger_rows (year, sort_order, customer_id, owner_name, plate, zone_id, kind, bulk_count, monthly_fee, start_month, note,
       slot_id, vehicle_type, car_color, plate_province, due_day, bay, billing, is_owner)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,
    [f.year, n, f.customerId, f.ownerName, f.plate, place.zone_id, f.kind, f.bulkCount, owner ? 0 : f.fee, f.startMonth, f.note, place.slot_id, lot.vehicle_type, lot.car_color, lot.plate_province, lot.due_day, place.bay, billingOf(f.body, place.slot_id), owner],
  );
  return r;
}

route("POST", "/ledger/rows", EDIT as any, async (c) => {
  const b = await c.json();
  const y = year(b.year);
  const ownerName = str(b.ownerName, 120);
  if (!ownerName) throw new HttpError(400, "กรุณากรอกชื่อผู้เช่า");
  const settings = await getSettings(c.db);
  const kind = ["normal", "excluded", "bulk"].includes(b.kind) ? b.kind : "normal";
  const created = await c.db.tx(async (q) => {
    const customerId = b.customerId ? Number(b.customerId) : await ensureCustomer(q, ownerName);
    const r = await insertRow(q, {
      year: y, customerId, ownerName, plate: str(b.plate, 40), zoneId: b.zoneId ? Number(b.zoneId) : null, kind,
      bulkCount: Math.max(1, Number(b.bulkCount) || 1), fee: money(b.monthlyFee) ?? settings.monthlyFeeDefault,
      startMonth: b.startMonth == null ? 1 : month(b.startMonth), note: str(b.note, 300), body: b,
    });
    await audit(c, { action: "row.create", entity: "ledger_row", entityId: r.id, summary: `เพิ่มผู้เช่า ${ownerName}${r.plate ? ` (${r.plate})` : ""} ในปี ${y}${r.slot_id ? ` ช่อง ${r.slot_id}` : ""}`, after: pick(r) }, q);
    return r;
  });
  return { row: rowFromDb(created) };
});

route("PATCH", "/ledger/rows/:id", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const b = await c.json();
  const [cur] = await c.db.query("select * from ledger_rows where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบแถว");
  const n: Record<string, any> = {
    owner_name: b.ownerName === undefined ? cur.owner_name : str(b.ownerName, 120),
    plate: b.plate === undefined ? cur.plate : str(b.plate, 40),
    zone_id: b.zoneId === undefined ? cur.zone_id : b.zoneId ? Number(b.zoneId) : null,
    kind: b.kind === undefined ? cur.kind : ["normal", "excluded", "bulk"].includes(b.kind) ? b.kind : cur.kind,
    monthly_fee: cur.monthly_fee,
    fee_changes: cur.fee_changes ?? [],
    is_active: b.isActive === undefined ? cur.is_active : Boolean(b.isActive),
    needs_review: b.needsReview === undefined ? cur.needs_review : Boolean(b.needsReview),
    note: b.note === undefined ? cur.note : str(b.note, 300),
    start_month: b.startMonth === undefined ? cur.start_month : month(b.startMonth),
    end_month: b.endMonth === undefined ? cur.end_month : b.endMonth === null ? null : month(b.endMonth),
    paid_through_year: b.paidThroughYear === undefined ? cur.paid_through_year : intOrNull(b.paidThroughYear),
    paid_through_month: b.paidThroughMonth === undefined ? cur.paid_through_month : b.paidThroughMonth === null ? null : month(b.paidThroughMonth),
    sort_order: b.sortOrder === undefined ? cur.sort_order : Number(b.sortOrder) || 0,
    billing: b.billing === "yearly" || b.billing === "monthly" ? b.billing : cur.billing,
  };
  if (!n.owner_name) throw new HttpError(400, "กรุณากรอกชื่อผู้เช่า");
  // a new price starts from a month: earlier months keep the price they had
  const newFee = b.monthlyFee === undefined ? null : money(b.monthlyFee);
  let feeNote = "";
  let feeFrom = 1;
  if (newFee != null && newFee > 0) {
    const t = bangkokToday();
    feeFrom = b.feeFrom == null ? (cur.year === t.year ? t.month : 1) : month(b.feeFrom);
    const now = feeFor({ monthlyFee: cur.monthly_fee, feeChanges: cur.fee_changes ?? [] }, feeFrom);
    if (newFee !== now) {
      if (feeFrom <= 1) Object.assign(n, { monthly_fee: newFee, fee_changes: [] });
      else {
        const keep = (cur.fee_changes ?? []).filter((x: any) => x.month < feeFrom);
        const before = feeFor({ monthlyFee: cur.monthly_fee, feeChanges: keep }, feeFrom - 1);
        n.fee_changes = newFee === before ? keep : [...keep, { month: feeFrom, fee: newFee }];
      }
      feeNote = ` · ราคา ${now / 100} → ${newFee / 100} บาท ตั้งแต่เดือน ${THAI_MONTHS[feeFrom - 1]} (เดือนก่อนหน้าไม่เปลี่ยน)`;
    }
  }
  const lot = lotFields(b, cur);
  Object.assign(n, lot);
  await c.db.tx(async (q) => {
    // who the vehicle belongs to follows the name: fixing a typo (or picking another customer) moves the vehicle
    // to that customer, so the Customers page, the 3D card and the ledger always agree
    let customerId: number | null = cur.customer_id;
    if (b.customerId != null) {
      const [exists] = await q.query("select id from customers where id = $1", [Number(b.customerId)]);
      if (!exists) throw new HttpError(400, "ไม่พบลูกค้าที่เลือก");
      customerId = exists.id;
    } else if (n.owner_name !== cur.owner_name) customerId = await ensureCustomer(q, n.owner_name);
    if (b.customerId != null) {
      const [who] = await q.query("select name from customers where id = $1", [customerId]);
      n.owner_name = who.name;
    }
    // "swap": the slot is taken by another vehicle of the same customer -> that one steps out (and takes this vehicle's old slot)
    let swapped: Record<string, any> | null = null;
    if (b.swap === true && n.slot_id && n.slot_id !== cur.slot_id && cur.customer_id != null) {
      const [occ] = await q.query(
        "select * from ledger_rows where year = $1 and slot_id = $2 and id <> $3 and is_active and customer_id = $4",
        [cur.year, n.slot_id, id, cur.customer_id],
      );
      if (occ) {
        await q.query("update ledger_rows set slot_id = null, bay = null where id = $1", [occ.id]);
        swapped = occ;
      }
    }
    const place = await resolvePlacement(q, {
      year: cur.year, rowId: id, vehicleType: n.vehicle_type, zoneId: n.zone_id, slotId: n.slot_id,
      bay: b.bay !== undefined ? (b.bay === null ? null : Number(b.bay)) : n.slot_id === cur.slot_id && n.vehicle_type === cur.vehicle_type && n.zone_id === cur.zone_id ? cur.bay : null,
      startMonth: n.start_month, endMonth: n.end_month, counts: n.is_active, cur: cur as any,
    });
    n.slot_id = place.slot_id;
    n.zone_id = place.zone_id;
    n.bay = place.bay;
    // a row that stays where it is keeps its flag (a paying tenant who was already in a Private zone is not switched off behind their back)
    const ownerFlag = n.zone_id === cur.zone_id && customerId === cur.customer_id ? Boolean(cur.is_owner) : await noRent(q, customerId, n.zone_id);
    if (ownerFlag && !cur.is_owner) {
      const [paid] = await q.query("select 1 from payments where row_id = $1 and amount > 0 limit 1", [id]);
      if (paid) throw new HttpError(409, `${n.owner_name} มียอดชำระแล้ว แต่ช่อง/โซนนี้ไม่คิดเงิน (เจ้าของหรือ Private) ย้ายไปช่องอื่น หรือเอายอดชำระออกก่อน เพื่อไม่ให้ยอดรวมเปลี่ยนโดยไม่รู้ตัว`);
    }
    if (!ownerFlag && cur.is_owner && n.monthly_fee === 0) n.monthly_fee = (await getSettings(q)).monthlyFeeDefault;
    await q.query(
      `update ledger_rows set owner_name=$2, plate=$3, zone_id=$4, kind=$5, monthly_fee=$6, is_active=$7, needs_review=$8,
         note=$9, start_month=$10, end_month=$11, paid_through_year=$12, paid_through_month=$13, sort_order=$14,
         slot_id=$15, vehicle_type=$16, car_color=$17, plate_province=$18, due_day=$19, bay=$20, fee_changes=$21::jsonb, customer_id=$22, billing=$23, is_owner=$24 where id=$1`,
      [id, n.owner_name, n.plate, n.zone_id, n.kind, n.monthly_fee, n.is_active, n.needs_review, n.note, n.start_month, n.end_month, n.paid_through_year, n.paid_through_month, n.sort_order, n.slot_id, n.vehicle_type, n.car_color, n.plate_province, n.due_day, n.bay, JSON.stringify(n.fee_changes), customerId, n.billing, ownerFlag],
    );
    let swapNote = "";
    if (swapped) {
      let to: { slot_id: string | null; zone_id: number | null; bay: number | null } | null = null;
      if (cur.slot_id) {
        try {
          to = await resolvePlacement(q, { year: cur.year, rowId: swapped.id, vehicleType: swapped.vehicle_type, zoneId: null, slotId: cur.slot_id, bay: null, startMonth: swapped.start_month, endMonth: swapped.end_month, counts: true });
        } catch {
          to = null; // the old slot does not suit the other vehicle (e.g. a motorcycle zone): it simply stays without a slot
        }
      }
      await q.query("update ledger_rows set slot_id = $2, zone_id = coalesce($3, zone_id), bay = $4 where id = $1", [swapped.id, to?.slot_id ?? null, to?.zone_id ?? null, to?.bay ?? null]);
      swapNote = ` · ${swapped.plate || "รถอีกคัน"} ${to?.slot_id ? `ย้ายไปช่อง ${to.slot_id}` : "ออกจากช่องนี้ (ยังไม่ระบุช่อง)"}`;
    }
    // the customer made by a typo is removed when nothing else uses it and it holds no contact details
    let cleaned = "";
    if (cur.customer_id != null && customerId !== cur.customer_id) {
      const [left] = await q.query<{ n: number }>("select count(*)::int as n from ledger_rows where customer_id = $1", [cur.customer_id]);
      const [old] = await q.query("select name, phone, email, note from customers where id = $1", [cur.customer_id]);
      if (left.n === 0 && old && !old.phone && !old.email && !old.note) {
        await q.query("delete from customers where id = $1", [cur.customer_id]);
        cleaned = ` · ลบลูกค้า “${old.name}” ที่ไม่มีรถแล้ว`;
      }
    }
    // the same vehicle in later years continues at the new price (those years had their own copy of the old one)
    let later = 0;
    if (feeNote) {
      const same = cur.customer_id != null ? "customer_id = $2" : "owner_name = $2";
      const r = await q.query(
        `update ledger_rows set monthly_fee = $1, fee_changes = '[]'::jsonb where year > $4 and plate = $3 and ${same} returning id`,
        [feeFor({ monthlyFee: n.monthly_fee, feeChanges: n.fee_changes }, 12), cur.customer_id ?? cur.owner_name, cur.plate, cur.year],
      );
      later = r.length;
    }
    await audit(c, { action: "row.update", entity: "ledger_row", entityId: id, summary: `แก้ไขผู้เช่า ${n.owner_name}${n.plate ? ` (${n.plate})` : ""} ปี ${cur.year}${feeNote}${later ? ` · ปีถัดไป ${later} แถวใช้ราคาใหม่ต่อ` : ""}${cleaned}${swapNote}`, before: pick(cur), after: pick(n) }, q);
  });
  const [row] = await c.db.query("select * from ledger_rows where id = $1", [id]);
  return { row: rowFromDb(row) };
});

const pick = (r: any) => ({ ownerName: r.owner_name, plate: r.plate, plateProvince: r.plate_province, slotId: r.slot_id, bay: r.bay, vehicleType: r.vehicle_type, carColor: r.car_color, dueDay: r.due_day, zoneId: r.zone_id, kind: r.kind, billing: r.billing, monthlyFee: r.monthly_fee, feeChanges: r.fee_changes ?? [], isActive: r.is_active, needsReview: r.needs_review, note: r.note, startMonth: r.start_month, endMonth: r.end_month, paidThrough: r.paid_through_year ? `${r.paid_through_month}/${r.paid_through_year}` : null });
// take a vehicle off the 3D map only: the ledger row, its payments and the customer stay exactly as they were
route("POST", "/ledger/rows/:id/unplace", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from ledger_rows where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบแถว");
  if (!cur.slot_id) return { ok: true, auditId: null };
  const auditId = await c.db.tx(async (q) => {
    await q.query("update ledger_rows set slot_id = null, bay = null where id = $1", [id]);
    return audit(c, {
      action: "row.unplace",
      entity: "ledger_row",
      entityId: id,
      summary: `เอา ${cur.owner_name}${cur.plate ? ` (${cur.plate})` : ""} ออกจากผังที่จอด ${slotLabel(cur.slot_id)} (ข้อมูลในสมุดรายรับอยู่ครบ)`,
      before: { slotId: cur.slot_id, bay: cur.bay },
      after: { slotId: null, bay: null },
    }, q);
  });
  return { ok: true, auditId };
});

route("DELETE", "/ledger/rows/:id", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from ledger_rows where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบแถว");
  const pays = await c.db.query("select month, amount, method, account_id, updated_at, updated_by from payments where row_id = $1 order by month", [id]);
  let auditId: number | null = null;
  await c.db.tx(async (q) => {
    await q.query("delete from ledger_rows where id = $1", [id]);
    // the whole row and its payments go into the audit entry, so “restore” can bring it back exactly
    auditId = await audit(c, {
      action: "row.delete",
      entity: "ledger_row",
      entityId: id,
      summary: `ลบแถว ${cur.owner_name}${cur.plate ? ` (${cur.plate})` : ""} ปี ${cur.year}`,
      before: { ownerName: cur.owner_name, plate: cur.plate, slotId: cur.slot_id, snapshot: { row: cur, payments: pays } },
    }, q);
  });
  return { ok: true, restorable: true, auditId };
});

/**
 * A vehicle that was added again by mistake (so it starts with no payments) is folded into the one already in the ledger:
 * the map details (slot, type, colour, province) move to the original, which keeps all its payments, and the extra row
 * is deleted (a full copy stays in the history, so it can be undone).
 */
route("POST", "/ledger/rows/:id/merge", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const b = await c.json();
  const targetId = Number(b.targetId);
  if (!targetId || targetId === id) throw new HttpError(400, "เลือกรถคันเดิมที่จะรวมเข้าด้วย");
  const [src] = await c.db.query("select * from ledger_rows where id = $1", [id]);
  const [dst] = await c.db.query("select * from ledger_rows where id = $1", [targetId]);
  if (!src || !dst) throw new HttpError(404, "ไม่พบแถว");
  if (src.year !== dst.year) throw new HttpError(400, "รวมได้เฉพาะแถวของปีเดียวกัน");
  if (src.customer_id == null || src.customer_id !== dst.customer_id) throw new HttpError(400, "รวมได้เฉพาะรถของลูกค้าคนเดียวกัน");
  const pays = await c.db.query("select month, amount, method, account_id, updated_at, updated_by from payments where row_id = $1 order by month", [id]);
  if (pays.some((p) => (p.amount ?? 0) > 0)) throw new HttpError(409, "แถวนี้มียอดชำระแล้ว รวมเข้ากับคันอื่นไม่ได้ ลบหรือแก้ที่แถวนี้เอง");
  const result = await c.db.tx(async (q) => {
    // the extra row lets go of its slot first, so the original can take it
    await q.query("update ledger_rows set slot_id = null, bay = null where id = $1", [id]);
    const lot = {
      slot_id: src.slot_id ?? dst.slot_id,
      vehicle_type: src.vehicle_type ?? dst.vehicle_type,
      car_color: src.car_color ?? dst.car_color,
      plate_province: src.plate_province || dst.plate_province,
      zone_id: dst.zone_id ?? src.zone_id,
      due_day: dst.due_day ?? src.due_day,
      plate: dst.plate || src.plate,
    };
    const place = await resolvePlacement(q, {
      year: dst.year, rowId: dst.id, vehicleType: lot.vehicle_type, zoneId: lot.slot_id === dst.slot_id ? dst.zone_id : null, slotId: lot.slot_id,
      bay: src.slot_id ? src.bay : dst.bay, startMonth: dst.start_month, endMonth: dst.end_month, counts: dst.is_active, cur: dst as any,
    });
    await q.query(
      "update ledger_rows set slot_id=$2, zone_id=$3, bay=$4, vehicle_type=$5, car_color=$6, plate_province=$7, due_day=$8, plate=$9 where id=$1",
      [dst.id, place.slot_id, place.zone_id ?? lot.zone_id, place.bay, lot.vehicle_type, lot.car_color, lot.plate_province, lot.due_day, lot.plate],
    );
    await q.query("delete from ledger_rows where id = $1", [id]);
    const auditId = await audit(c, {
      action: "row.delete",
      entity: "ledger_row",
      entityId: id,
      summary: `รวมแถว ${src.owner_name}${src.plate ? ` (${src.plate})` : ""} เข้ากับ ${dst.owner_name}${lot.plate ? ` (${lot.plate})` : ""} ปี ${src.year}${place.slot_id ? ` · ช่อง ${place.slot_id}` : ""}`,
      before: { ownerName: src.owner_name, plate: src.plate, slotId: src.slot_id, snapshot: { row: src, payments: pays } },
    }, q);
    const [row] = await q.query("select * from ledger_rows where id = $1", [dst.id]);
    return { row, auditId };
  });
  return { row: rowFromDb(result.row), auditId: result.auditId };
});

route("POST", "/ledger/years/:year/copy-previous", EDIT as any, async (c) => {
  const y = year(Number(c.params.year));
  const [{ n }] = await c.db.query<{ n: number }>("select count(*)::int as n from ledger_rows where year = $1", [y]);
  if (n > 0) throw new HttpError(409, `ปี ${y} มีข้อมูลอยู่แล้ว`);
  const copied = await copyYear(c, c.db, y);
  if (!copied) throw new HttpError(404, `ไม่พบข้อมูลปี ${y - 1} ให้คัดลอก`);
  return { ok: true, copied };
});

// -------------------------------------------------------------- customers

route("POST", "/customers", EDIT as any, async (c) => {
  const b = await c.json();
  const name = str(b.name, 120);
  if (!name) throw new HttpError(400, "กรุณากรอกชื่อลูกค้า");
  const settings = await getSettings(c.db);
  const vehicles: any[] = Array.isArray(b.vehicles) ? b.vehicles.slice(0, 20) : [];
  const y = b.year == null ? bangkokToday().year : year(b.year);
  const out = await c.db.tx(async (q) => {
    const dup = await q.query("select id from customers where name = $1", [name]);
    if (dup.length) throw new HttpError(409, "มีลูกค้าชื่อนี้อยู่แล้ว");
    const [cu] = await q.query(
      "insert into customers (name, phone, email, note, is_owner) values ($1,$2,$3,$4,$5) returning *",
      [name, str(b.phone, 40), str(b.email, 200), str(b.note, 300), b.isOwner === true],
    );
    const rows = [];
    for (const v of vehicles) {
      const r = await insertRow(q, {
        year: y, customerId: cu.id, ownerName: name, plate: str(v.plate, 40), zoneId: v.zoneId ? Number(v.zoneId) : null, kind: "normal", bulkCount: 1,
        fee: b.isOwner === true ? 0 : (money(v.monthlyFee) ?? settings.monthlyFeeDefault), startMonth: v.startMonth ? month(v.startMonth) : 1, note: "", body: v,
      });
      rows.push(rowFromDb(r));
    }
    await audit(c, { action: "customer.create", entity: "customer", entityId: cu.id, summary: `เพิ่มลูกค้า ${name}${vehicles.length ? ` พร้อมรถ ${vehicles.length} คัน ในปี ${y}` : ""}`, after: { name, phone: cu.phone, email: cu.email, vehicles: vehicles.map((v) => v.plate) } }, q);
    return { cu, rows };
  });
  return { customer: { id: out.cu.id, name: out.cu.name, phone: out.cu.phone, email: out.cu.email, note: out.cu.note, isActive: true, isOwner: Boolean(out.cu.is_owner) }, rows: out.rows };
});

route("PATCH", "/customers/:id", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const b = await c.json();
  const [cur] = await c.db.query("select * from customers where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบลูกค้า");
  const n = {
    name: b.name === undefined ? cur.name : str(b.name, 120),
    phone: b.phone === undefined ? cur.phone : str(b.phone, 40),
    email: b.email === undefined ? cur.email : str(b.email, 200),
    note: b.note === undefined ? cur.note : str(b.note, 300),
    is_active: b.isActive === undefined ? cur.is_active : Boolean(b.isActive),
    is_owner: b.isOwner === undefined ? cur.is_owner : Boolean(b.isOwner),
  };
  if (!n.name) throw new HttpError(400, "กรุณากรอกชื่อลูกค้า");
  if (n.name !== cur.name) {
    const dup = await c.db.query("select id from customers where name = $1 and id <> $2", [n.name, id]);
    if (dup.length) throw new HttpError(409, "มีลูกค้าชื่อนี้อยู่แล้ว");
  }
  await c.db.tx(async (q) => {
    await q.query("update customers set name=$2, phone=$3, email=$4, note=$5, is_active=$6, is_owner=$7 where id=$1", [id, n.name, n.phone, n.email, n.note, n.is_active, n.is_owner]);
    // owner or not applies to every vehicle of the customer, in every year
    if (n.is_owner !== cur.is_owner) await q.query("update ledger_rows set is_owner = ($2 or coalesce((select access = 'private' from zones z where z.id = ledger_rows.zone_id), false)) where customer_id = $1", [id, n.is_owner]);
    if (cur.is_owner && !n.is_owner) {
      // no longer an owner: vehicles that had no price get the default price, so they start paying like everyone else
      const settings = await getSettings(q);
      await q.query("update ledger_rows set monthly_fee = $2 where customer_id = $1 and monthly_fee = 0", [id, settings.monthlyFeeDefault]);
    }
    // the name follows the customer into every year of the ledger
    if (n.name !== cur.name) await q.query("update ledger_rows set owner_name = $2 where customer_id = $1", [id, n.name]);
    if (n.is_active !== cur.is_active) {
      const [{ cy }] = await q.query<{ cy: number }>("select $1::int as cy", [bangkokToday().year]);
      if (n.is_active) {
        // coming back: every slot they held must still be free, otherwise the car would sit on top of someone else's
        for (const r of await q.query("select * from ledger_rows where customer_id = $1 and year >= $2 and not is_active and kind = 'normal' and slot_id is not null", [id, cy])) {
          await resolvePlacement(q, { year: r.year, rowId: r.id, vehicleType: r.vehicle_type, zoneId: r.zone_id, slotId: r.slot_id, bay: r.bay, startMonth: r.start_month, endMonth: r.end_month, counts: true, cur: r as any });
        }
      }
      // this year and later: ended rent frees the slot (the car leaves the 3D map); earlier years stay as history
      await q.query("update ledger_rows set is_active = $2 where customer_id = $1 and year >= $3", [id, n.is_active, cy]);
    }
    await audit(c, {
      action: "customer.update",
      entity: "customer",
      entityId: id,
      summary: `แก้ไขลูกค้า ${n.name}${n.name !== cur.name ? ` (เดิม ${cur.name})` : ""}${n.is_active !== cur.is_active ? (n.is_active ? " · กลับมาเช่า" : " · เลิกเช่า (นำรถออกจากผังที่จอด)") : ""}${n.is_owner !== cur.is_owner ? (n.is_owner ? " · ตั้งเป็นเจ้าของ (ไม่คิดเงิน)" : " · ยกเลิกสถานะเจ้าของ") : ""}`,
      before: { name: cur.name, phone: cur.phone, email: cur.email, note: cur.note, isActive: cur.is_active },
      after: { name: n.name, phone: n.phone, email: n.email, note: n.note, isActive: n.is_active },
    }, q);
  });
  return { ok: true };
});

route("DELETE", "/customers/:id", ADMIN as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from customers where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบลูกค้า");
  const [{ n }] = await c.db.query<{ n: number }>("select count(*)::int as n from ledger_rows where customer_id = $1", [id]);
  if (n > 0) throw new HttpError(409, "ลูกค้ามีรายการในสมุดรายรับ ลบไม่ได้ ให้ปิดการใช้งานแทน");
  await c.db.query("delete from customers where id = $1", [id]);
  await audit(c, { action: "customer.delete", entity: "customer", entityId: id, summary: `ลบลูกค้า ${cur.name}`, before: { name: cur.name, snapshot: { customer: cur } } });
  return { ok: true };
});

// ----------------------------------------------------------- payment due days

/** Set one due day on every vehicle of a customer (the "sync" button); null = back to the default. */
route("POST", "/customers/:id/sync-due-day", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const b = await c.json();
  const [cu] = await c.db.query("select name from customers where id = $1", [id]);
  if (!cu) throw new HttpError(404, "ไม่พบลูกค้า");
  const d = dueDay(b.dueDay, null);
  const y = b.year == null ? bangkokToday().year : year(b.year);
  const changed = await c.db.tx(async (q) => {
    const r = await q.query("update ledger_rows set due_day = $1 where customer_id = $2 and year = $3 and (due_day is distinct from $1) returning id", [d, id, y]);
    await audit(c, { action: "customer.sync_due_day", entity: "customer", entityId: id, summary: `ตั้งวันนัดชำระของ ${cu.name} เป็น ${d ? `วันที่ ${d}` : "ค่าเริ่มต้น"} ทุกคัน (${r.length} คัน)`, after: { dueDay: d, year: y } }, q);
    return r.length;
  });
  return { ok: true, changed };
});

/** Every vehicle of the year follows the default due day again. */
route("POST", "/ledger/due-day/reset", ADMIN as any, async (c) => {
  const b = await c.json();
  const y = b.year == null ? bangkokToday().year : year(b.year);
  const changed = await c.db.tx(async (q) => {
    const r = await q.query("update ledger_rows set due_day = null where year = $1 and due_day is not null returning id", [y]);
    await audit(c, { action: "ledger.reset_due_day", entity: "year", entityId: y, summary: `ให้รถทุกคันปี ${y} ใช้วันนัดชำระเริ่มต้น (${r.length} คัน)` }, q);
    return r.length;
  });
  return { ok: true, changed };
});

// ------------------------------------------------------------------ zones

const zoneBody = (b: any, cur?: Record<string, any>) => {
  const slots: unknown = b.slotIds === undefined ? (cur?.slot_ids ?? []) : b.slotIds;
  if (!Array.isArray(slots) || slots.some((x) => !isSlotId(x))) throw new HttpError(400, "รายการช่องจอดไม่ถูกต้อง");
  const kind = (b.kind === undefined ? (cur?.kind ?? "parking") : b.kind) as string;
  if (kind !== "parking" && kind !== "storage") throw new HttpError(400, "ชนิดโซนไม่ถูกต้อง");
  // a storage zone has no price per slot, no motorcycles and is never Private: it is just where the sheds are
  const moto = kind === "storage" ? 0 : b.motoCapacity === undefined ? (cur?.moto_capacity ?? 0) : Math.max(0, Math.round(Number(b.motoCapacity)) || 0);
  return {
    kind,
    name: str(b.name ?? cur?.name ?? "", 80),
    description: str(b.description ?? cur?.description ?? "", 200),
    capacity: b.capacity === undefined ? (cur?.capacity ?? null) : b.capacity == null || b.capacity === "" ? null : Math.max(0, Math.round(Number(b.capacity)) || 0),
    defaultFee: b.defaultFee === undefined ? (cur?.default_fee ?? null) : money(b.defaultFee),
    isActive: b.isActive === undefined ? (cur?.is_active ?? true) : Boolean(b.isActive),
    access: (kind === "storage" ? "public" : b.access === undefined ? (cur?.access ?? "public") : b.access) as string,
    slotIds: [...new Set(slots as string[])],
    motoCapacity: moto,
  };
};

/** Rules a zone must keep: unique slots across zones, motorcycle quota that fits, nobody evicted. */
async function checkZone(q: Queryable, id: number | null, z: ReturnType<typeof zoneBody>, cur?: Record<string, any>): Promise<{ id: number; name: string; slots: string[]; rest: string[] }[]> {
  if (!z.name) throw new HttpError(400, "กรุณากรอกชื่อโซน");
  const today = bangkokToday().year;
  // which slots turn into sheds / stop being sheds with this change
  const wasStorage: string[] = cur?.kind === "storage" ? (cur.slot_ids as string[]) : [];
  const nowStorage: string[] = z.kind === "storage" ? z.slotIds : [];
  const becoming = nowStorage.filter((x) => !wasStorage.includes(x));
  if (becoming.length) {
    const [v] = await q.query(`select owner_name, plate, slot_id from ledger_rows where slot_id = any($1::text[]) and year >= $2 and is_active and ${CAR_ROW} limit 1`, [becoming, today]);
    if (v) throw new HttpError(409, `${slotLabel(v.slot_id)} มี ${v.owner_name}${v.plate ? ` (${v.plate})` : ""} จอดอยู่ เปลี่ยนเป็นคลังเก็บของไม่ได้ ย้ายรถไปช่องอื่นก่อน`);
  }
  const leaving = wasStorage.filter((x) => !nowStorage.includes(x));
  if (leaving.includes(STORAGE_SLOT)) throw new HttpError(409, "คลังเก็บของหลังเดิม (ในโมเดลบ้าน) เปลี่ยนเป็นที่จอดรถไม่ได้");
  if (leaving.length) {
    const [v] = await q.query(`select owner_name, slot_id from ledger_rows where slot_id = any($1::text[]) and year >= $2 and is_active and not ${CAR_ROW} limit 1`, [leaving, today]);
    if (v) throw new HttpError(409, `${slotLabel(v.slot_id)} มี ${v.owner_name} เช่าคลังอยู่ เปลี่ยนเป็นที่จอดรถไม่ได้ ให้ผู้เช่าเลิกเช่าหรือย้ายก่อน`);
  }
  if (z.kind === "parking" && z.slotIds.includes(STORAGE_SLOT)) throw new HttpError(409, "คลังเก็บของหลังเดิม (ในโมเดลบ้าน) ต้องอยู่ในโซนคลังเก็บของ");
  // a Private zone is not rented: whoever pays rent now cannot be moved in without their payments disappearing from the totals
  if (z.access === "private") {
    const [v] = await q.query(
      `select owner_name, plate from ledger_rows r
        where (r.zone_id = $1 or r.slot_id = any($2::text[])) and r.year >= $3 and not r.is_owner
          and exists (select 1 from payments p where p.row_id = r.id and p.amount > 0) limit 1`,
      [id ?? 0, z.slotIds, today],
    );
    if (v) throw new HttpError(409, `${v.owner_name}${v.plate ? ` (${v.plate})` : ""} มียอดชำระค่าเช่าแล้ว ย้ายเข้าโซน Private (ไม่คิดเงิน) ไม่ได้ ย้ายรถไปช่องอื่นก่อน`);
  }
  if (z.access !== "public" && z.access !== "private") throw new HttpError(400, "ชนิดโซนไม่ถูกต้อง");
  // a slot picked here that sits in another zone is moved over (the other zone loses it)
  const others = await q.query("select id, name, slot_ids, moto_capacity, kind from zones where id <> $1", [id ?? 0]);
  const takes: { id: number; name: string; slots: string[]; rest: string[]; motoCapacity: number }[] = [];
  for (const o of others) {
    const slots = (o.slot_ids as string[]).filter((s) => z.slotIds.includes(s));
    if (!slots.length) continue;
    const rest = (o.slot_ids as string[]).filter((s) => !slots.includes(s));
    if (o.moto_capacity > 0) {
      if (o.moto_capacity > baysIn(rest)) throw new HttpError(409, `โซน “${o.name}” เป็นโซนมอเตอร์ไซค์ ถ้าเอา ${slots.map(slotLabel).join(", ")} ออกจะจอดครบ ${o.moto_capacity} คันไม่ได้ ลดจำนวนที่โซนนั้นก่อน`);
      const used = await q.query("select owner_name from ledger_rows where zone_id = $1 and slot_id = any($2::text[]) and is_active limit 1", [o.id, slots]);
      if (used.length) throw new HttpError(409, `${used[0].owner_name} จอดมอเตอร์ไซค์อยู่ในช่องที่จะย้าย`);
    }
    if (o.kind === "storage" && z.kind !== "storage") {
      if (slots.includes(STORAGE_SLOT)) throw new HttpError(409, "คลังเก็บของหลังเดิม (ในโมเดลบ้าน) เปลี่ยนเป็นที่จอดรถไม่ได้");
      const [v] = await q.query(`select owner_name, slot_id from ledger_rows where slot_id = any($1::text[]) and year >= $2 and is_active and not ${CAR_ROW} limit 1`, [slots, today]);
      if (v) throw new HttpError(409, `${slotLabel(v.slot_id)} มี ${v.owner_name} เช่าคลังอยู่ เปลี่ยนเป็นที่จอดรถไม่ได้`);
    }
    if (o.kind !== "storage" && z.kind === "storage") {
      const [v] = await q.query(`select owner_name, plate, slot_id from ledger_rows where slot_id = any($1::text[]) and year >= $2 and is_active and ${CAR_ROW} limit 1`, [slots, today]);
      if (v) throw new HttpError(409, `${slotLabel(v.slot_id)} มี ${v.owner_name}${v.plate ? ` (${v.plate})` : ""} จอดอยู่ เปลี่ยนเป็นคลังเก็บของไม่ได้`);
    }
    takes.push({ id: o.id, name: o.name, slots, rest, motoCapacity: o.moto_capacity });
  }
    if (z.motoCapacity > 0) {
    if (!z.slotIds.length) throw new HttpError(400, "โซนมอเตอร์ไซค์ต้องเลือกช่องจอดอย่างน้อย 1 ช่อง");
    const room = baysIn(z.slotIds);
    if (z.motoCapacity > room) throw new HttpError(400, `ช่องที่เลือกจอดมอเตอร์ไซค์ได้สูงสุด ${room} คัน (ห่างกันคันละ 1 เมตร) ลดจำนวนหรือเพิ่มช่อง`);
  }
  if (id != null) {
    const held = await q.query(
      "select id, owner_name, plate, slot_id, vehicle_type from ledger_rows where zone_id = $1 and year = $2 and is_active",
      [id, today],
    );
    const motos = held.filter((r) => isMotorcycle(r.vehicle_type));
    if (z.motoCapacity > 0 && held.length > motos.length) throw new HttpError(409, "โซนนี้มีรถที่ไม่ใช่มอเตอร์ไซค์อยู่ จึงตั้งเป็นโซนมอเตอร์ไซค์ไม่ได้");
    if (z.motoCapacity === 0 && motos.length) throw new HttpError(409, `โซนนี้มีมอเตอร์ไซค์ ${motos.length} คัน ต้องมีจำนวนจอดมอเตอร์ไซค์อย่างน้อยเท่านี้`);
    if (z.motoCapacity > 0 && z.motoCapacity < motos.length) throw new HttpError(409, `มีมอเตอร์ไซค์จอดอยู่ ${motos.length} คัน ลดจำนวนต่ำกว่านี้ไม่ได้`);
    for (const r of held) {
      if (r.slot_id && !z.slotIds.includes(r.slot_id)) throw new HttpError(409, `เอา ${slotLabel(r.slot_id)} ออกไม่ได้ เพราะ ${r.owner_name}${r.plate ? ` (${r.plate})` : ""} ใช้อยู่`);
    }
  }
  return takes;
}

async function applyTakes(q: Queryable, takes: { id: number; rest: string[] }[]) {
  for (const t of takes) await q.query("update zones set slot_ids = $2::jsonb where id = $1", [t.id, JSON.stringify(t.rest)]);
}
const movedNote = (takes: { name: string; slots: string[] }[]) => (takes.length ? ` · ย้าย ${takes.map((t) => `${t.slots.map(slotLabel).join(", ")} จากโซน ${t.name}`).join("; ")}` : "");

const zonePick = (z: ReturnType<typeof zoneBody>) => ({ name: z.name, kind: z.kind, access: z.access, isActive: z.isActive, slotIds: z.slotIds, motoCapacity: z.motoCapacity, capacity: z.capacity, defaultFee: z.defaultFee });

route("POST", "/zones", EDIT as any, async (c) => {
  const z = zoneBody(await c.json());
  const r = await c.db.tx(async (q) => {
    const takes = await checkZone(q, null, z);
    await applyTakes(q, takes);
    const [{ n }] = await q.query<{ n: number }>("select coalesce(max(sort_order), -1)::int + 1 as n from zones");
    const [row] = await q.query(
      "insert into zones (name, description, capacity, default_fee, is_active, sort_order, access, slot_ids, moto_capacity, kind) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) returning id",
      [z.name, z.description, z.capacity, z.defaultFee, z.isActive, n, z.access, JSON.stringify(z.slotIds), z.motoCapacity, z.kind],
    );
    if (z.slotIds.length) await q.query("update ledger_rows set zone_id = $1 where slot_id = any($2::text[]) and (zone_id is distinct from $1)", [row.id, z.slotIds]);
    await syncZoneNoRent(q, row.id);
    await audit(c, { action: "zone.create", entity: "zone", entityId: row.id, summary: `เพิ่มโซน ${z.name} (${z.slotIds.length} ช่อง)${movedNote(takes)}`, after: zonePick(z) }, q);
    return row;
  });
  await loadStorage(c.db);
  return { id: r.id };
});

route("PATCH", "/zones/:id", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from zones where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบโซน");
  const z = zoneBody(await c.json(), cur);
  await c.db.tx(async (q) => {
    const takes = await checkZone(q, id, z, cur);
    await applyTakes(q, takes);
    await q.query(
      "update zones set name=$2, description=$3, capacity=$4, default_fee=$5, is_active=$6, access=$7, slot_ids=$8::jsonb, moto_capacity=$9, kind=$10 where id=$1",
      [id, z.name, z.description, z.capacity, z.defaultFee, z.isActive, z.access, JSON.stringify(z.slotIds), z.motoCapacity, z.kind],
    );
    // rows already sitting in a slot that now belongs to this zone follow it (the zone name shows everywhere)
    if (z.slotIds.length) await q.query("update ledger_rows set zone_id = $1 where slot_id = any($2::text[]) and (zone_id is distinct from $1)", [id, z.slotIds]);
    // Private / not Private: the rent of the vehicles in this zone follows
    await syncZoneNoRent(q, id);
    await audit(c, {
      action: "zone.update",
      entity: "zone",
      entityId: id,
      summary: `แก้ไขโซน ${z.name}${z.name !== cur.name ? ` (เดิม ${cur.name})` : ""}${cur.is_active !== z.isActive ? (z.isActive ? " · เปิดใช้งาน" : " · ปิดใช้งาน") : ""}${movedNote(takes)}`,
      before: { name: cur.name, kind: cur.kind, access: cur.access, isActive: cur.is_active, slotIds: cur.slot_ids, motoCapacity: cur.moto_capacity, capacity: cur.capacity, defaultFee: cur.default_fee },
      after: zonePick(z),
    }, q);
  });
  await loadStorage(c.db);
  return { ok: true };
});

route("DELETE", "/zones/:id", EDIT as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from zones where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบโซน");
  const held = await c.db.query("select id from ledger_rows where zone_id = $1", [id]);
  await c.db.tx(async (q) => {
    await q.query("delete from zones where id = $1", [id]);
    await audit(c, { action: "zone.delete", entity: "zone", entityId: id, summary: `ลบโซน ${cur.name} (${held.length} แถวถูกตั้งเป็น “ไม่ระบุโซน”)`, before: { name: cur.name, snapshot: { zone: cur, rowIds: held.map((r) => r.id) } } }, q);
  });
  await loadStorage(c.db);
  return { ok: true, detached: held.length, restorable: true };
});

// ---------------------------------------------------------- slot: parking or storage

/** Every slot can be a parking space or a storage shed. A shed lives in a zone of kind "storage" (made on first use). */
route("PUT", "/slots/:id/kind", EDIT as any, async (c) => {
  const slot = c.params.id;
  if (!isSlotId(slot)) throw new HttpError(400, "ช่องจอดไม่ถูกต้อง");
  const b = await c.json();
  const kind = b.kind === "storage" ? "storage" : b.kind === "parking" ? "parking" : null;
  if (!kind) throw new HttpError(400, "เลือกว่าเป็นที่จอดรถหรือคลังเก็บของ");
  const today = bangkokToday().year;
  const out = await c.db.tx(async (q) => {
    const zones = await q.query("select * from zones order by sort_order, id");
    const holder = zones.find((z) => (z.slot_ids as string[]).includes(slot));
    const isShed = holder?.kind === "storage" || slot === STORAGE_SLOT;
    if (kind === "storage" && holder && holder.moto_capacity > 0) throw new HttpError(409, `${slotLabel(slot)} อยู่ในโซนมอเตอร์ไซค์ “${holder.name}” เปลี่ยนเป็นคลังเก็บของไม่ได้`);
    if (kind === "storage") {
      if (isShed) return { changed: false, zone: holder?.name ?? "คลังเก็บของ" };
      const [v] = await q.query(`select owner_name, plate from ledger_rows where slot_id = $1 and year >= $2 and is_active and ${CAR_ROW} limit 1`, [slot, today]);
      if (v) throw new HttpError(409, `${slotLabel(slot)} มี ${v.owner_name}${v.plate ? ` (${v.plate})` : ""} จอดอยู่ ย้ายรถไปช่องอื่นก่อนจึงเปลี่ยนเป็นคลังเก็บของได้`);
      let target: Record<string, any> = zones.find((z) => z.kind === "storage" && z.is_active) as Record<string, any>;
      if (!target) {
        const [n] = await q.query<{ n: number }>("select coalesce(max(sort_order), -1)::int + 1 as n from zones");
        target = (await q.query(
          "insert into zones (name, description, sort_order, kind, slot_ids) values ('คลังเก็บของ', 'ช่องที่เป็นคลังเก็บของ เช่ากันปีละครั้ง', $1, 'storage', $2::jsonb) returning *",
          [n.n, JSON.stringify(zones.some((z) => (z.slot_ids as string[]).includes(STORAGE_SLOT)) ? [] : [STORAGE_SLOT])], // the shed built into the model joins it too
        ))[0];
      }
      if (holder) await q.query("update zones set slot_ids = $2::jsonb where id = $1", [holder.id, JSON.stringify((holder.slot_ids as string[]).filter((x) => x !== slot))]);
      await q.query("update zones set slot_ids = $2::jsonb where id = $1", [target.id, JSON.stringify([...(target.slot_ids as string[]), slot])]);
      await q.query("update ledger_rows set zone_id = $1 where slot_id = $2 and year >= $3", [target.id, slot, today]);
      await audit(c, { action: "slot.kind", entity: "slot", entityId: slot, summary: `ตั้ง ${`ช่อง ${slot}`} เป็นคลังเก็บของ (โซน ${target.name}${holder ? `, ย้ายจากโซน ${holder.name}` : ""})`, before: { kind: "parking", zone: holder?.name ?? null }, after: { kind: "storage", zone: target.name } }, q);
      return { changed: true, zone: target.name as string };
    }
    if (slot === STORAGE_SLOT) throw new HttpError(409, "คลังเก็บของหลังเดิม (ในโมเดลบ้าน) เปลี่ยนเป็นที่จอดรถไม่ได้");
    if (!isShed) return { changed: false, zone: holder?.name ?? null };
    const [v] = await q.query(`select owner_name from ledger_rows where slot_id = $1 and year >= $2 and is_active and not ${CAR_ROW} limit 1`, [slot, today]);
    if (v) throw new HttpError(409, `${v.owner_name} เช่าคลังนี้อยู่ ให้เลิกเช่าหรือย้ายก่อนจึงเปลี่ยนเป็นที่จอดรถได้`);
    await q.query("update zones set slot_ids = $2::jsonb where id = $1", [holder!.id, JSON.stringify((holder!.slot_ids as string[]).filter((x) => x !== slot))]);
    await q.query("update ledger_rows set zone_id = null where slot_id = $1 and year >= $2", [slot, today]);
    await audit(c, { action: "slot.kind", entity: "slot", entityId: slot, summary: `ตั้ง ช่อง ${slot} กลับเป็นที่จอดรถ (ออกจากโซน ${holder!.name})`, before: { kind: "storage", zone: holder!.name }, after: { kind: "parking", zone: null } }, q);
    return { changed: true, zone: null };
  });
  await loadStorage(c.db);
  return out;
});

// ------------------------------------------------------- restore deleted things

/** Bring back something that was deleted, from the snapshot the delete left in the audit log. */
route("POST", "/audit/:id/restore", EDIT as any, async (c) => {
  const auditId = Number(c.params.id);
  const [a] = await c.db.query("select id, action, entity_id, before, user_id, at from audit_log where id = $1", [auditId]);
  // admins restore anything; an editor can take back their own delete of a row for 30 minutes (the "undo" button)
  if (a && c.user!.role !== "admin" && !(a.action === "row.delete" && a.user_id === c.user!.id && Date.now() - new Date(a.at).getTime() < 30 * 60_000)) throw new HttpError(403, "กู้คืนได้เฉพาะผู้ดูแล หรือรายการที่คุณเพิ่งลบเองภายใน 30 นาที");
  const snap = a?.before?.snapshot;
  if (!a || !snap || !["row.delete", "zone.delete", "customer.delete"].includes(a.action)) throw new HttpError(404, "รายการนี้กู้คืนไม่ได้ (ไม่มีข้อมูลเดิมเก็บไว้)");
  let note = "";
  let summary = "";
  await c.db.tx(async (q) => {
    if (a.action === "customer.delete") {
      const k = snap.customer;
      if ((await q.query("select 1 from customers where id = $1", [k.id])).length) throw new HttpError(409, "ลูกค้านี้ถูกกู้คืนไปแล้ว");
      if ((await q.query("select 1 from customers where name = $1", [k.name])).length) throw new HttpError(409, `มีลูกค้าชื่อ “${k.name}” อยู่แล้ว กู้คืนซ้ำไม่ได้`);
      await q.query(
        "insert into customers (id, name, phone, email, note, is_active, created_at, is_owner) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [k.id, k.name, k.phone ?? "", k.email ?? "", k.note ?? "", k.is_active ?? true, k.created_at ?? new Date().toISOString(), Boolean(k.is_owner)],
      );
      summary = `กู้คืนลูกค้า ${k.name}`;
    } else if (a.action === "zone.delete") {
      const z = snap.zone;
      if ((await q.query("select 1 from zones where id = $1", [z.id])).length) throw new HttpError(409, "โซนนี้ถูกกู้คืนไปแล้ว");
      if ((await q.query("select 1 from zones where name = $1", [z.name])).length) throw new HttpError(409, `มีโซนชื่อ “${z.name}” อยู่แล้ว`);
      const taken = new Set((await q.query("select slot_ids from zones")).flatMap((r) => r.slot_ids as string[]));
      const keep = (z.slot_ids as string[]).filter((s) => !taken.has(s));
      const lost = (z.slot_ids as string[]).filter((s) => taken.has(s));
      const motoCap = Math.min(z.moto_capacity ?? 0, baysIn(keep));
      await q.query(
        "insert into zones (id, name, description, capacity, default_fee, is_active, sort_order, access, slot_ids, moto_capacity, kind) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)",
        [z.id, z.name, z.description ?? "", z.capacity, z.default_fee, z.is_active, z.sort_order ?? 0, z.access ?? "public", JSON.stringify(keep), motoCap, z.kind ?? "parking"],
      );
      const ids: number[] = snap.rowIds ?? [];
      if (ids.length) await q.query("update ledger_rows set zone_id = $1 where id = any($2::int[]) and zone_id is null", [z.id, ids]);
      if (lost.length) note = `ช่อง ${lost.map(slotLabel).join(", ")} ถูกใช้ในโซนอื่นแล้ว จึงไม่ได้ใส่กลับ`;
      summary = `กู้คืนโซน ${z.name}`;
    } else {
      const r = snap.row;
      if ((await q.query("select 1 from ledger_rows where id = $1", [r.id])).length) throw new HttpError(409, "แถวนี้ถูกกู้คืนไปแล้ว");
      const zoneOk = r.zone_id != null && (await q.query("select 1 from zones where id = $1", [r.zone_id])).length > 0;
      const custOk = r.customer_id != null && (await q.query("select 1 from customers where id = $1", [r.customer_id])).length > 0;
      let place = { slot_id: r.slot_id as string | null, zone_id: (zoneOk ? r.zone_id : null) as number | null, bay: r.bay as number | null };
      try {
        place = await resolvePlacement(q, {
          year: r.year, rowId: r.id, vehicleType: r.vehicle_type, zoneId: place.zone_id, slotId: r.slot_id, bay: r.bay,
          startMonth: r.start_month, endMonth: r.end_month, counts: r.is_active,
        });
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        place = { slot_id: null, zone_id: place.zone_id, bay: null };
        note = `${e.message} จึงกู้คืนโดยยังไม่ระบุช่อง เลือกช่องใหม่ได้ที่แถวนี้`;
      }
      await q.query(
        `insert into ledger_rows (id, year, sort_order, customer_id, owner_name, plate, zone_id, kind, bulk_count, source_row, monthly_fee,
           paid_through_year, paid_through_month, start_month, end_month, note, needs_review, is_active, created_at,
           slot_id, vehicle_type, car_color, plate_province, due_day, bay, fee_changes, billing, is_owner)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28)`,
        [r.id, r.year, r.sort_order, custOk ? r.customer_id : null, r.owner_name, r.plate, place.zone_id, r.kind, r.bulk_count, r.source_row, r.monthly_fee,
          r.paid_through_year, r.paid_through_month, r.start_month, r.end_month, r.note, r.needs_review, r.is_active, r.created_at,
          place.slot_id, r.vehicle_type, r.car_color, r.plate_province, r.due_day, place.bay, JSON.stringify(r.fee_changes ?? []), r.billing ?? "monthly", Boolean(r.is_owner)],
      );
      for (const p of snap.payments ?? []) {
        await q.query("insert into payments (row_id, month, amount, method, account_id, updated_at, updated_by) values ($1,$2,$3,$4, (select id from bank_accounts where id = $5), $6, (select id from users where id = $7))", [r.id, p.month, p.amount, p.method ?? "cash", p.account_id ?? null, p.updated_at, p.updated_by]);
      }
      summary = `กู้คืนแถว ${r.owner_name}${r.plate ? ` (${r.plate})` : ""} ปี ${r.year} พร้อมยอดชำระ ${(snap.payments ?? []).length} เดือน`;
    }
    await audit(c, { action: a.action.replace(".delete", ".restore"), entity: a.action === "row.delete" ? "ledger_row" : a.action.split(".")[0], entityId: a.entity_id, summary: note ? `${summary} (${note})` : summary, after: { fromAudit: auditId } }, q);
  });
  return { ok: true, note, summary };
});

// --------------------------------------------------------------- accounts

route("GET", "/accounts/:id/reveal", EDIT as any, async (c) => {
  const [r] = await c.db.query("select number_enc, holder, bank from bank_accounts where id = $1", [Number(c.params.id)]);
  if (!r) throw new HttpError(404, "ไม่พบบัญชี");
  await audit(c, { action: "account.reveal", entity: "bank_account", entityId: c.params.id, summary: `ดูเลขบัญชีเต็ม (${r.bank} ${r.holder})` });
  return { number: decrypt(r.number_enc) };
});

route("POST", "/accounts", ADMIN as any, async (c) => {
  const b = await c.json();
  const number = str(b.number, 40);
  if (!number) throw new HttpError(400, "กรุณากรอกเลขบัญชี");
  const [r] = await c.db.query(
    "insert into bank_accounts (bank, number_enc, holder, label, shows, sort_order) values ($1,$2,$3,$4,$5, (select coalesce(max(sort_order),-1)+1 from bank_accounts)) returning id",
    [str(b.bank, 40) || "TTB", encrypt(number), str(b.holder, 120), str(b.label, 80), b.shows === "collect" ? "collect" : "net"],
  );
  await audit(c, { action: "account.create", entity: "bank_account", entityId: r.id, summary: `เพิ่มบัญชีรับเงิน ${str(b.bank, 40) || "TTB"} (${str(b.holder, 120)})` });
  return { id: r.id };
});

route("PATCH", "/accounts/:id", ADMIN as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select * from bank_accounts where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบบัญชี");
  const b = await c.json();
  const number = b.number === undefined || b.number === "" ? null : str(b.number, 40);
  await c.db.query(
    "update bank_accounts set bank=$2, number_enc=$3, holder=$4, label=$5, shows=$6 where id=$1",
    [id, b.bank === undefined ? cur.bank : str(b.bank, 40), number ? encrypt(number) : cur.number_enc, b.holder === undefined ? cur.holder : str(b.holder, 120), b.label === undefined ? cur.label : str(b.label, 80), b.shows === "collect" ? "collect" : b.shows === "net" ? "net" : cur.shows],
  );
  await audit(c, { action: "account.update", entity: "bank_account", entityId: id, summary: `แก้ไขบัญชีรับเงิน ${cur.bank} (${cur.holder})${number ? " — เปลี่ยนเลขบัญชี" : ""}` });
  return { ok: true };
});

route("DELETE", "/accounts/:id", ADMIN as any, async (c) => {
  const id = Number(c.params.id);
  const [cur] = await c.db.query("select bank, holder from bank_accounts where id = $1", [id]);
  if (!cur) throw new HttpError(404, "ไม่พบบัญชี");
  await c.db.query("delete from bank_accounts where id = $1", [id]);
  await audit(c, { action: "account.delete", entity: "bank_account", entityId: id, summary: `ลบบัญชีรับเงิน ${cur.bank} (${cur.holder})` });
  return { ok: true };
});

// --------------------------------------------------------------- settings

route("PUT", "/settings", ADMIN as any, async (c) => {
  const b = await c.json();
  const before = await getSettings(c.db);
  const after = { ...before };
  if (b.monthlyFeeDefault !== undefined) {
    const fee = money(b.monthlyFeeDefault);
    if (fee == null || fee <= 0) throw new HttpError(400, "ค่าเช่าเริ่มต้นต้องมากกว่า 0");
    after.monthlyFeeDefault = fee;
    await setSetting(c.db, "monthlyFeeDefault", fee);
  }
  if (b.reminders !== undefined) {
    after.reminders = sanitizeReminders(b.reminders);
    await setSetting(c.db, "reminders", after.reminders);
  }
  if (b.menu !== undefined) {
    after.menu = { hidden: sanitizeMenu(b.menu?.hidden) };
    await setSetting(c.db, "menu", after.menu);
  }
  await audit(c, { action: "settings.update", entity: "settings", summary: "แก้ไขการตั้งค่าระบบ/การแจ้งเตือน", before, after });
  return { settings: after };
});

// -------------------------------------------------------- formula overrides

route("POST", "/overrides/mode", ADMIN as any, async (c) => {
  const b = await c.json();
  const mode = b.mode === "standard" ? "standard" : b.mode === "legacy" ? "legacy" : null;
  if (!mode) throw new HttpError(400, "โหมดสูตรไม่ถูกต้อง");
  const ids: number[] | null = Array.isArray(b.ids) ? b.ids.map(Number) : null;
  const rows = await c.db.query(
    `select id, year, month, field, mode from calc_overrides where ($1::int[] is null or id = any($1::int[]))`,
    [ids],
  );
  const toChange = rows.filter((r) => r.mode !== mode);
  if (toChange.length) {
    await c.db.query("update calc_overrides set mode = $2 where id = any($1::int[])", [toChange.map((r) => r.id), mode]);
  }
  await audit(c, {
    action: "formula.mode",
    entity: "calc_override",
    entityId: ids ? ids.join(",") : "all",
    summary: `เปลี่ยนสูตร ${toChange.length} จุด เป็น “${mode === "standard" ? "มาตรฐาน" : "ตามไฟล์เดิม"}”`,
    before: toChange.map((r) => ({ id: r.id, year: r.year, month: r.month, field: r.field, mode: r.mode })),
    after: { mode },
  });
  return { ok: true, changed: toChange.length };
});

// ----------------------------------------------------------------- savings

route("PUT", "/savings/days", EDIT as any, async (c) => {
  const b = await c.json();
  const changes: any[] = Array.isArray(b.changes) ? b.changes : [];
  if (changes.length > 400) throw new HttpError(400, "แก้ไขพร้อมกันได้ไม่เกิน 400 ช่อง");
  let changed = 0;
  await c.db.tx(async (q) => {
    for (const x of changes) {
      const y = year(x.year);
      const m = month(x.month);
      const d = Number(x.day);
      if (!Number.isInteger(d) || d < 1 || d > 31) throw new HttpError(400, "วันที่ไม่ถูกต้อง");
      const amount = money(x.amount);
      const [prev] = await q.query("select amount from savings_days where year=$1 and month=$2 and day=$3", [y, m, d]);
      const before = prev ? (prev.amount as number | null) : null;
      if (before === amount) continue;
      await q.query(
        `insert into savings_days (year, month, day, amount) values ($1,$2,$3,$4)
         on conflict (year, month, day) do update set amount = excluded.amount`,
        [y, m, d, amount],
      );
      changed++;
      await audit(c, { action: "savings.update", entity: "savings_day", entityId: `${y}:${m}:${d}`, summary: `เงินเก็บพ่อ ${d} ${THAI_MONTHS[m - 1]} ${y}: ${baht(before)} → ${baht(amount)}`, before: { amount: before }, after: { amount } }, q);
    }
  });
  return { ok: true, changed };
});

route("PUT", "/savings/items", EDIT as any, async (c) => {
  const b = await c.json();
  const changes: any[] = Array.isArray(b.changes) ? b.changes : [];
  let changed = 0;
  await c.db.tx(async (q) => {
    for (const x of changes) {
      const y = year(x.year);
      const m = month(x.month);
      if (x.kind !== "expense" && x.kind !== "card") throw new HttpError(400, "ชนิดรายการไม่ถูกต้อง");
      const amount = money(x.amount);
      const [prev] = await q.query("select amount from savings_items where year=$1 and month=$2 and kind=$3", [y, m, x.kind]);
      const before = prev ? (prev.amount as number | null) : null;
      if (before === amount) continue;
      await q.query(
        `insert into savings_items (year, month, kind, amount) values ($1,$2,$3,$4)
         on conflict (year, month, kind) do update set amount = excluded.amount`,
        [y, m, x.kind, amount],
      );
      changed++;
      await audit(c, { action: "savings.item", entity: "savings_item", entityId: `${y}:${m}:${x.kind}`, summary: `เงินเก็บพ่อ ${x.kind === "expense" ? "ค่าใช้จ่าย" : "ค่าบัตร"} ${THAI_MONTHS[m - 1]} ${y}: ${baht(before)} → ${baht(amount)}`, before: { amount: before }, after: { amount } }, q);
    }
  });
  return { ok: true, changed };
});
