import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { EventForm } from '@/components/WorkForms';
import { deleteEvent } from '@/lib/work';
import { addDays, dayStartIso, fmtTime, vnDay, weekdayShort } from '@/lib/format';
import { EVENT_KIND_LABEL, type Booking, type CalEvent, type ExternalEvent, type Group } from '@/lib/types';
import { loadPeople } from '@/lib/people';

export const metadata: Metadata = { title: 'Lịch của tôi' };

type Item = { key: string; title: string; starts_at: string; ends_at: string; sub: string; href?: string; tone: 'group' | 'booking' | 'external'; deleteId?: string };
const TONE: Record<Item['tone'], string> = {
  group: 'border-l-brand-600 bg-brand-50 dark:bg-slate-800',
  booking: 'border-l-emerald-600 bg-emerald-50 dark:bg-emerald-950',
  external: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950',
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ thang?: string; tat_ca?: string }> }) {
  const sp = await searchParams;
  const today = vnDay();
  const month = /^\d{4}-\d{2}$/.test(sp.thang ?? '') ? sp.thang! : today.slice(0, 7);
  const first = `${month}-01`;
  // Lưới bắt đầu từ thứ Hai.
  const offset = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -offset);
  const gridEnd = addDays(gridStart, 42);
  const fromIso = dayStartIso(gridStart);
  const toIso = dayStartIso(gridEnd);
  const prev = addDays(first, -1).slice(0, 7);
  const next = addDays(first, 32).slice(0, 7);
  const all = Boolean(sp.tat_ca);

  const { supabase, userId, ctx } = await requireSession();
  const [{ data: events }, { data: bookings }, { data: groups }, { data: mine }] = await Promise.all([
    supabase.from('events').select('*').lt('starts_at', toIso).gte('ends_at', fromIso).order('starts_at').returns<CalEvent[]>(),
    supabase.from('bookings').select('*').eq('status', 'accepted').or(`host_id.eq.${userId},requester_id.eq.${userId}`).lt('starts_at', toIso).gte('ends_at', fromIso).returns<Booking[]>(),
    supabase.from('groups').select('id, name').is('archived_at', null).order('name').returns<Pick<Group, 'id' | 'name'>[]>(),
    supabase.from('group_members').select('group_id, can_create').eq('user_id', userId),
  ]);
  const memberOf = new Set((mine ?? []).map((m) => m.group_id));
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const { name } = await loadPeople(supabase, (bookings ?? []).flatMap((b) => [b.host_id, b.requester_id]));

  // Lịch từ nguồn ngoài (Google Calendar chỉ đọc) sẽ được gán ở đây khi mô-đun tích hợp được bật.
  const external: ExternalEvent[] = [];

  const items: Item[] = [
    ...(events ?? [])
      .filter((e) => all || memberOf.has(e.group_id))
      .map((e) => ({
        key: `e-${e.id}`, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at, tone: 'group' as const,
        sub: [EVENT_KIND_LABEL[e.kind], groupName.get(e.group_id), e.location].filter(Boolean).join(' · '),
        href: `/nhom/${e.group_id}`, deleteId: e.created_by === userId ? e.id : undefined,
      })),
    ...(bookings ?? []).map((b) => ({
      key: `b-${b.id}`, title: `Gặp: ${b.topic}`, starts_at: b.starts_at, ends_at: b.ends_at, tone: 'booking' as const,
      sub: b.host_id === userId ? `Với ${name(b.requester_id)}` : `Với ${name(b.host_id)}`, href: '/dat-lich',
    })),
    ...external.map((x) => ({
      key: `x-${x.id}`, title: x.title, starts_at: x.starts_at, ends_at: x.ends_at, tone: 'external' as const,
      sub: [x.source_label ?? 'Lịch ngoài', x.location].filter(Boolean).join(' · '), href: x.url ?? undefined,
    })),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const byDay = new Map<string, Item[]>();
  for (const it of items) {
    // Lịch kéo dài nhiều ngày hiện ở mọi ngày nó đi qua.
    let d = vnDay(it.starts_at);
    const last = vnDay(it.ends_at);
    for (let i = 0; i < 42 && d <= last; i++, d = addDays(d, 1)) {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(it);
    }
  }
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const upcoming = items.filter((i) => i.ends_at >= new Date().toISOString()).slice(0, 12);
  const creatable = (groups ?? []).filter((g) => ctx.is_admin || ctx.role === 'principal' || ctx.all_groups_secretary || (mine ?? []).some((m) => m.group_id === g.id && m.can_create));
  const [y, m] = month.split('-');
  const q = (t: string) => `/lich?thang=${t}${all ? '&tat_ca=1' : ''}`;

  return (
    <>
      <PageHead
        title="Lịch của tôi"
        sub="Cuộc họp, sự kiện, hạn chót của các nhóm bạn tham gia và lịch gặp đã được đồng ý."
        actions={<>
          <Link href={q(prev)} className="btn-secondary" aria-label="Tháng trước">←</Link>
          <Link href={q(today.slice(0, 7))} className="btn-secondary">Hôm nay</Link>
          <Link href={q(next)} className="btn-secondary" aria-label="Tháng sau">→</Link>
        </>}
      />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Tháng {Number(m)}/{y}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-brand-600" /> Lịch nhóm</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-600" /> Lịch gặp</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-500" /> Lịch ngoài</span>
          <Link href={all ? `/lich?thang=${month}` : `/lich?thang=${month}&tat_ca=1`} className="text-brand-600 hover:underline dark:text-brand-100">
            {all ? 'Chỉ nhóm của tôi' : 'Mọi nhóm tôi xem được'}
          </Link>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <div className="grid min-w-[720px] grid-cols-7">
          {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
            <div key={d} className="border-b border-slate-200 px-2 py-1.5 text-center text-xs font-semibold muted dark:border-slate-800">{d}</div>
          ))}
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={`min-h-24 border-b border-r border-slate-100 p-1.5 dark:border-slate-800 ${inMonth ? '' : 'bg-slate-50 dark:bg-slate-950'}`}>
                <div className={`mb-1 text-xs ${d === today ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 font-semibold text-white' : inMonth ? 'font-medium' : 'muted'}`}>{Number(d.slice(8))}</div>
                <ul className="space-y-1">
                  {list.slice(0, 3).map((it) => (
                    <li key={it.key} className={`truncate rounded border-l-2 px-1 py-0.5 text-[11px] ${TONE[it.tone]}`} title={`${fmtTime(it.starts_at)} ${it.title}`}>
                      {it.href ? <a href={it.href} className="hover:underline">{fmtTime(it.starts_at)} {it.title}</a> : <>{fmtTime(it.starts_at)} {it.title}</>}
                    </li>
                  ))}
                  {list.length > 3 && <li className="text-[11px] muted">+{list.length - 3} mục</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="card">
          <h2 className="mb-3 font-semibold">Sắp diễn ra</h2>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcoming.map((it) => (
                <li key={it.key} className="flex items-start gap-3 py-2">
                  <div className="w-16 shrink-0 text-center">
                    <div className="text-xs muted">{weekdayShort(vnDay(it.starts_at))}</div>
                    <div className="font-semibold">{vnDay(it.starts_at).slice(8)}/{vnDay(it.starts_at).slice(5, 7)}</div>
                  </div>
                  <div className={`min-w-0 flex-1 rounded border-l-2 px-2 py-1 ${TONE[it.tone]}`}>
                    <div className="font-medium">{it.href ? <a href={it.href} className="hover:underline">{it.title}</a> : it.title}</div>
                    <div className="text-xs muted">{fmtTime(it.starts_at)} đến {fmtTime(it.ends_at)}{it.sub ? ` · ${it.sub}` : ''}</div>
                  </div>
                  {it.deleteId && (
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={it.deleteId} />
                      <button className="text-xs text-red-600 hover:underline dark:text-red-400">Xóa</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">Không có lịch nào sắp tới trong khoảng đang xem.</p>
          )}
        </section>
        {creatable.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-semibold">Thêm lịch</h2>
            <EventForm groups={creatable.map((g) => ({ id: g.id, label: g.name }))} />
          </section>
        )}
      </div>
    </>
  );
}
