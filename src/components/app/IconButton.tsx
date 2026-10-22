import { cn } from "@/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // accessible name (also the tooltip)
  children: ReactNode;
}

// Frameless icon button: no border, no background until hover.
export default function IconButton({ label, className, children, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 md:size-8 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white [&_svg]:size-[18px]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
