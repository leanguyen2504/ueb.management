import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead, SectionTabs } from '@/components/PageHead';
import { features, publicEnv, serverEnv } from '@/lib/env';
import { fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import {
  blockedBy, blocking, byProductType, daysBetween, dueState, fmtHours, groupWorklogs, hours, inProgressNoLog,
  missingProof, pickConvertedField, submittedByMonth, type MissingProof, todoList, waitingOnMe, waitingOnOthers, periodLabel, weekStart, type Worklog,
} from '@/lib/jira/report';
import type { JiraAccount, JiraIssueRow, JiraMentionRow } from '@/lib/jira/types';
import { DataTable } from '@/components/table/DataTable';
import { BookmarkletSetup, TokenForm } from './JiraConnect';
import { disconnectJira } from './actions';
import { ISSUE_COLUMNS, PRODUCT_COLUMNS, WORKLOG_COLUMNS, issueRow, productRow, worklogRow, type RowCtx } from './rows';
import { ReportTab } from './ReportTab';

export const metadata: Metadata = { title: 'Jira của tôi' };

const TABS = ['can-lam', 'cho-toi', 'cho-nguoi-khac', 'da-lam', 'worklog', 'tat-ca', 'bao-cao', 'ket-noi'] as const;
type Tab = (typeof TABS)[number];
export type JiraSearch = { muc?: string; xem?: string; kieu?: string; ai?: string; nhom?: string; tu?: string; den?: string; loi?: string; ok?: string; nguoi?: string | string[] };

export default async function JiraPage({ searchParams }: { searchParams: Promise<JiraSearch> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireSession();
  // RLS: mỗi người chỉ đọc được dữ liệu Jira của chính mình.
  const [{ data: acc }, { data: issueRows }, { data: wlRows }, { data: mentionRows }] = await Promise.all([
    supabase.from('jira_accounts').select('*').maybeSingle<JiraAccount & { share_scope?: 'none' | 'leads' | 'members' }>(),
    supabase.from('jira_issues').select('*').order('updated_at_jira', { ascending: false, nullsFirst: false }).limit(3000),
    supabase.from('jira_worklogs').select('worklog_id, issue_key, started_at, seconds, comment').order('started_at', { ascending: false }).limit(20000),
    supabase.from('jira_mentions').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  const synced = Boolean(acc?.last_synced_at);
  const fallback: Tab = synced ? 'can-lam' : 'ket-noi';
  const tab: Tab = TABS.includes(sp.muc as Tab) ? (sp.muc as Tab) : fallback;
  const by = sp.xem === 'thang' ? 'thang' : 'tuan';
  const issues = (issueRows ?? []) as JiraIssueRow[];
  const worklogs = (wlRows ?? []) as Worklog[];
  const mentions = (mentionRows ?? []) as JiraMentionRow[];
  const jiraUrl = serverEnv.jiraBaseUrl();
  const browse = (key: string) => (jiraUrl ? `${jiraUrl}/browse/${encodeURIComponent(key)}` : null);
  const byKey = new Map(issues.map((i) => [i.issue_key, i]));
  const today = vnDay();

  const field = pickConvertedField(acc?.custom_field_names ?? [], process.env.JIRA_CONVERTED_HOURS_FIELD);
  const submitted = submittedByMonth(issues, field, 12);
  const proof = missingProof(issues);
  const todo = todoList(issues);
  const noLog = inProgressNoLog(issues, worklogs);
  const onMe = waitingOnMe(issues, mentions);
  const onOthers = waitingOnOthers(issues);
  const overdue = todo.filter((i) => dueState(i, today) === 'overdue');
  const soon = todo.filter((i) => dueState(i, today) === 'soon');
  const weeks = groupWorklogs(worklogs, 'tuan', 12);
  const thisMonth = today.slice(0, 7);
  const totals = {
    weekSec: weeks[0].seconds,
    lastWeekSec: weeks[1].seconds,
    monthSec: groupWorklogs(worklogs, 'thang', 1)[0].seconds,
    submittedMonth: submitted.find((s) => s.key === thisMonth)?.count ?? 0,
    convertedMonth: submitted.find((s) => s.key === thisMonth)?.converted ?? 0,
    convertedYear: submitted.filter((s) => s.key.startsWith(thisMonth.slice(0, 4))).reduce((a, s) => a + s.converted, 0),
  };
  const waitingMe = onMe.mentions.length + onMe.blockingOthers.length;
  const waitingOthers = onOthers.delegated.length + onOthers.blocked.length;
  const q = (o: Partial<Record<'muc' | 'xem' | 'kieu', string>>) => {
    const p = new URLSearchParams({ muc: o.muc ?? tab });
    if ((o.xem ?? by) !== 'tuan') p.set('xem', o.xem ?? by);
    if (o.kieu ?? sp.kieu) p.set('kieu', (o.kieu ?? sp.kieu)!);
    return `/jira?${p.toString()}`;
  };
  const ctx: RowCtx = { browse, today, byKey, field };
  const staleDays = acc?.last_synced_at ? daysBetween(vnDay(acc.last_synced_at), today) : 0;

  return (
    <>
      <PageHead
        eyebrow="Cá nhân"
        title="Jira của tôi"
        sub={synced ? (
          <>
            <b>{acc!.jira_display_name || acc!.jira_username}</b> ({acc!.jira_username}) · cập nhật {fmtDateTime(acc!.last_synced_at)}
            {acc!.last_source === 'server' ? ' (tự động)' : ' (nút trên Jira)'} · Chỉ bạn xem được{acc?.share_scope && acc.share_scope !== 'none' ? ', trừ phần bạn đã chia sẻ' : ''}.
          </>
        ) : 'Kết nối Jira để xem việc cần làm, worklog, sản phẩm đã nộp và xuất báo cáo Excel. Chỉ bạn xem được dữ liệu của mình.'}
        actions={synced ? (
          <>
            <Link href={q({ muc: 'bao-cao' })} className="btn-secondary">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
              Xuất Excel
            </Link>
            <Link href={q({ muc: 'ket-noi' })} className="btn-secondary">Cập nhật dữ liệu</Link>
          </>
        ) : undefined}
      />

      {synced && staleDays >= 2 && (
        <p role="status" className="-mt-2 mb-4 rounded-xl bg-orange-50 px-4 py-2.5 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">
          Dữ liệu Jira đã cũ {staleDays} ngày. <Link href={q({ muc: 'ket-noi' })} className="font-semibold underline">Cập nhật ngay</Link> để số liệu và báo cáo đúng.
        </p>
      )}

      {synced && proof.length > 0 && (
        <p role="alert" className="-mt-2 mb-4 rounded-xl bg-orange-50 px-4 py-2.5 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">
          <b>{proof.length} mã Jira bạn đã log work còn thiếu comment hoặc file sản phẩm.</b>{' '}
          {proof.slice(0, 6).map((x, n) => <span key={x.issue.issue_key}>{n > 0 && ', '}<IssueLink k={x.issue.issue_key} href={browse(x.issue.issue_key)} title={x.issue.summary} /></span>)}
          {proof.length > 6 && '…'}{' '}
          <Link href={`${q({ muc: 'can-lam' })}#thieu-minh-chung`} className="font-semibold underline">Xem chi tiết</Link>
        </p>
      )}

      {synced && (
        <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className="card !p-0" aria-label="Việc cần chú ý">
            <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide muted">Việc cần chú ý</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <Kpi href={q({ muc: 'can-lam' })} label="Cần làm" value={todo.length} hint={`${noLog.length} đang làm chưa log tuần này`} />
              <Kpi href={q({ muc: 'can-lam' })} label="Quá hạn" value={overdue.length} tone={overdue.length ? 'warn' : undefined} hint={soon.length ? `${soon.length} đến hạn trong 7 ngày` : 'Không có việc sắp đến hạn'} />
              <Kpi href={q({ muc: 'cho-toi' })} label="Đang chờ tôi" value={waitingMe} tone={waitingMe ? 'warn' : undefined} hint={`${onMe.mentions.length} lời nhắc · ${onMe.blockingOthers.length} việc đang chặn`} />
              <Kpi href={q({ muc: 'cho-nguoi-khac' })} label="Chờ người khác" value={waitingOthers} hint={`${onOthers.blocked.length} bị chặn · ${onOthers.delegated.length} đã giao`} />
            </div>
          </section>
          <section className="card !p-0" aria-label="Kết quả">
            <h2 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide muted">Kết quả</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3">
              <Kpi href={q({ muc: 'worklog' })} label="Giờ log tuần này" value={fmtHours(hours(totals.weekSec))}
                hint={`Tuần trước ${fmtHours(hours(totals.lastWeekSec))} · tháng ${fmtHours(hours(totals.monthSec))}`}
                extra={<Spark values={[...weeks].reverse().map((w) => hours(w.seconds))} />} />
              <Kpi href={q({ muc: 'da-lam' })} label="Sản phẩm tháng này" value={totals.submittedMonth} hint={field ? `${fmtHours(totals.convertedMonth)} giờ quy đổi` : undefined} />
              <Kpi href={q({ muc: 'da-lam' })} label="Giờ quy đổi năm nay" value={field ? fmtHours(totals.convertedYear) : '—'} hint={field ? `Trường "${field}"` : 'Chưa thấy trường quy đổi'} />
            </div>
          </section>
        </div>
      )}

      <SectionTabs current={tab} tabs={[
        ...(synced ? [
          { key: 'can-lam', href: q({ muc: 'can-lam' }), label: 'Cần làm', count: todo.length },
          { key: 'cho-toi', href: q({ muc: 'cho-toi' }), label: 'Đang chờ tôi', count: waitingMe },
          { key: 'cho-nguoi-khac', href: q({ muc: 'cho-nguoi-khac' }), label: 'Chờ người khác', count: waitingOthers },
          { key: 'da-lam', href: q({ muc: 'da-lam' }), label: 'Đã làm' },
          { key: 'worklog', href: q({ muc: 'worklog' }), label: 'Worklog' },
          { key: 'tat-ca', href: q({ muc: 'tat-ca' }), label: 'Tất cả mã Jira', count: issues.length },
        ] : []),
        { key: 'cay', href: '/jira/cay', label: 'Cây công việc' },
        { key: 'bao-cao', href: q({ muc: 'bao-cao' }), label: 'Báo cáo Excel' },
        { key: 'ket-noi', href: q({ muc: 'ket-noi' }), label: 'Kết nối, cập nhật' },
      ]} />

      {tab === 'can-lam' && synced && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm muted">Việc được giao cho bạn hoặc bạn có log work, chưa xong. Bấm vào một việc để xem chi tiết.</p>
            <nav className="seg" aria-label="Kiểu hiển thị">
              <Link href={q({ kieu: 'nhom' })} aria-current={sp.kieu !== 'bang' ? 'page' : undefined}>Theo hạn</Link>
              <Link href={q({ kieu: 'bang' })} aria-current={sp.kieu === 'bang' ? 'page' : undefined}>Dạng bảng</Link>
            </nav>
          </div>
          {proof.length > 0 && (
            <div id="thieu-minh-chung" className="mb-4 scroll-mt-20">
              <Panel title="Thiếu comment hoặc file sản phẩm" count={proof.length}
                note="Mã bạn có log work (đang mở, hoặc đã xong từ đầu tháng trước) nhưng bạn chưa comment hoặc chưa đính kèm file sản phẩm trên Jira. Bổ sung trên Jira rồi bấm Cập nhật dữ liệu.">
                <ProofList items={proof} ctx={ctx} />
              </Panel>
            </div>
          )}
          {noLog.length > 0 && (
            <p className="mb-4 rounded-xl bg-gold-50 px-4 py-2.5 text-sm dark:bg-gold-600/10">
              <b className="text-gold-600 dark:text-gold-500">Chưa log work tuần này:</b>{' '}
              {noLog.map((i, n) => <span key={i.issue_key}>{n > 0 && ', '}<IssueLink k={i.issue_key} href={browse(i.issue_key)} title={i.summary} /></span>)}
            </p>
          )}
          {sp.kieu === 'bang' ? (
            <div className="card"><DataTable id="jira-can-lam" columns={ISSUE_COLUMNS} rows={todo.map((i) => issueRow(i, ctx))} exportName="viec-can-lam" empty="Không có việc nào đang mở." /></div>
          ) : todo.length === 0 ? (
            <div className="card text-sm muted">Không có việc nào đang mở. Tuyệt vời!</div>
          ) : (
            <div className="space-y-3">
              <Group title="Quá hạn" tone="warn" items={overdue} ctx={ctx} />
              <Group title="Đến hạn trong 7 ngày" tone="gold" items={soon} ctx={ctx} />
              <Group title="Còn hạn" items={todo.filter((i) => dueState(i, today) === 'later')} ctx={ctx} />
              <Group title="Chưa đặt hạn" items={todo.filter((i) => !i.due_date)} ctx={ctx} closed={todo.length > 15} />
            </div>
          )}
        </>
      )}

      {tab === 'cho-toi' && synced && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Comment nhắc tên tôi, chưa trả lời" count={onMe.mentions.length} note="Bạn chưa comment lại trên mã việc đó kể từ lời nhắc.">
            <MentionList items={onMe.mentions} ctx={ctx} empty="Không có lời nhắc nào đang chờ bạn." />
          </Panel>
          <Panel title="Việc của tôi đang chặn người khác" count={onMe.blockingOthers.length} note="Người khác đang chờ các việc này xong mới làm tiếp được.">
            <IssueList items={onMe.blockingOthers} ctx={ctx} empty="Không có việc nào của bạn đang chặn người khác." />
          </Panel>
        </div>
      )}

      {tab === 'cho-nguoi-khac' && synced && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Việc của tôi bị việc khác chặn" count={onOthers.blocked.length}>
            <IssueList items={onOthers.blocked} ctx={ctx} empty="Không có việc nào bị chặn." />
          </Panel>
          <Panel title="Việc tôi tạo hoặc theo dõi, người khác đang làm" count={onOthers.delegated.length} note="Xếp theo hạn; mở một việc để xem comment mới nhất và biết cần nhắc ai.">
            <IssueList items={[...onOthers.delegated].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))} ctx={ctx} showAssignee empty="Không có việc nào." />
          </Panel>
        </div>
      )}

      {tab === 'da-lam' && synced && (() => {
        const items = submitted.flatMap((s) => s.items);
        const types = byProductType(items, field);
        const maxCount = Math.max(1, ...submitted.map((s) => s.count));
        return (
          <>
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Panel title="Theo tháng, 12 tháng gần nhất" note="Việc của bạn chuyển sang trạng thái hoàn thành, theo tháng hoàn thành.">
                <ul className="space-y-1">
                  {submitted.map((s) => (
                    <li key={s.key} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 muted">{s.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span className="block h-full rounded-full bg-brand-600 dark:bg-brand-300" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                      </span>
                      <span className="w-24 text-right tabular-nums"><b>{s.count}</b> sản phẩm</span>
                      {field && <span className="hidden w-24 text-right text-xs tabular-nums muted sm:block">{fmtHours(s.converted)} giờ QĐ</span>}
                    </li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Theo loại sản phẩm" note={field ? <>Giờ quy đổi lấy từ trường <b>{field}</b> (số giờ ở cuối, ví dụ &quot;Biên bản loại 1-1h&quot; là 1 giờ).</> : <>Chưa tìm thấy trường &quot;giờ quy đổi&quot;{acc!.custom_field_names.length ? <> (các trường đang có: {acc!.custom_field_names.slice(0, 12).join(', ')}{acc!.custom_field_names.length > 12 ? '…' : ''})</> : null}.</>}>
                {types.length ? (
                  <table className="table">
                    <thead><tr><th>Loại sản phẩm</th><th className="text-right">Số lượng</th>{field && <th className="text-right">Giờ quy đổi</th>}</tr></thead>
                    <tbody>
                      {types.map((r) => <tr key={r.label}><td>{r.label}</td><td className="text-right tabular-nums">{r.count}</td>{field && <td className="text-right tabular-nums">{fmtHours(r.converted)}</td>}</tr>)}
                      <tr className="font-semibold"><td>Tổng</td><td className="text-right tabular-nums">{types.reduce((a, r) => a + r.count, 0)}</td>{field && <td className="text-right tabular-nums">{fmtHours(types.reduce((a, r) => a + r.converted, 0))}</td>}</tr>
                    </tbody>
                  </table>
                ) : <p className="text-sm muted">Chưa có sản phẩm nào hoàn thành trong 12 tháng gần nhất.</p>}
              </Panel>
            </div>
            <Panel title="Danh sách sản phẩm đã nộp" note="Lọc theo tháng, loại sản phẩm; chọn cột cần xem; tải Excel đúng phần đang lọc.">
              <DataTable id="jira-da-lam" columns={PRODUCT_COLUMNS.filter((c) => field || c.key !== 'converted')} rows={items.map((i) => productRow(i, ctx))}
                exportName="san-pham-da-nop" initialSort={{ key: 'resolved', dir: 'desc' }} empty="Chưa có sản phẩm nào." />
            </Panel>
          </>
        );
      })()}

      {tab === 'worklog' && synced && (() => {
        const periods = groupWorklogs(worklogs, by, 12);
        const maxSec = Math.max(1, ...periods.map((p) => p.seconds));
        const avg = periods.slice(1).reduce((s, p) => s + p.seconds, 0) / Math.max(1, periods.length - 1);
        return (
          <>
            <Panel title={by === 'tuan' ? 'Giờ log 12 tuần gần nhất' : 'Giờ log 12 tháng gần nhất'}
              note={`Trung bình ${fmtHours(hours(avg))} giờ mỗi ${by === 'tuan' ? 'tuần' : 'tháng'} (không tính kỳ hiện tại).`}
              right={(
                <nav className="seg" aria-label="Xem theo">
                  <Link href={q({ xem: 'tuan' })} aria-current={by === 'tuan' ? 'page' : undefined}>Theo tuần</Link>
                  <Link href={q({ xem: 'thang' })} aria-current={by === 'thang' ? 'page' : undefined}>Theo tháng</Link>
                </nav>
              )}>
              <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Biểu đồ giờ log">
                {[...periods].reverse().map((p) => (
                  <div key={p.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.label}: ${fmtHours(hours(p.seconds))} giờ, ${p.issues} mã việc`}>
                    <span className="text-[10px] tabular-nums muted opacity-0 group-hover:opacity-100 sm:opacity-100">{p.seconds ? fmtHours(hours(p.seconds)) : ''}</span>
                    <span className={`w-full rounded-t-md ${p.key === periods[0].key ? 'bg-gold-500' : 'bg-brand-600 dark:bg-brand-300'}`} style={{ height: `${Math.max(2, (p.seconds / maxSec) * 100)}%` }} />
                    <span className="w-full truncate text-center text-[10px] muted">{by === 'tuan' ? `${p.key.slice(8)}/${p.key.slice(5, 7)}` : `T${Number(p.key.slice(5))}`}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <div className="mt-4">
              <Panel title="Chi tiết worklog" note="Toàn bộ worklog đã đồng bộ. Lọc theo tháng, tuần, dự án hoặc mã việc; cột Giờ cộng tổng phần đang lọc.">
                <DataTable id="jira-worklog" columns={WORKLOG_COLUMNS} exportName="worklog" initialSort={{ key: 'day', dir: 'desc' }}
                  rows={worklogs.map((w) => worklogRow(w, ctx, (d) => periodLabel(weekStart(d), 'tuan')))} empty="Chưa có worklog." />
              </Panel>
            </div>
          </>
        );
      })()}

      {tab === 'tat-ca' && synced && (
        <Panel title="Mã Jira liên quan đến tôi" note="Lọc cột Liên quan để xem việc được giao, tôi tạo, theo dõi, có worklog hoặc nhắc tên. Bấm Cột để bật thêm thông tin (ước tính, sprint, nhãn, epic, comment mới nhất...).">
          <DataTable id="jira-tat-ca" columns={ISSUE_COLUMNS} rows={issues.map((i) => issueRow(i, ctx))} exportName="ma-jira" empty="Không có mã việc nào." />
        </Panel>
      )}

      {tab === 'bao-cao' && <ReportTab sp={sp} userId={userId} supabase={supabase} synced={synced} shareScope={acc?.share_scope} />}

      {tab === 'ket-noi' && (
        <section id="ket-noi" className="space-y-4">
          <div className="card">
            <h2 className="font-semibold">Cập nhật số liệu Jira như thế nào?</h2>
            <p className="mt-1 text-sm muted">
              Jira của trường chỉ mở trong mạng trường và không cấp Token, nên web không tự vào Jira đọc được. Thay vào đó bạn dùng một <b>nút trên thanh dấu trang</b>:
              khi bạn bấm nút lúc đang mở Jira, trình duyệt của bạn đọc dữ liệu của riêng bạn và gửi về đây. Sau đó, khi tab Jira còn mở, nút tự cập nhật lại mỗi 30 phút.
            </p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                <h3 className="mb-1.5 text-sm font-semibold">Lần đầu (chỉ làm một lần trên mỗi máy)</h3>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Hiện thanh dấu trang: Chrome, Edge bấm <b>Ctrl+Shift+B</b> (Mac: <b>⌘+Shift+B</b>); Safari vào menu View → Show Favorites Bar.</li>
                  <li>Ở ô bên dưới, bấm <b>Tạo nút</b>.</li>
                  <li>Giữ chuột vào nút đỏ <b>Đồng bộ Jira → UEB</b>, kéo thả lên thanh dấu trang.</li>
                </ol>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40">
                <h3 className="mb-1.5 text-sm font-semibold">Mỗi khi cần số liệu mới</h3>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Mở {jiraUrl ? <a className="link" href={jiraUrl} target="_blank" rel="noreferrer">Jira của trường</a> : 'Jira của trường'} và đăng nhập (trong mạng trường hoặc VPN).</li>
                  <li>Bấm nút <b>Đồng bộ Jira → UEB</b> trên thanh dấu trang.</li>
                  <li>Đợi ô đỏ góc phải dưới báo <b>Đã cập nhật…</b>, rồi tải lại trang này. Cứ để tab Jira mở thì số liệu tự mới lại mỗi 30 phút.</li>
                </ol>
              </div>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">Gặp trục trặc?</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 muted">
                <li><b>Không kéo được nút</b> (Safari, máy công ty khóa): bấm <b>Chép mã nút</b>, tạo một dấu trang mới bất kỳ, sửa dấu trang đó và dán mã vào ô URL/Địa chỉ.</li>
                <li><b>Bấm nút không thấy gì:</b> phải bấm khi đang ở trang Jira của trường (không phải trang này), và đã đăng nhập Jira.</li>
                <li><b>Báo &quot;Thiếu mã đồng bộ&quot; hoặc lỗi 401:</b> nút đã cũ. Bấm <b>Tạo lại nút</b> rồi kéo nút mới lên thay nút cũ.</li>
                <li><b>Đổi máy, đổi trình duyệt:</b> làm lại phần &quot;Lần đầu&quot;, hoặc dùng Chép mã nút để tạo dấu trang trên máy kia. Tạo lại nút sẽ làm nút trên máy cũ hết hiệu lực.</li>
                <li>Cũng nút đó, bấm khi đang mở <a className="link" href="https://chamcong4lan.ueb.edu.vn/ChamCong/BaoCao" target="_blank" rel="noreferrer">trang Báo cáo chấm công</a> để lấy giờ vào/ra về Lịch → Chấm công.</li>
              </ul>
            </details>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h2 className="mb-1 font-semibold">{acc?.has_sync_key ? 'Nút của bạn' : 'Tạo nút Đồng bộ Jira'}</h2>
              <p className="mb-3 text-sm muted">
                {synced ? <>Lần cập nhật gần nhất: <b>{fmtDateTime(acc!.last_synced_at)}</b>{acc!.last_source === 'server' ? ' (tự động)' : ' (nút trên Jira)'}.</> : 'Chưa có dữ liệu Jira nào được gửi về.'}
              </p>
              <BookmarkletSetup appUrl={publicEnv.appUrl().replace(/\/+$/, '')} hasKey={Boolean(acc?.has_sync_key)} jiraUrl={jiraUrl} />
            </div>
            <div className="card space-y-3">
              <h2 className="font-semibold">Dữ liệu Jira của bạn</h2>
              <p className="text-sm muted">Chỉ bạn xem được dữ liệu này, trừ phần bạn tự bật chia sẻ ở tab Báo cáo Excel.</p>
              {features.jiraServerSync() && (
                <details className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/40" open={Boolean(acc?.has_token)}>
                  <summary className="cursor-pointer font-medium">Nâng cao: đồng bộ bằng Token (hầu hết mọi người không cần)</summary>
                  <p className="mt-2 muted">
                    Jira của trường hiện không có mục <b>Personal Access Tokens</b> trong trang hồ sơ, nên cách này chưa dùng được. Hãy dùng nút Đồng bộ Jira → UEB.
                    Chỉ khi trang hồ sơ Jira của bạn có mục đó, bạn mới tạo token và dán vào đây.
                  </p>
                  <div className="mt-2"><TokenForm hasToken={Boolean(acc?.has_token)} /></div>
                </details>
              )}
              {acc?.last_error && <p role="alert" className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">Lần đồng bộ gần nhất lỗi: {acc.last_error}</p>}
              {acc && (
                <form action={disconnectJira} className="border-t border-slate-200 pt-3 dark:border-slate-800">
                  <button className="btn-danger text-sm">Ngắt kết nối và xóa dữ liệu Jira đã lưu</button>
                </form>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Kpi({ href, label, value, hint, tone, extra }: { href: string; label: string; value: string | number; hint?: string; tone?: 'warn'; extra?: React.ReactNode }) {
  return (
    <Link href={href} className="group block border-t border-slate-100 px-4 py-3 hover:bg-slate-50 sm:border-l sm:first:border-l-0 dark:border-slate-800 dark:hover:bg-slate-800/40">
      <div className="text-xs muted group-hover:text-slate-700 dark:group-hover:text-slate-200">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'warn' && value ? 'text-orange-700 dark:text-orange-300' : ''}`}>{value}</div>
        {extra}
      </div>
      {hint && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug muted" title={hint}>{hint}</div>}
    </Link>
  );
}

// Biểu đồ cột nhỏ (giờ log 12 tuần).
function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <svg viewBox={`0 0 ${values.length * 5} 24`} className="mb-1 h-6 w-16 shrink-0" aria-hidden="true">
      {values.map((v, i) => <rect key={i} x={i * 5} y={24 - (v / max) * 24} width="3.5" height={Math.max(1, (v / max) * 24)} rx="1" className={i === values.length - 1 ? 'fill-gold-500' : 'fill-brand-300 dark:fill-brand-600'} />)}
    </svg>
  );
}

function Panel({ title, note, count, right, children }: { title: string; note?: React.ReactNode; count?: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}{count !== undefined && <span className="ml-2 text-sm font-normal muted">{count}</span>}</h2>
          {note && <p className="mt-0.5 text-xs muted">{note}</p>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function IssueLink({ k, href, title }: { k: string; href: string | null; title?: string }) {
  return href ? <a className="link whitespace-nowrap" href={href} target="_blank" rel="noreferrer" title={title}>{k}</a> : <span className="font-medium" title={title}>{k}</span>;
}

function ProofList({ items, ctx }: { items: MissingProof[]; ctx: RowCtx }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map(({ issue: i, noComment, noFile }) => (
        <li key={i.issue_key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
          <IssueLink k={i.issue_key} href={ctx.browse(i.issue_key)} />
          <span className="min-w-0 flex-1 truncate font-medium" title={i.summary}>{i.summary}</span>
          {noComment && <span className="chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">Chưa comment</span>}
          {noFile && <span className="chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">Chưa đính kèm file</span>}
          <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{i.status ?? ''}</span>
        </li>
      ))}
    </ul>
  );
}

const TONE = {
  warn: 'border-l-orange-500',
  gold: 'border-l-gold-500',
  none: 'border-l-slate-200 dark:border-l-slate-700',
};

function Group({ title, items, ctx, tone, closed }: { title: string; items: JiraIssueRow[]; ctx: RowCtx; tone?: 'warn' | 'gold'; closed?: boolean }) {
  if (!items.length) return null;
  return (
    <details open={!closed} className={`group/g card border-l-4 !py-3 ${TONE[tone ?? 'none']}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform group-open/g:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm muted">{items.length}</span>
      </summary>
      <div className="mt-2"><IssueList items={items} ctx={ctx} /></div>
    </details>
  );
}

const DUE_CHIP = {
  overdue: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  soon: 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500',
  later: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  none: '',
};

// Danh sách việc gọn: một dòng chính (hạn, mã, tóm tắt, trạng thái); bấm để mở chi tiết.
function IssueList({ items, ctx, empty, showAssignee }: { items: JiraIssueRow[]; ctx: RowCtx; empty?: string; showAssignee?: boolean }) {
  if (!items.length) return <p className="text-sm muted">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.slice(0, 200).map((i) => {
        const st = dueState(i, ctx.today);
        const d = i.due_date ? daysBetween(ctx.today, i.due_date) : null;
        const since = i.status_since ? daysBetween(vnDay(i.status_since), ctx.today) : null;
        const bBy = blockedBy(i);
        const bOut = blocking(i);
        const meta = [i.sprint, ...(i.fix_versions ?? []), ...(i.components ?? []), ...(i.labels ?? [])].filter(Boolean) as string[];
        return (
          <li key={i.issue_key}>
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                {d !== null && (
                  <span className={`chip ${DUE_CHIP[st]} tabular-nums`} title={`Hạn ${fmtDate(i.due_date!)}`}>
                    {d < 0 ? `Quá ${-d} ngày` : d === 0 ? 'Hôm nay' : `${fmtDate(i.due_date!).slice(0, 5)}`}
                  </span>
                )}
                <IssueLink k={i.issue_key} href={ctx.browse(i.issue_key)} />
                <span className="min-w-0 flex-1 truncate font-medium" title={i.summary}>{i.summary}</span>
                {bBy.length > 0 && <span className="chip !bg-orange-100 !text-orange-800 dark:!bg-orange-950 dark:!text-orange-300">Chờ {bBy.length}</span>}
                {bOut.length > 0 && <span className="chip !bg-gold-100 !text-gold-600 dark:!bg-gold-600/20 dark:!text-gold-500">Chặn {bOut.length}</span>}
                {i.reopen_count > 0 && <span className="chip !bg-orange-100 !text-orange-700 dark:!bg-orange-950 dark:!text-orange-300">Trả lại {i.reopen_count}</span>}
                {showAssignee && <span className="text-xs muted">{i.assignee_name ?? 'chưa giao'}</span>}
                <span className="chip">{i.status}</span>
                {i.my_seconds > 0 && <span className="hidden w-14 text-right text-xs tabular-nums muted sm:inline">{fmtHours(hours(i.my_seconds))} giờ</span>}
              </summary>
              <div className="mb-3 ml-5 grid gap-x-6 gap-y-1.5 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2 dark:bg-slate-800/40">
                <Info label="Trạng thái">{i.status}{since ? ` · ${since} ngày` : ''}{i.priority ? ` · ưu tiên ${i.priority}` : ''}</Info>
                <Info label="Thời gian">
                  {[i.start_date && `bắt đầu ${fmtDate(i.start_date)}`, i.due_date && `hạn ${fmtDate(i.due_date)}`].filter(Boolean).join(', ') || '—'}
                </Info>
                <Info label="Giờ">
                  {[i.my_seconds > 0 && `tôi log ${fmtHours(hours(i.my_seconds))}`, i.original_estimate && `ước tính ${fmtHours(hours(i.original_estimate))}`, i.remaining_estimate != null && `còn ${fmtHours(hours(i.remaining_estimate))}`].filter(Boolean).join(' · ') || '—'}
                </Info>
                <Info label="Người làm, người tạo">{i.assignee_name ?? 'chưa giao'} · {i.reporter_name ?? '—'}</Info>
                {i.subtask_total > 0 && <Info label="Việc con">{i.subtask_done}/{i.subtask_total} xong</Info>}
                {(i.parent_key || i.epic_key) && (
                  <Info label="Thuộc">
                    {i.parent_key && <><IssueLink k={i.parent_key} href={ctx.browse(i.parent_key)} /> {i.parent_summary} </>}
                    {i.epic_key && <>· Epic <IssueLink k={i.epic_key} href={ctx.browse(i.epic_key)} title={ctx.byKey.get(i.epic_key)?.summary} /></>}
                  </Info>
                )}
                <Info label="Dự án">{[i.project_name, i.issue_type, ...meta].filter(Boolean).join(' · ')}</Info>
                {bBy.length > 0 && <Info label="Đang chờ" warn>{bBy.map((l, n) => <span key={`${l.key}-${n}`}>{n > 0 && ', '}{l.key && <IssueLink k={l.key} href={ctx.browse(l.key)} />} {l.summary}</span>)}</Info>}
                {bOut.length > 0 && <Info label="Đang chặn" warn>{bOut.map((l, n) => <span key={`${l.key}-${n}`}>{n > 0 && ', '}{l.key && <IssueLink k={l.key} href={ctx.browse(l.key)} />} {l.summary}</span>)}</Info>}
                {i.last_comment && (
                  <div className="sm:col-span-2">
                    <Info label={`Comment mới nhất · ${i.last_comment.isMe ? 'bạn' : i.last_comment.author} · ${fmtDate(vnDay(i.last_comment.created))}`}>{mentionText(i.last_comment.body, 400)}</Info>
                  </div>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function Info({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`text-xs ${warn ? 'font-semibold text-orange-700 dark:text-orange-300' : 'muted'}`}>{label}</div>
      <div className="break-words">{children}</div>
    </div>
  );
}

function MentionList({ items, ctx, empty }: { items: JiraMentionRow[]; ctx: RowCtx; empty: string }) {
  if (!items.length) return <p className="text-sm muted">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((m) => (
        <li key={m.comment_id} className="py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 text-xs muted">
            <b className="text-slate-700 dark:text-slate-200">{m.author_name}</b>
            <span>{fmtDateTime(m.created_at)}</span>
            <IssueLink k={m.issue_key} href={ctx.browse(m.issue_key)} />
            <span className="truncate">{ctx.byKey.get(m.issue_key)?.summary}</span>
          </div>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-line" title={mentionText(m.body, 2000)}>{mentionText(m.body, 600)}</p>
        </li>
      ))}
    </ul>
  );
}

// Jira lưu @nhắc tên dạng [~tên đăng nhập]: hiện lại thành @tên.
function mentionText(body: string, max: number) {
  const t = body.replace(/\[~(?:accountid:)?([^\]]+)\]/g, '@$1');
  return t.length > max ? t.slice(0, max) + '…' : t;
}
