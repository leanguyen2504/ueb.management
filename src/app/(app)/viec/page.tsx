import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { TaskList } from '@/components/TaskList';
import { TaskForm } from '@/components/WorkForms';
import { loadPeople } from '@/lib/people';
import { TASK_STATUS_LABEL, type Group, type Task, type TaskStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Việc của tôi' };

const TABS = [
  ['', 'Tôi thực hiện'],
  ['da-giao', 'Tôi đã giao'],
  ['xong', 'Đã hoàn thành'],
] as const;

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ xem?: string }> }) {
  const { xem = '' } = await searchParams;
  const { supabase, userId } = await requireSession();

  let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('updated_at', { ascending: false }).limit(300);
  if (xem === 'da-giao') q = q.eq('created_by', userId).neq('status', 'done');
  else if (xem === 'xong') q = q.or(`assignee_id.eq.${userId},created_by.eq.${userId}`).eq('status', 'done');
  else q = q.eq('assignee_id', userId).neq('status', 'done');

  const [{ data: tasks }, { data: groups }, { data: mine }] = await Promise.all([
    q.returns<Task[]>(),
    supabase.from('groups').select('id, name, parent_id').is('archived_at', null).order('name').returns<Pick<Group, 'id' | 'name' | 'parent_id'>[]>(),
    supabase.from('group_members').select('group_id, can_create').eq('user_id', userId),
  ]);
  const list = tasks ?? [];
  const groupMap = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const { name } = await loadPeople(supabase, list.map((t) => t.assignee_id));
  // Nhóm tôi được tạo việc (chỉ để gợi ý; RLS kiểm tra lại).
  const creatable = new Set((mine ?? []).filter((m) => m.can_create).map((m) => m.group_id));
  const groupOptions = (groups ?? []).filter((g) => creatable.has(g.id)).map((g) => ({ id: g.id, label: g.name }));

  const byStatus = (s: TaskStatus) => list.filter((t) => t.status === s);
  const counts = (['todo', 'doing', 'review'] as TaskStatus[]).map((s) => [s, byStatus(s).length] as const);

  return (
    <>
      <PageHead title="Việc" sub="Việc được giao cho bạn và việc bạn giao cho người khác, trong các nhóm bạn tham gia." />
      <nav className="seg mb-5" aria-label="Lọc việc">
        {TABS.map(([k, label]) => (
          <a key={k} href={k ? `/viec?xem=${k}` : '/viec'} aria-current={xem === k ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      {xem !== 'xong' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {counts.map(([s, n]) => (
            <span key={s} className="chip px-3 py-1 text-sm">{TASK_STATUS_LABEL[s]}: <b className="tabular-nums">{n}</b></span>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="card">
          <TaskList
            tasks={list}
            name={name}
            groupName={(id) => groupMap.get(id) ?? 'Nhóm'}
            empty={xem === 'da-giao' ? 'Bạn chưa giao việc nào đang mở.' : xem === 'xong' ? 'Chưa có việc hoàn thành.' : 'Bạn không có việc nào đang mở.'}
          />
        </section>
        {groupOptions.length > 0 && (
          <section id="tao-viec" className="card scroll-mt-20">
            <h2 className="mb-3 text-lg font-semibold">Tạo việc nhanh</h2>
            <TaskForm groups={groupOptions} />
            <p className="mt-2 text-xs muted">Để giao cho người khác, tạo việc trong trang của nhóm.</p>
          </section>
        )}
      </div>
    </>
  );
}
