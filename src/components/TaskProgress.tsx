import { vnDay } from '@/lib/format';
import { nudgeOverdue } from '@/lib/work';
import type { Task } from '@/lib/types';

export function progressOf(tasks: Pick<Task, 'status' | 'due_date'>[]) {
  const today = vnDay();
  const done = tasks.filter((t) => t.status === 'done').length;
  const doing = tasks.filter((t) => t.status === 'doing' || t.status === 'review').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < today).length;
  return { total: tasks.length, done, doing, todo, overdue, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

export function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 ${className}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

// Tiến độ của nhóm: tổng quan và theo từng người được giao.
export function TaskProgress({ tasks, name, groupId, canNudge }: { tasks: Task[]; name: (id: string | null) => string; groupId: string; canNudge: boolean }) {
  if (!tasks.length) return null;
  const p = progressOf(tasks);
  const today = vnDay();
  const byPerson = new Map<string, Task[]>();
  tasks.forEach((t) => {
    const k = t.assignee_id ?? '';
    byPerson.set(k, [...(byPerson.get(k) ?? []), t]);
  });
  const rows = [...byPerson.entries()]
    .map(([uid, list]) => ({ uid, ...progressOf(list) }))
    .sort((a, b) => b.overdue - a.overdue || (b.total - b.done) - (a.total - a.done));
  const stat = (label: string, n: number, cls = '') => (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
      <div className={`text-xl font-semibold ${cls}`}>{n}</div>
      <div className="text-xs muted">{label}</div>
    </div>
  );
  return (
    <section className="card mb-4" aria-labelledby="tien-do-h">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tien-do-h" className="font-semibold">Tiến độ: {p.done}/{p.total} việc xong ({p.pct}%)</h2>
        {canNudge && p.overdue > 0 && (
          <form action={nudgeOverdue}>
            <input type="hidden" name="group_id" value={groupId} />
            <button className="btn-secondary border-orange-300 px-3 py-1 text-sm text-orange-700 dark:border-orange-700 dark:text-orange-300">Đôn đốc {p.overdue} việc quá hạn</button>
          </form>
        )}
      </div>
      <ProgressBar pct={p.pct} className="mb-3" />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stat('Chưa làm', p.todo)}
        {stat('Đang làm / chờ duyệt', p.doing, 'text-sky-600 dark:text-sky-400')}
        {stat('Đã xong', p.done, 'text-emerald-600 dark:text-emerald-400')}
        {stat('Quá hạn', p.overdue, p.overdue ? 'text-orange-600 dark:text-orange-400' : '')}
      </div>
      <details open={rows.length <= 8}>
        <summary className="cursor-pointer text-sm font-medium">Theo từng người</summary>
        <table className="table mt-2">
          <thead><tr><th>Người làm</th><th>Xong</th><th>Còn lại</th><th>Quá hạn</th><th className="w-1/3">Tiến độ</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid || 'none'}>
                <td>{r.uid ? name(r.uid) : <span className="muted">Chưa giao</span>}</td>
                <td>{r.done}</td>
                <td>{r.total - r.done}</td>
                <td className={r.overdue ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}>{r.overdue}</td>
                <td><ProgressBar pct={r.pct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p className="mt-2 text-xs muted">Tính đến hôm nay {today.split('-').reverse().join('/')}.</p>
    </section>
  );
}
