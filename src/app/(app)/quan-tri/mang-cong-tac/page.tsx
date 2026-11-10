import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { HopTabs, PageHead } from '@/components/PageHead';
import { loadAreas } from '@/lib/meetings';
import { AreaForm } from './AreaForm';
import { deleteArea } from './actions';

export const metadata: Metadata = { title: 'Mảng công tác và đầu mối' };

export default async function AreasPage() {
  const { supabase, ctx } = await requireSession();
  const canEdit = ctx.is_admin || ctx.role === 'principal' || ctx.role === 'secretary';
  if (!canEdit) redirect('/hop');
  const [areas, { data: groups }, { data: people }] = await Promise.all([
    loadAreas(supabase),
    supabase.from('groups').select('id, name').is('archived_at', null).order('name'),
    supabase.from('profiles').select('email, full_name').limit(2000),
  ]);
  const byEmail = new Map((people ?? []).map((p) => [String(p.email).toLowerCase(), (p.full_name || p.email) as string]));
  const who = (e: string) => (byEmail.has(e) ? `${byEmail.get(e)}` : `${e} (chưa đăng nhập)`);
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]));
  const gs = (groups ?? []).map((g) => ({ id: g.id as string, name: g.name as string }));

  return (
    <>
      <HopTabs current="mang" />
      <PageHead title="Mảng công tác và đầu mối" sub="Theo văn bản phân công: mỗi mảng có một đầu mối phụ trách chính và người phối hợp. Khi thêm bên gửi tài liệu trùng tên mảng, đầu mối của mảng đó tự thấy buổi họp trong mục &quot;Của tôi&quot;." />
      <div className="card mb-4">
        <h2 className="mb-3 font-semibold">Thêm mảng</h2>
        <AreaForm groups={gs} uid="new" />
      </div>
      <div className="card p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {areas.map((a) => (
            <li key={a.id} className="p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.name}{a.group_id && <span className="ml-2 text-xs muted">nhóm: {groupName.get(a.group_id)}</span>}</div>
                  <div className="text-sm">
                    {a.primary_email ? <>Đầu mối: {who(a.primary_email)}</> : <span className="muted">Chưa có đầu mối</span>}
                    {a.coordinator_emails.length > 0 && <> · Phối hợp: {a.coordinator_emails.map(who).join(', ')}</>}
                  </div>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-brand-600 dark:text-brand-300">Sửa</summary>
                  <div className="mt-2 w-[min(40rem,85vw)]"><AreaForm area={a} groups={gs} uid={`a-${a.id}`} /></div>
                </details>
                <form action={deleteArea}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-sm text-orange-600 hover:underline dark:text-orange-400">Xóa</button>
                </form>
              </div>
            </li>
          ))}
          {!areas.length && <li className="p-4 text-center muted">Chưa có mảng nào.</li>}
        </ul>
      </div>
    </>
  );
}
