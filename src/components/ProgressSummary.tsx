import { ProgressBar } from '@/components/TaskProgress';
import type { sumProgress } from '@/lib/progress';

// Ô số liệu tiến độ: tổng việc, chưa làm, đang làm, đã xong, quá hạn. Không có tên việc.
export function ProgressTiles({ p }: { p: ReturnType<typeof sumProgress> }) {
  const stat = (label: string, n: number, cls = '') => (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
      <div className={`text-xl font-semibold tabular-nums ${cls}`}>{n}</div>
      <div className="text-xs muted">{label}</div>
    </div>
  );
  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{p.done}/{p.total} việc xong ({p.pct}%)</span>
      </div>
      <ProgressBar pct={p.pct} className="mb-3" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Chưa làm', p.todo)}
        {stat('Đang làm / chờ duyệt', p.doing, 'text-sky-600 dark:text-sky-400')}
        {stat('Đã xong', p.done, 'text-emerald-600 dark:text-emerald-400')}
        {stat('Quá hạn', p.overdue, p.overdue ? 'text-orange-600 dark:text-orange-400' : '')}
      </div>
    </>
  );
}
