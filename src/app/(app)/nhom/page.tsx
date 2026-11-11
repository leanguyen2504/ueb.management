import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { CreateGroupForm } from './GroupForms';
import { GroupTable } from './GroupTable';
import { KIND_LABEL, groupTypeLabel, type Group } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';
import { requestJoin } from './actions';

type DirRow = { id: string; name: string; description: string | null; kind: string; unit_category: string | null; parent_id: string | null; parent_name: string | null; member_count: number; open_tasks: number; is_member: boolean; can_view: boolean };

export const metadata: Metadata = { title: 'Dự án' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ luu_tru?: string; loai?: string; tb?: string; loi?: string }> }) {
  const { luu_tru, loai = '', tb, loi } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  let query = supabase.from('groups').select('*').order('name');
  query = luu_tru ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (loai && loai in KIND_LABEL) query = query.eq('kind', loai);
  const [{ data: groups }, { data: mine }, { data: counts }, { data: allNames }, { data: dir }, { data: myRequests }] = await Promise.all([
    query.returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager, is_clerk').eq('user_id', userId),
    supabase.from('group_members').select('group_id'),
    supabase.from('groups').select('id, name'),
    // Danh bạ: mọi nhóm đang hoạt động, kể cả nhóm mình chưa tham gia (chỉ tên, mô tả, đơn vị quản lý, số liệu).
    luu_tru ? Promise.resolve({ data: [] as DirRow[] }) : supabase.rpc('group_directory'),
    supabase.from('join_requests').select('group_id').eq('requester_id', userId).eq('status', 'pending').is('task_id', null),
  ]);
  const pending = new Set((myRequests ?? []).map((r) => r.group_id));
  const others = ((dir ?? []) as DirRow[]).filter((g) => !g.can_view && (!loai || g.kind === loai));
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
        {[['', 'Tất cả'], ...Object.entries(KIND_LABEL)].map(([k, label]) => (
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
        {ctx.can_create_group && !luu_tru && <CreateGroupForm units={((dir ?? []) as DirRow[]).filter((g) => g.kind === 'unit').map((g) => ({ id: g.id, name: g.name }))} />}
        {groups?.length ? (
          <GroupTable rows={groups.map((g) => ({
            id: g.id,
            name: g.name,
            parent: (g.parent_id && parentName.get(g.parent_id)) || '',
            kind: g.kind === 'unit' && g.unit_category ? `unit:${g.unit_category}` : g.kind,
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
