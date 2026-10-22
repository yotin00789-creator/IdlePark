import { cn } from "@/utils";
import { XMarkGlyph } from "@/icons";
import { useEffect, useRef, type ReactNode } from "react";
import IconButton from "./IconButton";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

// Bottom sheet on phones, side drawer on larger screens. Keeps the page behind it in view
// (no centred modal for form work) and traps Escape / outside click.
export default function Sheet({ open, onClose, title, description, children, footer, wide }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      panel.current?.querySelector<HTMLElement>("input:not([disabled]),select,textarea")?.focus();
    }, 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-99999 flex items-end justify-center md:items-stretch md:justify-end">
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-theme-xl md:max-h-none md:rounded-none dark:bg-gray-900",
          wide ? "md:max-w-2xl" : "md:max-w-md",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>
            {description && <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          <IconButton label="ปิด" onClick={onClose} className="-me-2">
            <XMarkGlyph />
          </IconButton>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex gap-3 border-t border-gray-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-gray-800 [&>*]:flex-1 md:[&>*]:flex-none md:justify-end md:[&]:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
