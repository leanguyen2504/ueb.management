import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { serverEnv } from '@/lib/env';
import { addDays, dayStartIso, fmtDateTime, vnDay } from '@/lib/format';
import { loadPersonal } from '@/lib/personal-data';
import { fmtHours } from '@/lib/jira/report';
import {
  CHECKIN_LABEL, DAY_TARGET_HOURS, ROLE_LABEL, VERDICT_LABEL, buildDays, type DayRow, type DayVerdict,
} from '@/lib/attendance';
import { WEEKDAY, hhmm } from '@/components/calendar/time';
import { PageHead } from '@/components/PageHead';
import { LichTabs } from '../tabs';
import { CheckInForm } from '../ca-nhan/PersonalForms';
import { clearCheckIn } from '../ca-nhan/actions';

export const metadata: Metadata = { title: 'Chấm công' };

const VERDICT_TONE: Record<DayVerdict, string> = {
  dat: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'mot-phan': 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500',
  'nghi-phep': 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  'cho-duyet': 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500',
  thieu: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'cuoi-tuan': '',
  'lam-cuoi-tuan': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'chua-den': '',
  'hom-nay': 'bg-brand-50 text-brand-600 dark:bg-brand-900 dark:text-brand-100',
};

const monthShift = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ thang?: string; ngay?: string }> }) {
  const sp = await searchParams;
  const today = vnDay();
  const month = /^\d{4}-\d{2}$/.test(sp.thang ?? '') ? sp.thang! : today.slice(0, 7);
  const from = `${month}-01`;
  const to = `${monthShift(month, 1)}-01`;
  // Ngày đang điểm danh: hôm nay, hoặc ngày được chọn trong 31 ngày gần đây.
  const pick = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? '') && sp.ngay! <= addDays(today, 7) && sp.ngay! >= addDays(today, -31) ? sp.ngay! : today;

  const { supabase, userId } = await requireSession();
  const data = await loadPersonal(supabase, userId, dayStartIso(from), dayStartIso(to), { worklogs: true });
  const { data: pickRow } = pick >= from && pick < to
    ? { data: data.checkins.find((c) => c.day === pick) ?? null }
    : await supabase.from('attendance_checkins').select('day, place, note, checked_at').eq('day', pick).maybeSingle();
  const days = buildDays({
    from, to, today, checkins: data.checkins, items: data.items, requests: data.requests, worklogs: data.worklogs,
    issues: data.issues, convertedField: data.convertedField,
  });
  const jiraUrl = serverEnv.jiraBaseUrl();
  const browse = (key: string) => (jiraUrl ? `${jiraUrl}/browse/${encodeURIComponent(key)}` : null);

  const past = days.filter((d) => d.day <= today);
  const workdays = past.filter((d) => !d.weekend);
  const sum = (f: (d: DayRow) => number) => past.reduce((s, d) => s + f(d), 0);
  const stats = {
    ok: past.filter((d) => d.verdict === 'dat').length,
    checked: past.filter((d) => d.checkin).length,
    leave: past.reduce((s, d) => s + (d.leaveFraction > 0 ? d.leaveFraction : 0), 0),
    present: workdays.filter((d) => d.leaveFraction < 1).length,
    missing: workdays.filter((d) => d.verdict === 'thieu').length,
    hours: sum((d) => d.worklogHours + d.teachHours),
    products: sum((d) => d.products.length),
    converted: sum((d) => d.converted),
    overtime: days.reduce((s, d) => s + d.overtime.length, 0),
  };
  const requestsInMonth = data.requests.filter((r) => r.to >= from && r.from < to);
  const [y, m] = month.split('-').map(Number);

  return (
    <>
      <LichTabs current="cham-cong" />
      <PageHead
        eyebrow="Cá nhân"
        title={`Chấm công tháng ${m}/${y}`}
        sub="Ghép điểm danh của bạn, lịch cá nhân, việc được phân công, đơn nghỉ phép và làm ngoài giờ trên Jira, worklog và sản phẩm hoàn thành. Chỉ bạn xem được trang này."
        actions={
          <>
            <Link href={`/lich/cham-cong?thang=${monthShift(month, -1)}`} className="btn-secondary">‹ Tháng trước</Link>
            {month !== today.slice(0, 7) && <Link href="/lich/cham-cong" className="btn-secondary">Tháng này</Link>}
            <Link href={`/lich/cham-cong?thang=${monthShift(month, 1)}`} className="btn-secondary">Tháng sau ›</Link>
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="card" aria-labelledby="h-diem-danh">
          <h2 id="h-diem-danh" className="mb-1 font-semibold">
            Điểm danh {pick === today ? 'hôm nay' : `ngày ${pick.slice(8)}/${pick.slice(5, 7)}`}
          </h2>
          <p className="mb-3 text-sm muted">
            {pickRow ? `Đã điểm danh: ${CHECKIN_LABEL[pickRow.place as keyof typeof CHECKIN_LABEL]} lúc ${hhmm(pickRow.checked_at)}. ` : 'Hôm nay bạn làm việc ở đâu? '}
            Điểm danh bù được trong 31 ngày: bấm vào ngày trong bảng.
          </p>
          <CheckInForm key={pick} day={pick} current={(pickRow?.place as never) ?? null} note={pickRow?.note ?? null} />
          {pickRow && (
            <form action={clearCheckIn} className="mt-2">
              <input type="hidden" name="day" value={pick} />
              <button className="text-xs text-orange-700 hover:underline dark:text-orange-300">Xóa điểm danh ngày này</button>
            </form>
          )}
        </section>

        <section aria-label="Tổng hợp tháng" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ngày có mặt" value={`${stats.present}/${workdays.length}`} />
          <Stat label="Ngày nghỉ phép (Jira)" value={fmtHours(stats.leave)} />
          <Stat label="Ngày đạt 8 giờ" value={String(stats.ok)} />
          <Stat label="Ngày chưa log work" value={String(stats.missing)} />
          <Stat label="Giờ làm (log + giảng)" value={fmtHours(Math.round(stats.hours * 100) / 100)} />
          <Stat label="Sản phẩm hoàn thành" value={String(stats.products)} />
          <Stat label="Giờ quy đổi" value={fmtHours(Math.round(stats.converted * 100) / 100)} />
          <Stat label="Đơn làm ngoài giờ" value={String(requestsInMonth.filter((r) => r.kind === 'overtime').length)} />
        </section>
      </div>

      {!data.account?.last_synced_at && (
        <p className="mb-4 rounded-xl bg-gold-100 px-4 py-3 text-sm text-gold-600 dark:bg-gold-600/20 dark:text-gold-500">
          Chưa có dữ liệu Jira. <Link href="/jira#ket-noi" className="font-semibold underline">Kết nối Jira</Link> để bảng tự ghi nghỉ phép, làm ngoài giờ, worklog và sản phẩm.
        </p>
      )}

      <div className="card overflow-x-auto !p-0">
        <table className="table min-w-[960px]">
          <thead>
            <tr>
              <th className="w-24">Ngày</th>
              <th>Làm việc ở đâu</th>
              <th>Lịch và việc được giao</th>
              <th>Nghỉ / ngoài giờ (Jira)</th>
              <th className="text-right">Giờ làm</th>
              <th>Sản phẩm hoàn thành</th>
              <th>Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} id={`ngay-${d.day}`} className={`${d.weekend ? 'bg-slate-50/70 dark:bg-slate-900/40' : ''} ${d.day === today ? 'outline outline-2 -outline-offset-2 outline-gold-500' : ''}`}>
                <td className="whitespace-nowrap align-top">
                  {d.day <= addDays(today, 7) && d.day >= addDays(today, -31) ? (
                    <Link href={`/lich/cham-cong?thang=${month}&ngay=${d.day}`} className="font-medium hover:underline" title="Điểm danh ngày này">
                      {WEEKDAY[new Date(`${d.day}T00:00:00Z`).getUTCDay()]} {d.day.slice(8)}/{d.day.slice(5, 7)}
                    </Link>
                  ) : (
                    <span className="font-medium">{WEEKDAY[new Date(`${d.day}T00:00:00Z`).getUTCDay()]} {d.day.slice(8)}/{d.day.slice(5, 7)}</span>
                  )}
                </td>
                <td className="align-top text-sm">
                  {d.place ?? <span className="muted">—</span>}
                  {d.placeFrom && <div className="text-xs muted">{d.placeFrom === 'diem-danh' ? 'tự điểm danh' : d.placeFrom === 'lich' ? 'theo lịch' : d.placeFrom === 'mac-dinh' ? 'không có đơn nghỉ' : 'theo Jira'}</div>}
                  {d.checkin?.note && <div className="text-xs muted">{d.checkin.note}</div>}
                </td>
                <td className="align-top text-sm">
                  {d.items.length === 0 ? <span className="muted">—</span> : (
                    <ul className="space-y-0.5">
                      {d.items.map((i) => (
                        <li key={i.id}>
                          <Link href={`/lich/ca-nhan?xem=ngay&ngay=${d.day}`} className="hover:underline">
                            {!i.all_day && <span className="tabular-nums muted">{hhmm(i.starts_at)} </span>}
                            {i.title}
                          </Link>
                          {(i.role || i.assigned_by) && (
                            <span className="text-xs muted"> · {[i.role && ROLE_LABEL[i.role], i.assigned_by && (i.status === 'pending' ? 'được giao, chờ nhận' : 'được giao')].filter(Boolean).join(', ')}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="align-top text-sm">
                  {[...d.leave, ...d.overtime].length === 0 ? <span className="muted">—</span> : (
                    <ul className="space-y-0.5">
                      {[...d.leave, ...d.overtime].map((r) => (
                        <li key={r.key}>
                          {r.kind === 'leave' ? 'Nghỉ' : 'Ngoài giờ'}{r.leaveType ? ` (${r.leaveType})` : ''}{r.fraction < 1 ? ', nửa ngày' : ''}{r.hours ? `, ${fmtHours(r.hours)} giờ` : ''}
                          {' · '}
                          {browse(r.key) ? <a href={browse(r.key)!} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">{r.key}</a> : r.key}
                          <span className={`ml-1 text-xs ${r.state === 'approved' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gold-600 dark:text-gold-500'}`}>
                            {r.state === 'approved' ? 'đã duyệt' : `chờ duyệt${r.status ? `: ${r.status}` : ''}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap text-right align-top text-sm tabular-nums">
                  {d.worklogHours + d.teachHours > 0 ? (
                    <>
                      {fmtHours(Math.round((d.worklogHours + d.teachHours) * 100) / 100)} giờ
                      <div className="text-xs muted">{[d.worklogHours && `log ${fmtHours(d.worklogHours)}`, d.teachHours && `giảng ${fmtHours(d.teachHours)}`].filter(Boolean).join(' · ')}</div>
                    </>
                  ) : <span className="muted">—</span>}
                </td>
                <td className="align-top text-sm">
                  {d.products.length === 0 ? <span className="muted">—</span> : (
                    <>
                      <div className="font-medium">{d.products.length} sản phẩm{d.converted ? ` · ${fmtHours(d.converted)} giờ quy đổi` : ''}</div>
                      <ul className="text-xs muted">
                        {d.products.slice(0, 4).map((p) => (
                          <li key={p.key} className="truncate" title={p.summary}>
                            {browse(p.key) ? <a href={browse(p.key)!} target="_blank" rel="noreferrer" className="hover:underline">{p.key}</a> : p.key} {p.summary}
                          </li>
                        ))}
                        {d.products.length > 4 && <li>và {d.products.length - 4} sản phẩm khác</li>}
                      </ul>
                    </>
                  )}
                </td>
                <td className="whitespace-nowrap align-top text-sm">
                  {VERDICT_LABEL[d.verdict] && <span className={`chip ${VERDICT_TONE[d.verdict]}`}>{VERDICT_LABEL[d.verdict]}</span>}
                  {d.verdict === 'mot-phan' && <div className="mt-0.5 text-xs muted">cần {fmtHours(d.target)} giờ</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-6 text-sm muted" aria-label="Cách tính">
        <h2 className="mb-1 font-semibold text-slate-700 dark:text-slate-300">Cách tính</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>Làm việc ở đâu</b>: Jira không có dữ liệu chấm công và web không nhận được dữ liệu chấm công khuôn mặt của trường, nên ngày làm việc nào không có đơn nghỉ phép trên Jira đều tính là <b>Có mặt</b>. Ngày có việc đi onsite/công tác trên Jira (tiêu đề ghi ngày, ví dụ &quot;Đi onsite Thành ủy ngày 14.10.2026&quot;) hiện là Công tác. Muốn ghi rõ ở trường, ở khoa hay đi giảng thì điểm danh hoặc thêm lịch cá nhân.</li>
          <li><b>Nghỉ phép, làm ngoài giờ</b>: chỉ đọc từ đơn trên Jira loại &quot;nghỉ phép&quot; mà bạn là người viết đơn (trường &quot;Người viết đơn&quot;, &quot;Từ ngày&quot;, &quot;Đến ngày&quot;, &quot;Số ngày nghỉ&quot;). Mỗi lần đồng bộ Jira, bảng tự cập nhật; đơn bị từ chối không tính.</li>
          <li><b>Giờ làm</b> = giờ log work trên Jira trong ngày + giờ dạy/giảng trên lịch cá nhân. <b>Sản phẩm</b> = việc Jira của bạn chuyển sang Xong trong ngày, giờ quy đổi theo trường &quot;{data.convertedField ?? 'Sản phẩm'}&quot;.</li>
          <li><b>Đạt</b> khi giờ làm hoặc giờ quy đổi đủ {DAY_TARGET_HOURS} giờ (trừ phần nghỉ phép); <b>Nghỉ có phép</b> khi đơn nghỉ đã duyệt; <b>Chưa log work</b> khi ngày làm việc đã qua mà chưa có worklog, giờ giảng hay sản phẩm nào trên Jira (vẫn tính là có mặt, chỉ nhắc bạn log work).</li>
          {data.account?.last_synced_at && <li>Dữ liệu Jira cập nhật lần cuối {fmtDateTime(data.account.last_synced_at)}. <Link href="/jira#ket-noi" className="text-brand-600 hover:underline dark:text-brand-300">Cập nhật</Link></li>}
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="card !p-4">
      <div className="text-xs muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? 'text-orange-700 dark:text-orange-300' : ''}`}>{value}</div>
    </div>
  );
}
