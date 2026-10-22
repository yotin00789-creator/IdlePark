import PageMeta from "@/components/common/PageMeta";
import Button from "@/components/app/Button";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 p-6 text-center dark:bg-gray-900">
      <PageMeta title="ไม่พบหน้านี้ | IdlePark" description="ไม่พบหน้าที่ต้องการ" />
      <p className="num text-title-md font-semibold text-gray-300 dark:text-gray-700">404</p>
      <h1 className="mt-2 text-lg font-semibold text-gray-800 dark:text-white/90">ไม่พบหน้านี้</h1>
      <p className="mt-1 max-w-sm text-theme-sm text-gray-500 dark:text-gray-400">ลิงก์อาจเปลี่ยนไปหรือพิมพ์ไม่ถูกต้อง กลับไปหน้าแรกแล้วเลือกจากเมนู</p>
      <Link to="/" className="mt-5"><Button>กลับหน้าแรก</Button></Link>
    </div>
  );
}
