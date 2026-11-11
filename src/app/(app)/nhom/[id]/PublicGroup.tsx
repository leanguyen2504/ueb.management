import Link from 'next/link';
import { groupTypeLabel } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { Avatar } from '@/components/Avatar';
import { cancelJoin, requestJoin } from '../actions';

export type DirGroup = { id: string; name: string; description: string | null; kind: string; unit_category?: string | null; parent_id: string | null; parent_name: string | null; member_count: number; open_tasks: number };
type Contact = { user_id: string; full_name: string; email: string; position: string | null; phone: string | null; office: string | null; role: string };
type OpenTask = { id: string; title: string; due_date: string | null; has_assignee: boolean };
type MyRequest = { id: string; task_id: string | null; created_at: string };

// Trang của nhóm với người chưa tham gia: chỉ thông tin chung, lãnh đạo, đầu mối liên hệ
// và tên các việc đang mở. Tài liệu, mô tả việc, lịch, thành viên khác vẫn được RLS giữ kín.
export function PublicGroup({ group, contacts, tasks, requests, units = [], projects = [], tb, loi }: { group: DirGroup; contacts: Contact[]; tasks: OpenTask[]; requests: MyRequest[]; units?: DirGroup[]; projects?: (DirGroup & { can_view: boolean })[]; tb?: string; loi?: string }) {
  const back = `/nhom/${group.id}`;
  const groupReq = requests.find((r) => !r.task_id);
  const taskReq = new Map(requests.filter((r) => r.task_id).map((r) => [r.task_id!, r]));
  const leaders = contacts.filter((c) => c.role === 'Trưởng nhóm');
  const clerks = contacts.filter((c) => c.role !== 'Trưởng nhóm');

  const Cancel = ({ id }: { id: string }) => (
    <form action={cancelJoin}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="group_id" value={group.id} />
      <button className="text-xs muted hover:underline">Hủy yêu cầu</button>
    </form>
  );
  const People = ({ list, empty }: { list: Contact[]; empty: string }) =>
    list.length ? (
      <ul className="space-y-3">
        {list.map((c) => (
          <li key={c.user_id} className="flex items-start gap-3">
            <Avatar name={c.full_name || c.email} size={36} />
            <div className="min-w-0 text-sm">
              <Link href={`/nguoi/${c.user_id}`} className="font-semibold hover:underline">{c.full_name || c.email}</Link>
              {c.position && <div className="muted">{c.position}</div>}
              <div className="text-xs muted">
                <a href={`mailto:${c.email}`} className="link">{c.email}</a>
                {c.phone && <> · <a href={`tel:${c.phone}`} className="link">{c.phone}</a></>}
                {c.office && <> · {c.office}</>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    ) : <p className="text-sm muted">{empty}</p>;

  return (
    <>
      <div className="mb-5">
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm muted" aria-label="Vị trí">
          <Link href="/nhom" className="link">Dự án</Link>
          {group.parent_id && <><span>›</span><Link href={`/nhom/${group.parent_id}`} className="link">{group.parent_name}</Link></>}
        </nav>
        <h1 className="text-2xl font-semibold md:text-[28px] md:leading-tight">{group.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <span className="chip bg-gold-50 text-gold-600 dark:bg-gold-600/15 dark:text-gold-500">{groupTypeLabel(group)}</span>
          <span className="muted">{group.member_count} thành viên · {group.open_tasks} việc đang mở</span>
          {units.length > 0 && <span className="muted">· Cùng làm:</span>}
          {units.map((u) => <Link key={u.id} href={`/nhom/${u.id}`} className="chip hover:text-brand-600 dark:hover:text-brand-300">{u.name}</Link>)}
        </div>
        {group.description && <p className="mt-2 max-w-3xl text-sm muted">{group.description}</p>}
      </div>
      {tb && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{tb}</p>}
      {loi && <p role="alert" className="mb-4 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">{loi}</p>}

      <section className="card mb-5 flex flex-wrap items-center gap-3 border-gold-500/40 bg-gold-50/60 dark:bg-gold-600/10">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Bạn chưa tham gia {group.name}.</p>
          <p className="muted">Bạn xem được lãnh đạo, đầu mối liên hệ và tên các việc. Tài liệu và chi tiết bên trong chỉ thành viên mới xem được.</p>
        </div>
        {groupReq ? (
          <div className="flex items-center gap-3"><span className="chip">Đã xin tham gia, chờ duyệt</span><Cancel id={groupReq.id} /></div>
        ) : (
          <details className="w-full sm:w-auto">
            <summary className="btn cursor-pointer list-none">Xin tham gia nhóm</summary>
            <JoinForm groupId={group.id} back={back} />
          </details>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card">
          <h2 className="mb-1 text-lg font-semibold">Việc đang mở ({tasks.length})</h2>
          <p className="mb-3 text-sm muted">Muốn góp sức cho việc nào thì bấm “Xin tham gia việc này”. Khi được duyệt, bạn được thêm vào nhóm{tasks.some((t) => !t.has_assignee) ? ' và nhận luôn việc chưa có người phụ trách' : ''}.</p>
          {tasks.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {tasks.map((t) => {
                const r = taskReq.get(t.id);
                return (
                  <li key={t.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs muted">{t.due_date ? `Hạn ${fmtDate(t.due_date)}` : 'Chưa đặt hạn'} · {t.has_assignee ? 'Đã có người phụ trách' : 'Đang cần người'}</div>
                      </div>
                      {r ? (
                        <div className="flex items-center gap-3"><span className="chip">Chờ duyệt</span><Cancel id={r.id} /></div>
                      ) : (
                        <details className="w-full sm:w-auto">
                          <summary className="btn-secondary cursor-pointer list-none px-3 py-1 text-xs">Xin tham gia việc này</summary>
                          <JoinForm groupId={group.id} taskId={t.id} back={back} />
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm muted">Nhóm chưa có việc đang mở.</p>}
        </section>
        <div className="space-y-5">
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Lãnh đạo</h2>
            <People list={leaders} empty="Chưa có Trưởng nhóm." />
          </section>
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Đầu mối liên hệ</h2>
            <People list={clerks} empty={leaders.length ? 'Chưa có Văn thư. Liên hệ trực tiếp Trưởng nhóm.' : 'Chưa có đầu mối liên hệ.'} />
          </section>
          {projects.length > 0 && (
            <section className="card">
              <h2 className="mb-3 text-lg font-semibold">Dự án liên đơn vị</h2>
              <ul className="space-y-2 text-sm">
                {projects.map((p) => (
                  <li key={p.id}><Link href={`/nhom/${p.id}`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">{p.name}</Link> <span className="text-xs muted">· {p.open_tasks} việc đang mở{p.can_view ? '' : ' · chưa tham gia'}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function JoinForm({ groupId, taskId, back }: { groupId: string; taskId?: string; back: string }) {
  return (
    <form action={requestJoin} className="mt-2 space-y-2 sm:w-80">
      <input type="hidden" name="group_id" value={groupId} />
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      <input type="hidden" name="back" value={back} />
      <label className="label" htmlFor={`msg-${taskId ?? groupId}`}>Lời nhắn (không bắt buộc)</label>
      <textarea id={`msg-${taskId ?? groupId}`} name="message" maxLength={500} rows={2} className="input" placeholder="Bạn có thể giúp gì, có kinh nghiệm gì…" />
      <button className="btn">Gửi yêu cầu</button>
    </form>
  );
}
