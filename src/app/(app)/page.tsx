import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { TaskList } from '@/components/TaskList';
import { loadPeople } from '@/lib/people';
import { addDays, dayStartIso, fmtDateTime, fmtTime, greeting, todayLabel, vnDay, weekdayShort } from '@/lib/format';
import { isGoogleCalendarEnabled } from '@/lib/google-calendar';
import { loadMeetings, meetingProgress } from '@/lib/meetings';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { KIND_LABEL, type AppNotification, type Booking, type CalEvent, type Group, type Task } from '@/lib/types';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ lich?: string }> }) {
  const { lich } = await searchParams;
  const { supabase, userId, profile } = await requireSession();
  const today = vnDay();
  const nowIso = new Date().toISOString();
  const weekEnd = dayStartIso(addDays(today, 7));
  const [{ data: groups }, { data: mine }, { data: tasks }, { data: events }, { data: pendingBookings }, { data: notes }, meetings] = await Promise.all([
    supabase.from('groups').select('*').is('archived_at', null).order('name').returns<Group[]>(),
    supabase.from('group_members').select('group_id, is_manager').eq('user_id', userId),
    supabase.from('tasks').select('*').eq('assignee_id', userId).neq('status', 'done').order('due_date', { ascending: true, nullsFirst: false }).limit(50).returns<Task[]>(),
    supabase.from('events').select('*').gte('ends_at', nowIso).lt('starts_at', weekEnd).order('starts_at').limit(50).returns<CalEvent[]>(),
    supabase.from('bookings').select('*').eq('host_id', userId).eq('status', 'pending').gte('ends_at', nowIso).returns<Booking[]>(),
    supabase.from('notifications').select('*').is('read_at', null).order('created_at', { ascending: false }).limit(5).returns<AppNotification[]>(),
    // Buổi họp hôm nay từ lịch Google dùng chung mà tôi được xem (Hiệu trưởng, thư ký...).
    isGoogleCalendarEnabled() ? loadMeetings(supabase, userId, dayStartIso(today), dayStartIso(addDays(today, 1))).catch(() => []) : Promise.resolve([]),
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
  const tomorrowIso = dayStartIso(addDays(today, 1));
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
  type TodayItem = { key: string; start: string; time: string; title: string; location: string | null; source: string; href: string; chip?: string; warn?: boolean };
  const todayItems: TodayItem[] = [
    ...meetings
      .filter((m) => !filter || filter === `g:${m.source_id}`)
      .map((m) => {
        const p = meetingProgress(m);
        const docs = p.preTotal + m.attachments.length;
        return {
          key: `g|${m.source_id}|${m.event_key}`, start: m.starts_at, time: m.all_day ? 'Cả ngày' : fmtTime(m.starts_at), title: m.title,
          location: m.location, source: m.source_label, href: `/hop#${meetingAnchor(m.source_id, m.event_key)}`,
          chip: docs ? (p.preTotal ? `Tài liệu ${p.preDone}/${p.preTotal} bên` : `${m.attachments.length} tài liệu`) + (p.minutesDone ? ' · có biên bản' : '') : 'Chưa có tài liệu',
          warn: p.preDone < p.preTotal,
        };
      }),
    ...(!filter || filter === 'nhom' ? myEvents : [])
      .filter((e) => e.starts_at < tomorrowIso && e.ends_at >= dayStartIso(today))
      .filter((e) => !googleSeen.has(`${new Date(e.starts_at).getTime()}|${norm(e.title)}`))
      .map((e) => ({
        key: `e|${e.id}`, start: e.starts_at, time: fmtTime(e.starts_at), title: e.title, location: e.location,
        source: groupName.get(e.group_id) ?? 'Lịch nhóm', href: `/lich?xem=ngay&ngay=${today}`,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start));

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
          <h2 className="font-semibold">Họp hôm nay</h2>
          <div className="flex gap-3 text-sm">
            <Link href="/lich?xem=ngay" className="text-brand-600 hover:underline dark:text-brand-100">Mở lịch</Link>
            {meetings.length > 0 && <Link href="/hop" className="text-brand-600 hover:underline dark:text-brand-100">Hồ sơ cuộc họp</Link>}
          </div>
        </div>
        {filters.length > 2 && (
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo lịch">
            {filters.map((f) => (
              <Link key={f.key} href={f.key ? `/?lich=${encodeURIComponent(f.key)}` : '/'} aria-current={filter === f.key ? 'true' : undefined}
                className={`rounded-full px-2.5 py-1 text-xs ${filter === f.key ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                {f.label}
              </Link>
            ))}
          </div>
        )}
        {todayItems.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {todayItems.map((it) => (
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
        ) : <p className="text-sm muted">Hôm nay không có buổi họp nào{filter ? ' trong lịch đã chọn' : ''}.</p>}
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
