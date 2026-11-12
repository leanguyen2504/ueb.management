import Link from 'next/link';
import { groupTypeLabel, type Group } from '@/lib/types';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { ProgressBar } from '@/components/TaskProgress';
import { ProgressTiles } from '@/components/ProgressSummary';
import { donePct, sumProgress, type ProgressRow } from '@/lib/progress';

type Contact = { user_id: string; full_name: string; email: string; position: string | null; role: string };

// Trang nhóm với Hiệu trưởng (khi không là thành viên): thông tin chung, lãnh đạo, đầu mối
// và tiến độ chung bằng số liệu. Không hiện tên việc, tài liệu, lịch, thành viên hay nhật ký.
export function PrincipalGroup({ group, parent, contacts, rows }: { group: Group; parent: { id: string; name: string } | null; contacts: Contact[]; rows: ProgressRow[] }) {
  const self = rows.find((r) => r.id === group.id);
  const children = rows.filter((r) => r.parent_id === group.id);
  const p = sumProgress(self ? [self] : []);
  const sub = sumProgress(children);

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
          {self && <span className="muted">{self.member_count} thành viên{self.last_activity ? ` · cập nhật ${fmtDateTime(self.last_activity)}` : ''}</span>}
        </div>
        {group.description && <p className="mt-2 max-w-3xl text-sm muted">{group.description}</p>}
      </div>

      <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm muted dark:bg-slate-800">
        Bạn đang xem tổng quan và tiến độ chung. Chi tiết đầu việc, tài liệu, lịch và thành viên do nhóm quản lý.
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <section className="card" aria-labelledby="td-h">
            <h2 id="td-h" className="mb-2 text-lg font-semibold">Tiến độ chung</h2>
            {self?.task_total ? (
              <>
                <ProgressTiles p={p} />
                {self.next_due && <p className="mt-3 text-sm muted">Hạn gần nhất: {fmtDate(self.next_due)}</p>}
              </>
            ) : <p className="text-sm muted">Chưa có đầu việc nào.</p>}
          </section>

          {children.length > 0 && (
            <section className="card" aria-labelledby="con-h">
              <h2 id="con-h" className="mb-1 text-lg font-semibold">Dự án và nhóm con <span className="chip ml-1 align-middle">{children.length}</span></h2>
              <p className="mb-3 text-sm muted">Cộng lại: {sub.done}/{sub.total} việc xong ({sub.pct}%){sub.overdue ? `, ${sub.overdue} việc quá hạn` : ''}.</p>
              <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                {children.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/nhom/${c.id}`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">{c.name}</Link>
                      <div className="text-xs muted">{groupTypeLabel(c)} · {c.member_count} thành viên{c.task_overdue ? ` · ${c.task_overdue} quá hạn` : ''}</div>
                    </div>
                    {c.task_total ? (
                      <div className="flex w-48 items-center gap-2">
                        <ProgressBar pct={donePct(c)} className="flex-1" />
                        <span className="whitespace-nowrap text-xs tabular-nums">{c.task_done}/{c.task_total}</span>
                      </div>
                    ) : <span className="text-xs muted">Chưa có việc</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section className="card" aria-labelledby="lh-h">
          <h2 id="lh-h" className="mb-3 text-lg font-semibold">Lãnh đạo và đầu mối</h2>
          {contacts.length ? (
            <ul className="space-y-2.5">
              {contacts.map((c) => (
                <li key={c.user_id} className="text-sm">
                  <Link href={`/nguoi/${c.user_id}`} className="font-semibold hover:underline">{c.full_name || c.email}</Link>
                  <span className="muted"> · {c.role}</span>
                  {c.position && <div className="text-xs muted">{c.position}</div>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm muted">Chưa có Trưởng nhóm hay đầu mối.</p>}
        </section>
      </div>
    </>
  );
}
