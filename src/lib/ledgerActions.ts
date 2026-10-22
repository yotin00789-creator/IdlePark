import type { LedgerRow } from "../../shared/types";
import { api, errorMessage } from "./api";
import { dataStore } from "./dataStore";
import { toast } from "./toast";

/**
 * Tick a renter as "not counted in the books": the row stays in the ledger with its collection cells, but its money
 * is not added to the totals (and nobody is chased for it). Untick to count it again.
 */
export async function setExcluded(row: LedgerRow, excluded: boolean) {
  const kind = excluded ? "excluded" : "normal";
  dataStore.mergeRow({ ...row, kind }); // the row moves at once; the totals follow when the server answers
  try {
    await api.patch(`/ledger/rows/${row.id}`, { kind });
    await dataStore.load(true);
    toast.success(excluded ? "ไม่รวมในบัญชีแล้ว" : "นับรวมในบัญชีแล้ว", excluded ? `${row.ownerName} ยังบันทึกการเก็บเงินได้ แต่ไม่นับในยอดรวม` : `${row.ownerName} นับในยอดรวมเหมือนเดิม`);
  } catch (e) {
    dataStore.mergeRow(row);
    toast.error(errorMessage(e));
  }
}
