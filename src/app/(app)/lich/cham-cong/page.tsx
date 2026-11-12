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
import { DataTable } from '@/components/table/DataTable';
import { AutoRefresh } from '@/components/AutoRefresh';
import { excuseKeys, punchFindings, punchSpan, violationsOf, type PunchRow, type PunchSync } from '@/lib/punch';
import type { Column, Row, Tone } from '@/components/table/types';
import { LichTabs } from '../tabs';
import { CheckInForm } from '../ca-nhan/PersonalForms';
import { clearCheckIn } from '../ca-nhan/actions';

export const metadata: Metadata = { title: 'Chấm công' };

const PUNCH_SITE = 'https://chamcong4lan.ueb.edu.vn/ChamCong/BaoCao';

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
  const [data, { data: punches }, { data: punchSync }] = await Promise.all([
    loadPersonal(supabase, userId, dayStartIso(from), dayStartIso(to), { worklogs: true }),
    supabase.from('attendance_punches').select('*').gte('day', from).lt('day', to).order('day').returns<PunchRow[]>(),
    supabase.from('attendance_punch_sync').select('*').maybeSingle<PunchSync>(),
  ]);
  const { data: pickRow } = pick >= from && pick < to
    ? { data: data.checkins.find((c) => c.day === pick) ?? null }
    : await supabase.from('attendance_checkins').select('day, place, note, checked_at').eq('day', pick).maybeSingle();
  const days = buildDays({
    from, to, today, checkins: data.checkins, items: data.items, requests: data.requests, worklogs: data.worklogs,
    issues: data.issues, convertedField: data.convertedField, punches: punches ?? [],
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
    punchErrors: past.reduce((s, d) => s + (d.punch?.error_count ?? 0), 0),
    punchConverted: past.reduce((s, d) => s + (d.punch?.minutes_converted ?? 0), 0),
  };
  // Ngày máy chấm công ghi lỗi mà chưa có giải trình, hoặc lệch với đơn trên Jira.
  const findings = past.map((d) => ({ d, f: punchFindings(d.punch, d.leave) })).filter((x) => x.f.length);
  const punchAgeH = punchSync ? (Date.now() - Date.parse(punchSync.synced_at)) / 3600000 : null;
  const requestsInMonth = data.requests.filter((r) => r.to >= from && r.from < to);
  const [y, m] = month.split('-').map(Number);

  return (
    <>
      <LichTabs current="cham-cong" />
      <AutoRefresh seconds={60} />
      <PageHead
        eyebrow="Cá nhân"
        title={`Chấm công tháng ${m}/${y}`}
        sub="Ghép máy chấm công của trường, điểm danh của bạn, lịch cá nhân, việc được phân công, đơn nghỉ phép và làm ngoài giờ trên Jira, worklog và sản phẩm hoàn thành. Chỉ bạn xem được trang này."
        actions={
          <>
            <Link href={`/lich/cham-cong?thang=${monthShift(month, -1)}`} className="btn-secondary">‹ Tháng trước</Link>
            {month !== today.slice(0, 7) && <Link href="/lich/cham-cong" className="btn-secondary">Tháng này</Link>}
            <Link href={`/lich/cham-cong?thang=${monthShift(month, 1)}`} className="btn-secondary">Tháng sau ›</Link>
          </>
        }
      />

      {(() => {
        // Những điều cần rà soát trong tháng, hiện ngay đầu trang.
        const missing = workdays.filter((d) => d.verdict === 'thieu');
        const partial = workdays.filter((d) => d.verdict === 'mot-phan');
        const pendingReq = requestsInMonth.filter((r) => r.state === 'pending');
        const stale = data.account?.last_synced_at ? Math.round((Date.now() - Date.parse(data.account.last_synced_at)) / 86400000) : null;
        const notes: React.ReactNode[] = [];
        if (!data.account?.last_synced_at) notes.push(<>Chưa có dữ liệu Jira. <Link href="/jira?muc=ket-noi" className="font-semibold underline">Kết nối Jira</Link> để bảng tự ghi nghỉ phép, làm ngoài giờ, worklog và sản phẩm.</>);
        else if (stale !== null && stale >= 2) notes.push(<>Dữ liệu Jira đã cũ {stale} ngày (cập nhật {fmtDateTime(data.account.last_synced_at)}). <Link href="/jira?muc=ket-noi" className="font-semibold underline">Cập nhật</Link></>);
        if (missing.length) notes.push(<>{missing.length} ngày làm việc chưa có worklog: {missing.slice(0, 8).map((d) => `${d.day.slice(8)}/${d.day.slice(5, 7)}`).join(', ')}{missing.length > 8 ? '…' : ''}</>);
        if (partial.length) notes.push(<>{partial.length} ngày chưa đủ {DAY_TARGET_HOURS} giờ.</>);
        if (pendingReq.length) notes.push(<>{pendingReq.length} đơn nghỉ/ngoài giờ trên Jira đang chờ duyệt.</>);
        if (punchSync?.excuse_error) notes.push(<><b>Hệ thống chấm công của trường báo không đọc được đơn nghỉ phép từ Jira</b> ở lần đồng bộ gần nhất: số lỗi có thể chưa trừ ngày nghỉ. Đừng dựa vào số lỗi lúc này, hãy đồng bộ lại sau.</>);
        if (findings.length) notes.push(<>
          <b>{findings.length} ngày máy chấm công ghi lỗi chưa được giải trình</b>:{' '}
          {findings.slice(0, 6).map(({ d, f }, i) => (
            <span key={d.day}>{i > 0 && '; '}{d.day.slice(8)}/{d.day.slice(5, 7)} {violationsOf(d.punch).map((v) => v.label).join(', ') || `${d.punch!.error_count} lỗi`} ({f.join('; ').toLowerCase()})</span>
          ))}
          {findings.length > 6 ? '…' : ''}. Nếu sai, làm đơn giải trình trên Jira hoặc báo phòng TCNS.
        </>);
        if (punchAgeH !== null && punchAgeH >= 24) notes.push(<>Dữ liệu máy chấm công cập nhật lúc {fmtDateTime(punchSync!.synced_at)}, đã cũ {Math.floor(punchAgeH / 24)} ngày. Mở <a href={PUNCH_SITE} target="_blank" rel="noreferrer" className="font-semibold underline">trang chấm công</a> và bấm nút Đồng bộ Jira → UEB.</>);
        return notes.length > 0 && (
          <section role="status" aria-label="Cần rà soát" className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200">
            <h2 className="mb-1 font-semibold">Cần rà soát</h2>
            <ul className="list-disc space-y-0.5 pl-5">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </section>
        );
      })()}

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <section className="card" aria-labelledby="h-diem-danh">
          <h2 id="h-diem-danh" className="mb-1 font-semibold">
            Điểm danh {pick === today ? 'hôm nay' : `ngày ${pick.slice(8)}/${pick.slice(5, 7)}`}
          </h2>
          <p className="mb-3 text-sm muted">
            {pickRow ? `Đã điểm danh: ${CHECKIN_LABEL[pickRow.place as keyof typeof CHECKIN_LABEL]} lúc ${hhmm(pickRow.checked_at)}. ` : 'Hôm nay bạn làm việc ở đâu? '}
            Điểm danh bù trong 31 ngày: bấm vào ngày ở bảng.
          </p>
          <CheckInForm key={pick} day={pick} current={(pickRow?.place as never) ?? null} note={pickRow?.note ?? null} />
          {pickRow && (
            <form action={clearCheckIn} className="mt-2">
              <input type="hidden" name="day" value={pick} />
              <button className="text-xs text-orange-700 hover:underline dark:text-orange-300">Xóa điểm danh ngày này</button>
            </form>
          )}
          <div className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
            <h3 className="mb-1 font-semibold">Máy chấm công của trường</h3>
            {punchSync ? (
              <p className="muted">
                Cập nhật lúc {fmtDateTime(punchSync.synced_at)}
                {punchSync.source_synced_at ? `, máy chấm công lấy dữ liệu lúc ${fmtDateTime(punchSync.source_synced_at)}` : ''}.
                {' '}Tài khoản {punchSync.punch_username}{punchSync.unit_name ? ` · ${punchSync.unit_name}` : ''}.{' '}
                <a href={PUNCH_SITE} target="_blank" rel="noreferrer" className="link">Mở trang chấm công</a> rồi bấm nút <b>Đồng bộ Jira → UEB</b> để cập nhật; để tab đó mở thì nút tự cập nhật mỗi 10 phút, trang này tự làm mới mỗi phút.
              </p>
            ) : (
              <p className="muted">
                Chưa có giờ vào/ra. Máy chấm công nằm trong mạng của trường nên web không tự đọc được: hãy dùng nút <b>Đồng bộ Jira → UEB</b>
                {data.account?.has_sync_key ? ' đã lưu trên thanh dấu trang' : <> (chưa có thì <Link href="/jira?muc=ket-noi" className="link">tạo nút</Link>)</>},
                mở <a href={PUNCH_SITE} target="_blank" rel="noreferrer" className="link">trang Báo cáo chấm công</a>, đăng nhập rồi bấm nút. Nút chỉ gửi dòng chấm công của chính bạn.
              </p>
            )}
          </div>
        </section>

        <section aria-label="Tổng hợp tháng" className="grid items-start gap-3 sm:grid-cols-3">
          <StatGroup title="Ngày công" items={[
            { label: 'Có mặt', value: `${stats.present}/${workdays.length}` },
            { label: 'Nghỉ phép (Jira)', value: fmtHours(stats.leave) },
            ...(punchSync
              ? [{ label: 'Lỗi chấm công', value: String(stats.punchErrors), warn: findings.length > 0 }]
              : [{ label: 'Tự điểm danh', value: String(stats.checked) }]),
          ]} />
          <StatGroup title="Giờ làm" items={[
            { label: 'Log + giảng', value: fmtHours(Math.round(stats.hours * 100) / 100) },
            { label: `Ngày đạt ${DAY_TARGET_HOURS} giờ`, value: String(stats.ok) },
            { label: 'Ngày chưa log', value: String(stats.missing), warn: stats.missing > 0 },
          ]} />
          <StatGroup title="Kết quả" items={[
            { label: 'Sản phẩm', value: String(stats.products) },
            { label: 'Giờ quy đổi', value: fmtHours(Math.round(stats.converted * 100) / 100) },
            { label: 'Đơn ngoài giờ', value: String(requestsInMonth.filter((r) => r.kind === 'overtime').length) },
          ]} />
        </section>
      </div>

      <section className="card">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Bảng chấm công theo ngày</h2>
          <p className="text-xs muted">Lọc cột Đánh giá để xem ngày chưa log, chưa đủ giờ; bấm Cột để bật giờ log, giờ giảng, danh sách sản phẩm; mũi tên đầu dòng mở chi tiết ngày.</p>
        </div>
        <DataTable id="cham-cong" columns={COLUMNS} exportName={`cham-cong-${month}`} pageSize={40}
          rows={days.map((d) => dayRow(d, { today, month, browse }))} />
      </section>

      <details className="mt-6 text-sm muted">
        <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-300">Cách tính</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Máy chấm công</b>: giờ vào/ra, vi phạm (đi muộn, về sớm, không chấm), giải trình và số lỗi lấy nguyên từ <a href={PUNCH_SITE} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">báo cáo chấm công của trường</a> mỗi khi bạn bấm nút đồng bộ ở trang đó. Ngày có lỗi mà chưa có giải trình được tô vàng và ghi rõ: đã có đơn duyệt trên Jira nhưng máy chưa ghi nhận, đơn đang chờ duyệt, hay chưa có đơn.</li>
          <li><b>Làm việc ở đâu</b>: ngày có giờ chấm trên máy tính là <b>Ở trường</b>. Ngày chưa có dữ liệu máy chấm công mà không có đơn nghỉ phép trên Jira thì tạm tính là <b>Có mặt</b>. Ngày có việc đi onsite/công tác trên Jira (tiêu đề ghi ngày, ví dụ &quot;Đi onsite Thành ủy ngày 14.10.2026&quot;) hiện là Công tác. Muốn ghi rõ ở trường, ở khoa hay đi giảng thì điểm danh hoặc thêm lịch cá nhân.</li>
          <li><b>Nghỉ phép, làm ngoài giờ</b>: chỉ đọc từ đơn trên Jira loại &quot;nghỉ phép&quot; mà bạn là người viết đơn (trường &quot;Người viết đơn&quot;, &quot;Từ ngày&quot;, &quot;Đến ngày&quot;, &quot;Số ngày nghỉ&quot;). Mỗi lần đồng bộ Jira, bảng tự cập nhật; đơn bị từ chối không tính.</li>
          <li><b>Giờ làm</b> = giờ log work trên Jira trong ngày + giờ dạy/giảng trên lịch cá nhân. <b>Sản phẩm</b> = việc Jira của bạn chuyển sang Xong trong ngày, giờ quy đổi theo trường &quot;{data.convertedField ?? 'Sản phẩm'}&quot;.</li>
          <li><b>Đạt</b> khi giờ làm hoặc giờ quy đổi đủ {DAY_TARGET_HOURS} giờ (trừ phần nghỉ phép); <b>Nghỉ có phép</b> khi đơn nghỉ đã duyệt; <b>Chưa log work</b> khi ngày làm việc đã qua mà chưa có worklog, giờ giảng hay sản phẩm nào trên Jira (vẫn tính là có mặt, chỉ nhắc bạn log work).</li>
          {data.account?.last_synced_at && <li>Dữ liệu Jira cập nhật lần cuối {fmtDateTime(data.account.last_synced_at)}. <Link href="/jira?muc=ket-noi" className="text-brand-600 hover:underline dark:text-brand-300">Cập nhật</Link></li>}
        </ul>
      </details>
    </>
  );
}

const VERDICT_TONE: Record<DayVerdict, Tone | undefined> = {
  dat: 'ok', 'mot-phan': 'gold', 'nghi-phep': 'muted', 'cho-duyet': 'gold', thieu: 'warn',
  'cuoi-tuan': undefined, 'lam-cuoi-tuan': 'ok', 'chua-den': undefined, 'hom-nay': 'info',
};
const FROM_LABEL = { 'diem-danh': 'tự điểm danh', lich: 'theo lịch', 'mac-dinh': 'không có đơn nghỉ', jira: 'theo Jira', 'may-cham-cong': 'máy chấm công' } as const;

const COLUMNS: Column[] = [
  { key: 'day', label: 'Ngày', type: 'date', nowrap: true },
  { key: 'weekday', label: 'Thứ', type: 'enum', hidden: true },
  { key: 'verdict', label: 'Đánh giá', type: 'enum', nowrap: true },
  { key: 'place', label: 'Làm việc ở đâu', type: 'enum' },
  { key: 'punch', label: 'Giờ vào – ra', type: 'text', nowrap: true, help: 'Theo máy chấm công của trường: ca sáng · ca chiều' },
  { key: 'violations', label: 'Vi phạm chấm công', type: 'tags' },
  { key: 'punchErrors', label: 'Số lỗi', type: 'number', align: 'right', total: true },
  { key: 'punchMinutes', label: 'Phút quy đổi', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'excuse', label: 'Giải trình (máy chấm công)', type: 'tags', hidden: true },
  { key: 'hours', label: 'Giờ làm', type: 'number', align: 'right', total: true },
  { key: 'worklog', label: 'Giờ log', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'teach', label: 'Giờ giảng', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'products', label: 'Sản phẩm', type: 'number', align: 'right', total: true },
  { key: 'converted', label: 'Giờ quy đổi', type: 'number', align: 'right', total: true },
  { key: 'items', label: 'Lịch và việc được giao', type: 'tags', wide: true },
  { key: 'requests', label: 'Nghỉ / ngoài giờ (Jira)', type: 'tags' },
  { key: 'productList', label: 'Danh sách sản phẩm', type: 'tags', hidden: true, wide: true },
  { key: 'overtimeHours', label: 'Giờ ngoài giờ', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'note', label: 'Ghi chú điểm danh', type: 'text', hidden: true },
];

function dayRow(d: DayRow, o: { today: string; month: string; browse: (k: string) => string | null }): Row {
  const wd = WEEKDAY[new Date(`${d.day}T00:00:00Z`).getUTCDay()];
  const canPick = d.day <= addDays(o.today, 7) && d.day >= addDays(o.today, -31);
  const total = Math.round((d.worklogHours + d.teachHours) * 100) / 100;
  const reqs = [...d.leave, ...d.overtime];
  const findings = d.day <= o.today ? punchFindings(d.punch, d.leave) : [];
  const excuses = [d.punch?.excuse_am, d.punch?.excuse_pm].flatMap((e) => (e ?? '').split(';')).map((x) => x.trim()).filter(Boolean);
  return {
    id: d.day,
    tone: findings.length ? 'warn' : d.day === o.today ? 'today' : d.weekend ? 'weekend' : undefined,
    cells: {
      day: { v: d.day, t: `${wd} ${d.day.slice(8)}/${d.day.slice(5, 7)}`, href: canPick ? `/lich/cham-cong?thang=${o.month}&ngay=${d.day}` : undefined, title: canPick ? 'Điểm danh ngày này' : undefined },
      weekday: wd,
      punch: d.punch ? { v: punchSpan(d.punch) || null, t: punchSpan(d.punch) || '—', sub: d.punch.makeup_day ? 'ngày làm bù' : undefined } : null,
      violations: { items: [
        ...violationsOf(d.punch).map((v) => ({ t: v.label, tone: (excuseKeys(d.punch).length ? 'muted' : v.heavy ? 'danger' : 'warn') as Tone })),
        ...findings.map((f) => ({ t: f, tone: 'gold' as Tone })),
      ] },
      punchErrors: d.punch?.error_count || null,
      punchMinutes: d.punch?.minutes_converted || null,
      excuse: { items: excuses.map((e) => ({ t: e, href: o.browse(e.split('·')[0].trim()) ?? undefined, ext: true })) },
      place: { v: d.place ?? '', sub: d.placeFrom ? FROM_LABEL[d.placeFrom] : undefined },
      items: { items: d.items.map((i) => ({
        t: `${i.all_day ? '' : `${hhmm(i.starts_at)} `}${i.title}`,
        href: `/lich/ca-nhan?xem=ngay&ngay=${d.day}`,
        sub: [i.role && ROLE_LABEL[i.role], i.assigned_by && (i.status === 'pending' ? 'được giao, chờ nhận' : 'được giao')].filter(Boolean).join(', ') || undefined,
      })) },
      requests: { items: reqs.map((r) => ({
        t: `${r.kind === 'leave' ? 'Nghỉ' : 'Ngoài giờ'}${r.leaveType ? ` (${r.leaveType})` : ''}${r.fraction < 1 ? ', nửa ngày' : ''}${r.hours ? `, ${fmtHours(r.hours)} giờ` : ''}`,
        href: o.browse(r.key) ?? undefined, ext: true,
        sub: r.state === 'approved' ? 'đã duyệt' : `chờ duyệt${r.status ? `: ${r.status}` : ''}`,
      })) },
      worklog: d.worklogHours || null,
      teach: d.teachHours || null,
      hours: total ? { v: total, sub: [d.worklogHours && `log ${fmtHours(d.worklogHours)}`, d.teachHours && `giảng ${fmtHours(d.teachHours)}`].filter(Boolean).join(' · ') || undefined } : null,
      products: d.products.length || null,
      productList: { items: d.products.map((p) => ({ t: p.key, href: o.browse(p.key) ?? undefined, ext: true, sub: p.summary })) },
      converted: d.converted || null,
      overtimeHours: d.overtimeHours || null,
      verdict: VERDICT_LABEL[d.verdict] ? { v: VERDICT_LABEL[d.verdict], tone: VERDICT_TONE[d.verdict], sub: d.verdict === 'mot-phan' ? `cần ${fmtHours(d.target)} giờ` : undefined } : null,
      note: d.checkin?.note ?? null,
    },
    detail: d.products.length || d.checkin?.note || reqs.length || d.punch ? [
      ...(d.punch ? [{ label: 'Máy chấm công', value: `${punchSpan(d.punch) || 'Không có lần chấm'}${d.punch.error_count ? ` · ${d.punch.error_count} lỗi, ${d.punch.minutes_converted} phút quy đổi` : ''}${excuses.length ? ` · giải trình: ${excuses.join('; ')}` : ''}` }] : []),
      ...(d.checkin ? [{ label: 'Điểm danh', value: `${CHECKIN_LABEL[d.checkin.place]} lúc ${hhmm(d.checkin.checked_at)}${d.checkin.note ? ` · ${d.checkin.note}` : ''}` }] : []),
      ...(d.products.length ? [{ label: `Sản phẩm hoàn thành (${d.products.length})`, value: { items: d.products.map((p) => ({ t: p.key, href: o.browse(p.key) ?? undefined, ext: true, sub: `${p.summary}${p.converted ? ` · ${fmtHours(p.converted)} giờ QĐ` : ''}` })) } }] : []),
      ...(reqs.length ? [{ label: 'Đơn trên Jira', value: { items: reqs.map((r) => ({ t: r.key, href: o.browse(r.key) ?? undefined, ext: true, sub: r.title })) } }] : []),
    ] : undefined,
  };
}

function StatGroup({ title, items }: { title: string; items: { label: string; value: string; warn?: boolean }[] }) {
  return (
    <div className="card !p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide muted">{title}</h3>
      <dl className="space-y-1.5">
        {items.map((i) => (
          <div key={i.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-sm muted">{i.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${i.warn ? 'text-orange-700 dark:text-orange-300' : ''}`}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
