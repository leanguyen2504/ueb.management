import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { features, publicEnv, serverEnv } from '@/lib/env';
import { fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import {
  ROLE_FILTERS, fmtHours, groupWorklogs, hours, numberOf, pickConvertedField, roleChips, submittedByMonth,
  type RoleFilter, type Worklog,
} from '@/lib/jira/report';
import type { JiraAccount, JiraIssueRow } from '@/lib/jira/types';
import { BookmarkletSetup, TokenForm } from './JiraConnect';
import { disconnectJira } from './actions';

export const metadata: Metadata = { title: 'Jira của tôi' };

type Search = Promise<{ xem?: string; vai?: string }>;

export default async function JiraPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const by = sp.xem === 'thang' ? 'thang' : 'tuan';
  const role: RoleFilter = sp.vai && sp.vai in ROLE_FILTERS ? (sp.vai as RoleFilter) : 'tat-ca';
  const { supabase } = await requireSession();
  // RLS: mỗi người chỉ đọc được dữ liệu Jira của chính mình.
  const [{ data: acc }, { data: issueRows }, { data: wlRows }, { data: mentionRows }] = await Promise.all([
    supabase.from('jira_accounts').select('*').maybeSingle<JiraAccount>(),
    supabase.from('jira_issues').select('*').order('updated_at_jira', { ascending: false, nullsFirst: false }).limit(3000),
    supabase.from('jira_worklogs').select('worklog_id, issue_key, started_at, seconds, comment').order('started_at', { ascending: false }).limit(20000),
    supabase.from('jira_mentions').select('*').order('created_at', { ascending: false }).limit(100),
  ]);
  const issues = (issueRows ?? []) as JiraIssueRow[];
  const worklogs = (wlRows ?? []) as Worklog[];
  const mentions = (mentionRows ?? []) as { comment_id: string; issue_key: string; author_name: string | null; body: string; created_at: string }[];
  const jiraUrl = serverEnv.jiraBaseUrl();
  const browse = (key: string) => (jiraUrl ? `${jiraUrl}/browse/${encodeURIComponent(key)}` : null);
  const summaryOf = new Map(issues.map((i) => [i.issue_key, i.summary]));
  const synced = Boolean(acc?.last_synced_at);

  const periods = groupWorklogs(worklogs, by, 12);
  const maxSec = Math.max(1, ...periods.map((p) => p.seconds));
  const field = pickConvertedField(acc?.custom_field_names ?? [], process.env.JIRA_CONVERTED_HOURS_FIELD);
  const submitted = submittedByMonth(issues, field, 12);
  const thisMonth = vnDay().slice(0, 7);
  const totals = {
    weekSec: groupWorklogs(worklogs, 'tuan', 1)[0].seconds,
    monthSec: groupWorklogs(worklogs, 'thang', 1)[0].seconds,
    submittedMonth: submitted.find((s) => s.key === thisMonth)?.count ?? 0,
    convertedYear: submitted.filter((s) => s.key.startsWith(thisMonth.slice(0, 4))).reduce((a, s) => a + s.converted, 0),
  };
  const filtered = issues.filter(ROLE_FILTERS[role].test);
  const q = (o: { xem?: string; vai?: string }) => {
    const p = new URLSearchParams({ xem: o.xem ?? by, vai: o.vai ?? role });
    return `/jira?${p.toString()}`;
  };

  return (
    <>
      <PageHead
        eyebrow="Cá nhân"
        title="Jira của tôi"
        sub="Chỉ dữ liệu Jira của chính bạn: worklog, sản phẩm đã nộp, giờ quy đổi, mã việc liên quan và comment nhắc tên bạn. Chỉ bạn xem được trang này, kể cả quản trị cũng không xem được."
        actions={synced ? <a href="#ket-noi" className="btn-secondary">Cập nhật dữ liệu</a> : undefined}
      />

      {synced && (
        <>
          <p className="-mt-3 mb-5 text-sm muted">
            Tài khoản Jira: <b>{acc!.jira_display_name || acc!.jira_username}</b> ({acc!.jira_username}) · cập nhật lần cuối {fmtDateTime(acc!.last_synced_at)}
            {acc!.last_source === 'server' ? ' (tự động)' : ' (bấm nút trên Jira)'}
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Giờ log tuần này" value={fmtHours(hours(totals.weekSec))} />
            <Stat label="Giờ log tháng này" value={fmtHours(hours(totals.monthSec))} />
            <Stat label="Sản phẩm nộp tháng này" value={String(totals.submittedMonth)} />
            <Stat label={field ? `${field} năm nay` : 'Giờ quy đổi năm nay'} value={field ? fmtHours(totals.convertedYear) : '—'} />
          </div>

          <section className="card mb-6" aria-labelledby="h-worklog">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-worklog" className="font-semibold">Worklog cá nhân</h2>
              <nav className="seg" aria-label="Xem theo">
                <Link href={q({ xem: 'tuan' })} aria-current={by === 'tuan' ? 'page' : undefined}>Theo tuần</Link>
                <Link href={q({ xem: 'thang' })} aria-current={by === 'thang' ? 'page' : undefined}>Theo tháng</Link>
              </nav>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {periods.map((p) => (
                <li key={p.key}>
                  <details>
                    <summary className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                      <span className="w-48 shrink-0">{p.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(p.seconds / maxSec) * 100}%` }} />
                      </span>
                      <span className="w-20 text-right font-semibold tabular-nums">{fmtHours(hours(p.seconds))} giờ</span>
                      <span className="hidden w-20 text-right text-xs muted sm:block">{p.issues} mã việc</span>
                    </summary>
                    {p.items.length ? (
                      <table className="table mb-2">
                        <thead><tr><th>Ngày</th><th>Mã việc</th><th className="text-right">Giờ</th><th>Ghi chú</th></tr></thead>
                        <tbody>
                          {p.items.map((w) => (
                            <tr key={w.worklog_id}>
                              <td className="whitespace-nowrap">{fmtDate(vnDay(w.started_at))}</td>
                              <td><IssueLink k={w.issue_key} href={browse(w.issue_key)} /> <span className="muted">{summaryOf.get(w.issue_key)}</span></td>
                              <td className="text-right tabular-nums">{fmtHours(hours(w.seconds))}</td>
                              <td className="muted">{w.comment}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : <p className="pb-2 text-sm muted">Không có worklog.</p>}
                  </details>
                </li>
              ))}
            </ul>
          </section>

          <section className="card mb-6" aria-labelledby="h-sanpham">
            <h2 id="h-sanpham" className="font-semibold">Sản phẩm đã nộp và giờ quy đổi</h2>
            <p className="mb-3 mt-1 text-xs muted">
              Tính các mã việc bạn được giao đã chuyển sang trạng thái hoàn thành, theo tháng hoàn thành.
              {field ? <> Giờ quy đổi lấy từ trường <b>{field}</b> trên Jira.</> : <> Chưa tìm thấy trường &quot;giờ quy đổi&quot; trong dữ liệu Jira của bạn{acc!.custom_field_names.length ? <> (các trường đang có: {acc!.custom_field_names.slice(0, 15).join(', ')}{acc!.custom_field_names.length > 15 ? '…' : ''})</> : null}.</>}
            </p>
            <table className="table">
              <thead><tr><th>Tháng</th><th className="text-right">Số sản phẩm</th>{field && <th className="text-right">Giờ quy đổi</th>}<th>Mã việc</th></tr></thead>
              <tbody>
                {submitted.map((s) => (
                  <tr key={s.key}>
                    <td className="whitespace-nowrap">{s.label}</td>
                    <td className="text-right tabular-nums">{s.count}</td>
                    {field && <td className="text-right tabular-nums">{fmtHours(s.converted)}</td>}
                    <td className="text-xs">
                      {s.items.map((i, n) => (
                        <span key={i.issue_key}>{n > 0 && ', '}<IssueLink k={i.issue_key} href={browse(i.issue_key)} title={i.summary} />
                          {field && numberOf(i.custom?.[field]) !== null && <span className="muted"> ({fmtHours(numberOf(i.custom[field])!)})</span>}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card mb-6" aria-labelledby="h-viec">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="h-viec" className="font-semibold">Mã Jira liên quan đến tôi</h2>
              <nav className="seg" aria-label="Lọc theo vai trò">
                {(Object.keys(ROLE_FILTERS) as RoleFilter[]).map((r) => (
                  <Link key={r} href={q({ vai: r })} aria-current={role === r ? 'page' : undefined}>
                    {ROLE_FILTERS[r].label} <span className="text-xs muted">{issues.filter(ROLE_FILTERS[r].test).length}</span>
                  </Link>
                ))}
              </nav>
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Mã</th><th>Tóm tắt</th><th>Trạng thái</th><th>Liên quan</th><th className="text-right">Giờ của tôi</th><th>Hạn</th><th>Cập nhật</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 300).map((i) => (
                    <tr key={i.issue_key}>
                      <td className="whitespace-nowrap"><IssueLink k={i.issue_key} href={browse(i.issue_key)} /></td>
                      <td>{i.summary}<div className="text-xs muted">{i.project_name}{i.issue_type ? ` · ${i.issue_type}` : ''}</div></td>
                      <td className="whitespace-nowrap"><span className="chip">{i.status}</span></td>
                      <td><div className="flex flex-wrap gap-1">{roleChips(i).map((c) => <span key={c} className="chip">{c}</span>)}</div></td>
                      <td className="text-right tabular-nums">{i.my_seconds ? fmtHours(hours(i.my_seconds)) : ''}</td>
                      <td className="whitespace-nowrap">{i.due_date ? fmtDate(i.due_date) : ''}</td>
                      <td className="whitespace-nowrap text-xs muted">{i.updated_at_jira ? fmtDate(vnDay(i.updated_at_jira)) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <p className="py-3 text-sm muted">Không có mã việc nào.</p>}
              {filtered.length > 300 && <p className="py-3 text-sm muted">Đang hiện 300/{filtered.length} mã mới cập nhật nhất.</p>}
            </div>
          </section>

          <section className="card mb-6" aria-labelledby="h-nhac">
            <h2 id="h-nhac" className="mb-3 font-semibold">Comment nhắc đến tôi</h2>
            {mentions.length ? (
              <ul className="space-y-3">
                {mentions.map((m) => (
                  <li key={m.comment_id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="mb-1 text-xs muted"><b>{m.author_name}</b> · {fmtDateTime(m.created_at)} · <IssueLink k={m.issue_key} href={browse(m.issue_key)} /> {summaryOf.get(m.issue_key)}</div>
                    <p className="whitespace-pre-line">{mentionText(m.body)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Chưa có comment nào nhắc tên bạn (@{acc!.jira_username}).</p>}
          </section>
        </>
      )}

      <section id="ket-noi" className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-1 font-semibold">{synced ? 'Cập nhật dữ liệu: nút trên trang Jira' : 'Kết nối Jira: nút trên trang Jira'}</h2>
          <p className="mb-3 text-sm muted">Dùng được cả khi Jira chỉ mở trong mạng trường. Mỗi lần muốn cập nhật số liệu, mở Jira và bấm nút.</p>
          <BookmarkletSetup appUrl={publicEnv.appUrl().replace(/\/+$/, '')} hasKey={Boolean(acc?.has_sync_key)} jiraUrl={jiraUrl} />
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold">Đồng bộ tự động hằng ngày</h2>
          {features.jiraServerSync() ? (
            <>
              <p className="text-sm muted">Máy chủ web tự đọc Jira mỗi sáng bằng Personal Access Token của bạn. Chỉ chạy được nếu Jira mở ra Internet.</p>
              <TokenForm hasToken={Boolean(acc?.has_token)} />
            </>
          ) : (
            <p className="text-sm muted">Chưa bật. Cần Jira của trường mở ra Internet; quản trị hệ thống bật bằng biến FEATURE_JIRA (xem tài liệu docs/jira.md).</p>
          )}
          {acc?.last_error && <p role="alert" className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">Lần đồng bộ gần nhất lỗi: {acc.last_error}</p>}
          {acc && (
            <form action={disconnectJira} className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <button className="btn-danger text-sm">Ngắt kết nối và xóa dữ liệu Jira đã lưu</button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card !p-4">
      <div className="text-xs muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function IssueLink({ k, href, title }: { k: string; href: string | null; title?: string }) {
  return href ? <a className="link whitespace-nowrap" href={href} target="_blank" rel="noreferrer" title={title}>{k}</a> : <span className="font-medium" title={title}>{k}</span>;
}

// Jira lưu @nhắc tên dạng [~tên đăng nhập]: hiện lại thành @tên.
function mentionText(body: string) {
  const t = body.replace(/\[~(?:accountid:)?([^\]]+)\]/g, '@$1');
  return t.length > 500 ? t.slice(0, 500) + '…' : t;
}
