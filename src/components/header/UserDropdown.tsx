import UserAvatar from "@/components/app/UserAvatar";
import { ChevronDownGlyph, LogoutGlyph, ShieldCheckGlyph, UserGlyph } from "@/icons";
import { ROLE_LABEL, auth, fullName, useAuth } from "@/lib/session";
import { cn } from "@/utils";
import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";

export default function UserDropdown() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const name = fullName(user) || user.email;
  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-theme-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5 [&_svg]:size-4 [&_svg]:text-gray-500";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="dropdown-toggle flex items-center gap-2 rounded-lg p-1 pe-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        aria-label="เมนูบัญชี"
        aria-expanded={open}
      >
        <UserAvatar id={user.id} name={name} hasAvatar={user.hasAvatar} version={user.avatarVersion} size={32} />
        <span className="hidden text-start leading-tight sm:block">
          <span className="block max-w-36 truncate text-theme-sm font-medium">{name}</span>
          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDownGlyph className={cn("size-4 text-gray-500 dark:text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        className="absolute inset-e-0 mt-3 flex w-64 flex-col rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="px-3 py-2">
          <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{name}</p>
          <p className="truncate text-theme-xs text-gray-500 dark:text-gray-400">{user.email}</p>
        </div>
        <ul className="border-y border-gray-100 py-1 dark:border-gray-800">
          <li>
            <DropdownItem onItemClick={() => setOpen(false)} tag="a" to="/profile" className={item}>
              <UserGlyph /> โปรไฟล์
            </DropdownItem>
          </li>
          <li>
            <DropdownItem onItemClick={() => setOpen(false)} tag="a" to="/profile/security" className={item}>
              <ShieldCheckGlyph /> ความปลอดภัย
            </DropdownItem>
          </li>
        </ul>
        <button onClick={() => auth.signOut()} className={cn(item, "mt-1 w-full")}>
          <LogoutGlyph /> ออกจากระบบ
        </button>
      </Dropdown>
    </div>
  );
}
