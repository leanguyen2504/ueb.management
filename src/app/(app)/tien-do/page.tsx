import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead, SectionTabs } from '@/components/PageHead';
import { ProgressBar } from '@/components/TaskProgress';
import { ProgressTiles } from '@/components/ProgressSummary';
import { donePct, progressOverview, sumProgress, type ProgressRow } from '@/lib/progress';
import { KIND_LABEL, groupTypeLabel } from '@/lib/types';
import { fmtDate, fmtDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Tiến độ chung' };

const SORTS: [string, string][] = [['', 'Tên'], ['qua-han', 'Quá hạn nhiều'], ['tien-do', 'Tiến độ thấp'], ['cap-nhat', 'Mới cập nhật']];

// Tiến độ chung của các nhóm, dự án: chỉ số liệu tổng hợp (số việc theo trạng thái, quá hạn, % xong).
// Hiệu trưởng xem mọi nhóm ở đây mà không xem được tên việc, tài liệu, lịch hay thành viên.
export default async function ProgressPage({ searchParams }: { searchParams: Promise<{ loai?: string; sap?: string }> }) {
  const { loai = '', sap = '' } = await searchParams;
  const { supabase, ctx } = await requireSession();
  const { rows: all } = await progressOverview(supabase);
  const rows = all.filter((r) => !loai || r.kind === loai);
  const cmp: Record<string, (a: ProgressRow, b: ProgressRow) => number> = {
    'qua-han': (a, b) => b.task_overdue - a.task_overdue,
    'tien-do': (a, b) => (a.task_total ? donePct(a) : 101) - (b.task_total ? donePct(b) : 101),
    'cap-nhat': (a, b) => String(b.last_activity ?? '').localeCompare(String(a.last_activity ?? '')),
  };
  rows.sort((a, b) => (cmp[sap]?.(a, b) ?? 0) || a.name.localeCompare(b.name, 'vi'));
  const total = sumProgress(rows);
  const href = (q: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ loai, sap, ...q }).filter(([, v]) => v));
    return `/tien-do${p.size ? `?${p}` : ''}`;
  };
  const scope = ctx.is_admin || ctx.all_groups_secretary || ctx.role === 'principal';

  return (
    <>
      <PageHead title="Nhóm và Dự án" sub={scope
        ? 'Tiến độ chung của mọi đơn vị, dự án và sự kiện đang hoạt động. Chỉ hiện số liệu tổng hợp, không hiện chi tiết bên trong.'
        : 'Tiến độ chung của các nhóm bạn tham gia.'} />
      <SectionTabs current="tien-do" tabs={[
        { key: 'nhom', href: '/nhom', label: 'Danh sách' },
        { key: 'tien-do', href: '/tien-do', label: 'Tiến độ chung' },
      ]} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="seg" aria-label="Lọc theo loại">
          {[['', 'Tất cả'], ...Object.entries(KIND_LABEL)].map(([k, label]) => (
            <Link key={k} href={href({ loai: k })} aria-current={loai === k ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="muted">Sắp xếp:</span>
          {SORTS.map(([k, label]) => (
            <Link key={k} href={href({ sap: k })} aria-current={sap === k ? 'page' : undefined}
              className={sap === k ? 'font-semibold' : 'link'}>{label}</Link>
          ))}
        </div>
      </div>

      <section className="card mb-4" aria-labelledby="tong-h">
        <h2 id="tong-h" className="mb-2 font-semibold">Tổng cộng {rows.length} {loai ? KIND_LABEL[loai as keyof typeof KIND_LABEL]?.toLowerCase() : 'nhóm và dự án'}</h2>
        <ProgressTiles p={total} />
      </section>

      {rows.length ? (
        <section className="card p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Loại</th>
                  <th className="whitespace-nowrap">Thành viên</th>
                  <th className="min-w-44">Tiến độ</th>
                  <th className="whitespace-nowrap">Đang làm</th>
                  <th className="whitespace-nowrap">Quá hạn</th>
                  <th className="whitespace-nowrap">Hạn gần nhất</th>
                  <th className="whitespace-nowrap">Cập nhật</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = donePct(r);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/nhom/${r.id}`} className="font-medium hover:text-brand-600 dark:hover:text-brand-300">{r.name}</Link>
                        {r.parent_name && <div className="text-xs muted">thuộc {r.parent_name}</div>}
                      </td>
                      <td className="whitespace-nowrap text-sm">{groupTypeLabel(r)}</td>
                      <td className="tabular-nums">{r.member_count}</td>
                      <td>
                        {r.task_total ? (
                          <div className="flex items-center gap-2">
                            <ProgressBar pct={pct} className="w-24 flex-1" />
                            <span className="whitespace-nowrap text-xs tabular-nums">{r.task_done}/{r.task_total} · {pct}%</span>
                          </div>
                        ) : <span className="text-xs muted">Chưa có việc</span>}
                      </td>
                      <td className="tabular-nums">{r.task_doing}</td>
                      <td className={`tabular-nums ${r.task_overdue ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}`}>{r.task_overdue}</td>
                      <td className="whitespace-nowrap text-sm">{r.next_due ? fmtDate(r.next_due) : <span className="muted">—</span>}</td>
                      <td className="whitespace-nowrap text-xs muted">{fmtDateTime(r.last_activity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="card text-sm muted">Chưa có nhóm hay dự án nào.</p>
      )}
    </>
  );
}
