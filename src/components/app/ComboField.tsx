import { CheckGlyph, ChevronDownGlyph } from "@/icons";
import { cn } from "@/utils";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ComboOption {
  value: string;
  sub?: string; // second line: plates, phone...
}

interface ComboFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  hint?: string;
  placeholder?: string;
  newHint?: (value: string) => string; // shown when the typed text matches nobody
}

/** A text field that suggests existing values in a styled list (replaces the browser's plain <datalist>). */
export default function ComboField({ label, value, onChange, options, hint, placeholder, newHint }: ComboFieldProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // list shows everything until the user types
  const [active, setActive] = useState(-1);

  const q = value.trim().toLowerCase();
  const shown = useMemo(
    () => (typed && q ? options.filter((o) => `${o.value} ${o.sub ?? ""}`.toLowerCase().includes(q)) : options),
    [options, q, typed],
  );
  const exact = options.some((o) => o.value === value.trim());

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  useEffect(() => {
    if (open && !typed) box.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, typed]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setTyped(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!shown.length) return;
      setActive((a) => (e.key === "ArrowDown" ? (a + 1) % shown.length : (a - 1 + shown.length) % shown.length));
    } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
      e.preventDefault();
      pick(shown[active].value);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <label htmlFor={id} className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          className="app-input pe-10"
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); setActive(-1); }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "ซ่อนรายชื่อ" : "แสดงรายชื่อลูกค้า"}
          onClick={() => { setOpen((o) => !o); setTyped(false); }}
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
        >
          <ChevronDownGlyph className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (shown.length > 0 || (newHint && value.trim() && !exact)) && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="custom-scrollbar absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {shown.map((o, i) => {
            const on = o.value === value.trim();
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={on}
                onPointerDown={(e) => { e.preventDefault(); pick(o.value); }}
                onPointerEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2", i === active ? "bg-gray-100 dark:bg-white/8" : "hover:bg-gray-50 dark:hover:bg-white/5")}
              >
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-theme-sm font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {[...o.value][0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{o.value}</span>
                  {o.sub && <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">{o.sub}</span>}
                </span>
                {on && <CheckGlyph className="size-4 shrink-0 text-link" />}
              </li>
            );
          })}
          {newHint && value.trim() && !exact && (
            <li className="mt-1 rounded-lg border-t border-gray-100 px-2.5 py-2 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">{newHint(value.trim())}</li>
          )}
        </ul>
      )}
      {hint && <p className="mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400">{hint}</p>}
    </div>
  );
}
