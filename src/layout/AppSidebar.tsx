import BrandLogo from "@/components/common/BrandLogo";
import { useSidebar } from "@/context/SidebarContext";
import {
  BankGlyph,
  CarSideGlyph,
  ChartGlyph,
  CubeGlyph,
  FileTextGlyph,
  DashboardGlyph,
  HistoryGlyph,
  LedgerGlyph,
  MapPinGlyph,
  ReceiptGlyph,
  SlidersGlyph,
  UsersGlyph,
  WalletGlyph,
  ShieldCheckGlyph,
} from "@/icons";
import { isAdmin, useAuth } from "@/lib/session";
import { cn } from "@/utils";
import { useEffect, type ComponentType, type SVGProps } from "react";
import { Link, useLocation } from "react-router";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  adminOnly?: boolean;
}

const MAIN: NavItem[] = [
  { to: "/", label: "แดชบอร์ด", icon: DashboardGlyph },
  { to: "/lot", label: "ผังที่จอด 3 มิติ", icon: CubeGlyph },
  { to: "/ledger", label: "สมุดรายรับ", icon: LedgerGlyph },
  { to: "/summary", label: "สรุปรายปี", icon: ChartGlyph },
  { to: "/reports", label: "รายงาน PDF", icon: FileTextGlyph },
  { to: "/customers", label: "ลูกค้าและรถ", icon: CarSideGlyph },
  { to: "/zones", label: "โซนที่จอด", icon: MapPinGlyph },
  { to: "/savings", label: "เงินเก็บพ่อ", icon: WalletGlyph },
  { to: "/accounts", label: "บัญชีรับเงิน", icon: BankGlyph },
];
const SYSTEM: NavItem[] = [
  { to: "/formula-audit", label: "ตรวจสอบสูตร", icon: ReceiptGlyph },
  { to: "/audit", label: "ประวัติการใช้งาน", icon: HistoryGlyph, adminOnly: true },
  { to: "/users", label: "ผู้ใช้งาน", icon: UsersGlyph, adminOnly: true },
  { to: "/settings", label: "ตั้งค่าและแจ้งเตือน", icon: SlidersGlyph, adminOnly: true },
  { to: "/profile/security", label: "ความปลอดภัยของบัญชี", icon: ShieldCheckGlyph },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, setIsMobileOpen } = useSidebar();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const wide = isExpanded || isHovered || isMobileOpen;

  useEffect(() => {
    setIsMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const active = (to: string) => (to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`));

  const render = (items: NavItem[]) => (
    <ul className="flex flex-col gap-0.5">
      {items
        .filter((i) => !i.adminOnly || isAdmin(user))
        .map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              title={wide ? undefined : label}
              aria-current={active(to) ? "page" : undefined}
              className={cn("group menu-item overflow-hidden ps-[19px]", active(to) ? "menu-item-active" : "menu-item-inactive")}
            >
              <Icon className={cn("size-[18px] shrink-0", active(to) ? "menu-item-icon-active" : "menu-item-icon-inactive")} />
              <span className={cn("truncate whitespace-nowrap transition-opacity duration-150", wide ? "opacity-100 delay-75" : "opacity-0")}>{label}</span>
            </Link>
          </li>
        ))}
    </ul>
  );

  return (
    <aside
      className={cn(
        "fixed inset-s-0 top-0 z-100000 flex h-screen flex-col overflow-hidden border-e border-gray-200 bg-white px-4 text-gray-900 transition-[width,transform,box-shadow] duration-200 ease-out xl:translate-x-0 xl:rtl:translate-x-0 dark:border-gray-800 dark:bg-gray-900",
        wide ? "w-72.5" : "w-22.5",
        wide && !isExpanded && !isMobileOpen && "shadow-theme-xl",
        isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
      )}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex overflow-hidden py-6 ps-3">
        <Link to="/" aria-label="IdlePark สมุดบัญชีที่จอดรถ" className="shrink-0">
          <BrandLogo className={cn("transition-opacity duration-150", wide ? "[&>span:last-child]:opacity-100" : "[&>span:last-child]:opacity-0")} />
        </Link>
      </div>
      <nav className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto pb-6" aria-label="เมนูหลัก">
        <div>
          <h2 className={cn("overflow-hidden px-3 text-theme-xs font-medium whitespace-nowrap text-gray-500 transition-[opacity,max-height,margin] duration-150 dark:text-gray-400", wide ? "mb-2 max-h-5 opacity-100" : "mb-0 max-h-0 opacity-0")}>เมนู</h2>
          {render(MAIN)}
        </div>
        <div>
          <h2 className={cn("overflow-hidden px-3 text-theme-xs font-medium whitespace-nowrap text-gray-500 transition-[opacity,max-height,margin] duration-150 dark:text-gray-400", wide ? "mb-2 max-h-5 opacity-100" : "mb-0 max-h-0 opacity-0")}>ระบบ</h2>
          {render(SYSTEM)}
        </div>
      </nav>
    </aside>
  );
}
