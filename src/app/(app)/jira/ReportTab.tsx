import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import { DataTable } from '@/components/table/DataTable';
import type { Column, Row } from '@/components/table/types';
import { loadReport, loadSharePeople, parseScope } from '@/lib/jira/load';
import { KIND_LABEL, SHARE_LABEL, monthAfter, parsePeriod, personStats, type SharePerson } from '@/lib/jira/team';
import { setJiraShare } from './actions';
import type { JiraSearch } from './page';

const STAT_COLUMNS: Column[] = [
  { key: 'name', label: 'Người', type: 'text' },
  { key: 'unit', label: 'Đơn vị', type: 'enum' },
  { key: 'groups', label: 'Nhóm, dự án chung', type: 'tags', hidden: true },
  { key: 'open', label: 'Việc mở', type: 'number', align: 'right', total: true },
  { key: 'inProgress', label: 'Đang làm', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'overdue', label: 'Quá hạn', type: 'number', align: 'right', total: true },
  { key: 'dueSoon', label: 'Đến hạn 7 ngày', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'blocked', label: 'Bị chặn', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'logHours', label: 'Giờ log', type: 'number', align: 'right', total: true },
  { key: 'logDays', label: 'Ngày có log', type: 'number', align: 'right', hidden: true },
  { key: 'logIssues', label: 'Mã có log', type: 'number', align: 'right', hidden: true },
  { key: 'products', label: 'Sản phẩm', type: 'number', align: 'right', total: true },
  { key: 'converted', label: 'Giờ quy đổi', type: 'number', align: 'right', total: true },
  { key: 'reopened', label: 'Bị trả lại', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'share', label: 'Chia sẻ', type: 'enum', hidden: true },
  { key: 'synced', label: 'Cập nhật Jira', type: 'date', nowrap: true },
];

const quarterStart = (day: string) => `${day.slice(0, 4)}-${String(Math.floor((Number(day.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;

export async function ReportTab({ sp, userId, supabase, synced, shareScope }: {
  sp: JiraSearch; userId: string; supabase: SupabaseClient; synced: boolean; shareScope?: SharePerson['share_scope'];
}) {
  const today = vnDay();
  const period = parsePeriod(sp.tu, sp.den, today);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v) params.set(k, v);
  }
  const scope = parseScope(params);
  const people = await loadSharePeople(supabase);
  const sharingReady = people !== null && shareScope !== undefined;
  const others = (people ?? []).filter((p) => !p.is_me);
  const groups = [...new Map((people ?? []).flatMap((p) => p.groups).map((g) => [g.id, g])).values()]
    .sort((a, b) => (KIND_LABEL[a.kind] ?? '').localeCompare(KIND_LABEL[b.kind] ?? '', 'vi') || a.name.localeCompare(b.name, 'vi'));
  const selected = scope.kind === 'chon' ? scope.ids : [];

  const report = synced || scope.kind !== 'toi' ? await loadReport(supabase, userId, scope, period) : { error: 'Bạn chưa kết nối Jira.' };
  const rows: Row[] = 'error' in report ? [] : report.people.map((p) => {
    const s = personStats(report.issues.filter((i) => i.user_id === p.user_id), report.worklogs.filter((w) => w.user_id === p.user_id), p.field, period, today);
    return {
      id: p.user_id,
      cells: {
        name: { v: p.full_name || p.email, sub: p.is_me ? 'Bạn' : p.email },
        unit: p.unit,
        groups: { items: p.groups.map((g) => ({ t: g.name, sub: KIND_LABEL[g.kind] })) },
        open: s.open, inProgress: s.inProgress,
        overdue: s.overdue ? { v: s.overdue, tone: 'warn' } : 0,
        dueSoon: s.dueSoon, blocked: s.blocked, logHours: s.logHours, logDays: s.logDays, logIssues: s.logIssues,
        products: s.products, converted: p.field ? s.converted : null, reopened: s.reopened,
        share: p.is_me ? 'Bạn' : SHARE_LABEL[p.share_scope],
        synced: p.last_synced_at ? { v: vnDay(p.last_synced_at), title: fmtDateTime(p.last_synced_at) } : null,
      },
    };
  });

  const preset = (label: string, from: string, to: string) => {
    const p = new URLSearchParams(params);
    p.set('muc', 'bao-cao');
    p.set('tu', from);
    p.set('den', to);
    p.delete('loi');
    p.delete('ok');
    const on = from === period.from && to === period.to;
    return <a key={label} href={`/jira?${p.toString()}`} aria-current={on ? 'page' : undefined}>{label}</a>;
  };
  const ym = today.slice(0, 7);
  const prevYm = (() => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })();
  const endOf = (m: string) => addDays(`${monthAfter(m)}-01`, -1);

  return (
    <div className="space-y-4">
      {sp.loi && <p role="alert" className="rounded-xl bg-orange-50 px-4 py-2.5 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">{sp.loi}</p>}
      {sp.ok === 'chia-se' && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Đã lưu lựa chọn chia sẻ.</p>}

      <form action="/jira" method="get" className="card space-y-4">
        <input type="hidden" name="muc" value="bao-cao" />
        <div>
          <h2 className="font-semibold">Xuất báo cáo Excel</h2>
          <p className="mt-0.5 text-xs muted">File gồm 6 trang: Tổng hợp theo người, Theo tháng, Sản phẩm đã nộp, Theo loại sản phẩm, Worklog, Mã việc (đủ 30 cột). Mở bằng Excel là có sẵn bộ lọc ở dòng tiêu đề.</p>
        </div>

        <fieldset>
          <legend className="label">Báo cáo của ai</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Choice name="ai" value="toi" checked={scope.kind === 'toi'} title="Chỉ tôi" sub="Dữ liệu Jira của bạn" />
            <Choice name="ai" value="nhom" checked={scope.kind === 'nhom'} disabled={!groups.length} title="Một nhóm, dự án, đơn vị"
              sub={groups.length ? 'Chọn nhóm ở ô bên dưới' : 'Chưa có ai trong nhóm chung chia sẻ với bạn'} />
            <Choice name="ai" value="tat-ca" checked={scope.kind === 'tat-ca'} disabled={!others.length} title="Mọi người liên quan"
              sub={others.length ? `${others.length} người đã chia sẻ với bạn` : 'Chưa có ai chia sẻ với bạn'} />
            <Choice name="ai" value="chon" checked={scope.kind === 'chon'} disabled={!others.length} title="Chọn từng người" sub="Đánh dấu ở danh sách bên dưới" />
          </div>
          {!sharingReady && <p className="mt-2 text-xs muted">Báo cáo người liên quan cần bật tính năng chia sẻ trên cơ sở dữ liệu (quản trị chạy migration chia sẻ Jira).</p>}
        </fieldset>

        {(groups.length > 0 || others.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.length > 0 && (
              <label className="block">
                <span className="label">Nhóm, dự án, đơn vị</span>
                <select name="nhom" defaultValue={scope.kind === 'nhom' ? scope.id : ''} className="input">
                  <option value="">Chọn…</option>
                  {Object.entries(KIND_LABEL).map(([k, label]) => {
                    const list = groups.filter((g) => g.kind === k);
                    return list.length ? (
                      <optgroup key={k} label={label}>
                        {list.map((g) => <option key={g.id} value={g.id}>{g.name} ({(people ?? []).filter((p) => p.groups.some((x) => x.id === g.id)).length} người)</option>)}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>
            )}
            {others.length > 0 && (
              <details className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800" open={scope.kind === 'chon'}>
                <summary className="cursor-pointer text-sm font-medium">Chọn người ({selected.length ? `${selected.length} đã chọn` : `${people!.length} người`})</summary>
                <div className="mt-2 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                  {(people ?? []).map((p) => (
                    <label key={p.user_id} className="flex items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="checkbox" name="nguoi" value={p.user_id} defaultChecked={selected.includes(p.user_id)} className="mt-1" />
                      <span className="min-w-0">
                        <span className="block truncate">{p.full_name || p.email}{p.is_me ? ' (bạn)' : ''}</span>
                        <span className="block truncate text-xs muted">{p.groups.map((g) => g.name).join(', ') || p.unit}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="label">Từ ngày</span><input type="date" name="tu" defaultValue={period.from} className="input !w-40" /></label>
          <label className="block"><span className="label">Đến ngày</span><input type="date" name="den" defaultValue={period.to} className="input !w-40" /></label>
          <nav className="seg" aria-label="Chọn nhanh kỳ báo cáo">
            {preset('Tháng này', `${ym}-01`, endOf(ym))}
            {preset('Tháng trước', `${prevYm}-01`, endOf(prevYm))}
            {preset('Quý này', quarterStart(today), endOf(addDays(quarterStart(today), 62).slice(0, 7)))}
            {preset('Năm nay', `${ym.slice(0, 4)}-01-01`, `${ym.slice(0, 4)}-12-31`)}
          </nav>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button className="btn-secondary">Xem số liệu</button>
          <button formAction="/jira/xuat" className="btn">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
            Tải Excel
          </button>
        </div>
      </form>

      <section className="card">
        <h2 className="font-semibold">Số liệu {fmtDate(period.from)} – {fmtDate(period.to)}</h2>
        <p className="mb-3 mt-0.5 text-xs muted">Việc mở, quá hạn tính tại hôm nay; giờ log, sản phẩm, giờ quy đổi tính trong kỳ. Bấm Cột để thêm số liệu (đang làm, bị chặn, số ngày có log, bị trả lại...).</p>
        {'error' in report
          ? <p className="text-sm muted">{report.error}</p>
          : <DataTable id="jira-bao-cao" columns={STAT_COLUMNS} rows={rows} exportName="so-lieu-jira" empty="Không có ai trong phạm vi này." />}
      </section>

      <section className="card">
        <h2 className="font-semibold">Chia sẻ dữ liệu Jira của tôi</h2>
        <p className="mt-0.5 text-sm muted">
          Mặc định chỉ bạn xem được. Khi bật, người được chọn xem và xuất được: mã việc (tóm tắt, trạng thái, hạn, giờ, sản phẩm, giờ quy đổi) và worklog của bạn.
          Không chia sẻ comment, lời nhắc tên và lịch sử trạng thái. Chỉ tính các nhóm, dự án, đơn vị bạn đang tham gia (không tính không gian cá nhân).
        </p>
        {!synced ? (
          <p className="mt-3 text-sm muted">Kết nối Jira trước để chia sẻ.</p>
        ) : !sharingReady ? (
          <p className="mt-3 text-sm muted">Tính năng chia sẻ chưa được bật trên cơ sở dữ liệu.</p>
        ) : (
          <form action={setJiraShare} className="mt-3 space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <Choice name="scope" value="none" checked={shareScope === 'none'} title="Không chia sẻ" sub="Chỉ mình tôi xem được" />
              <Choice name="scope" value="leads" checked={shareScope === 'leads'} title="Trưởng nhóm, Văn thư" sub="Của các nhóm, dự án, đơn vị tôi tham gia" />
              <Choice name="scope" value="members" checked={shareScope === 'members'} title="Mọi thành viên nhóm chung" sub="Ai cùng nhóm, dự án, đơn vị với tôi" />
            </div>
            <button className="btn">Lưu lựa chọn</button>
          </form>
        )}
      </section>
    </div>
  );
}

function Choice({ name, value, checked, disabled, title, sub }: { name: string; value: string; checked: boolean; disabled?: boolean; title: string; sub: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 dark:has-[:checked]:border-brand-300 dark:has-[:checked]:bg-brand-900/30 ${disabled ? 'cursor-not-allowed opacity-50' : ''} border-slate-200 dark:border-slate-800`}>
      <input type="radio" name={name} value={value} defaultChecked={checked} disabled={disabled} className="mt-0.5" />
      <span><span className="block font-medium">{title}</span><span className="block text-xs muted">{sub}</span></span>
    </label>
  );
}
