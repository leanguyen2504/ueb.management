import Link from 'next/link';
import { deleteTask, setTaskStatus } from '@/lib/work';
import { fmtDate, vnDay } from '@/lib/format';
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task } from '@/lib/types';

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  low: '',
  normal: '',
  high: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
  urgent: 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
};

// Danh sách việc; nút đổi trạng thái chỉ là giao diện, cơ sở dữ liệu kiểm tra quyền.
export function TaskList({
  tasks,
  name,
  groupName,
  canDelete = false,
  empty = 'Chưa có việc nào.',
}: {
  tasks: Task[];
  name: (id: string | null) => string;
  groupName?: (id: string) => string;
  canDelete?: boolean;
  empty?: string;
}) {
  if (!tasks.length) return <p className="text-sm muted">{empty}</p>;
  const today = vnDay();
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {tasks.map((t) => {
        const overdue = t.due_date && t.status !== 'done' && t.due_date < today;
        return (
          <li key={t.id} className="flex flex-wrap items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${t.status === 'done' ? 'line-through muted' : ''}`}>{t.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs muted">
                {groupName && <Link href={`/nhom/${t.group_id}`} className="hover:underline">{groupName(t.group_id)}</Link>}
                {t.assignee_id ? <span>Người làm: {name(t.assignee_id)}</span> : <span>Chưa giao</span>}
                {t.due_date && <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>Hạn {fmtDate(t.due_date)}{overdue ? ' (quá hạn)' : ''}</span>}
                {t.priority !== 'normal' && <span className={`chip ${PRIORITY_CLASS[t.priority]}`}>{TASK_PRIORITY_LABEL[t.priority]}</span>}
              </div>
              {t.description && <p className="mt-1 text-sm">{t.description}</p>}
            </div>
            <form action={setTaskStatus} className="flex items-center gap-1">
              <input type="hidden" name="id" value={t.id} />
              <select name="status" defaultValue={t.status} className="input w-auto py-1 text-xs" aria-label="Trạng thái">
                {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn-secondary px-2 py-1 text-xs">Lưu</button>
            </form>
            {canDelete && (
              <form action={deleteTask}>
                <input type="hidden" name="id" value={t.id} />
                <button className="px-2 py-1 text-xs text-red-600 hover:underline dark:text-red-400">Xóa</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
