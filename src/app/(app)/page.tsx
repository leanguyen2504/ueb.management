import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { TaskList } from '@/components/TaskList';
import { ProgressBar, progressOf } from '@/components/TaskProgress';
import { CalendarFilter } from '@/components/CalendarFilter';
import { loadPeople } from '@/lib/people';
import { addDays, dayStartIso, fmtDate, fmtDateTime, fmtTime, greeting, todayLabel, vnDay, weekdayShort } from '@/lib/format';
import { isGoogleCalendarEnabled } from '@/lib/google-calendar';
import { loadMeetings, meetingProgress } from '@/lib/meetings';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { KIND_LABEL, groupTypeLabel, type Booking, type CalEvent, type Group, type Task } from '@/lib/types';

type SP = { lich?: string; khoang?: string; tu?: string; den?: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RANGES = [
  { key: '', label: 'Hôm nay' },
  { key: 'ngay-mai', label: 'Ngày mai' },
  { key: 'tuan-nay', label: 'Tuần này' },
  { key: 'tuan-sau', label: 'Tuần sau' },
  { key: '7-ngay', label: '7 ngày tới' },
] as const;

// Khoảng ngày của mục Họp: [from, to) theo ngày giờ Việt Nam, tối đa 62 ngày.
function meetingRange(sp: SP, today: string) {
  const monday = (d: string) => { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); return addDays(d, wd === 0 ? -6 : 1 - wd); };
  switch (sp.khoang) {
    case 'ngay-mai': return { key: 'ngay-mai', from: addDays(today, 1), to: addDays(today, 2), label: 'ngày mai' };
    case 'tuan-nay': { const m = monday(today); return { key: 'tuan-nay', from: m, to: addDays(m, 7), label: 'tuần này' }; }
    case 'tuan-sau': { const m = addDays(monday(today), 7); return { key: 'tuan-sau', from: m, to: addDays(m, 7), label: 'tuần sau' }; }
    case '7-ngay': return { key: '7-ngay', from: today, to: addDays(today, 7), label: '7 ngày tới' };
    case 'tuy-chon': {
      let from = DAY.test(sp.tu ?? '') ? sp.tu! : today;
      let last = DAY.test(sp.den ?? '') ? sp.den! : from;
      if (last < from) [from, last] = [last, from];
      const max = addDays(from, 61);
      if (last > max) last = max;
      return { key: 'tuy-chon', from, to: addDays(last, 1), label: from === last ? `ngày ${fmtDate(from)}` : `${fmtDate(from)} – ${fmtDate(last)}` };
    }
    default: return { key: '', from: today, to: addDays(today, 1), label: 'hôm nay' };
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { lich } = sp;
  const { supabase, userId, profile } = await requireSession();
  const today = vnDay();
  const range = meetingRange(sp, today);
  const rangeFromIso = dayStartIso(range.from);
  const rangeToIso = dayStartIso(range.to);
  const multiDay = range.to !== addDays(range.from, 1);
  const nowIso = new Date().toISOString();
  const [{ data: groups }, { data: mine }, { data: tasks }, { data: groupTasks }, { data: pendingBookings }, { count: unreadCount }, meetings, { data: rangeEvents }] = await Promise.all([
    supabase.from('groups').select('*').is('archived_at', null).order('name').returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('assignee_id', userId).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(50).returns<Task[]>(),
    supabase.from('group_members').select('group_id').eq('user_id', userId).then(async ({ data }) => {
      const ids = (data ?? []).map((d) => d.group_id);
      return ids.length ? supabase.from('tasks').select('group_id, status, due_date').in('group_id', ids) : { data: [] as Pick<Task, 'group_id' | 'status' | 'due_date'>[] };
    }),
    supabase.from('bookings').select('*').eq('host_id', userId).eq('status', 'pending').gte('ends_at', nowIso).returns<Booking[]>(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    // Buổi họp trong khoảng đã chọn từ lịch Google dùng chung mà tôi được xem (Hiệu trưởng, thư ký...).
    isGoogleCalendarEnabled() ? loadMeetings(supabase, userId, rangeFromIso, rangeToIso).catch(() => []) : Promise.resolve([]),
    supabase.from('events').select('*').gte('ends_at', rangeFromIso).lt('starts_at', rangeToIso).order('starts_at').limit(300).returns<CalEvent[]>(),
  ]);
  const mineIds = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager]));
  const myGroups = (groups ?? []).filter((g) => mineIds.has(g.id));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const openTasks = tasks ?? [];
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < today).length;
  const { name } = await loadPeople(supabase, [userId]);

  // Họp hôm nay: buổi họp lịch Google (kèm tiến độ hồ sơ) và lịch nhóm của tôi. Một buổi họp
  // có cả trong lịch nhóm và lịch Google (cùng giờ, cùng tên) chỉ hiện một dòng theo lịch Google.
  const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
  const googleSeen = new Set(meetings.map((m) => `${new Date(m.starts_at).getTime()}|${norm(m.title)}`));
  const sourceLabels = new Map<string, string>();
  for (const m of meetings) if (m.source_label) sourceLabels.set(m.source_id, m.source_label);
  const filters = [
    { key: '', label: 'Tất cả' },
    ...[...sourceLabels].map(([id, label]) => ({ key: `g:${id}`, label })),
    { key: 'nhom', label: 'Lịch nhóm của tôi' },
  ];
  const filter = filters.some((f) => f.key === lich) ? lich! : '';
  type TodayItem = { key: string; start: string; day: string; time: string; title: string; location: string | null; source: string; href: string; chip?: string; warn?: boolean };
  const todayItems: TodayItem[] = [
    ...meetings
      .filter((m) => !filter || filter === `g:${m.source_id}`)
      .map((m) => {
        const p = meetingProgress(m);
        const docs = p.preTotal + m.attachments.length;
        return {
          key: `g|${m.source_id}|${m.event_key}`, start: m.starts_at, day: vnDay(m.starts_at), time: m.all_day ? 'Cả ngày' : fmtTime(m.starts_at), title: m.title,
          location: m.location, source: m.source_label, href: `/hop?ngay=${vnDay(m.starts_at)}#${meetingAnchor(m.source_id, m.event_key)}`,
          chip: docs ? (p.preTotal ? `Tài liệu ${p.preDone}/${p.preTotal} bên` : `${m.attachments.length} tài liệu`) + (p.minutesDone ? ' · có biên bản' : '') : 'Chưa có tài liệu',
          warn: p.preDone < p.preTotal,
        };
      }),
    ...(!filter || filter === 'nhom' ? (rangeEvents ?? []).filter((e) => mineIds.has(e.group_id)) : [])
      .filter((e) => !googleSeen.has(`${new Date(e.starts_at).getTime()}|${norm(e.title)}`))
      .map((e) => ({
        key: `e|${e.id}`, start: e.starts_at, day: vnDay(e.starts_at) < range.from ? range.from : vnDay(e.starts_at), time: fmtTime(e.starts_at), title: e.title, location: e.location,
        source: groupName.get(e.group_id) ?? 'Lịch nhóm', href: `/lich?xem=ngay&ngay=${vnDay(e.starts_at)}`,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start));
  const byDay = new Map<string, TodayItem[]>();
  for (const it of todayItems) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);
  const qs = (patch: Partial<SP>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ lich: filter, khoang: range.key, tu: sp.tu, den: sp.den, ...patch })) if (v) q.set(k, v);
    if (q.get('khoang') !== 'tuy-chon') { q.delete('tu'); q.delete('den'); }
    const t = q.toString();
    return t ? `/?${t}` : '/';
  };
  const pill = (on: boolean) => `rounded-lg px-3 py-1 text-sm ${on ? 'bg-white font-semibold text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white' : 'font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`;
  const missingMeetings = meetings.filter((m) => { const p = meetingProgress(m); return p.preDone < p.preTotal; }).length;
  // Bốn ô "cần để ý": chỉ những gì cần người dùng làm, bấm để tới đúng chỗ.
  const attention = [
    { n: overdue, text: 'việc quá hạn cần xử lý', href: '/viec', tone: 'text-orange-700 dark:text-orange-400' },
    { n: missingMeetings, text: `cuộc họp ${range.label} còn thiếu tài liệu`, href: `/hop?ngay=${range.from}${multiDay ? '&xem=tuan' : ''}&thieu=1`, tone: 'text-amber-600 dark:text-amber-400' },
    { n: pendingBookings?.length ?? 0, text: 'yêu cầu gặp chờ bạn xác nhận', href: '/dat-lich', tone: '' },
    { n: unreadCount ?? 0, text: 'thông báo chưa đọc', href: '/thong-bao', tone: '' },
  ];
  const groupProgress = (id: string) => progressOf((groupTasks ?? []).filter((t) => t.group_id === id));
  return (
    <>
      <PageHead eyebrow={todayLabel()} title={`${greeting()}, ${profile.full_name || profile.email}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {attention.map((a) => (
          <Link key={a.text} href={a.href} className="card flex items-center gap-3 py-3 hover:border-brand-600 md:py-3.5 dark:hover:border-brand-300">
            <span className={`font-display text-2xl font-semibold tabular-nums ${a.n ? a.tone : 'text-slate-400'}`}>{a.n}</span>
            <span className="text-sm leading-snug muted">{a.text}</span>
          </Link>
        ))}
      </div>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Họp {range.label}</h2>
          {filters.length > 2 && <CalendarFilter value={filter} options={filters.map((f) => ({ value: f.key, label: f.label, href: qs({ lich: f.key }) }))} />}
        </div>
        <div className="mb-3 flex flex-wrap items-start gap-2">
          <div className="seg" role="group" aria-label="Chọn khoảng ngày">
            {RANGES.map((r) => (
              <Link key={r.key} href={qs({ khoang: r.key })} aria-current={range.key === r.key ? 'true' : undefined} className={pill(range.key === r.key)}>{r.label}</Link>
            ))}
          </div>
          <details className="relative" open={range.key === 'tuy-chon' ? true : undefined}>
            <summary className={`btn-secondary cursor-pointer list-none px-3 py-1.5 ${range.key === 'tuy-chon' ? 'border-brand-600 text-brand-600 dark:border-brand-300 dark:text-brand-300' : ''}`}>Chọn ngày…</summary>
            <form method="get" action="/" className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="khoang" value="tuy-chon" />
              {filter && <input type="hidden" name="lich" value={filter} />}
              <div><label className="label" htmlFor="h-tu">Từ ngày</label><input id="h-tu" name="tu" type="date" className="input" defaultValue={range.key === 'tuy-chon' ? range.from : today} /></div>
              <div><label className="label" htmlFor="h-den">Đến ngày</label><input id="h-den" name="den" type="date" className="input" defaultValue={range.key === 'tuy-chon' ? addDays(range.to, -1) : addDays(today, 6)} /></div>
              <button type="submit" className="btn-secondary">Xem</button>
              <span className="text-xs muted">Tối đa 62 ngày.</span>
            </form>
          </details>
        </div>
        {todayItems.length ? (
          <div className="space-y-2">
            {[...byDay].map(([day, items]) => (
              <div key={day}>
                {multiDay && <h3 className="mt-3 font-display text-xs font-semibold uppercase tracking-wider muted">{weekdayShort(day)} · {fmtDate(day)}{day === today ? ' · hôm nay' : ''} · {items.length} buổi</h3>}
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {items.map((it) => (
                    <li key={it.key}>
                      <Link href={it.href} className="group grid grid-cols-[3.5rem_3px_1fr] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[3.5rem_3px_1fr_auto]">
                        <span className="font-display text-[15px] font-semibold tabular-nums">{it.time}</span>
                        <span className={`h-full min-h-9 rounded ${it.chip ? 'bg-brand-600 dark:bg-brand-300' : 'bg-teal-600 dark:bg-teal-400'}`} />
                        <span className="min-w-0">
                          <span className="block font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">{it.title}</span>
                          <span className="block text-xs muted">{[it.location, it.source].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="col-start-3 sm:col-start-auto">
                          {it.chip ? <span className={`chip ${it.warn ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : ''}`}>{it.chip}</span> : <span className="chip">Lịch nhóm</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : <p className="py-4 text-sm muted">Không có buổi họp nào {range.label}{filter ? ' trong lịch đã chọn' : ''}.</p>}
        <div className="mt-3 flex justify-between gap-3 border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          <Link href={`/lich?xem=${multiDay ? 'tuan' : 'ngay'}&ngay=${range.from}`} className="link">Mở trong Lịch</Link>
          <Link href={`/hop?ngay=${range.from}${multiDay ? '&xem=tuan' : ''}`} className="link">Hồ sơ cuộc họp</Link>
        </div>
      </section>
      <div className="space-y-5">
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Việc cần làm</h2>
            <Link href="/viec" className="link text-sm">Tất cả {openTasks.length}</Link>
          </div>
          <TaskList tasks={openTasks.slice(0, 5)} name={name} groupName={(id) => groupName.get(id) ?? 'Nhóm'} empty="Bạn không có việc nào đang mở." />
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dự án của tôi</h2>
            <Link href="/nhom" className="link text-sm">Khám phá</Link>
          </div>
          {myGroups.length ? (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {myGroups.map((g) => {
                const p = groupProgress(g.id);
                return (
                  <li key={g.id}>
                    <Link href={`/nhom/${g.id}`} className="group flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">{g.name}</span>
                        {p.total > 0 && <span className="mt-1 flex items-center gap-2 text-xs muted"><ProgressBar pct={p.pct} className="h-1.5 w-24" />{p.pct}% · {p.total - p.done} việc mở</span>}
                      </span>
                      <span className="chip">{mineIds.get(g.id) ? 'Trưởng nhóm' : groupTypeLabel(g)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm muted">Bạn chưa tham gia nhóm nào. Trưởng nhóm hoặc Văn thư sẽ thêm bạn vào nhóm.</p>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
