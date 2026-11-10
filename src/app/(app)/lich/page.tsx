import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireSession } from '@/lib/session';
import { EventForm } from '@/components/WorkForms';
import { deleteEvent } from '@/lib/work';
import { EVENT_KIND_LABEL, type Booking, type CalEvent, type Group } from '@/lib/types';
import { loadPeople } from '@/lib/people';
import { getGoogleCalendarEvents, isGoogleCalendarEnabled } from '@/lib/google-calendar';
import { CalendarView } from '@/components/calendar/CalendarView';
import { PALETTE, VIEW_LABEL, type CalItem, type CalSource, type CalView } from '@/components/calendar/types';
import { addDay, dayStart, monthGridStart, vnDayOf, weekStart } from '@/components/calendar/time';

export const metadata: Metadata = { title: 'Lịch của tôi' };

const VIEWS = Object.keys(VIEW_LABEL) as CalView[];

// Khoảng ngày [from, to) cần nạp cho mỗi kiểu xem, và tiêu đề hiện trên thanh công cụ.
function rangeOf(view: CalView, anchor: string): { from: string; to: string; title: string } {
  const [y, m] = anchor.split('-').map(Number);
  if (view === 'ngay') return { from: anchor, to: addDay(anchor, 1), title: `${Number(anchor.slice(8))} tháng ${m}, ${y}` };
  if (view === 'tuan') {
    const s = weekStart(anchor);
    const e = addDay(s, 6);
    const [, m1] = s.split('-').map(Number);
    const [y2, m2] = e.split('-').map(Number);
    const title = m1 === m2 ? `Tháng ${m2}, ${y2}` : `Thg ${m1} – thg ${m2}, ${y2}`;
    return { from: s, to: addDay(s, 7), title };
  }
  if (view === 'thang') {
    const s = monthGridStart(anchor);
    return { from: s, to: addDay(s, 42), title: `Tháng ${m}, ${y}` };
  }
  return { from: anchor, to: addDay(anchor, 30), title: `Từ ${Number(anchor.slice(8))}/${m}/${y}` };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ xem?: string; ngay?: string; thang?: string; tat_ca?: string }> }) {
  const sp = await searchParams;
  const today = vnDayOf(new Date().toISOString());
  const saved = (await cookies()).get('lich_xem')?.value;
  // Liên kết cũ dạng ?thang=YYYY-MM vẫn mở được ở kiểu xem tháng.
  const view: CalView = VIEWS.includes(sp.xem as CalView)
    ? (sp.xem as CalView)
    : sp.thang ? 'thang' : VIEWS.includes(saved as CalView) ? (saved as CalView) : 'tuan';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? '') ? sp.ngay! : /^\d{4}-\d{2}$/.test(sp.thang ?? '') ? `${sp.thang}-01` : today;
  const { from, to, title } = rangeOf(view, anchor);
  const fromIso = new Date(dayStart(from)).toISOString();
  const toIso = new Date(dayStart(to)).toISOString();
  const all = Boolean(sp.tat_ca);

  const { supabase, userId, ctx } = await requireSession();
  const [{ data: events }, { data: bookings }, { data: groups }, { data: mine }, google, { data: gSources }] = await Promise.all([
    supabase.from('events').select('*').lt('starts_at', toIso).gte('ends_at', fromIso).order('starts_at').returns<CalEvent[]>(),
    supabase.from('bookings').select('*').eq('status', 'accepted').or(`host_id.eq.${userId},requester_id.eq.${userId}`).lt('starts_at', toIso).gte('ends_at', fromIso).returns<Booking[]>(),
    supabase.from('groups').select('id, name').is('archived_at', null).order('name').returns<Pick<Group, 'id' | 'name'>[]>(),
    supabase.from('group_members').select('group_id, can_create').eq('user_id', userId),
    getGoogleCalendarEvents(supabase, userId, fromIso, toIso),
    isGoogleCalendarEnabled()
      ? supabase.from('calendar_sources').select('id, label').eq('is_enabled', true).order('created_at')
      : Promise.resolve({ data: [] as { id: string; label: string }[] }),
  ]);
  const memberOf = new Set((mine ?? []).map((m) => m.group_id));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const { name } = await loadPeople(supabase, (bookings ?? []).flatMap((b) => [b.host_id, b.requester_id]));

  const sources: CalSource[] = [
    { key: 'nhom', label: 'Lịch nhóm', color: '#039be5' },
    { key: 'gap', label: 'Lịch gặp', color: '#33b679' },
  ];
  // Mỗi lịch Google một màu cố định theo thứ tự thêm vào.
  (gSources ?? []).forEach((g, i) => sources.push({ key: `g:${g.id}`, label: g.label, color: PALETTE[(i + 2) % PALETTE.length] }));

  const items: CalItem[] = [
    ...(events ?? [])
      .filter((e) => all || memberOf.has(e.group_id))
      .map((e) => ({
        key: `e-${e.id}`, source: 'nhom', title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, all_day: false,
        sub: [EVENT_KIND_LABEL[e.kind], groupName.get(e.group_id)].filter(Boolean).join(' · '),
        location: e.location, description: e.description,
        links: [{ href: `/nhom/${e.group_id}`, label: 'Mở nhóm' }],
        deleteId: e.created_by === userId ? e.id : undefined,
      })),
    ...(bookings ?? []).map((b) => ({
      key: `b-${b.id}`, source: 'gap', title: `Gặp: ${b.topic}`, starts_at: b.starts_at, ends_at: b.ends_at, all_day: false,
      sub: b.host_id === userId ? `Với ${name(b.requester_id)}` : `Với ${name(b.host_id)}`,
      links: [{ href: '/dat-lich', label: 'Mở trang đặt lịch' }],
    })),
    ...google.map((g) => ({
      key: g.id, source: `g:${g.source_id}`, title: g.title, starts_at: g.starts_at, ends_at: g.ends_at, all_day: g.all_day,
      location: g.location, description: g.description,
      links: [
        ...(g.meet_url ? [{ href: g.meet_url, label: 'Tham gia họp trực tuyến', external: true }] : []),
        ...(g.html_link ? [{ href: g.html_link, label: 'Mở trên Google Calendar', external: true }] : []),
      ],
    })),
  ];

  const creatable = (groups ?? []).filter((g) => ctx.is_admin || ctx.role === 'principal' || ctx.all_groups_secretary || (mine ?? []).some((m) => m.group_id === g.id && m.can_create));
  const extraQuery = all ? '&tat_ca=1' : '';

  return (
    <CalendarView
      view={view}
      anchor={anchor}
      today={today}
      title={title}
      items={items}
      sources={sources}
      extraQuery={extraQuery}
      deleteAction={deleteEvent}
      createForm={creatable.length > 0 ? <EventForm groups={creatable.map((g) => ({ id: g.id, label: g.name }))} /> : undefined}
      sideExtra={
        <div className="space-y-2 text-sm">
          <Link href={`/lich?xem=${view}&ngay=${anchor}${all ? '' : '&tat_ca=1'}`} className="block text-brand-600 hover:underline dark:text-brand-300">
            {all ? 'Chỉ lịch nhóm của tôi' : 'Lịch của mọi nhóm tôi xem được'}
          </Link>
          {ctx.is_admin && <Link href="/quan-tri/lich-google" className="block text-brand-600 hover:underline dark:text-brand-300">Cấu hình lịch Google</Link>}
        </div>
      }
    />
  );
}
