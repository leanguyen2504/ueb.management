import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { greeting, todayLabel } from '@/lib/format';
import { KIND_LABEL, type Group } from '@/lib/types';

export default async function HomePage() {
  const { supabase, userId, profile, ctx } = await requireSession();
  const [{ data: groups }, { data: mine }] = await Promise.all([
    supabase.from('groups').select('*').is('archived_at', null).order('name').returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager').eq('user_id', userId),
  ]);
  const mineIds = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager]));
  const myGroups = (groups ?? []).filter((g) => mineIds.has(g.id));
  const seesAll = ctx.is_admin || ctx.role === 'principal' || ctx.all_groups_secretary;

  const stats = [
    { label: 'Nhóm của tôi', value: myGroups.length, foot: `${myGroups.filter((g) => mineIds.get(g.id)).length} nhóm tôi quản lý`, href: '/nhom' },
    { label: 'Nhóm tôi xem được', value: groups?.length ?? 0, foot: seesAll ? 'phạm vi toàn trường' : 'theo quyền được cấp', href: '/nhom' },
  ];

  return (
    <>
      <PageHead title={`${greeting()}, ${profile.full_name || profile.email}`} sub={`${todayLabel()} · giờ Việt Nam`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-brand-600">
            <div className="text-xs font-medium muted">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
            <div className="mt-1 text-xs muted">{s.foot}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Nhóm của tôi</h2>
            <Link href="/nhom" className="text-sm text-brand-600 hover:underline dark:text-brand-100">Tất cả</Link>
          </div>
          {myGroups.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {myGroups.map((g) => (
                <li key={g.id}>
                  <Link href={`/nhom/${g.id}`} className="flex items-center justify-between py-2 hover:text-brand-600">
                    <span>{g.name}</span>
                    <span className="chip">{mineIds.get(g.id) ? 'Quản lý' : KIND_LABEL[g.kind]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">Bạn chưa tham gia nhóm nào. Người quản lý nhóm sẽ thêm bạn vào nhóm.</p>
          )}
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold">Sắp có</h2>
          <p className="text-sm muted">
            Việc của tôi, lịch họp, dự án và sự kiện, hồ sơ cuộc họp, tài liệu Drive, nhắc việc và Trợ lý công việc sẽ xuất hiện ở trang này trong các giai đoạn tiếp theo.
          </p>
        </section>
      </div>
    </>
  );
}
