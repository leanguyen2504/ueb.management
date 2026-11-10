import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { TaskList } from '@/components/TaskList';
import { loadPeople } from '@/lib/people';
import { addDays, dayStartIso, fmtDate, fmtDateTime, fmtTime, greeting, todayLabel, vnDay, weekdayShort } from '@/lib/format';
import { isGoogleCalendarEnabled } from '@/lib/google-calendar';
import { loadMeetings, meetingProgress } from '@/lib/meetings';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { KIND_LABEL, type AppNotification, type Booking, type CalEvent, type Group, type Task } from '@/lib/types';

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
  const weekEnd = dayStartIso(addDays(today, 7));
  const [{ data: groups }, { data: mine }, { data: tasks }, { data: events }, { data: pendingBookings }, { data: notes }, meetings, { data: rangeEvents }] = await Promise.all([
    supabase.from('groups').select('*').is('archived_at', null).order('name').returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('assignee_id', userId).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(50).returns<Task[]>(),
    supabase.from('events').select('*').gte('ends_at', nowIso).lt('starts_at', weekEnd).order('starts_at').limit(50).returns<CalEvent[]>(),
    supabase.from('bookings').select('*').eq('host_id', userId).eq('status', 'pending').gte('ends_at', nowIso).returns<Booking[]>(),
    supabase.from('notifications').select('*').is('read_at', null).order('created_at', { ascending: false }).limit(5).returns<AppNotification[]>(),
    // Buổi họp trong khoảng đã chọn từ lịch Google dùng chung mà tôi được xem (Hiệu trưởng, thư ký...).
    isGoogleCalendarEnabled() ? loadMeetings(supabase, userId, rangeFromIso, rangeToIso).catch(() => []) : Promise.resolve([]),
    supabase.from('events').select('*').gte('ends_at', rangeFromIso).lt('starts_at', rangeToIso).order('starts_at').limit(300).returns<CalEvent[]>(),
  ]);
  const mineIds = new Map((mine ?? []).map((m) => [m.group_id, m.is_manager]));
  const myGroups = (groups ?? []).filter((g) => mineIds.has(g.id));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const myEvents = (events ?? []).filter((e) => mineIds.has(e.group_id));
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
  const pill = (on: boolean) => `rounded-full px-2.5 py-1 text-xs ${on ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`;

  const stats = [
    { label: 'Việc đang mở', value: openTasks.length, foot: overdue ? `${overdue} việc quá hạn` : 'không có việc quá hạn', href: '/viec', alert: overdue > 0 },
    { label: 'Lịch 7 ngày tới', value: myEvents.length, foot: 'của các nhóm tôi tham gia', href: '/lich' },
    { label: 'Yêu cầu gặp chờ tôi', value: pendingBookings?.length ?? 0, foot: 'trên trang đặt lịch', href: '/dat-lich' },
    { label: 'Thông báo chưa đọc', value: notes?.length ?? 0, foot: 'xem tất cả', href: '/thong-bao' },
  ];

  return (
    <>
      <PageHead title="Dashboard của tôi" sub={`${greeting()}, ${profile.full_name || profile.email} · ${todayLabel()} · giờ Việt Nam`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:border-brand-600">
            <div className="text-xs font-medium muted">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
            <div className={`mt-1 text-xs ${s.alert ? 'font-semibold text-red-600 dark:text-red-400' : 'muted'}`}>{s.foot}</div>
          </Link>
        ))}
      </div>

      <section className="card mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Họp {range.label}</h2>
          <div className="flex gap-3 text-sm">
            <Link href={`/lich?xem=${multiDay ? 'tuan' : 'ngay'}&ngay=${range.from}`} className="text-brand-600 hover:underline dark:text-brand-100">Mở lịch</Link>
            <Link href={`/hop?ngay=${range.from}`} className="text-brand-600 hover:underline dark:text-brand-100">Hồ sơ cuộc họp</Link>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Chọn khoảng ngày">
          {RANGES.map((r) => (
            <Link key={r.key} href={qs({ khoang: r.key })} aria-current={range.key === r.key ? 'true' : undefined} className={pill(range.key === r.key)}>{r.label}</Link>
          ))}
          <details className="relative" open={range.key === 'tuy-chon' ? true : undefined}>
            <summary className={`${pill(range.key === 'tuy-chon')} cursor-pointer list-none`}>Chọn ngày…</summary>
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
        {filters.length > 2 && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo lịch">
            {filters.map((f) => (
              <Link key={f.key} href={qs({ lich: f.key })} aria-current={filter === f.key ? 'true' : undefined} className={pill(filter === f.key)}>
                {f.label}
              </Link>
            ))}
          </div>
        )}
        {todayItems.length ? (
          <div className="space-y-3">
            {[...byDay].map(([day, items]) => (
              <div key={day}>
                {multiDay && <h3 className="mt-2 text-xs font-semibold uppercase muted">{weekdayShort(day)} · {fmtDate(day)}{day === today ? ' · hôm nay' : ''} · {items.length} buổi</h3>}
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((it) => (
                    <li key={it.key}>
                      <Link href={it.href} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 hover:text-brand-600">
                        <span className="w-12 shrink-0 text-sm font-semibold">{it.time}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{it.title}</span>
                          <span className="block text-xs muted">{[it.location, it.source].filter(Boolean).join(' · ')}</span>
                        </span>
                        {it.chip && <span className={`chip text-xs ${it.warn ? 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300' : ''}`}>{it.chip}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : <p className="text-sm muted">Không có buổi họp nào {range.label}{filter ? ' trong lịch đã chọn' : ''}.</p>}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Việc cần làm</h2>
            <Link href="/viec" className="text-sm text-brand-600 hover:underline dark:text-brand-100">Tất cả</Link>
          </div>
          <TaskList tasks={openTasks.slice(0, 8)} name={name} groupName={(id) => groupName.get(id) ?? 'Nhóm'} empty="Bạn không có việc nào đang mở." />
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Lịch sắp tới</h2>
            <Link href="/lich" className="text-sm text-brand-600 hover:underline dark:text-brand-100">Mở lịch</Link>
          </div>
          {myEvents.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {myEvents.slice(0, 8).map((e) => (
                <li key={e.id} className="flex gap-3 py-2">
                  <div className="w-12 shrink-0 text-center text-xs"><div className="muted">{weekdayShort(vnDay(e.starts_at))}</div><div className="font-semibold">{vnDay(e.starts_at).slice(8)}/{vnDay(e.starts_at).slice(5, 7)}</div></div>
                  <div className="min-w-0">
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs muted">{fmtTime(e.starts_at)} · {groupName.get(e.group_id)}{e.location ? ` · ${e.location}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm muted">Không có lịch trong 7 ngày tới.</p>}
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Dự án và nhóm của tôi</h2>
            <Link href="/nhom" className="text-sm text-brand-600 hover:underline dark:text-brand-100">Khám phá</Link>
          </div>
          {myGroups.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {myGroups.map((g) => (
                <li key={g.id}>
                  <Link href={`/nhom/${g.id}`} className="flex items-center justify-between py-2 hover:text-brand-600">
                    <span>{g.name}</span>
                    <span className="chip">{mineIds.get(g.id) ? 'Trưởng nhóm' : KIND_LABEL[g.kind]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">Bạn chưa tham gia nhóm nào. Trưởng nhóm hoặc Văn thư sẽ thêm bạn vào nhóm.</p>
          )}
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Thông báo mới</h2>
            <Link href="/thong-bao" className="text-sm text-brand-600 hover:underline dark:text-brand-100">Tất cả</Link>
          </div>
          {notes?.length ? (
            <ul className="space-y-2 text-sm">
              {notes.map((n) => (
                <li key={n.id}><div className="font-medium">{n.title}</div><div className="text-xs muted">{n.body ? `${n.body} · ` : ''}{fmtDateTime(n.created_at)}</div></li>
              ))}
            </ul>
          ) : <p className="text-sm muted">Không có thông báo mới.</p>}
        </section>
      </div>
    </>
  );
}
