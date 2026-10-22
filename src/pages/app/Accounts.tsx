import Baht from "@/components/app/Baht";
import Button from "@/components/app/Button";
import Card from "@/components/app/Card";
import { SelectField, TextField } from "@/components/app/Field";
import ConfirmDialog from "@/components/app/ConfirmDialog";
import PageHeader from "@/components/app/PageHeader";
import Sheet from "@/components/app/Sheet";
import PageMeta from "@/components/common/PageMeta";
import { CopyGlyph, EyeGlyph, EyeOffGlyph, PencilGlyph, PlusGlyph } from "@/icons";
import { api, errorMessage } from "@/lib/api";
import { dataStore, useCalc, type Account } from "@/lib/dataStore";
import { canEdit, isAdmin, useAuth } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useState } from "react";

export default function Accounts() {
  const model = useCalc();
  const { user } = useAuth();
  const [year, setYear] = useState<number | null>(null);
  const [shown, setShown] = useState<Record<number, string>>({});
  const [form, setForm] = useState<{ account: Account | null } | null>(null);
  if (!model) return null;
  const y = year ?? model.data.today.year;
  const calc = model.byYear.get(y);

  const reveal = async (a: Account) => {
    if (shown[a.id]) return setShown((s) => Object.fromEntries(Object.entries(s).filter(([k]) => Number(k) !== a.id)));
    try {
      const r = await api.get<{ number: string }>(`/accounts/${a.id}/reveal`);
      setShown((s) => ({ ...s, [a.id]: r.number }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const copy = async (a: Account) => {
    try {
      const number = shown[a.id] ?? (await api.get<{ number: string }>(`/accounts/${a.id}/reveal`)).number;
      await navigator.clipboard.writeText(number.replace(/-/g, ""));
      toast.success("คัดลอกเลขบัญชีแล้ว");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageMeta title="บัญชีรับเงิน | IdlePark" description="บัญชีธนาคารสำหรับรับค่าเช่า" />
      <PageHeader
        title="บัญชีรับเงิน"
        description="เลขบัญชีเก็บแบบเข้ารหัส ซ่อนไว้เป็นค่าเริ่มต้น การดูเลขเต็มและการคัดลอกถูกบันทึกในประวัติการใช้งาน"
        actions={<>
          <select aria-label="ปีที่แสดงยอด" value={y} onChange={(e) => setYear(Number(e.target.value))} className="app-input h-10 w-auto py-0 pe-8">{model.data.years.map((x) => <option key={x.year} value={x.year}>ปี {x.year}</option>)}</select>
          {isAdmin(user) && <Button icon={<PlusGlyph />} onClick={() => setForm({ account: null })}>เพิ่มบัญชี</Button>}
        </>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {model.data.accounts.map((a) => (
          <Card key={a.id} title={a.label || a.bank} description={`${a.bank} · ${a.holder}`} actions={isAdmin(user) && <button aria-label="แก้ไขบัญชี" onClick={() => setForm({ account: a })} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 [&_svg]:size-4"><PencilGlyph /></button>}>
            <p className="num text-xl font-semibold tracking-wide text-gray-900 dark:text-white">{shown[a.id] ?? a.masked}</p>
            <div className="mt-3 flex gap-2">
              {canEdit(user) && <Button size="sm" variant="outline" icon={shown[a.id] ? <EyeOffGlyph /> : <EyeGlyph />} onClick={() => reveal(a)}>{shown[a.id] ? "ซ่อนเลข" : "แสดงเลขเต็ม"}</Button>}
              {canEdit(user) && <Button size="sm" variant="outline" icon={<CopyGlyph />} onClick={() => copy(a)}>คัดลอก</Button>}
            </div>
            <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
              <p className="text-theme-xs text-gray-500">{a.shows === "net" ? `รวม(หักแล้ว) ปี ${y}` : `เก็บเงิน ปี ${y}`}</p>
              <p className="mt-0.5 text-lg font-semibold">{calc ? <Baht value={a.shows === "net" ? calc.totals.net : calc.totals.collect} signColor={a.shows === "net"} dash={false} /> : "—"} <span className="text-theme-sm font-normal text-gray-500 dark:text-gray-400">บาท</span></p>
              <p className="mt-1 text-theme-xs text-gray-500 dark:text-gray-400">ตัวเลขใต้กล่องบัญชีในไฟล์เดิม (ตั้งให้แสดงอะไรได้ในหน้าแก้ไข)</p>
            </div>
          </Card>
        ))}
        {model.data.accounts.length === 0 && <p className="app-card p-6 text-theme-sm text-gray-500">ยังไม่มีบัญชี</p>}
      </div>
      {form && <AccountSheet account={form.account} onClose={() => setForm(null)} />}
    </>
  );
}

function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [bank, setBank] = useState(account?.bank ?? "TTB");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState(account?.holder ?? "");
  const [label, setLabel] = useState(account?.label ?? "");
  const [shows, setShows] = useState(account?.shows ?? "net");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!account && !number.trim()) return setError("กรุณากรอกเลขบัญชี");
    setBusy(true);
    try {
      if (account) await api.patch(`/accounts/${account.id}`, { bank, holder, label, shows, number });
      else await api.post("/accounts", { bank, holder, label, shows, number });
      await dataStore.load(true);
      toast.success("บันทึกแล้ว");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const [confirm, setConfirm] = useState(false);
  const remove = async () => {
    if (!account) return;
    setBusy(true);
    await api.del(`/accounts/${account.id}`).catch((e) => toast.error(errorMessage(e)));
    await dataStore.load(true);
    toast.success("ลบบัญชีแล้ว");
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={account ? "แก้ไขบัญชี" : "เพิ่มบัญชี"} footer={<>{account && <Button variant="ghost" className="!flex-none text-error-600" onClick={() => setConfirm(true)}>ลบ</Button>}<Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button loading={busy} onClick={save}>บันทึก</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4"><TextField label="ธนาคาร" value={bank} onChange={(e) => setBank(e.target.value)} /><TextField label="ชื่อเรียก" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น บัญชีรับเงินหลัก" /></div>
        <TextField label="เลขบัญชี" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={account ? "เว้นว่างถ้าไม่เปลี่ยน" : "000-0-00000-0"} />
        <TextField label="ชื่อบัญชี" value={holder} onChange={(e) => setHolder(e.target.value)} />
        <SelectField label="ตัวเลขที่แสดงใต้บัญชี" value={shows} onChange={(e) => setShows(e.target.value as "net" | "collect")}><option value="net">รวม(หักแล้ว) ของปี</option><option value="collect">เก็บเงิน ของปี</option></SelectField>
        {error && <p role="alert" className="text-theme-sm text-error-600">{error}</p>}
      </div>
      <ConfirmDialog open={confirm} title="ลบบัญชีนี้?" body="ลบบัญชีรับเงินนี้ออกจากระบบ (ไม่กระทบตัวเลขในสมุดรายรับ)" confirmLabel="ลบบัญชี" busy={busy} onConfirm={remove} onClose={() => setConfirm(false)} />
    </Sheet>
  );
}
