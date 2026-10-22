import { pageTitle } from "@/lib/pageTitle";
import { useEffect, type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

// The title and description are shown in the top bar (see AppHeader); this component
// only renders the page's action buttons.
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  useEffect(() => {
    pageTitle.set({ title, description });
  }, [title, description]);
  if (!actions) return null;
  return <div className="mb-4 flex flex-wrap items-center justify-end gap-2 md:mb-5">{actions}</div>;
}
