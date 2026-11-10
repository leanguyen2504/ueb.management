'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VIEW_LABEL, type CalItem, type CalSource, type CalView } from './types';
import {
  WEEKDAY, WEEKDAY_LONG, addDay, dayStart, dmy, hhmm, monthGridStart, vnDayOf, vnMinutesOf, weekStart, weekdayOf,
} from './time';

// Lịch kiểu Google Calendar: xem theo ngày, tuần, tháng hoặc lịch biểu; bật/tắt
// từng nguồn lịch; bấm vào một mục để xem chi tiết. Dữ liệu do trang máy chủ nạp.

const HOUR_PX = 48;
const DAY_MS = 86400000;
const VIEWS: CalView[] = ['ngay', 'tuan', 'thang', 'lich-bieu'];

type Props = {
  view: CalView;
  anchor: string;
  today: string;
  title: string;
  items: CalItem[];
  sources: CalSource[];
  extraQuery?: string;
  deleteAction?: (form: FormData) => Promise<void>;
  createForm?: React.ReactNode;
  sideExtra?: React.ReactNode;
};

const isAllDayLike = (it: CalItem) => it.all_day || new Date(it.ends_at).getTime() - new Date(it.starts_at).getTime() >= DAY_MS;

// Các ngày (giờ Việt Nam) mà một mục đi qua. Mục cả ngày kết thúc lúc 00:00 ngày sau không tính ngày đó.
function daysOf(it: CalItem): string[] {
  const first = vnDayOf(it.starts_at);
  const endMs = new Date(it.ends_at).getTime();
  const last = endMs > new Date(it.starts_at).getTime() ? vnDayOf(new Date(endMs - 1).toISOString()) : first;
  const out: string[] = [];
  for (let d = first, i = 0; d <= last && i < 62; d = addDay(d, 1), i++) out.push(d);
  return out;
}

function timeText(it: CalItem): string {
  const d1 = vnDayOf(it.starts_at);
  const days = daysOf(it);
  const d2 = days[days.length - 1];
  const wd = (d: string) => `${WEEKDAY_LONG[weekdayOf(d)]}, ${dmy(d)}`;
  if (it.all_day) return d1 === d2 ? `${wd(d1)} · Cả ngày` : `${dmy(d1)} đến ${dmy(d2)} · Cả ngày`;
  if (d1 === d2) return `${wd(d1)} · ${hhmm(it.starts_at)} đến ${hhmm(it.ends_at)}`;
  return `${hhmm(it.starts_at)} ${dmy(d1)} đến ${hhmm(it.ends_at)} ${dmy(d2)}`;
}

type Seg = { it: CalItem; top: number; height: number; col: number; cols: number };

// Xếp các mục trùng giờ thành cột cạnh nhau như Google Calendar.
function layoutDay(items: CalItem[], day: string): Seg[] {
  const start = dayStart(day);
  const segs = items
    .map((it) => {
      const s = Math.max(new Date(it.starts_at).getTime(), start);
      const e = Math.min(Math.max(new Date(it.ends_at).getTime(), new Date(it.starts_at).getTime() + 15 * 60000), start + DAY_MS);
      return { it, s, e };
    })
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Seg[] = [];
  let cluster: { seg: Seg; e: number }[] = [];
  let clusterEnd = -Infinity;
  let colEnds: number[] = [];
  const flush = () => {
    for (const c of cluster) c.seg.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };
  for (const x of segs) {
    if (x.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let col = colEnds.findIndex((end) => end <= x.s);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(x.e);
    } else colEnds[col] = x.e;
    const minutes = (x.s - start) / 60000;
    const dur = Math.max((x.e - x.s) / 60000, 20);
    const seg: Seg = { it: x.it, top: (minutes / 60) * HOUR_PX, height: (dur / 60) * HOUR_PX - 2, col, cols: 1 };
    out.push(seg);
    cluster.push({ seg, e: x.e });
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  flush();
  return out;
}

export function CalendarView(props: Props) {
  const { view, anchor, today, title, items, sources, extraQuery = '', deleteAction, createForm, sideExtra } = props;
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ it: CalItem; x: number; y: number } | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    try {
      setHidden(new Set(JSON.parse(localStorage.getItem('lich_an') || '[]')));
    } catch {}
  }, []);
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    localStorage.setItem('lich_an', JSON.stringify([...next]));
  };

  const color = useMemo(() => new Map(sources.map((s) => [s.key, s.color])), [sources]);
  const label = useMemo(() => new Map(sources.map((s) => [s.key, s.label])), [sources]);
  const visible = useMemo(() => items.filter((i) => !hidden.has(i.source)), [items, hidden]);

  const href = (v: CalView, d: string) => `/lich?xem=${v}&ngay=${d}${extraQuery}`;
  const step = (dir: 1 | -1) => {
    if (view === 'ngay') return addDay(anchor, dir);
    if (view === 'tuan') return addDay(anchor, 7 * dir);
    if (view === 'lich-bieu') return addDay(anchor, 30 * dir);
    const [y, m] = anchor.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 1));
    return d.toISOString().slice(0, 10);
  };
  const rememberView = (v: CalView) => {
    document.cookie = `lich_xem=${v}; path=/; max-age=31536000; samesite=lax`;
  };

  // Phím tắt như Google Calendar: t hôm nay, j/n tới, k/p lùi, d/w/m/a đổi kiểu xem.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        setCreating(false);
        return;
      }
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
      const go = (v: CalView, d: string) => {
        rememberView(v);
        router.push(href(v, d));
      };
      const map: Record<string, () => void> = {
        t: () => go(view, today),
        j: () => go(view, step(1)),
        n: () => go(view, step(1)),
        k: () => go(view, step(-1)),
        p: () => go(view, step(-1)),
        d: () => go('ngay', anchor),
        w: () => go('tuan', anchor),
        m: () => go('thang', anchor),
        a: () => go('lich-bieu', anchor),
      };
      map[e.key]?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const open = (it: CalItem) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected({ it, x: e.clientX, y: e.clientY });
  };

  return (
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6" onClick={() => setSelected(null)}>
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 md:px-6 dark:border-slate-800 dark:bg-slate-900">
        {createForm && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setCreating(true); }}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-medium shadow-md ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            Tạo
          </button>
        )}
        <Link href={href(view, today)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">Hôm nay</Link>
        <div className="flex">
          <Link href={href(view, step(-1))} aria-label="Trước" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
          <Link href={href(view, step(1))} aria-label="Sau" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
        <h1 className="mr-auto text-lg font-normal md:text-xl">{title}</h1>
        <nav className="flex rounded-md border border-slate-300 text-sm dark:border-slate-700" aria-label="Kiểu xem">
          {VIEWS.map((v) => (
            <Link key={v} href={href(v, anchor)} onClick={() => rememberView(v)} aria-current={v === view ? 'page' : undefined}
              className={`px-3 py-1.5 first:rounded-l-md last:rounded-r-md ${v === view ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-slate-700 dark:text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
              {VIEW_LABEL[v]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex">
        {/* Cột trái */}
        <aside className="hidden w-60 shrink-0 space-y-5 border-r border-slate-200 p-4 lg:block dark:border-slate-800">
          <MiniMonth anchor={anchor} today={today} view={view} href={href} />
          <SourceList sources={sources} hidden={hidden} toggle={toggle} />
          {sideExtra}
          <p className="text-[11px] muted">Phím tắt: T hôm nay, J/K tới/lùi, D ngày, W tuần, M tháng, A lịch biểu.</p>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800">
            {sources.map((s) => (
              <button key={s.key} type="button" onClick={() => toggle(s.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${hidden.has(s.key) ? 'border-slate-300 muted dark:border-slate-700' : 'border-transparent text-white'}`}
                style={hidden.has(s.key) ? undefined : { background: s.color }}>
                {s.label}
              </button>
            ))}
          </div>
          {view === 'thang' ? (
            <MonthGrid anchor={anchor} today={today} items={visible} color={color} href={href} open={open} />
          ) : view === 'lich-bieu' ? (
            <Agenda anchor={anchor} today={today} items={visible} color={color} href={href} open={open} />
          ) : (
            <TimeGrid days={view === 'ngay' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDay(weekStart(anchor), i))}
              today={today} items={visible} color={color} href={href} open={open} />
          )}
        </div>
      </div>

      {selected && (
        <Detail sel={selected} color={color.get(selected.it.source) ?? '#039be5'} sourceLabel={label.get(selected.it.source) ?? ''}
          onClose={() => setSelected(null)} deleteAction={deleteAction} />
      )}

      {creating && createForm && (
        <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-16" onClick={() => setCreating(false)}>
          <div role="dialog" aria-modal="true" aria-label="Tạo lịch" className="card max-h-[85dvh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Thêm lịch nhóm</h2>
              <button type="button" onClick={() => setCreating(false)} aria-label="Đóng" className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
            </div>
            {createForm}
          </div>
        </div>
      )}
    </div>
  );
}

type Href = (v: CalView, d: string) => string;
type Opener = (it: CalItem) => (e: React.MouseEvent) => void;

function MiniMonth({ anchor, today, view, href }: { anchor: string; today: string; view: CalView; href: Href }) {
  const [month, setMonth] = useState(anchor.slice(0, 7));
  useEffect(() => setMonth(anchor.slice(0, 7)), [anchor]);
  const start = monthGridStart(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDay(start, i));
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  };
  const inRange = (d: string) =>
    view === 'tuan' ? weekStart(d) === weekStart(anchor) : view === 'ngay' ? d === anchor : false;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">Tháng {Number(month.slice(5))}, {month.slice(0, 4)}</span>
        <span>
          <button type="button" onClick={() => shift(-1)} aria-label="Tháng trước" className="rounded-full px-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">‹</button>
          <button type="button" onClick={() => shift(1)} aria-label="Tháng sau" className="rounded-full px-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">›</button>
        </span>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => <div key={d} className="py-1 muted">{d}</div>)}
        {days.map((d) => (
          <Link key={d} href={href(view === 'thang' || view === 'lich-bieu' ? view : view, d)}
            className={`mx-auto my-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
              d === today ? 'bg-brand-600 font-semibold text-white' : inRange(d) ? 'bg-brand-50 text-brand-700 dark:bg-slate-700 dark:text-white' : d.startsWith(month) ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : 'muted hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}>
            {Number(d.slice(8))}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SourceList({ sources, hidden, toggle }: { sources: CalSource[]; hidden: Set<string>; toggle: (k: string) => void }) {
  return (
    <div>
      <h2 className="mb-1 text-sm font-medium">Lịch của tôi</h2>
      <ul className="space-y-0.5">
        {sources.map((s) => (
          <li key={s.key}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <input type="checkbox" checked={!hidden.has(s.key)} onChange={() => toggle(s.key)} className="h-4 w-4 rounded" style={{ accentColor: s.color }} />
              <span className="truncate">{s.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayHeader({ day, today, href, big }: { day: string; today: string; href: Href; big?: boolean }) {
  const isToday = day === today;
  return (
    <div className="flex flex-col items-center py-1.5">
      <span className={`text-[11px] font-medium uppercase ${isToday ? 'text-brand-600 dark:text-brand-300' : 'muted'}`}>{WEEKDAY[weekdayOf(day)]}</span>
      <Link href={href('ngay', day)} className={`flex items-center justify-center rounded-full ${big ? 'h-11 w-11 text-2xl' : 'h-10 w-10 text-xl'} ${isToday ? 'bg-brand-600 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
        {Number(day.slice(8))}
      </Link>
    </div>
  );
}

function Chip({ it, color, open }: { it: CalItem; color: string; open: Opener }) {
  return (
    <button type="button" onClick={open(it)} title={it.title}
      className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium text-white hover:brightness-95" style={{ background: color }}>
      {it.title}
    </button>
  );
}

function TimeGrid({ days, today, items, color, href, open }: { days: string[]; today: string; items: CalItem[]; color: Map<string, string>; href: Href; open: Opener }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    // Cuộn tới 7 giờ sáng, hoặc tới mục sớm nhất nếu sớm hơn.
    const timed = items.filter((i) => !isAllDayLike(i) && days.includes(vnDayOf(i.starts_at)));
    const earliest = Math.min(7 * 60, ...timed.map((i) => vnMinutesOf(i.starts_at)));
    if (scroller.current) scroller.current.scrollTop = (Math.max(earliest - 30, 0) / 60) * HOUR_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join()]);

  const allDay = items.filter(isAllDayLike);
  const timed = items.filter((i) => !isAllDayLike(i));
  const cols = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const minW = days.length > 1 ? 'min-w-[640px]' : '';

  return (
    <div className="overflow-x-auto">
      <div className={minW}>
        <div className="grid overflow-y-hidden border-b border-slate-200 [scrollbar-gutter:stable] dark:border-slate-800" style={cols}>
          <div className="self-end pb-1 pr-2 text-right text-[10px] muted">GMT+07</div>
          {days.map((d) => <div key={d} className="border-l border-slate-200 dark:border-slate-800"><DayHeader day={d} today={today} href={href} big={days.length === 1} /></div>)}
          <div />
          {days.map((d) => (
            <div key={d} className="min-h-6 space-y-0.5 border-l border-slate-200 p-0.5 dark:border-slate-800">
              {allDay.filter((it) => daysOf(it).includes(d)).map((it) => <Chip key={it.key} it={it} color={color.get(it.source) ?? '#039be5'} open={open} />)}
            </div>
          ))}
        </div>
        <div ref={scroller} className="h-[calc(100dvh-230px)] min-h-[420px] overflow-y-auto [scrollbar-gutter:stable]">
          <div className="relative grid" style={{ ...cols, height: 24 * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: 23 }, (_, h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] muted" style={{ top: (h + 1) * HOUR_PX }}>{String(h + 1).padStart(2, '0')}:00</span>
              ))}
            </div>
            {days.map((d) => (
              <div key={d} className="relative border-l border-slate-200 dark:border-slate-800">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-slate-100 dark:border-slate-800/70" style={{ height: HOUR_PX }} />
                ))}
                {layoutDay(timed.filter((it) => daysOf(it).includes(d)), d).map((s) => {
                  const c = color.get(s.it.source) ?? '#039be5';
                  const short = s.height < 34;
                  return (
                    <button key={s.it.key + d} type="button" onClick={open(s.it)} title={`${hhmm(s.it.starts_at)} ${s.it.title}`}
                      className="absolute flex flex-col items-stretch justify-start overflow-hidden rounded-md border border-white px-1.5 py-0.5 text-left text-[11px] leading-tight text-white shadow-sm hover:z-10 hover:brightness-95 dark:border-slate-900"
                      style={{ top: s.top, height: s.height, left: `calc(${(s.col / s.cols) * 100}% + 1px)`, width: `calc(${(1 / s.cols) * 100}% - 3px)`, background: c }}>
                      {short ? (
                        <span className="block truncate"><b className="font-semibold">{s.it.title}</b>, {hhmm(s.it.starts_at)}</span>
                      ) : (
                        <>
                          <span className="line-clamp-2 font-semibold">{s.it.title}</span>
                          <span className="block truncate opacity-90">{hhmm(s.it.starts_at)} đến {hhmm(s.it.ends_at)}</span>
                          {s.it.location && s.height > 60 && <span className="block truncate opacity-90">{s.it.location}</span>}
                        </>
                      )}
                    </button>
                  );
                })}
                {now !== null && d === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (vnMinutesOf(new Date(now).toISOString()) / 60) * HOUR_PX }}>
                    <div className="relative h-0.5 bg-red-500"><span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-red-500" /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ anchor, today, items, color, href, open }: { anchor: string; today: string; items: CalItem[]; color: Map<string, string>; href: Href; open: Opener }) {
  const start = monthGridStart(anchor);
  const month = anchor.slice(0, 7);
  const weeks = addDay(start, 35).startsWith(month) ? 6 : 5;
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDay(start, i));
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) for (const d of daysOf(it)) {
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(it);
  }
  for (const list of byDay.values()) list.sort((a, b) => Number(isAllDayLike(b)) - Number(isAllDayLike(a)) || a.starts_at.localeCompare(b.starts_at));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-7" style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(110px, 1fr))` }}>
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d) => (
          <div key={d} className="border-b border-r border-slate-200 py-1 text-center text-[11px] font-medium muted dark:border-slate-800">{d}</div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className="min-w-0 border-b border-r border-slate-200 p-1 dark:border-slate-800">
              <div className="mb-0.5 text-center">
                <Link href={href('ngay', d)} className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${d === today ? 'bg-brand-600 font-semibold text-white' : d.startsWith(month) ? 'hover:bg-slate-100 dark:hover:bg-slate-800' : 'muted'}`}>
                  {d.endsWith('-01') ? `${Number(d.slice(8))} thg ${Number(d.slice(5, 7))}` : Number(d.slice(8))}
                </Link>
              </div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((it) =>
                  isAllDayLike(it) ? (
                    <Chip key={it.key} it={it} color={color.get(it.source) ?? '#039be5'} open={open} />
                  ) : (
                    <button key={it.key} type="button" onClick={open(it)} title={`${hhmm(it.starts_at)} ${it.title}`}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color.get(it.source) ?? '#039be5' }} />
                      <span className="shrink-0 muted">{hhmm(it.starts_at)}</span>
                      <span className="truncate font-medium">{it.title}</span>
                    </button>
                  ),
                )}
                {list.length > 3 && (
                  <Link href={href('ngay', d)} className="block rounded px-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800">{list.length - 3} mục khác</Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({ anchor, today, items, color, href, open }: { anchor: string; today: string; items: CalItem[]; color: Map<string, string>; href: Href; open: Opener }) {
  const days = Array.from({ length: 30 }, (_, i) => addDay(anchor, i));
  const rows = days
    .map((d) => ({ d, list: items.filter((it) => daysOf(it).includes(d)).sort((a, b) => Number(isAllDayLike(b)) - Number(isAllDayLike(a)) || a.starts_at.localeCompare(b.starts_at)) }))
    .filter((r) => r.list.length);
  if (!rows.length) return <p className="p-6 text-sm muted">Không có lịch nào trong 30 ngày tới.</p>;
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {rows.map(({ d, list }) => (
        <li key={d} className="flex gap-4 px-4 py-3">
          <Link href={href('ngay', d)} className="flex w-20 shrink-0 items-start gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-lg ${d === today ? 'bg-brand-600 text-white' : ''}`}>{Number(d.slice(8))}</span>
            <span className={`pt-1.5 text-[11px] uppercase ${d === today ? 'text-brand-600 dark:text-brand-300' : 'muted'}`}>thg {Number(d.slice(5, 7))}, {WEEKDAY[weekdayOf(d)]}</span>
          </Link>
          <ul className="min-w-0 flex-1 space-y-1">
            {list.map((it) => (
              <li key={it.key}>
                <button type="button" onClick={open(it)} className="flex w-full items-start gap-3 rounded px-2 py-1 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color.get(it.source) ?? '#039be5' }} />
                  <span className="w-28 shrink-0 muted">{isAllDayLike(it) ? 'Cả ngày' : `${hhmm(it.starts_at)} đến ${hhmm(it.ends_at)}`}</span>
                  <span className="min-w-0">
                    <span className="block font-medium">{it.title}</span>
                    {(it.location || it.sub) && <span className="block truncate text-xs muted">{[it.location, it.sub].filter(Boolean).join(' · ')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Detail({ sel, color, sourceLabel, onClose, deleteAction }: {
  sel: { it: CalItem; x: number; y: number }; color: string; sourceLabel: string; onClose: () => void; deleteAction?: (f: FormData) => Promise<void>;
}) {
  const { it } = sel;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) return setPos(null);
    let left = sel.x + 12;
    if (left + w > vw - 8) left = Math.max(8, sel.x - w - 12);
    const top = Math.min(Math.max(8, sel.y - 40), vh - h - 8);
    setPos({ left, top });
  }, [sel]);
  const Icon = ({ d }: { d: string }) => (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 muted" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
  return (
    <div ref={ref} role="dialog" aria-label={it.title} onClick={(e) => e.stopPropagation()}
      className={`fixed z-40 w-[min(420px,calc(100vw-16px))] rounded-xl bg-white p-4 shadow-2xl ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700 ${pos ? '' : 'inset-x-2 bottom-2 mx-auto'}`}
      style={pos ?? undefined}>
      <div className="mb-2 flex justify-end gap-1">
        {deleteAction && it.deleteId && (
          <form action={deleteAction} onSubmit={(e) => { if (!confirm('Xóa lịch này?')) e.preventDefault(); else onClose(); }}>
            <input type="hidden" name="id" value={it.deleteId} />
            <button aria-label="Xóa" title="Xóa" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
            </button>
          </form>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div className="flex gap-3">
        <span className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded" style={{ background: color }} />
        <div className="min-w-0">
          <h2 className="text-lg leading-snug">{it.title}</h2>
          <p className="text-sm muted">{timeText(it)}</p>
        </div>
      </div>
      <div className="mt-3 max-h-[50dvh] space-y-2 overflow-y-auto text-sm">
        {it.location && <div className="flex gap-3"><Icon d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" /><span>{it.location}</span></div>}
        {it.sub && <div className="flex gap-3"><Icon d="M4 6h16M4 12h16M4 18h10" /><span>{it.sub}</span></div>}
        {it.description && <div className="flex gap-3"><Icon d="M4 5h16M4 10h16M4 15h10M4 20h7" /><span className="whitespace-pre-line">{it.description}</span></div>}
        <div className="flex gap-3"><Icon d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" /><span>{sourceLabel}</span></div>
      </div>
      {it.links && it.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {it.links.map((l) => (
            <a key={l.href} href={l.href} target={l.external ? '_blank' : undefined} rel={l.external ? 'noopener noreferrer' : undefined}
              className={l === it.links![0] ? 'btn' : 'btn-secondary'}>
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
