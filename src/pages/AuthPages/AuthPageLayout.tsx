import ParkingScene from "@/components/common/ParkingScene";
import BrandLogo from "@/components/common/BrandLogo";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import Toaster from "@/components/app/Toaster";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  title?: string; // pages that draw their own headings (sign-in) leave this out
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

// Left: the brand with a looping parking lot. Right: the form.
export default function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] dark:bg-gray-900">
      <aside className="relative hidden overflow-hidden bg-gray-950 text-white lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,color-mix(in_srgb,var(--color-gold-400)_16%,transparent),transparent_60%)]" />
        <div className="relative">
          <BrandLogo onDark />
        </div>
        <div className="relative max-w-lg">
          <p className="text-theme-sm font-medium tracking-[0.18em] text-gold-400">PARKING LEDGER</p>
          <h2 className="mt-3 text-title-sm font-semibold text-balance xl:text-title-md">ที่จอดรถเป็นระเบียบ เก็บค่าเช่าไม่ตกหล่น</h2>
          <p className="mt-3 text-theme-sm leading-relaxed text-gray-400">ดูผังที่จอด 3 มิติ ตามสถานะการชำระรายคัน และแจ้งเตือนทางอีเมลเมื่อมีใครค้างจ่าย</p>
        </div>
        <div className="relative -mx-2">
          <ParkingScene bays={5} />
          <div className="mt-2 h-px bg-linear-to-r from-transparent via-gold-400/40 to-transparent" />
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:invisible"><BrandLogo /></span>
          <ThemeToggleButton />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
          {title && (
            <>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white/90">{title}</h1>
              {description && <p className="mt-2 text-theme-sm text-gray-500 dark:text-gray-400">{description}</p>}
            </>
          )}
          <div className={title ? "mt-7" : undefined}>{children}</div>
          {footer && <div className="mt-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">{footer}</div>}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
