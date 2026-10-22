export default function PageLoading({ label = "กำลังโหลดข้อมูล…" }: { label?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center text-theme-sm text-gray-500 dark:text-gray-400" role="status">
      <span className="me-3 size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" aria-hidden />
      {label}
    </div>
  );
}
