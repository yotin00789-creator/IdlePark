import {
  BankGlyph,
  CarSideGlyph,
  ChartGlyph,
  CubeGlyph,
  DashboardGlyph,
  FileTextGlyph,
  HistoryGlyph,
  LedgerGlyph,
  MapPinGlyph,
  ReceiptGlyph,
  ShieldCheckGlyph,
  SlidersGlyph,
  UsersGlyph,
  WalletGlyph,
} from "@/icons";
import type { ComponentType, SVGProps } from "react";

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  adminOnly?: boolean;
}

export const MAIN_NAV: NavItem[] = [
  { to: "/", label: "แดชบอร์ด", icon: DashboardGlyph },
  { to: "/lot", label: "ผังที่จอด 3 มิติ", icon: CubeGlyph },
  { to: "/ledger", label: "สมุดรายรับ", icon: LedgerGlyph },
  { to: "/summary", label: "สรุปรายปี", icon: ChartGlyph },
  { to: "/reports", label: "รายงาน PDF", icon: FileTextGlyph },
  { to: "/customers", label: "ลูกค้า", icon: CarSideGlyph },
  { to: "/zones", label: "โซนที่จอด", icon: MapPinGlyph },
  { to: "/savings", label: "เงินเก็บพ่อ", icon: WalletGlyph },
  { to: "/accounts", label: "บัญชีรับเงิน", icon: BankGlyph },
];
export const SYSTEM_NAV: NavItem[] = [
  { to: "/formula-audit", label: "ตรวจสอบสูตร", icon: ReceiptGlyph },
  { to: "/audit", label: "ประวัติการใช้งาน", icon: HistoryGlyph, adminOnly: true },
  { to: "/users", label: "ผู้ใช้งาน", icon: UsersGlyph, adminOnly: true },
  { to: "/settings", label: "ตั้งค่าและแจ้งเตือน", icon: SlidersGlyph, adminOnly: true },
  { to: "/profile/security", label: "ความปลอดภัยของบัญชี", icon: ShieldCheckGlyph },
];

/** These stay in the menu whatever is chosen: the settings page is where hidden entries are switched back on. */
export const NAV_LOCKED = ["/settings", "/profile/security"];
