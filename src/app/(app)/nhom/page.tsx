import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { CreateGroupForm } from './GroupForms';
import { KIND_LABEL, type Group } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Khám phá dự án' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ q?: string; luu_tru?: string; loai?: string }> }) {
  const { q = '', luu_tru, loai = '' } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  let query = supabase.from('groups').select('*').order('name');
  query = luu_tru ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (loai && loai in KIND_LABEL) query = query.eq('kind', loai);
  if (q.trim()) query = query.ilike('name', `%${q.trim().replace(/[%_]/g, '')}%`);
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
          <Link key={k} href={`/nhom?${new URLSearchParams({ ...(k ? { loai: k } : {}), ...(q ? { q } : {}), ...(luu_tru ? { luu_tru } : {}) })}`}
            aria-current={loai === k ? 'page' : undefined} className={loai === k ? 'btn px-3 py-1' : 'btn-secondary px-3 py-1'}>{label}</Link>
        ))}
      </nav>
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {loai && <input type="hidden" name="loai" value={loai} />}
        <input name="q" defaultValue={q} placeholder="Tìm theo tên" className="input max-w-xs" aria-label="Tìm theo tên" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="luu_tru" value="1" defaultChecked={Boolean(luu_tru)} /> Nhóm đã lưu trữ</label>
        <button className="btn-secondary">Lọc</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-x-auto p-0">
          {groups?.length ? (
            <table className="table">
              <thead><tr><th>Tên</th><th>Loại</th><th>Việc đang mở</th><th>Thành viên</th><th>Vai trò của tôi</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <Link href={`/nhom/${g.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-100">{g.name}</Link>
                      {g.parent_id && parentName.get(g.parent_id) && <div className="text-xs muted">{parentName.get(g.parent_id)}</div>}
                    </td>
                    <td>{KIND_LABEL[g.kind]}</td>
                    <td>{openTasks.get(g.id) ?? 0}</td>
                    <td>{memberCount.get(g.id) ?? 0}</td>
                    <td>{role.get(g.id) ?? <span className="muted">Xem theo phạm vi</span>}</td>
                    <td className="whitespace-nowrap muted">{fmtDateTime(g.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm muted">{q ? 'Không tìm thấy nhóm phù hợp.' : 'Chưa có nhóm nào bạn được xem.'}</p>
          )}
        </section>
        {ctx.can_create_group && <CreateGroupForm />}
      </div>
    </>
  );
}
