import Link from 'next/link';
import { TaskDropBox } from '@/components/TaskDropBox';
import { deleteOrRequestTask, deleteTask, deleteTaskLink, nudgeTask, setTaskStatus } from '@/lib/work';
import { ConfirmButton } from '@/components/ConfirmButton';
import { TaskEditButton, type Option } from '@/components/WorkForms';
import { fmtDate, vnDay } from '@/lib/format';
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, type Task, type TaskLink } from '@/lib/types';

const PRIORITY_CLASS: Record<Task['priority'], string> = {
  low: '',
  normal: '',
  high: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
  urgent: 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300',
};

// Mô tả nhập từ kế hoạch thường có "Người phụ trách: … · Phối hợp: …": tách ra để hiện
// thành "Bên phụ trách", "Bên phối hợp" cạnh hạn, phần còn lại giữ làm mô tả.
function splitRoles(description: string | null) {
  let lead = '';
  let support = '';
  const rest: string[] = [];
  for (const seg of (description ?? '').split(/\s+·\s+|\n+/)) {
    const m = seg.match(/^\s*(người phụ trách|bên phụ trách|phụ trách|phối hợp|bên phối hợp)\s*:\s*(.+?)\.?\s*$/iu);
    if (m && /phụ trách/i.test(m[1]) && !lead) lead = m[2];
    else if (m && /phối hợp/i.test(m[1]) && !support) support = m[2];
    else if (seg.trim()) rest.push(seg.trim());
  }
  return { lead, support, rest: rest.join(' · ') };
}

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
  showProgress = false,
  deleteState,
  back,
  canEdit,
  people,
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
  /** Hiện ô % tiến độ cạnh trạng thái (trang Việc). */
  showProgress?: boolean;
  /** Nút xóa trên từng dòng (trang Việc): xóa ngay, đề nghị Trưởng nhóm xóa, hoặc đang chờ duyệt. */
  deleteState?: (t: Task) => 'delete' | 'request' | 'pending' | null;
  /** Trang quay về sau khi xóa hoặc gửi đề nghị. */
  back?: string;
  /** Ai được sửa thông tin việc (quyền Sửa của nhóm); cơ sở dữ liệu kiểm tra lại. */
  canEdit?: boolean | ((t: Task) => boolean);
  /** Thành viên để đổi người thực hiện, theo từng việc; không có thì không hiện ô đó. */
  people?: Option[] | ((t: Task) => Option[] | undefined);
}) {
  if (!tasks.length) return <p className="text-sm muted">{empty}</p>;
  const today = vnDay();
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {tasks.map((t) => {
        const overdue = t.due_date && t.status !== 'done' && t.due_date < today;
        const roles = splitRoles(t.description);
        return (
          <li key={`${t.id}:${t.status}:${t.progress}`} className="flex flex-wrap items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className={`font-medium ${t.status === 'done' ? 'line-through muted' : ''}`}>{t.title}</div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs muted">
                {groupName && <Link href={`/nhom/${t.group_id}`} className="hover:underline">{groupName(t.group_id)}</Link>}
                {(roles.lead || t.assignee_id) && <span>Bên phụ trách: {roles.lead || name(t.assignee_id)}</span>}
                {roles.support && <span>Bên phối hợp: {roles.support}</span>}
                {t.start_date && <span>Bắt đầu {fmtDate(t.start_date)}</span>}
                {t.due_date && <span className={overdue ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}>Hạn {fmtDate(t.due_date)}{overdue ? ' (quá hạn)' : ''}</span>}
                {t.priority !== 'normal' && <span className={`chip ${PRIORITY_CLASS[t.priority]}`}>{TASK_PRIORITY_LABEL[t.priority]}</span>}
              </div>
              {t.progress != null && t.status !== 'done' && (
                <div className="mt-1.5 flex items-center gap-2 text-xs muted">
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-brand-600" style={{ width: `${t.progress}%` }} /></div>
                  <span className="tabular-nums">{t.progress}%</span>
                </div>
              )}
              {roles.rest && <p className="mt-1 text-sm">{roles.rest}</p>}
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
              {showProgress && (
                <input name="progress" type="number" min={0} max={100} step={5} defaultValue={t.progress ?? ''} placeholder="%" className="input w-16 py-1 text-xs" aria-label="Tiến độ (%)" />
              )}
              <select name="status" defaultValue={t.status} className="input w-auto py-1 text-xs" aria-label="Trạng thái">
                {Object.entries(TASK_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn-secondary px-2 py-1 text-xs">Lưu</button>
            </form>
            {(typeof canEdit === 'function' ? canEdit(t) : canEdit) && (
              <TaskEditButton task={t} people={typeof people === 'function' ? people(t) : people} />
            )}
            {deleteState && (() => {
              const st = deleteState(t);
              if (st === 'pending') return <span className="chip px-2 py-1 text-xs" title="Đã gửi đề nghị xóa, chờ Trưởng nhóm duyệt">Chờ duyệt xóa</span>;
              if (!st) return null;
              return (
                <form action={deleteOrRequestTask}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="group_id" value={t.group_id} />
                  {back && <input type="hidden" name="back" value={back} />}
                  <ConfirmButton
                    className="px-2 py-1 text-xs text-orange-600 hover:underline dark:text-orange-400"
                    title={st === 'delete' ? 'Xóa hẳn việc này' : 'Gửi Trưởng nhóm duyệt xóa việc này'}
                    message={st === 'delete' ? `Xóa hẳn việc “${t.title}”? Không hoàn tác được.` : `Gửi Trưởng nhóm đề nghị xóa việc “${t.title}”?`}
                  >
                    {st === 'delete' ? 'Xóa' : 'Đề nghị xóa'}
                  </ConfirmButton>
                </form>
              );
            })()}
            {!deleteState && canDelete && (
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
  const notes = links.filter((l) => l.body && !l.url && !l.file_path);
  const files = links.filter((l) => !notes.includes(l));
  return (
    <div className="mt-1.5 text-sm">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((l) => (
            <li key={l.id} className="chip flex items-center gap-1">
              <a href={l.url ?? `/viec/tep?p=${encodeURIComponent(l.file_path ?? '')}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-100">📎 {l.label || l.file_name || 'Sản phẩm'}</a>
              {l.file_path && <a href={`/viec/tep?p=${encodeURIComponent(l.file_path)}&tai=1`} className="text-xs muted hover:underline" title="Tải về">{l.file_size != null ? mb(l.file_size) : ''} ⤓</a>}
              {(l.created_by === me || canAttach) && <RemoveLink id={l.id} groupId={task.group_id} />}
            </li>
          ))}
        </ul>
      )}
      {notes.map((l) => (
        <div key={l.id} className="mt-1 flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
          <p className="flex-1 whitespace-pre-line">📝 {l.body}</p>
          {(l.created_by === me || canAttach) && <RemoveLink id={l.id} groupId={task.group_id} />}
        </div>
      ))}
      {canAttach && <TaskDropBox taskId={task.id} groupId={task.group_id} />}
    </div>
  );
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

function RemoveLink({ id, groupId }: { id: string; groupId: string }) {
  return (
    <form action={deleteTaskLink}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="group_id" value={groupId} />
      <button className="text-xs text-orange-600 dark:text-orange-400" aria-label="Gỡ sản phẩm">×</button>
    </form>
  );
}
