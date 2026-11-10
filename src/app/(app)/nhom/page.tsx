import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { CreateGroupForm } from './GroupForms';
import { GroupTable } from './GroupTable';
import { KIND_LABEL, type Group } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Khám phá dự án' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ luu_tru?: string; loai?: string }> }) {
  const { luu_tru, loai = '' } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  let query = supabase.from('groups').select('*').order('name');
  query = luu_tru ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (loai && loai in KIND_LABEL) query = query.eq('kind', loai);
  const [{ data: groups }, { data: mine }, { data: counts }, { data: allNames }] = await Promise.all([
    query.returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager, is_clerk').eq('user_id', userId),
    supabase.from('group_members').select('group_id'),
    supabase.from('groups').select('id, name'),
  ]);
  const { data: taskRows } = await supabase.from('tasks').select('group_id').neq('status', 'done');
  const openTasks = new Map<string, number>();
  (taskRows ?? []).forEach((t) => openTasks.set(t.group_id, (openTasks.get(t.group_id) ?? 0) + 1));
  const role = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager ? 'Trưởng nhóm' : m.is_clerk ? 'Văn thư' : 'Thành viên']));
  const parentName = new Map((allNames ?? []).map((g) => [g.id, g.name]));
  const memberCount = new Map<string, number>();
  (counts ?? []).forEach((c) => memberCount.set(c.group_id, (memberCount.get(c.group_id) ?? 0) + 1));

  return (
    <>
      <PageHead title="Khám phá dự án" sub="Đơn vị, dự án và sự kiện bạn xem được. Mở từng mục để xem đầu việc, lịch và thành viên." />
      <nav className="mb-3 flex flex-wrap gap-2" aria-label="Lọc theo loại">
        {[['', 'Tất cả'], ...Object.entries(KIND_LABEL)].map(([k, label]) => (
          <Link key={k} href={`/nhom?${new URLSearchParams({ ...(k ? { loai: k } : {}), ...(luu_tru ? { luu_tru } : {}) })}`}
            aria-current={loai === k ? 'page' : undefined} className={loai === k ? 'btn px-3 py-1' : 'btn-secondary px-3 py-1'}>{label}</Link>
        ))}
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/nhom?${new URLSearchParams({ ...(loai ? { loai } : {}), ...(luu_tru ? {} : { luu_tru: '1' }) })}`} className="btn-secondary px-3 py-1">
          {luu_tru ? 'Quay lại nhóm đang hoạt động' : 'Xem nhóm đã lưu trữ'}
        </Link>
        {luu_tru && <span className="muted">Đang xem nhóm đã lưu trữ.</span>}
      </div>
      <div className="space-y-4">
        {ctx.can_create_group && !luu_tru && <CreateGroupForm />}
        {groups?.length ? (
          <GroupTable rows={groups.map((g) => ({
            id: g.id,
            name: g.name,
            parent: (g.parent_id && parentName.get(g.parent_id)) || '',
            kind: g.kind,
            kindLabel: KIND_LABEL[g.kind],
            openTasks: openTasks.get(g.id) ?? 0,
            members: memberCount.get(g.id) ?? 0,
            role: role.get(g.id) ?? '',
            updatedAt: g.updated_at,
            updatedLabel: fmtDateTime(g.updated_at),
          }))} />
        ) : (
          <p className="card text-sm muted">{luu_tru ? 'Chưa có nhóm nào đã lưu trữ.' : 'Chưa có nhóm nào bạn được xem.'}</p>
        )}
      </div>
    </>
  );
}
