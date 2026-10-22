import { currentFee } from "../../../shared/calc";
import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import EmptyState from "@/components/app/EmptyState";
import PageHeader from "@/components/app/PageHeader";
import PlateChip from "@/components/app/PlateChip";
import PageMeta from "@/components/common/PageMeta";
import CustomerSheet from "@/components/ledger/CustomerSheet";
import { PlusGlyph, SearchGlyph } from "@/icons";
import { useData, type Customer } from "@/lib/dataStore";
import { canEdit, isAdmin, useAuth } from "@/lib/session";
import { cn } from "@/utils";
import { useMemo, useState } from "react";

export default function Customers() {
  const { data } = useData();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"year" | "all">("year");
  const [form, setForm] = useState<{ customer: Customer | null } | null>(null);
  const editable = canEdit(user);

  const year = data?.today.year ?? 0;
  const rows = useMemo(() => {
    if (!data) return [];
    const thisYear = data.years.find((y) => y.year === year)?.rows ?? [];
    const term = q.trim().toLowerCase().replace(/\s+/g, "");
    return data.customers
      .filter((c) => (scope === "all" || (c.isActive && thisYear.some((r) => r.customerId === c.id && r.kind !== "excluded"))) && (!term || `${c.name}${c.phone}${c.email}${thisYear.filter((r) => r.customerId === c.id).map((r) => r.plate).join("")}`.toLowerCase().replace(/\s+/g, "").includes(term)))
      .map((c) => {
        const vehicles = thisYear.filter((r) => r.customerId === c.id && r.kind !== "excluded");
        return { c, vehicles, monthly: vehicles.filter((v) => v.isActive).reduce((n, v) => n + currentFee(v, data.today), 0) };
      });
  }, [data, q, scope, year]);

  if (!data) return null;
  return (
    <>
      <PageMeta title="ลูกค้าและรถ | IdlePark" description="เพิ่มและแก้ไขข้อมูลผู้เช่าและรถ" />
      <PageHeader
        title="ลูกค้าและรถ"
        description={`แสดง ${rows.length} จาก ${data.customers.length} ราย · ข้อมูลรถเป็นของปี ${year}`}
        actions={editable && <Button icon={<PlusGlyph />} onClick={() => setForm({ customer: null })}>เพิ่มลูกค้า</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1 md:max-w-sm">
          <SearchGlyph className="pointer-events-none absolute inset-s-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ เบอร์ อีเมล หรือทะเบียน" aria-label="ค้นหาลูกค้า" className="app-input ps-9" />
        </div>
        <select aria-label="ช่วงลูกค้าที่แสดง" value={scope} onChange={(e) => setScope(e.target.value as "year" | "all")} className="app-input h-10 w-auto pe-8">
          <option value="year">เช่าอยู่ในปี {year}</option>
          <option value="all">ทั้งหมด (รวมที่เลิกเช่าแล้ว)</option>
        </select>
      </div>
      <Card bodyClassName="p-0">
        {rows.length === 0 ? (
          <EmptyState title="ไม่พบลูกค้า" body="ลองค้นหาด้วยคำอื่น หรือกด “เพิ่มลูกค้า” เพื่อเริ่มต้น" />
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full">
                <thead><tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3">
                  <th className="app-th">ชื่อ</th><th className="app-th">ติดต่อ</th><th className="app-th">รถปี {year}</th><th className="app-th text-end">ค่าเช่า/เดือน</th><th className="app-th" />
                </tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map(({ c, vehicles, monthly }) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-white/3">
                      <td className="app-td"><span className={cn("font-medium text-gray-800 dark:text-white/90", !c.isActive && "text-gray-500 dark:text-gray-400 line-through")}>{c.name}</span></td>
                      <td className="app-td text-theme-xs text-gray-500">{c.phone || "—"}{c.email && <><br />{c.email}</>}</td>
                      <td className="app-td"><span className="flex flex-wrap gap-1">{vehicles.length ? vehicles.map((v) => <PlateChip key={v.id} plate={v.plate || "ไม่มีทะเบียน"} />) : <span className="text-gray-500 dark:text-gray-400">ไม่มีในปีนี้</span>}</span></td>
                      <td className="app-td text-end"><Baht value={monthly} dash={false} /></td>
                      <td className="app-td text-end"><button onClick={() => setForm({ customer: c })} className="text-theme-sm font-medium text-link hover:text-link-hover">{editable ? "แก้ไข" : "ดู"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
              {rows.map(({ c, vehicles, monthly }) => (
                <li key={c.id}>
                  <button onClick={() => setForm({ customer: c })} className="w-full px-4 py-3.5 text-start">
                    <div className="flex items-center justify-between gap-3"><span className="text-base font-medium text-gray-800 dark:text-white/90">{c.name}</span><Baht value={monthly} dash={false} className="text-theme-sm" /></div>
                    <span className="mt-1.5 flex flex-wrap gap-1">{vehicles.map((v) => <PlateChip key={v.id} plate={v.plate || "ไม่มีทะเบียน"} />)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {form && <CustomerSheet state={form} onClose={() => setForm(null)} editable={editable} admin={isAdmin(user)} />}
    </>
  );
}
