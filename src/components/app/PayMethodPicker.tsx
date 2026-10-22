import type { Account } from "@/lib/dataStore";
import type { PayMode } from "@/lib/payMode";
import { cn } from "@/utils";
import { PAY_METHOD_LABEL, type PayMethod } from "../../../shared/types";

interface PayMethodPickerProps {
  value: PayMode;
  onChange: (v: PayMode) => void;
  accounts: Account[];
  compact?: boolean;
  disabled?: boolean;
}

const METHODS: PayMethod[] = ["cash", "transfer"];

/** Cash or a transfer into one of the bank accounts; a transfer asks which account when there are several. */
export default function PayMethodPicker({ value, onChange, accounts, compact, disabled }: PayMethodPickerProps) {
  const accountId = accounts.some((a) => a.id === value.accountId) ? value.accountId : (accounts[0]?.id ?? null);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}>
      <div role="radiogroup" aria-label="วิธีรับเงิน" className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-white/8">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value.method === m}
            disabled={disabled}
            onClick={() => onChange({ method: m, accountId: m === "transfer" ? accountId : null })}
            className={cn(
              "rounded-md px-3 text-theme-sm font-medium transition-colors",
              compact ? "h-8" : "h-9",
              value.method === m ? "bg-white text-gray-900 shadow-theme-xs dark:bg-gray-700 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white",
            )}
          >
            {PAY_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      {value.method === "transfer" && accounts.length > 1 && (
        <select
          aria-label="บัญชีที่รับโอน"
          disabled={disabled}
          value={accountId ?? ""}
          onChange={(e) => onChange({ method: "transfer", accountId: Number(e.target.value) })}
          className={cn("app-input w-auto min-w-0 max-w-56", compact && "h-8 md:h-8")}
        >
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.bank} · {a.label}</option>)}
        </select>
      )}
      {value.method === "transfer" && accounts.length === 1 && <span className="text-theme-xs text-gray-500 dark:text-gray-400">{accounts[0].bank} · {accounts[0].label}</span>}
    </div>
  );
}
