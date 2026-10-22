/* eslint-disable react-hooks/refs -- floating-ui hands out callback refs and prop getters */
import type { FormulaExplain } from "@/lib/formulas";
import { cn } from "@/utils";
import { FloatingPortal, autoUpdate, flip, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { useState, type ReactNode } from "react";

interface FormulaPopoverProps {
  explain: FormulaExplain;
  children: ReactNode; // the number shown in the cell
  className?: string;
}

// A calculated cell is read-only; clicking it shows the Excel formula, the inputs and the result.
export default function FormulaPopover({ explain, children, className }: FormulaPopoverProps) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        title="ดูสูตรของตัวเลขนี้"
        className={cn("num w-full rounded px-3 py-2.5 text-end hover:bg-gray-100 dark:hover:bg-white/5", className)}
        {...getReferenceProps()}
      >
        {children}
      </button>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-999999 w-72 rounded-xl border border-gray-200 bg-white p-4 text-theme-sm shadow-theme-lg dark:border-gray-700 dark:bg-gray-900"
            {...getFloatingProps()}
          >
            <p className="font-semibold text-gray-800 dark:text-white/90">{explain.title}</p>
            {explain.note && <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">{explain.note}</p>}
            {explain.excel && (
              <p className="mt-3 rounded-md bg-gray-50 px-2.5 py-1.5 font-mono text-theme-xs break-all text-gray-700 dark:bg-white/5 dark:text-gray-300">
                <span className="mb-0.5 block font-sans text-gray-500 dark:text-gray-400">สูตร Excel เดิม</span>
                {explain.excel}
              </p>
            )}
            {explain.inputs.length > 0 && (
              <dl className="mt-3 space-y-1">
                {explain.inputs.map((i) => (
                  <div key={i.label} className="flex justify-between gap-3">
                    <dt className="text-gray-500 dark:text-gray-400">{i.label}</dt>
                    <dd className="num text-gray-800 dark:text-white/90">{i.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-3 flex justify-between border-t border-gray-100 pt-2 font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">
              <span>ผลลัพธ์</span>
              <span className="num">{explain.result}</span>
            </div>
            {explain.legacy && (
              <p className="mt-3 rounded-md bg-warning-50 px-2.5 py-1.5 text-theme-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                สูตรตามไฟล์เดิม · {explain.legacy}
              </p>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
