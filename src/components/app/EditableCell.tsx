import { formatBaht, parseBaht } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/utils";
import { useRef, useState } from "react";

export interface GridPos {
  grid: string;
  r: number;
  c: number;
}

interface EditableCellProps extends GridPos {
  value: number | null; // satang
  editable: boolean;
  onCommit: (next: number | null) => void;
  onPasteMatrix?: (r: number, c: number, matrix: string[][]) => void;
  label: string; // accessible name, e.g. "นา ตุลาคม"
  tone?: string; // background / text classes by status
  align?: "end" | "start";
  placeholder?: string;
}

const KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * A money cell that behaves like a spreadsheet cell: click or type to edit, Enter saves and moves
 * down, Esc cancels, arrows/Tab move, and Excel/Sheets ranges can be pasted. Empty is kept
 * distinct from 0.
 */
export default function EditableCell({ grid, r, c, value, editable, onCommit, onPasteMatrix, label, tone, align = "end", placeholder = "—" }: EditableCellProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null); // null = not editing
  const shown = draft ?? (value == null ? "" : formatBaht(value));

  const focusCell = (nr: number, nc: number) => {
    const el = document.querySelector<HTMLInputElement>(`input[data-grid="${grid}"][data-r="${nr}"][data-c="${nc}"]`);
    el?.focus();
    return Boolean(el);
  };

  const commit = () => {
    if (draft == null) return;
    const parsed = parseBaht(draft);
    setDraft(null);
    if (parsed === "invalid") {
      toast.error("กรอกเป็นตัวเลข เช่น 1200 หรือ 1,200.50");
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      ref={ref}
      data-grid={grid}
      data-r={r}
      data-c={c}
      aria-label={label}
      readOnly={!editable}
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      placeholder={placeholder}
      onFocus={(e) => {
        if (!editable) return;
        setDraft(value == null ? "" : String(value / 100));
        requestAnimationFrame(() => e.target.select());
      }}
      onBlur={commit}
      onChange={(e) => editable && setDraft(e.target.value)}
      onPaste={(e) => {
        if (!editable || !onPasteMatrix) return;
        const text = e.clipboardData.getData("text");
        if (!/[\t\n]/.test(text.trim())) return; // single value: normal paste
        e.preventDefault();
        const matrix = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
        setDraft(null);
        onPasteMatrix(r, c, matrix);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          focusCell(r + 1, c);
        } else if (e.key === "Escape") {
          setDraft(null);
          ref.current?.blur();
        } else if (KEYS.has(e.key) && !e.shiftKey) {
          const el = e.currentTarget;
          const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
          const atEnd = el.selectionStart === el.value.length;
          const whole = el.selectionStart === 0 && el.selectionEnd === el.value.length;
          if (e.key === "ArrowLeft" && !(atStart || whole)) return;
          if (e.key === "ArrowRight" && !(atEnd || whole)) return;
          const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          e.preventDefault();
          commit();
          focusCell(r + dr, c + dc);
        }
      }}
      className={cn(
        "num h-full w-full min-w-0 bg-transparent px-2.5 py-2.5 text-theme-sm outline-none placeholder:text-gray-500 focus:bg-white focus:ring-2 focus:ring-brand-500 focus:ring-inset dark:placeholder:text-gray-400 dark:focus:bg-gray-900",
        align === "end" ? "text-end" : "text-start",
        editable ? "cursor-text" : "cursor-default",
        tone,
      )}
    />
  );
}
