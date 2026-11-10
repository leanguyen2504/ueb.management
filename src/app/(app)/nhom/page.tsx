import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { CreateGroupForm } from './GroupForms';
import { KIND_LABEL, type Group } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Nhóm' };

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ q?: string; luu_tru?: string }> }) {
  const { q = '', luu_tru } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  let query = supabase.from('groups').select('*').order('name');
  query = luu_tru ? query.not('archived_at', 'is', null) : query.is('archived_at', null);
  if (q.trim()) query = query.ilike('name', `%${q.trim().replace(/[%_]/g, '')}%`);
  const [{ data: groups }, { data: mine }, { data: counts }] = await Promise.all([
    query.returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager').eq('user_id', userId),
    supabase.from('group_members').select('group_id'),
  ]);
  const role = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager ? 'Quản lý' : 'Thành viên']));
  const memberCount = new Map<string, number>();
  (counts ?? []).forEach((c) => memberCount.set(c.group_id, (memberCount.get(c.group_id) ?? 0) + 1));

  return (
    <>
      <PageHead title="Nhóm" sub="Nhóm có thể là đơn vị, dự án hoặc sự kiện. Quyền xem, tạo, sửa và tải tài liệu được cấu hình riêng cho từng nhóm." />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Tìm theo tên nhóm" className="input max-w-xs" aria-label="Tìm theo tên nhóm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="luu_tru" value="1" defaultChecked={Boolean(luu_tru)} /> Nhóm đã lưu trữ</label>
        <button className="btn-secondary">Lọc</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-x-auto p-0">
          {groups?.length ? (
            <table className="table">
              <thead><tr><th>Tên nhóm</th><th>Loại</th><th>Thành viên</th><th>Vai trò của tôi</th><th>Cập nhật</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td><Link href={`/nhom/${g.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-100">{g.name}</Link></td>
                    <td>{KIND_LABEL[g.kind]}</td>
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
