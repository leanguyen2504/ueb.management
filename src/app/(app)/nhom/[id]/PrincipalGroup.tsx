import Link from 'next/link';
import { groupTypeLabel, type Group } from '@/lib/types';
import type { DirGroup } from './PublicGroup';

type Contact = { user_id: string; full_name: string; email: string; position: string | null; phone: string | null; office: string | null; role: string };

// Trang nhóm với Hiệu trưởng (khi không là thành viên): thông tin chung, sự kiện và dự án đang diễn ra
// hoặc đang chuẩn bị (mọi cấp con chưa lưu trữ),
// lãnh đạo và đầu mối liên hệ. Không hiện tiến độ, đầu việc, tài liệu, lịch, thành viên hay nhật ký.
export function PrincipalGroup({ group, parent, memberCount, contacts, units, tree, linked }: {
  group: Group; parent: { id: string; name: string } | null; memberCount: number; contacts: Contact[]; units: DirGroup[];
  tree: (DirGroup & { depth: number })[]; linked: DirGroup[];
}) {
  const Item = ({ g, depth = 0 }: { g: DirGroup; depth?: number }) => (
    <li className="py-2.5" style={{ paddingLeft: `${depth * 1.25}rem` }}>
      <Link href={`/nhom/${g.id}`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">{g.name}</Link>
      <span className="chip ml-2 align-middle text-[11px]">{groupTypeLabel(g)}</span>
      {g.description && <div className="text-xs muted">{g.description}</div>}
    </li>
  );

  return (
    <>
      <div className="mb-5">
        <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm muted" aria-label="Vị trí">
          <Link href="/nhom" className="link">Nhóm và Dự án</Link>
          {parent && <><span>›</span><Link href={`/nhom/${parent.id}`} className="link">{parent.name}</Link></>}
        </nav>
        <h1 className="text-2xl font-semibold md:text-[28px] md:leading-tight">{group.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
          <span className="chip bg-gold-50 text-gold-600 dark:bg-gold-600/15 dark:text-gold-500">{groupTypeLabel(group)}</span>
          {group.archived_at && <span className="chip">Đã lưu trữ</span>}
          <span className="muted">{memberCount} thành viên</span>
          {units.length > 0 && <span className="muted">· Cùng làm:</span>}
          {units.map((u) => <Link key={u.id} href={`/nhom/${u.id}`} className="chip hover:text-brand-600 dark:hover:text-brand-300">{u.name}</Link>)}
        </div>
        {group.description && <p className="mt-2 max-w-3xl text-sm muted">{group.description}</p>}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="card" aria-labelledby="sk-h">
            <h2 id="sk-h" className="mb-1 text-lg font-semibold">Sự kiện và dự án đang diễn ra, đang chuẩn bị <span className="chip ml-1 align-middle">{tree.length}</span></h2>
            <p className="mb-2 text-sm muted">Gồm mọi cấp bên trong {group.name}. Mục đã lưu trữ không hiện ở đây.</p>
            {tree.length ? (
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {tree.map((g) => <Item key={g.id} g={g} depth={g.depth} />)}
              </ul>
            ) : <p className="text-sm muted">Chưa có sự kiện hay dự án nào.</p>}
          </section>
          {linked.length > 0 && (
            <section className="card" aria-labelledby="da-h">
              <h2 id="da-h" className="mb-1 text-lg font-semibold">Dự án liên đơn vị <span className="chip ml-1 align-middle">{linked.length}</span></h2>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {linked.map((g) => <Item key={g.id} g={g} />)}
              </ul>
            </section>
          )}
        </div>

        <section className="card" aria-labelledby="lh-h">
          <h2 id="lh-h" className="mb-3 text-lg font-semibold">Lãnh đạo và đầu mối liên hệ</h2>
          {contacts.length ? (
            <ul className="space-y-3">
              {contacts.map((c) => (
                <li key={c.user_id} className="text-sm">
                  <Link href={`/nguoi/${c.user_id}`} className="font-semibold hover:underline">{c.full_name || c.email}</Link>
                  <span className="muted"> · {c.role}</span>
                  {c.position && <div className="muted">{c.position}</div>}
                  <div className="text-xs muted">
                    <a href={`mailto:${c.email}`} className="link">{c.email}</a>
                    {c.phone && <> · <a href={`tel:${c.phone}`} className="link">{c.phone}</a></>}
                    {c.office && <> · {c.office}</>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm muted">Chưa có Trưởng nhóm hay đầu mối.</p>}
        </section>
      </div>
    </>
  );
}
