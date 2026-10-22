import Button from "@/components/app/Button";
import { TextField } from "@/components/app/Field";
import Sheet from "@/components/app/Sheet";
import PayMethodPicker from "@/components/app/PayMethodPicker";
import { savePayments, useData } from "@/lib/dataStore";
import { modeFields, payMode, usePayMode } from "@/lib/payMode";
import { formatBaht, monthName, parseBaht } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useState } from "react";
import { feeFor, isYearly } from "../../../shared/calc";
import type { LedgerRow } from "../../../shared/types";

interface PayDialogProps {
  target: { row: LedgerRow; month: number; paid: number } | null;
  onClose: () => void;
}

// Quick "mark as paid": defaults to the amount still owed so one tap records it.
export default function PayDialog({ target, onClose }: PayDialogProps) {
  return target ? <Form key={`${target.row.id}-${target.month}`} target={target} onClose={onClose} /> : null;
}

function Form({ target, onClose }: { target: NonNullable<PayDialogProps["target"]>; onClose: () => void }) {
  const { row, month, paid } = target;
  const { data } = useData();
  const mode = usePayMode();
  const accounts = data?.accounts ?? [];
  const [amount, setAmount] = useState(String((feeFor(row, month) - paid) / 100));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = parseBaht(amount);
    if (parsed === "invalid" || parsed == null || parsed <= 0) return setError("กรอกจำนวนเงินที่ได้รับเป็นตัวเลข");
    const f = modeFields(accounts);
    void savePayments([{ rowId: row.id, month, amount: paid + parsed, method: f.method, accountId: f.accountId }]);
    toast.success(`บันทึกแล้ว: ${row.ownerName} ${monthName(month)}`);
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="บันทึกว่าชำระแล้ว"
      description={`${row.ownerName}${row.plate ? ` · ${row.plate}` : ""} · ${monthName(month)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save}>บันทึก</Button>
        </>
      }
    >
      <TextField
        label="ได้รับเงิน (บาท)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error}
        hint={paid > 0 ? `เดือนนี้จ่ายไว้แล้ว ${formatBaht(paid)} บาท จะนำมารวมให้` : isYearly(row) ? `ค่าเช่าคลังเก็บของ ${formatBaht(feeFor(row, month))} บาท/ปี` : `ค่าเช่า ${formatBaht(feeFor(row, month))} บาท/เดือน`}
      />
      <div className="mt-5">
        <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">รับเงินด้วย</span>
        <PayMethodPicker value={mode} onChange={payMode.set} accounts={accounts} />
      </div>
    </Sheet>
  );
}
