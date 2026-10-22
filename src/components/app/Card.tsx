import { cn } from "@/utils";
import type { CSSProperties, ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}

export default function Card({ title, description, actions, children, className, bodyClassName, style }: CardProps) {
  return (
    <section className={cn("app-card overflow-hidden", className)} style={style}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            {title && <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h2>}
            {description && <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
