import type { Metadata } from 'next';
import { groupDirectory } from '@/lib/directory';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { CreateGroupForm } from './GroupForms';
import { PersonalProjectForm } from '@/components/WorkForms';
import { GroupTable } from './GroupTable';
import { KIND_LABEL, groupTypeLabel, type Group, type Task } from '@/lib/types';
import { TaskList } from '@/components/TaskList';
import { fmtDateTime } from '@/lib/format';
import { requestJoin } from './actions';

type DirRow = { id: string; name: string; description: string | null; kind: string; unit_category: string | null; parent_id: string | null; parent_name: string | null; member_count: number; open_tasks: number; is_member: boolean; can_view: boolean };

export const metadata: Metadata = { title: 'Dự án' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ luu_tru?: string; loai?: string; tb?: string; loi?: string }> }) {
  const { luu_tru, loai = '', tb, loi } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  let query = supabase.from('groups').select('*').order('name');
  query = luu_tru ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  // Thẻ Cá nhân: mục Cá nhân và các dự án cá nhân của tôi (chỉ tôi thấy). Thẻ theo loại không lẫn mục cá nhân.
  if (loai === 'ca-nhan') {
    await supabase.rpc('my_personal_group');
    query = query.eq('owner_id', userId);
  } else if (loai && loai in KIND_LABEL) query = query.eq('kind', loai).is('owner_id', null);
  const [{ data: groups }, { data: mine }, { data: counts }, { data: allNames }, { data: dir }, { data: myRequests }] = await Promise.all([
    query.returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager, is_clerk').eq('user_id', userId),
    supabase.from('group_members').select('group_id'),
    supabase.from('groups').select('id, name'),
    // Danh bạ: mọi nhóm đang hoạt động, kể cả nhóm mình chưa tham gia (chỉ tên, mô tả, đơn vị quản lý, số liệu).
    luu_tru ? Promise.resolve({ data: [] as DirRow[] }) : groupDirectory(supabase),
    supabase.from('join_requests').select('group_id').eq('requester_id', userId).eq('status', 'pending').is('task_id', null),
  ]);
  // Thẻ Cá nhân: hiện luôn mọi việc chưa xong trong mục Cá nhân.
  const personalIds = loai === 'ca-nhan' ? (groups ?? []).map((g) => g.id) : [];
  const { data: personalTasks } = personalIds.length
    ? await supabase.from('tasks').select('*').in('group_id', personalIds).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(500).returns<Task[]>()
    : { data: [] as Task[] };
  const pending = new Set((myRequests ?? []).map((r) => r.group_id));
  const others = loai === 'ca-nhan' ? [] : ((dir ?? []) as DirRow[]).filter((g) => !g.can_view && (!loai || g.kind === loai));
  const { data: taskRows } = await supabase.from('tasks').select('group_id').neq('status', 'done');
  const openTasks = new Map<string, number>();
  (taskRows ?? []).forEach((t) => openTasks.set(t.group_id, (openTasks.get(t.group_id) ?? 0) + 1));
  const role = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager ? 'Trưởng nhóm' : m.is_clerk ? 'Văn thư' : 'Thành viên']));
  const parentName = new Map((allNames ?? []).map((g) => [g.id, g.name]));
  const memberCount = new Map<string, number>();
  (counts ?? []).forEach((c) => memberCount.set(c.group_id, (memberCount.get(c.group_id) ?? 0) + 1));

  return (
    <>
      <PageHead title="Dự án" sub="Nhóm bạn tham gia ở trên; các đơn vị và dự án khác ở dưới để xin tham gia." />
      {tb && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{tb}</p>}
      {loi && <p role="alert" className="mb-4 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">{loi}</p>}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <nav className="seg" aria-label="Lọc theo loại">
        {[['', 'Tất cả'], ...Object.entries(KIND_LABEL), ['ca-nhan', 'Cá nhân']].map(([k, label]) => (
          <Link key={k} href={`/nhom?${new URLSearchParams({ ...(k ? { loai: k } : {}), ...(luu_tru ? { luu_tru } : {}) })}`}
            aria-current={loai === k ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/nhom?${new URLSearchParams({ ...(loai ? { loai } : {}), ...(luu_tru ? {} : { luu_tru: '1' }) })}`} className="link">
          {luu_tru ? 'Quay lại nhóm đang hoạt động' : 'Xem nhóm đã lưu trữ'}
        </Link>
        {luu_tru && <span className="muted">Đang xem nhóm đã lưu trữ.</span>}
      </div>
      </div>
      <div className="space-y-4">
        {loai === 'ca-nhan' && !luu_tru && (
          <section className="card">
            <h2 className="mb-1 font-semibold">+ Tạo dự án cá nhân</h2>
            <p className="mb-3 text-sm muted">Mọi việc và lịch trong mục Cá nhân chỉ bạn thấy. Xem tiến độ ở <Link href="/viec?xem=tien-do" className="link">Việc › Tiến độ</Link>.</p>
            <PersonalProjectForm />
          </section>
        )}
        {ctx.can_create_group && !luu_tru && loai !== 'ca-nhan' && <CreateGroupForm units={((dir ?? []) as DirRow[]).filter((g) => g.kind === 'unit').map((g) => ({ id: g.id, name: g.name }))} />}
        {groups?.length ? (
          <GroupTable rows={groups.map((g) => ({
            id: g.id,
            name: g.name,
            parent: (g.parent_id && parentName.get(g.parent_id)) || '',
            kind: g.owner_id ? 'ca-nhan' : g.kind === 'unit' && g.unit_category ? `unit:${g.unit_category}` : g.kind,
            kindLabel: groupTypeLabel(g),
            openTasks: openTasks.get(g.id) ?? 0,
            members: memberCount.get(g.id) ?? 0,
            role: role.get(g.id) ?? '',
            updatedAt: g.updated_at,
            updatedLabel: fmtDateTime(g.updated_at),
          }))} />
        ) : (
          <p className="card text-sm muted">{luu_tru ? 'Chưa có nhóm nào đã lưu trữ.' : 'Bạn chưa tham gia nhóm nào. Chọn một đơn vị hoặc dự án bên dưới để xin tham gia.'}</p>
        )}
        {loai === 'ca-nhan' && (
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Việc cá nhân chưa xong <span className="chip ml-1 align-middle">{personalTasks?.length ?? 0}</span></h2>
            <TaskList tasks={personalTasks ?? []} name={() => 'Bạn'} groupName={(gid) => { const g = (groups ?? []).find((x) => x.id === gid); return g ? (g.parent_id ? `Cá nhân › ${g.name}` : 'Cá nhân') : 'Cá nhân'; }} showProgress me={userId} empty="Chưa có việc cá nhân nào. Tạo nhanh ở trang Việc." />
          </section>
        )}
        {others.length > 0 && (
          <section className="card" aria-labelledby="nhom-khac">
            <h2 id="nhom-khac" className="text-lg font-semibold">Đơn vị và dự án khác <span className="chip ml-1 align-middle">{others.length}</span></h2>
            <p className="mb-3 text-sm muted">Bấm vào tên để xem lãnh đạo, đầu mối liên hệ và các việc đang cần người. Tài liệu bên trong chỉ thành viên mới xem được.</p>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {others.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/nhom/${g.id}`} className="font-semibold hover:text-brand-600 dark:hover:text-brand-300">{g.name}</Link>
                    <div className="text-xs muted">
                      {groupTypeLabel(g)}
                      {g.parent_id && <> · thuộc <Link href={`/nhom/${g.parent_id}`} className="link">{g.parent_name}</Link></>}
                      {` · ${g.member_count} thành viên · ${g.open_tasks} việc đang mở`}
                    </div>
                    {g.description && <p className="truncate text-xs muted">{g.description}</p>}
                  </div>
                  {pending.has(g.id) ? <span className="chip">Đã xin, chờ duyệt</span> : (
                    <form action={requestJoin}>
                      <input type="hidden" name="group_id" value={g.id} />
                      <input type="hidden" name="back" value="/nhom" />
                      <button className="btn-secondary px-3 py-1 text-xs">Xin tham gia</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
