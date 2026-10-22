import { cn } from "@/utils";

// IdlePark: the black tile with the gold P, and the wordmark set in type (so it reads in light and dark).
// `image` shows the supplied full logo; in the dark theme it sits on a paper-coloured plate.
export default function BrandLogo({ compact = false, className, image = false, onDark = false }: { compact?: boolean; className?: string; image?: boolean; onDark?: boolean }) {
  if (image) {
    return (
      <span className={cn("inline-flex rounded-xl dark:bg-[#f4f2ee] dark:px-3 dark:py-2", className)}>
        <img src="/images/idlepark/logo.png" alt="IdlePark" width={2424} height={528} className="h-9 w-auto sm:h-10" />
      </span>
    );
  }
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <img src="/images/idlepark/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[22%]" />
      {!compact && (
        <span className="flex flex-col whitespace-nowrap transition-opacity duration-150">
          <span className={cn("text-[17px] leading-none", onDark ? "text-white" : "text-gray-950 dark:text-white")}>
            <span className="font-normal tracking-[0.16em]">IDLE</span>
            <span className="font-bold tracking-[0.16em]">PARK</span>
          </span>
          <span className="mt-1.5 h-[3px] w-full rounded-full bg-[repeating-linear-gradient(90deg,var(--color-gold-400)_0_9px,transparent_9px_14px)]" aria-hidden />
          <span className={cn("mt-1 text-theme-xs leading-none", onDark ? "text-gray-400" : "text-gray-500 dark:text-gray-400")}>สมุดบัญชีที่จอดรถ</span>
        </span>
      )}
    </span>
  );
}
