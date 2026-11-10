import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { InviteForm, type GroupOption } from '@/components/InviteForm';
import { cancelInvite } from '@/lib/invite';
import { fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Mời đồng nghiệp' };

export default async function InvitePage() {
  const { supabase, userId } = await requireSession();
  const [{ data: groups }, { data: invites }] = await Promise.all([
    // RLS chỉ trả về các nhóm người này xem được.
    supabase.from('groups').select('id, name, parent_id').is('archived_at', null).order('name'),
    supabase.from('invitations').select('id, email, group_id, created_at, expires_at').eq('created_by', userId).is('accepted_at', null).order('created_at', { ascending: false }),
  ]);
  const byId = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const options: GroupOption[] = (groups ?? [])
    .filter((g) => g.parent_id || !(groups ?? []).some((c) => c.parent_id === g.id))
    .map((g) => ({ id: g.id, name: g.name, parent: g.parent_id ? byId.get(g.parent_id) ?? null : null }))
    .sort((a, b) => `${a.parent ?? ''}${a.name}`.localeCompare(`${b.parent ?? ''}${b.name}`, 'vi'));

  return (
    <>
      <PageHead title="Mời đồng nghiệp" sub="Chỉ người đang dùng hệ thống mới mời được người mới. Chỉ mời được email @vnu.edu.vn." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <InviteForm groups={options} />
        <section className="card">
          <h2 className="mb-2 font-semibold">Lời mời bạn đã gửi, chưa nhận ({invites?.length ?? 0})</h2>
          {invites?.length ? (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {invites.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 py-2">
                  <span>{i.email}<br /><span className="text-xs muted">{i.group_id ? `Nhóm: ${byId.get(i.group_id) ?? '—'} · ` : ''}hết hạn {fmtDateTime(i.expires_at)}</span></span>
                  <form action={cancelInvite}><input type="hidden" name="id" value={i.id} /><button className="text-xs text-orange-600 hover:underline dark:text-orange-400">Hủy</button></form>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm muted">Chưa có lời mời nào đang chờ.</p>}
        </section>
      </div>
    </>
  );
}
