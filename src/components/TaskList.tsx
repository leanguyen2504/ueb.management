import Link from 'next/link';
import { addTaskLink, deleteTask, deleteTaskLink, nudgeTask, setTaskStatus } from '@/lib/work';
import { fmtDate, vnDay } from '@/lib/format';
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task, type TaskLink } from '@/lib/types';

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  low: '',
  normal: '',
  high: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
  urgent: 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300',
};

// Danh sách việc; nút đổi trạng thái chỉ là giao diện, cơ sở dữ liệu kiểm tra quyền.
export function TaskList({
  tasks,
  name,
  groupName,
  canDelete = false,
  empty = 'Chưa có việc nào.',
  links,
  canNudge = false,
  canAttach = false,
  me,
}: {
  tasks: Task[];
  name: (id: string | null) => string;
  groupName?: (id: string) => string;
  canDelete?: boolean;
  empty?: string;
  /** Sản phẩm (link Drive) theo việc; có thì hiện phần sản phẩm. */
  links?: Map<string, TaskLink[]>;
  canNudge?: boolean;
  /** Có quyền gắn sản phẩm cho mọi việc trong nhóm (người được giao luôn gắn được). */
  canAttach?: boolean;
  me?: string;
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
                {t.due_date && <span className={overdue ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}>Hạn {fmtDate(t.due_date)}{overdue ? ' (quá hạn)' : ''}</span>}
                {t.priority !== 'normal' && <span className={`chip ${PRIORITY_CLASS[t.priority]}`}>{TASK_PRIORITY_LABEL[t.priority]}</span>}
              </div>
              {t.description && <p className="mt-1 text-sm">{t.description}</p>}
              {links && <TaskLinks task={t} links={links.get(t.id) ?? []} canAttach={canAttach || t.assignee_id === me} me={me} />}
            </div>
            {canNudge && t.assignee_id && t.status !== 'done' && t.assignee_id !== me && (
              <form action={nudgeTask}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="group_id" value={t.group_id} />
                <button className={`btn-secondary px-2 py-1 text-xs ${overdue ? 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300' : ''}`} title="Gửi thông báo nhắc người được giao">Đôn đốc</button>
              </form>
            )}
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
                <button className="px-2 py-1 text-xs text-orange-600 hover:underline dark:text-orange-400">Xóa</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TaskLinks({ task, links, canAttach, me }: { task: Task; links: TaskLink[]; canAttach: boolean; me?: string }) {
  if (!links.length && !canAttach) return null;
  return (
    <div className="mt-1.5 text-sm">
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((l) => (
            <li key={l.id} className="chip flex items-center gap-1">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-100">📎 {l.label || 'Sản phẩm'}</a>
              {(l.created_by === me || canAttach) && (
                <form action={deleteTaskLink}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="group_id" value={task.group_id} />
                  <button className="text-xs text-orange-600 dark:text-orange-400" aria-label="Gỡ sản phẩm">×</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAttach && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-brand-600 dark:text-brand-100">+ Gắn sản phẩm (link Drive)</summary>
          <form action={addTaskLink} className="mt-1 flex flex-wrap gap-2">
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="group_id" value={task.group_id} />
            <input name="url" type="url" required placeholder="https://drive.google.com/…" pattern="https://(drive|docs)\.google\.com/.*" className="input max-w-sm flex-1 py-1 text-xs" aria-label="Link Google Drive" />
            <input name="label" maxLength={200} placeholder="Tên (tùy chọn)" className="input w-40 py-1 text-xs" aria-label="Tên sản phẩm" />
            <button className="btn-secondary px-2 py-1 text-xs">Gắn</button>
          </form>
          <p className="mt-1 text-xs muted">Chỉ lưu đường link; quyền xem file vẫn do chia sẻ trên Google Drive quyết định.</p>
        </details>
      )}
    </div>
  );
}
