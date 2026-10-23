import { isYearly } from "../../shared/calc";
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

/**
 * End a tenancy (or take it up again). Nothing is deleted: the row, its payments and the customer stay; an ended row
 * leaves the active list, the 3D map and the reminders, and frees its slot. Coming back starts counting from this month.
 */
export async function setRenting(row: LedgerRow, renting: boolean, today: { year: number; month: number }): Promise<boolean> {
  const thisYear = row.year === today.year;
  const body: Record<string, unknown> = renting
    ? { isActive: true, endMonth: null, ...(thisYear && row.endMonth != null && !isYearly(row) ? { startMonth: today.month } : {}) }
    : { isActive: false, ...(thisYear && row.endMonth == null ? { endMonth: today.month } : {}) };
  try {
    await api.patch(`/ledger/rows/${row.id}`, body);
    await dataStore.load(true);
    if (renting) toast.success("กลับมาเช่าแล้ว", `${row.ownerName}${row.plate ? ` (${row.plate})` : ""} นับค่าเช่าตั้งแต่เดือนนี้ ข้อมูลและยอดเดิมอยู่ครบ`);
    else
      toast.success("เลิกเช่าแล้ว", `${row.ownerName}${row.plate ? ` (${row.plate})` : ""} ย้ายไปอยู่ส่วน “เลิกเช่าแล้ว” ข้อมูลและยอดที่เคยจ่ายเก็บไว้ครบ`, {
        label: "เลิกทำ",
        run: () => void setRenting({ ...row, isActive: false, endMonth: (body.endMonth as number | undefined) ?? row.endMonth }, true, today),
      });
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}
