import type { ReactNode } from "react";

export default function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-theme-sm text-gray-500 dark:text-gray-400">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
