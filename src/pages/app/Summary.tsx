import Baht from "@/components/app/Baht";
import Card from "@/components/app/Card";
import PageHeader from "@/components/app/PageHeader";
import PageLoading from "@/components/app/Skeleton";
import PageMeta from "@/components/common/PageMeta";
import { useCalc } from "@/lib/dataStore";
import { Suspense, lazy } from "react";
import { Link } from "react-router";

const CumulativeChart = lazy(() => import("@/components/dashboard/CumulativeChart"));

export default function Summary() {
  const model = useCalc();
  if (!model) return null;
  const { calc } = model;
  return (
    <>
      <PageMeta title="สรุปรายปี | IdlePark" description="ยอดรวมแต่ละปีและยอดคงเหลือสะสม" />
      <PageHeader title="สรุปรายปีและยอดสะสม" description="ไล่ยอดปีต่อปี: รวม → หักแล้ว → ยอดคงเหลือทั้งหมด เหมือนช่อง “ยอดคงเหลือทั้งหมด” ในไฟล์ Excel" />
      <Card className="mb-4" bodyClassName="p-0">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-3xl text-end">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/3">
                <th className="app-th text-start">ปี (พ.ศ.)</th><th className="app-th text-end">รวมทั้งปี</th><th className="app-th text-end">ให้พ่อ</th><th className="app-th text-end">จ่ายป้า</th><th className="app-th text-end">ค่าใช้จ่าย</th><th className="app-th text-end">เก็บเงิน</th><th className="app-th text-end">รวม(หักแล้ว)</th><th className="app-th text-end">ยอดสะสม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {calc.map((c) => (
                <tr key={c.year} className="hover:bg-gray-50 dark:hover:bg-white/3">
                  <td className="app-td text-start"><Link to={`/ledger/${c.year}`} className="num font-medium text-brand-600 hover:underline dark:text-brand-400">{c.year}</Link></td>
                  <td className="app-td"><Baht value={c.totals.income} dash={false} /></td>
                  <td className="app-td"><Baht value={c.totals.toFather} dash={false} /></td>
                  <td className="app-td"><Baht value={c.totals.payAunt} dash={false} /></td>
                  <td className="app-td"><Baht value={c.totals.totalExpense} dash={false} /></td>
                  <td className="app-td"><Baht value={c.totals.collect} dash={false} /></td>
                  <td className="app-td"><Baht value={c.totals.net} signColor dash={false} /></td>
                  <td className="app-td font-semibold"><Baht value={c.cumulative} signColor dash={false} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="รวม(หักแล้ว) และยอดสะสมแต่ละปี">
        <Suspense fallback={<PageLoading />}><CumulativeChart calc={calc} /></Suspense>
      </Card>
    </>
  );
}
