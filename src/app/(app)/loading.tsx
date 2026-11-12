// Khung chờ hiện ngay khi bấm chuyển trang, trong lúc máy chủ đọc dữ liệu.
// Thanh điều hướng và đầu trang vẫn giữ nguyên, nên người dùng thấy web phản hồi tức thì.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-5">
      <span className="sr-only">Đang tải…</span>
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-200/70 dark:bg-slate-800/70" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card space-y-3">
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-8 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="card space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-5 rounded bg-slate-200/80 dark:bg-slate-800/80" style={{ width: `${90 - i * 9}%` }} />
        ))}
      </div>
    </div>
  );
}
