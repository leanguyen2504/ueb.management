import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { InviteForm } from './InviteForm';
import { cancelInvite, setUser } from './actions';
import { ROLE_LABEL, type Profile } from '@/lib/types';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Người dùng' };

export default async function UsersPage() {
  const { supabase, userId } = await requireAdmin();
  const [{ data: users }, { data: scopes }, { data: invites }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name').returns<Profile[]>(),
    supabase.from('secretary_scopes').select('user_id, all_groups'),
    supabase.from('invitations').select('id, email, system_role, group_id, created_at, expires_at').is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  const allScope = new Set((scopes ?? []).filter((s) => s.all_groups).map((s) => s.user_id));

  return (
    <>
      <PageHead title="Người dùng" sub="Chỉ quản trị hệ thống thấy trang này. Mọi thay đổi vai trò và khóa tài khoản đều được ghi nhật ký." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Người dùng</th><th>Vai trò</th><th>Thư ký toàn trường</th><th>Hoạt động</th><th /></tr></thead>
            <tbody>
              {(users ?? []).map((u) => {
                const formId = `u-${u.id}`;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium">{u.full_name || '(chưa đặt tên)'}{u.id === userId && <span className="chip ml-2">Quản trị hệ thống</span>}</div>
                      <div className="text-xs muted">{u.email}{u.unit ? ` · ${u.unit}` : ''}</div>
                      <form id={formId} action={setUser}><input type="hidden" name="user_id" value={u.id} /></form>
                    </td>
                    <td>
                      <select name="system_role" form={formId} defaultValue={u.system_role} className="input py-1" aria-label="Vai trò">
                        {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><input type="checkbox" name="all_groups" form={formId} defaultChecked={allScope.has(u.id)} aria-label="Thư ký phạm vi tất cả nhóm" title="Chỉ áp dụng khi vai trò là Thư ký" /></td>
                    <td><input type="checkbox" name="is_active" form={formId} defaultChecked={u.is_active} disabled={u.id === userId} aria-label="Đang hoạt động" />{u.id === userId && <input type="hidden" name="is_active" value="on" form={formId} />}</td>
                    <td><button form={formId} className="btn-secondary px-2 py-1 text-xs">Lưu</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="p-3 text-xs muted">Thư ký không tích &quot;toàn trường&quot; chỉ quản lý các nhóm mình là người quản lý. Bỏ tích &quot;Hoạt động&quot; để khóa tài khoản: người đó không xem được dữ liệu nào nữa.</p>
        </section>
        <div className="space-y-4">
          <InviteForm />
          <section className="card">
            <h2 className="mb-2 font-semibold">Lời mời chưa nhận ({invites?.length ?? 0})</h2>
            {invites?.length ? (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 py-2">
                    <span>{i.email}<br /><span className="text-xs muted">{ROLE_LABEL[i.system_role as keyof typeof ROLE_LABEL]}{i.group_id ? ' · mời vào nhóm' : ''} · hết hạn {fmtDateTime(i.expires_at)}</span></span>
                    <form action={cancelInvite}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-red-600 hover:underline dark:text-red-400">Hủy</button></form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Không có lời mời đang chờ.</p>}
          </section>
        </div>
      </div>
    </>
  );
}
