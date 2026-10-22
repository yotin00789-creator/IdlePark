import { AlertGlyph, CheckGlyph, InfoGlyph, XMarkGlyph } from "@/icons";
import { dismiss, useToasts, type ToastTone } from "@/lib/toast";
import { cn } from "@/utils";

const TONE: Record<ToastTone, { icon: string; bar: string; ring: string; title: string }> = {
  success: { icon: "text-success-500", bar: "bg-success-500", ring: "ring-success-500/15", title: "สำเร็จ" },
  error: { icon: "text-error-500", bar: "bg-error-500", ring: "ring-error-500/15", title: "เกิดข้อผิดพลาด" },
  warning: { icon: "text-warning-500", bar: "bg-warning-500", ring: "ring-warning-500/15", title: "โปรดทราบ" },
  info: { icon: "text-link", bar: "bg-brand-500", ring: "ring-brand-500/15", title: "แจ้งให้ทราบ" },
};

// Notifications slide in at the top right (bottom on phones), each with a thin timer bar.
export default function Toaster() {
  const items = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-999999 flex flex-col-reverse items-stretch gap-2.5 px-3 pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:end-5 md:top-20 md:bottom-auto md:w-96 md:flex-col md:items-stretch md:px-0"
    >
      {items.map((t) => {
        const tone = TONE[t.tone];
        const Icon = t.tone === "success" ? CheckGlyph : t.tone === "info" ? InfoGlyph : AlertGlyph;
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "toast-card pointer-events-auto relative overflow-hidden rounded-2xl bg-white/95 text-gray-800 shadow-theme-xl ring-1 backdrop-blur-md dark:bg-gray-900/95 dark:text-white/90",
              tone.ring,
            )}
          >
            <div className="flex items-start gap-3 py-3.5 ps-4 pe-2.5">
              <Icon className={cn("mt-0.5 size-5 shrink-0", tone.icon)} />
              <div className="min-w-0 flex-1">
                <p className="text-theme-sm leading-snug font-semibold">{t.text}</p>
                {t.detail && <p className="mt-0.5 text-theme-xs leading-relaxed text-gray-500 dark:text-gray-400">{t.detail}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="ปิดการแจ้งเตือน"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <XMarkGlyph className="size-4" />
              </button>
            </div>
            <span className={cn("toast-timer absolute inset-x-0 bottom-0 h-[3px] origin-left", tone.bar)} style={{ animationDuration: `${t.ms}ms` }} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}
