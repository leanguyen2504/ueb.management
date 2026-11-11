import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead, SectionTabs } from '@/components/PageHead';
import { features, publicEnv, serverEnv } from '@/lib/env';
import { fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import {
  ROLE_FILTERS, blockedBy, blocking, daysBetween, dueState, fmtDuration, fmtHours, groupWorklogs, hours, inProgressNoLog,
  byProductType, numberOf, pickConvertedField, productLabel, roleChips, submittedByMonth, todoList, waitingOnMe, waitingOnOthers,
  type RoleFilter, type Worklog,
} from '@/lib/jira/report';
import type { JiraAccount, JiraIssueRow, JiraMentionRow } from '@/lib/jira/types';
import { BookmarkletSetup, TokenForm } from './JiraConnect';
import { disconnectJira } from './actions';

export const metadata: Metadata = { title: 'Jira của tôi' };

const TABS = ['can-lam', 'cho-toi', 'cho-nguoi-khac', 'da-lam', 'worklog', 'tat-ca'] as const;
type Tab = (typeof TABS)[number];
type Search = Promise<{ muc?: string; xem?: string; vai?: string }>;

export default async function JiraPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.muc as Tab) ? (sp.muc as Tab) : 'can-lam';
  const by = sp.xem === 'thang' ? 'thang' : 'tuan';
  const role: RoleFilter = sp.vai && sp.vai in ROLE_FILTERS ? (sp.vai as RoleFilter) : 'tat-ca';
  const { supabase } = await requireSession();
  // RLS: mỗi người chỉ đọc được dữ liệu Jira của chính mình.
  const [{ data: acc }, { data: issueRows }, { data: wlRows }, { data: mentionRows }] = await Promise.all([
    supabase.from('jira_accounts').select('*').maybeSingle<JiraAccount>(),
    supabase.from('jira_issues').select('*').order('updated_at_jira', { ascending: false, nullsFirst: false }).limit(3000),
    supabase.from('jira_worklogs').select('worklog_id, issue_key, started_at, seconds, comment').order('started_at', { ascending: false }).limit(20000),
    supabase.from('jira_mentions').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const issues = (issueRows ?? []) as JiraIssueRow[];
  const worklogs = (wlRows ?? []) as Worklog[];
  const mentions = (mentionRows ?? []) as JiraMentionRow[];
  const jiraUrl = serverEnv.jiraBaseUrl();
  const browse = (key: string) => (jiraUrl ? `${jiraUrl}/browse/${encodeURIComponent(key)}` : null);
  const byKey = new Map(issues.map((i) => [i.issue_key, i]));
  const synced = Boolean(acc?.last_synced_at);
  const today = vnDay();

  const field = pickConvertedField(acc?.custom_field_names ?? [], process.env.JIRA_CONVERTED_HOURS_FIELD);
  const submitted = submittedByMonth(issues, field, 12);
  const todo = todoList(issues);
  const noLog = inProgressNoLog(issues, worklogs);
  const onMe = waitingOnMe(issues, mentions);
  const onOthers = waitingOnOthers(issues);
  const overdue = todo.filter((i) => dueState(i, today) === 'overdue').length;
  const thisMonth = today.slice(0, 7);
  const totals = {
    weekSec: groupWorklogs(worklogs, 'tuan', 1)[0].seconds,
    monthSec: groupWorklogs(worklogs, 'thang', 1)[0].seconds,
    submittedMonth: submitted.find((s) => s.key === thisMonth)?.count ?? 0,
    convertedYear: submitted.filter((s) => s.key.startsWith(thisMonth.slice(0, 4))).reduce((a, s) => a + s.converted, 0),
  };
  const q = (o: { muc?: string; xem?: string; vai?: string }) =>
    `/jira?${new URLSearchParams({ muc: o.muc ?? tab, xem: o.xem ?? by, vai: o.vai ?? role }).toString()}`;
  const ctx = { browse, today, byKey };

  return (
    <>
      <PageHead
        eyebrow="Cá nhân"
        title="Jira của tôi"
        sub="Chỉ dữ liệu Jira của chính bạn. Chỉ bạn xem được trang này, kể cả quản trị cũng không xem được."
        actions={synced ? <a href="#ket-noi" className="btn-secondary">Cập nhật dữ liệu</a> : undefined}
      />

      {synced && (
        <>
          <p className="-mt-3 mb-5 text-sm muted">
            Tài khoản Jira: <b>{acc!.jira_display_name || acc!.jira_username}</b> ({acc!.jira_username}) · cập nhật lần cuối {fmtDateTime(acc!.last_synced_at)}
            {acc!.last_source === 'server' ? ' (tự động)' : ' (bấm nút trên Jira)'}
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Việc cần làm" value={String(todo.length)} />
            <Stat label="Quá hạn" value={String(overdue)} warn={overdue > 0} />
            <Stat label="Đang chờ tôi" value={String(onMe.mentions.length + onMe.blockingOthers.length)} warn={onMe.mentions.length + onMe.blockingOthers.length > 0} />
            <Stat label="Giờ log tuần này" value={fmtHours(hours(totals.weekSec))} />
            <Stat label="Sản phẩm nộp tháng này" value={String(totals.submittedMonth)} />
            <Stat label="Giờ quy đổi năm nay" value={field ? fmtHours(totals.convertedYear) : '—'} />
          </div>

          <SectionTabs current={tab} tabs={[
            { key: 'can-lam', href: q({ muc: 'can-lam' }), label: 'Cần làm', count: todo.length },
            { key: 'cho-toi', href: q({ muc: 'cho-toi' }), label: 'Đang chờ tôi', count: onMe.mentions.length + onMe.blockingOthers.length },
            { key: 'cho-nguoi-khac', href: q({ muc: 'cho-nguoi-khac' }), label: 'Đang chờ người khác', count: onOthers.delegated.length + onOthers.blocked.length },
            { key: 'da-lam', href: q({ muc: 'da-lam' }), label: 'Đã làm' },
            { key: 'worklog', href: q({ muc: 'worklog' }), label: 'Worklog' },
            { key: 'tat-ca', href: q({ muc: 'tat-ca' }), label: 'Tất cả mã Jira', count: issues.length },
          ]} />

          {tab === 'can-lam' && (
            <>
              <Section title="Việc của tôi, chưa xong" note="Việc được giao cho bạn hoặc bạn đã log work. Xếp theo hạn: quá hạn tô đỏ, đến hạn trong 7 ngày tô vàng; cùng hạn thì việc ưu tiên cao lên trước.">
                <IssueCards items={todo} ctx={ctx} empty="Không có việc nào đang mở. Tuyệt vời!" />
              </Section>
              <Section title="Đang làm nhưng tuần này chưa log work" note="Việc ở trạng thái đang làm mà từ thứ Hai tới nay bạn chưa ghi giờ.">
                <IssueCards items={noLog} ctx={ctx} empty="Việc đang làm nào cũng đã có worklog tuần này." />
              </Section>
            </>
          )}

          {tab === 'cho-toi' && (
            <>
              <Section title="Comment nhắc tên tôi, chưa trả lời" note="Bạn chưa comment lại trên mã việc đó kể từ lời nhắc.">
                <MentionList items={onMe.mentions} ctx={ctx} empty="Không có lời nhắc nào đang chờ bạn." />
              </Section>
              <Section title="Việc của tôi đang chặn việc khác" note="Người khác đang chờ các việc này xong mới làm tiếp được.">
                <IssueCards items={onMe.blockingOthers} ctx={ctx} empty="Không có việc nào của bạn đang chặn người khác." />
              </Section>
            </>
          )}

          {tab === 'cho-nguoi-khac' && (
            <>
              <Section title="Việc của tôi bị việc khác chặn">
                <IssueCards items={onOthers.blocked} ctx={ctx} empty="Không có việc nào bị chặn." />
              </Section>
              <Section title="Việc tôi tạo hoặc theo dõi, người khác đang làm" note="Xếp theo hạn; xem cột trạng thái và comment mới nhất để biết cần nhắc ai.">
                <IssueCards items={[...onOthers.delegated].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))} ctx={ctx} showAssignee empty="Không có việc nào." />
              </Section>
            </>
          )}

          {tab === 'da-lam' && (
            <Section title="Sản phẩm đã nộp và giờ quy đổi" note={<>Tính các mã việc của bạn (được giao cho bạn hoặc bạn có log work) đã chuyển sang trạng thái hoàn thành, theo tháng hoàn thành.{' '}
              {field ? <>Giờ quy đổi lấy từ trường <b>{field}</b> trên Jira (số giờ ghi ở cuối, ví dụ &quot;Biên bản loại 1-1h&quot; là 1 giờ).</> : <>Chưa tìm thấy trường &quot;giờ quy đổi&quot;{acc!.custom_field_names.length ? <> (các trường đang có: {acc!.custom_field_names.slice(0, 15).join(', ')}{acc!.custom_field_names.length > 15 ? '…' : ''})</> : null}.</>}</>}>
              <TypeTable title="Theo loại sản phẩm, 12 tháng gần nhất" rows={byProductType(submitted.flatMap((s) => s.items), field)} field={field} />
              <h3 className="mb-1 mt-5 text-sm font-semibold">Theo tháng</h3>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {submitted.map((s) => (
                  <li key={s.key}>
                    <details open={s.key === thisMonth && s.count > 0}>
                      <summary className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                        <span className="w-32 shrink-0">{s.label}</span>
                        <span className="flex-1 font-semibold">{s.count} sản phẩm</span>
                        {field && <span className="tabular-nums">{fmtHours(s.converted)} giờ quy đổi</span>}
                      </summary>
                      {s.items.length > 0 && (
                        <table className="table mb-2">
                          <thead><tr><th>Mã</th><th>Tóm tắt</th><th>Loại sản phẩm</th><th>Ngày nộp</th><th className="text-right">Giờ log</th>{field && <th className="text-right">Giờ quy đổi</th>}<th>Số lần bị trả lại</th></tr></thead>
                          <tbody>
                            {s.items.map((i) => (
                              <tr key={i.issue_key}>
                                <td><IssueLink k={i.issue_key} href={browse(i.issue_key)} /></td>
                                <td>{i.summary}</td>
                                <td className="text-xs">{field ? productLabel(i.custom?.[field]) : i.issue_type}</td>
                                <td className="whitespace-nowrap">{i.resolved_at ? fmtDate(vnDay(i.resolved_at)) : ''}</td>
                                <td className="text-right tabular-nums">{i.my_seconds ? fmtHours(hours(i.my_seconds)) : ''}</td>
                                {field && <td className="text-right tabular-nums">{numberOf(i.custom?.[field]) !== null ? fmtHours(numberOf(i.custom[field])!) : ''}</td>}
                                <td>{i.reopen_count ? <span className="chip !bg-orange-100 !text-orange-700 dark:!bg-orange-950 dark:!text-orange-300">{i.reopen_count} lần</span> : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tab === 'worklog' && <WorklogSection worklogs={worklogs} by={by} q={q} ctx={ctx} />}

          {tab === 'tat-ca' && (
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
              <AllTable items={issues.filter(ROLE_FILTERS[role].test)} ctx={ctx} />
            </section>
          )}
        </>
      )}

      <section id="ket-noi" className="mt-8 grid gap-4 lg:grid-cols-2">
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

function TypeTable({ title, rows, field }: { title: string; rows: ReturnType<typeof byProductType>; field: string | null }) {
  if (!rows.length) return <p className="text-sm muted">Chưa có sản phẩm nào hoàn thành trong 12 tháng gần nhất.</p>;
  return (
    <>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      <table className="table">
        <thead><tr><th>Loại sản phẩm</th><th className="text-right">Số lượng</th>{field && <th className="text-right">Giờ quy đổi</th>}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td className="text-right tabular-nums">{r.count}</td>{field && <td className="text-right tabular-nums">{fmtHours(r.converted)}</td>}</tr>
          ))}
          <tr className="font-semibold"><td>Tổng</td><td className="text-right tabular-nums">{rows.reduce((a, r) => a + r.count, 0)}</td>{field && <td className="text-right tabular-nums">{fmtHours(rows.reduce((a, r) => a + r.converted, 0))}</td>}</tr>
        </tbody>
      </table>
    </>
  );
}

type Ctx = { browse: (k: string) => string | null; today: string; byKey: Map<string, JiraIssueRow> };

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card !p-4">
      <div className="text-xs muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? 'text-orange-700 dark:text-orange-300' : ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card mb-6">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-1 text-xs muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function IssueLink({ k, href, title }: { k: string; href: string | null; title?: string }) {
  return href ? <a className="link whitespace-nowrap" href={href} target="_blank" rel="noreferrer" title={title}>{k}</a> : <span className="font-medium" title={title}>{k}</span>;
}

const DUE_STYLE = {
  overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  later: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  none: '',
};

function DueChip({ i, today }: { i: JiraIssueRow; today: string }) {
  const st = dueState(i, today);
  if (st === 'none') return null;
  const d = daysBetween(today, i.due_date!);
  const text = d < 0 ? `Quá hạn ${-d} ngày` : d === 0 ? 'Hạn hôm nay' : `Còn ${d} ngày`;
  return <span className={`chip ${DUE_STYLE[st]}`} title={`Hạn ${fmtDate(i.due_date!)}`}>{text} · {fmtDate(i.due_date!)}</span>;
}

// Thẻ một đầu việc: đủ thông tin để quyết định làm gì tiếp.
function IssueCards({ items, ctx, empty, showAssignee }: { items: JiraIssueRow[]; ctx: Ctx; empty: string; showAssignee?: boolean }) {
  if (!items.length) return <p className="text-sm muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {items.slice(0, 200).map((i) => {
        const since = i.status_since ? daysBetween(vnDay(i.status_since), ctx.today) : null;
        const bBy = blockedBy(i);
        const bOut = blocking(i);
        const meta = [i.sprint, ...(i.fix_versions ?? []), ...(i.components ?? []), ...(i.labels ?? [])].filter(Boolean) as string[];
        return (
          <li key={i.issue_key} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <IssueLink k={i.issue_key} href={ctx.browse(i.issue_key)} />
              <span className="font-medium">{i.summary}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="chip">{i.status}{since !== null && since > 0 ? ` · ${since} ngày` : ''}</span>
              <DueChip i={i} today={ctx.today} />
              {i.priority && <span className="chip">Ưu tiên: {i.priority}</span>}
              {i.start_date && <span className="chip">Bắt đầu {fmtDate(i.start_date)}</span>}
              {(i.original_estimate || i.remaining_estimate) ? <span className="chip">Còn {fmtDuration(i.remaining_estimate ?? 0)}{i.original_estimate ? ` / ước tính ${fmtDuration(i.original_estimate)}` : ''}</span> : null}
              {i.my_seconds > 0 && <span className="chip">Tôi đã log {fmtDuration(i.my_seconds)}</span>}
              {i.subtask_total > 0 && <span className="chip">Việc con {i.subtask_done}/{i.subtask_total}</span>}
              {i.reopen_count > 0 && <span className="chip !bg-orange-100 !text-orange-700 dark:!bg-orange-950 dark:!text-orange-300">Bị trả lại {i.reopen_count} lần</span>}
              {showAssignee && <span className="chip">Người làm: {i.assignee_name ?? 'chưa giao'}</span>}
            </div>
            {(i.parent_key || i.epic_key || meta.length > 0) && (
              <div className="mt-1.5 text-xs muted">
                {i.parent_key && <>Thuộc <IssueLink k={i.parent_key} href={ctx.browse(i.parent_key)} /> {i.parent_summary} · </>}
                {i.epic_key && <>Epic <IssueLink k={i.epic_key} href={ctx.browse(i.epic_key)} title={ctx.byKey.get(i.epic_key)?.summary} /> · </>}
                {i.project_name}{meta.length ? ` · ${meta.join(' · ')}` : ''}
              </div>
            )}
            {bBy.length > 0 && <LinkLine label="Đang chờ" links={bBy} ctx={ctx} />}
            {bOut.length > 0 && <LinkLine label="Đang chặn" links={bOut} ctx={ctx} />}
            {i.last_comment && (
              <p className="mt-1.5 text-xs muted">
                Comment mới nhất: <b>{i.last_comment.isMe ? 'bạn' : i.last_comment.author}</b> ({fmtDate(vnDay(i.last_comment.created))}): {mentionText(i.last_comment.body, 160)}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LinkLine({ label, links, ctx }: { label: string; links: ReturnType<typeof blockedBy>; ctx: Ctx }) {
  return (
    <p className="mt-1.5 text-xs">
      <span className="font-semibold text-orange-700 dark:text-orange-300">{label}:</span>{' '}
      {links.map((l, n) => <span key={`${l.key}-${n}`}>{n > 0 && ', '}{l.key && <IssueLink k={l.key} href={ctx.browse(l.key)} />} {l.summary}</span>)}
    </p>
  );
}

function MentionList({ items, ctx, empty }: { items: JiraMentionRow[]; ctx: Ctx; empty: string }) {
  if (!items.length) return <p className="text-sm muted">{empty}</p>;
  return (
    <ul className="space-y-3">
      {items.map((m) => (
        <li key={m.comment_id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
          <div className="mb-1 text-xs muted"><b>{m.author_name}</b> · {fmtDateTime(m.created_at)} · <IssueLink k={m.issue_key} href={ctx.browse(m.issue_key)} /> {ctx.byKey.get(m.issue_key)?.summary}</div>
          <p className="whitespace-pre-line">{mentionText(m.body, 500)}</p>
        </li>
      ))}
    </ul>
  );
}

function WorklogSection({ worklogs, by, q, ctx }: { worklogs: Worklog[]; by: 'tuan' | 'thang'; q: (o: { xem?: string }) => string; ctx: Ctx }) {
  const periods = groupWorklogs(worklogs, by, 12);
  const maxSec = Math.max(1, ...periods.map((p) => p.seconds));
  return (
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
                        <td><IssueLink k={w.issue_key} href={ctx.browse(w.issue_key)} /> <span className="muted">{ctx.byKey.get(w.issue_key)?.summary}</span></td>
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
  );
}

function AllTable({ items, ctx }: { items: JiraIssueRow[]; ctx: Ctx }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Mã</th><th>Tóm tắt</th><th>Trạng thái</th><th>Liên quan</th><th className="text-right">Giờ của tôi</th><th>Hạn</th><th>Cập nhật</th></tr></thead>
        <tbody>
          {items.slice(0, 300).map((i) => (
            <tr key={i.issue_key}>
              <td className="whitespace-nowrap"><IssueLink k={i.issue_key} href={ctx.browse(i.issue_key)} /></td>
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
      {!items.length && <p className="py-3 text-sm muted">Không có mã việc nào.</p>}
      {items.length > 300 && <p className="py-3 text-sm muted">Đang hiện 300/{items.length} mã mới cập nhật nhất.</p>}
    </div>
  );
}

// Jira lưu @nhắc tên dạng [~tên đăng nhập]: hiện lại thành @tên.
function mentionText(body: string, max: number) {
  const t = body.replace(/\[~(?:accountid:)?([^\]]+)\]/g, '@$1');
  return t.length > max ? t.slice(0, max) + '…' : t;
}
