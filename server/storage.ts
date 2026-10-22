// Which slots are storage sheds: the slots of every zone whose kind is "storage" (plus the built-in shed K01).
import { setStorageSlots } from "../shared/lot.js";
import type { Queryable } from "./db.js";

export async function loadStorage(q: Queryable): Promise<string[]> {
  const ids = (await q.query("select slot_ids from zones where kind = 'storage'")).flatMap((r) => r.slot_ids as string[]);
  setStorageSlots(ids);
  return ids;
}
