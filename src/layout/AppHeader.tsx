import IconButton from "@/components/app/IconButton";
import BrandLogo from "@/components/common/BrandLogo";
import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import { useSidebar } from "@/context/SidebarContext";
import { MenuGlyph, XMarkGlyph } from "@/icons";
import { usePageTitle } from "@/lib/pageTitle";
import { Link } from "react-router";

export default function AppHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { title, description } = usePageTitle();

  return (
    <header className="sticky top-0 z-99999 flex h-14 w-full items-center gap-2 border-b border-gray-200 bg-white px-3 md:h-16 md:px-5 dark:border-gray-800 dark:bg-gray-900">
      <IconButton
        label={isMobileOpen ? "ปิดเมนู" : "เปิดเมนู"}
        onClick={() => (window.innerWidth >= 1280 ? toggleSidebar() : toggleMobileSidebar())}
        className="size-10 md:size-10"
      >
        {isMobileOpen ? <XMarkGlyph /> : <MenuGlyph />}
      </IconButton>

      <Link to="/" className="xl:hidden" aria-label="หน้าแรก">
        <BrandLogo compact />
      </Link>

      <div className="ms-1 min-w-0 flex-1">
        <h1 className="truncate text-base leading-tight font-semibold text-gray-800 md:text-lg dark:text-white/90">{title}</h1>
        {description && <p className="hidden truncate text-theme-xs text-gray-500 md:block dark:text-gray-400">{description}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggleButton />
        <NotificationDropdown />
        <UserDropdown />
      </div>
    </header>
  );
}
