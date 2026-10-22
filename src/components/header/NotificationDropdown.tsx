import IconButton from "@/components/app/IconButton";
import { BellGlyph } from "@/icons";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/utils";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Dropdown } from "../ui/dropdown/Dropdown";

interface Notice {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  severity: "info" | "warning" | "error" | "success";
  createdAt: string;
  read: boolean;
}

const DOT: Record<Notice["severity"], string> = {
  info: "bg-blue-light-500",
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-error-500",
};

export default function NotificationDropdown() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ items: Notice[]; unread: number }>("/notifications");
      setItems(r.items);
      setUnread(r.unread);
    } catch {
      /* the bell is best-effort */
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const t = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const markAll = async () => {
    setItems((l) => l.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await api.post("/notifications/read", { all: true }).catch(() => {});
  };

  const openItem = async (n: Notice) => {
    setOpen(false);
    if (!n.read) {
      setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api.post("/notifications/read", { ids: [n.id] }).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="relative">
      <IconButton
        label={unread ? `การแจ้งเตือน ${unread} รายการใหม่` : "การแจ้งเตือน"}
        className="dropdown-toggle"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
      >
        <BellGlyph />
        {unread > 0 && (
          <span className="num absolute -top-0.5 inset-e-0 flex min-w-4 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </IconButton>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        className="absolute -inset-s-24 mt-3 flex max-h-[28rem] w-[calc(100vw-2rem)] max-w-96 flex-col rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg sm:inset-s-auto sm:inset-e-0 dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <h2 className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">การแจ้งเตือน</h2>
          {unread > 0 && (
            <button onClick={markAll} className="text-theme-xs font-medium text-link hover:text-link-hover">
              อ่านทั้งหมดแล้ว
            </button>
          )}
        </div>
        <ul className="custom-scrollbar flex-1 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-4 py-10 text-center text-theme-sm text-gray-500 dark:text-gray-400">ยังไม่มีการแจ้งเตือน</li>
          )}
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition hover:bg-gray-50 dark:hover:bg-white/5",
                  !n.read && "bg-brand-25 dark:bg-brand-500/5",
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-gray-300 dark:bg-gray-600" : DOT[n.severity])} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-theme-sm text-gray-800 dark:text-white/90", !n.read && "font-medium")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block truncate text-theme-xs text-gray-500 dark:text-gray-400">{n.body}</span>}
                  <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dropdown>
    </div>
  );
}
