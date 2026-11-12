import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Nhật ký hoạt động' };

const ACTION: Record<string, string> = { insert: 'Thêm', update: 'Sửa', delete: 'Xóa' };
const ENTITY: Record<string, string> = {
  profiles: 'Người dùng',
  groups: 'Nhóm',
  group_members: 'Thành viên nhóm',
  invitations: 'Lời mời',
  secretary_scopes: 'Phạm vi thư ký',
  system_settings: 'Cấu hình hệ thống',
  tasks: 'Đầu việc',
  events: 'Lịch',
  bookings: 'Đặt lịch',
};
const PAGE = 50;

// Tóm tắt các trường đã đổi (bỏ cột lịch sử).
function changes(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  if (!oldData || !newData) return '';
  const skip = new Set(['updated_at', 'updated_by', 'created_at', 'created_by']);
  return Object.keys(newData)
    .filter((k) => !skip.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => `${k}: ${JSON.stringify(oldData[k])} → ${JSON.stringify(newData[k])}`)
    .join('; ');
}

export default async function LogPage({ searchParams }: { searchParams: Promise<{ loai?: string; trang?: string }> }) {
  const { supabase, ctx } = await requireSession();
  if (!ctx.is_admin) redirect('/');
  const { loai = '', trang = '1' } = await searchParams;
  const page = Math.max(1, Number(trang) || 1);

  let q = supabase.from('activity_log').select('*').order('at', { ascending: false }).range((page - 1) * PAGE, page * PAGE);
  if (loai && ENTITY[loai]) q = q.eq('entity_type', loai);
  const { data: rows } = await q;
  const list = (rows ?? []).slice(0, PAGE);
  const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean))] as string[];
  const { data: people } = actorIds.length ? await supabase.from('profiles').select('id, email, full_name').in('id', actorIds) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p.full_name || p.email]));
  const label = (r: Record<string, unknown>) => {
    const d = (r.new_data ?? r.old_data) as Record<string, unknown> | null;
    return String(d?.name ?? d?.email ?? '');
  };

  return (
    <>
      <PageHead title="Nhật ký hoạt động" sub="Mọi thay đổi dữ liệu và quyền. Nhật ký chỉ được thêm, không ai sửa hay xóa được." />
      <form className="mb-4 flex gap-2">
        <select name="loai" defaultValue={loai} className="input max-w-xs" aria-label="Loại đối tượng">
          <option value="">Tất cả đối tượng</option>
          {Object.entries(ENTITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn-secondary">Lọc</button>
      </form>
      <section className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Thay đổi</th></tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDateTime(r.at)}</td>
                <td>{r.actor_id ? who.get(r.actor_id) ?? 'Người dùng' : 'Hệ thống'}</td>
                <td>{ACTION[r.action] ?? r.action}</td>
                <td>{ENTITY[r.entity_type] ?? r.entity_type}{label(r) ? `: ${label(r)}` : ''}</td>
                <td className="max-w-md break-words text-xs muted">{changes(r.old_data, r.new_data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-4 text-sm muted">Chưa có hoạt động.</p>}
      </section>
      <div className="mt-3 flex gap-2">
        {page > 1 && <a className="btn-secondary" href={`?loai=${loai}&trang=${page - 1}`}>← Mới hơn</a>}
        {(rows?.length ?? 0) > PAGE && <a className="btn-secondary" href={`?loai=${loai}&trang=${page + 1}`}>Cũ hơn →</a>}
      </div>
    </>
  );
}
