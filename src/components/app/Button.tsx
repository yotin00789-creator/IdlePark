import { cn } from "@/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode; // small frameless icon shown before the label
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-on-brand shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300",
  outline:
    "border border-gray-300 bg-white text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/5",
  ghost: "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5",
  danger: "bg-error-500 text-white shadow-theme-xs hover:bg-error-600 disabled:bg-error-300",
};

export default function Button({
  variant = "primary",
  size = "md",
  icon,
  loading,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: AppButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4",
        size === "sm" ? "h-9 px-3 text-theme-sm" : "h-11 px-4 text-base md:h-10 md:text-theme-sm",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
