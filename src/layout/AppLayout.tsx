import PageLoading from "@/components/app/Skeleton";
import MoneyConfirm from "@/components/app/MoneyConfirm";
import Toaster from "@/components/app/Toaster";
import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { dataStore, useData } from "@/lib/dataStore";
import { cn } from "@/utils";
import { useEffect } from "react";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

const LayoutContent: React.FC = () => {
  const { isExpanded, isMobileOpen } = useSidebar();
  const { data, error } = useData();
  useEffect(() => {
    void dataStore.load(true);
  }, []);

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />
      <div
        className={cn(
          "min-w-0 flex-1 transition-[margin] duration-200 ease-out",
          // a collapsed menu that opens on hover floats over the page; it never pushes it
          isExpanded ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader />
        <main className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
          {!data && !error && <PageLoading />}
          {!data && error && (
            <div className="app-card mx-auto mt-10 max-w-md p-6 text-center">
              <p className="text-theme-sm text-gray-700 dark:text-gray-300">{error}</p>
              <button onClick={() => dataStore.load(true)} className="mt-3 text-theme-sm font-medium text-link">ลองใหม่</button>
            </div>
          )}
          {data && <Outlet />}
        </main>
      </div>
      <MoneyConfirm />
      <Toaster />
    </div>
  );
};

const AppLayout: React.FC = () => (
  <SidebarProvider>
    <LayoutContent />
  </SidebarProvider>
);

export default AppLayout;
