import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { addDays, fmtDate, fmtTime, vnDay } from '@/lib/format';
import { buildSummary, type SummaryParams, type SummaryLink } from '@/lib/meeting-summary';
import { jiraUrl } from '@/lib/meeting-rules';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { serverEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Bảng tổng hợp hồ sơ họp' };

type SP = { ngay?: string; 'pham-vi'?: string; mang?: string; 'dau-moi'?: string };

function qs(sp: SP, patch: Partial<SP> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) q.set(k, v);
  return q.toString();
}

function Links({ items }: { items: SummaryLink[] }) {
  if (!items.length) return <span className="muted">Chưa có</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">{l.label} ↗</a></li>)}
    </ul>
  );
}

export default async function SummaryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireSession();
  const params: SummaryParams = { ngay: sp.ngay, pham_vi: sp['pham-vi'], mang: sp.mang, dau_moi: sp['dau-moi']?.toLowerCase() };
  const { range, rows, areas, focalEmails, emailName } = await buildSummary(supabase, userId, params);
  const jiraBase = serverEnv.jiraBaseUrl();
  const step = range.scope === 'thang' ? 31 : 7;
  const prev = range.scope === 'thang' ? addDays(range.from, -1) : addDays(range.from, -step);
  const next = range.to;
  const label = range.scope === 'thang' ? `Tháng ${range.from.slice(5, 7)}/${range.from.slice(0, 4)}` : `Tuần ${fmtDate(range.from)} – ${fmtDate(addDays(range.to, -1))}`;

  return (
    <>
      <PageHead
        title="Bảng tổng hợp hồ sơ họp"
        sub="Mỗi buổi họp một dòng, theo mẫu của văn bản phân công. Lọc theo mảng hoặc đầu mối, xuất ra Excel để gửi Thầy Hiệu trưởng."
        actions={<>
          <Link href={`/hop?ngay=${range.from}`} className="btn-secondary">Hồ sơ cuộc họp</Link>
          <a href={`/hop/tong-hop/xuat?${qs(sp, { ngay: range.from })}`} className="btn">Xuất Excel</a>
        </>}
      />

      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="ngay" value={range.from} />
        <div>
          <label className="label" htmlFor="pv">Phạm vi</label>
          <select id="pv" name="pham-vi" className="input" defaultValue={range.scope}>
            <option value="tuan">Theo tuần</option>
            <option value="thang">Theo tháng</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mang">Mảng / đơn vị</label>
          <select id="mang" name="mang" className="input" defaultValue={sp.mang ?? ''}>
            <option value="">Tất cả</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dm">Đầu mối</label>
          <select id="dm" name="dau-moi" className="input" defaultValue={params.dau_moi ?? ''}>
            <option value="">Tất cả</option>
            {focalEmails.map((e) => <option key={e} value={e}>{emailName(e)}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Lọc</button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/hop/tong-hop?${qs(sp, { ngay: prev })}`} className="btn-secondary">← Trước</Link>
        <span className="font-medium">{label}</span>
        <Link href={`/hop/tong-hop?${qs(sp, { ngay: next })}`} className="btn-secondary">Sau →</Link>
        <Link href={`/hop/tong-hop?${qs(sp, { ngay: vnDay() })}`} className="text-brand-600 hover:underline dark:text-brand-300">Hiện tại</Link>
        <span className="muted">· {rows.length} buổi họp</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase dark:border-slate-700 dark:bg-slate-900">
            <tr>
              <th className="p-2">Mã Jira · Tên cuộc họp</th>
              <th className="p-2">Ngày</th>
              <th className="p-2">Đơn vị liên quan</th>
              <th className="p-2">Link tài liệu trước họp</th>
              <th className="p-2">Link biên bản / sau họp</th>
              <th className="p-2">Người cập nhật</th>
              <th className="p-2">Tình trạng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top dark:divide-slate-800">
            {rows.map(({ meeting: m, units, pre, post, updaters, status }) => {
              const j = m.jira_key ? jiraUrl(jiraBase, m.jira_key) : null;
              return (
                <tr key={`${m.source_id}|${m.event_key}`}>
                  <td className="p-2">
                    {m.jira_key && (j ? <a href={j} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-brand-600 hover:underline dark:text-brand-300">{m.jira_key}</a> : <span className="font-mono text-xs">{m.jira_key}</span>)}
                    <div><Link href={`/hop?ngay=${vnDay(m.starts_at)}#${meetingAnchor(m.source_id, m.event_key)}`} className="font-medium hover:underline">{m.title}</Link></div>
                  </td>
                  <td className="whitespace-nowrap p-2">{fmtDate(vnDay(m.starts_at))}{!m.all_day && <div className="text-xs muted">{fmtTime(m.starts_at)}</div>}</td>
                  <td className="p-2">{units.join(', ') || <span className="muted">—</span>}</td>
                  <td className="p-2"><Links items={pre} /></td>
                  <td className="p-2"><Links items={post} /></td>
                  <td className="p-2">{updaters.join(', ') || <span className="muted">—</span>}</td>
                  <td className="p-2">{status}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="p-4 text-center muted">Không có buổi họp nào trong khoảng này.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
