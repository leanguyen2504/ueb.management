'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VIEW_LABEL, type CalItem, type CalSource, type CalView, type MoveAction } from './types';
import { CalDraftContext, type CalDraft } from './draft';
import { DataTable } from '@/components/table/DataTable';
import type { Column, Row } from '@/components/table/types';
import {
  WEEKDAY, WEEKDAY_LONG, addDay, dayStart, dmy, hhmm, monthGridStart, vnDayOf, vnMinutesOf, weekStart, weekdayOf,
} from './time';

// Lịch kiểu Google Calendar: xem theo ngày, tuần, tháng hoặc lịch biểu; bật/tắt
// từng nguồn lịch; bấm vào một mục để xem chi tiết. Dữ liệu do trang máy chủ nạp.
// Kéo chuột trên khung giờ để tạo lịch; kéo một mục để dời, kéo mép dưới để đổi giờ kết thúc;
// bấm nút bút chì trong ô chi tiết để sửa.

const HOUR_PX = 48;
const DAY_MS = 86400000;
const MIN_MS = 60000;
const SNAP = 15; // phút
const VIEWS: CalView[] = ['ngay', 'tuan', 'thang', 'lich-bieu', 'bang'];

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
  // Đường dẫn của trang lịch (mặc định /lich) và tiêu đề hộp thoại tạo lịch.
  basePath?: string;
  createTitle?: string;
  // Biểu mẫu sửa (đọc mục đang sửa qua useCalDraft) và thao tác kéo thả để dời / đổi giờ.
  editForm?: React.ReactNode;
  moveAction?: MoveAction;
};

// Hộp thoại đang mở: tạo (có thể kèm khung giờ vừa chọn) hoặc sửa một mục.
type Dialog = { n: number; start?: string; end?: string; allDay?: boolean; edit?: CalItem };

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
  const { view, anchor, today, title, items, sources, extraQuery = '', deleteAction, createForm, sideExtra, basePath = '/lich', createTitle = 'Thêm lịch nhóm', editForm, moveAction } = props;
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<{ it: CalItem; x: number; y: number } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const counter = useRef(0);
  const openDialog = (d: Omit<Dialog, 'n'>) => {
    setSelected(null);
    setDialog({ ...d, n: ++counter.current });
  };
  const closeDialog = useCallback(() => setDialog(null), []);
  // Mở sẵn hộp thoại thêm lịch khi đến từ nút Tạo mới (/lich?them=1).
  useEffect(() => { if (createForm && new URLSearchParams(window.location.search).get('them') === '1') openDialog({}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Giờ mới của các mục vừa kéo thả, hiện ngay trong lúc chờ máy chủ lưu.
  const [moved, setMoved] = useState<Record<string, { starts_at: string; ends_at: string }>>({});
  useEffect(() => setMoved({}), [items]);
  const onMove = moveAction
    ? async (it: CalItem, starts_at: string, ends_at: string) => {
        if (!it.editId) return;
        setMoved((m) => ({ ...m, [it.key]: { starts_at, ends_at } }));
        const res = await moveAction(it.editId, starts_at, ends_at).catch(() => ({ error: 'Không lưu được, hãy thử lại.' }));
        if (res?.error) {
          setMoved((m) => {
            const next = { ...m };
            delete next[it.key];
            return next;
          });
          alert(res.error);
        } else router.refresh();
      }
    : undefined;
  const onCreate = createForm ? (start: string, end: string, allDay: boolean) => openDialog({ start, end, allDay }) : undefined;

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
  const visible = useMemo(
    () => items.filter((i) => !hidden.has(i.source)).map((i) => (moved[i.key] ? { ...i, ...moved[i.key] } : i)),
    [items, hidden, moved],
  );

  const href = (v: CalView, d: string) => `${basePath}?xem=${v}&ngay=${d}${extraQuery}`;
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
        setDialog(null);
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
        b: () => go('bang', anchor),
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
          <button type="button" onClick={(e) => { e.stopPropagation(); openDialog({}); }}
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
          <p className="text-[11px] muted">Phím tắt: T hôm nay, J/K tới/lùi, D ngày, W tuần, M tháng, A lịch biểu, B bảng.</p>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2 overflow-x-auto overflow-y-hidden scrollbar-none border-b border-slate-200 px-4 py-2 lg:hidden dark:border-slate-800">
            {sources.map((s) => (
              <button key={s.key} type="button" onClick={() => toggle(s.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${hidden.has(s.key) ? 'border-slate-300 muted dark:border-slate-700' : 'border-transparent text-white'}`}
                style={hidden.has(s.key) ? undefined : { background: s.color }}>
                {s.label}
              </button>
            ))}
          </div>
          {view === 'thang' ? (
            <MonthGrid anchor={anchor} today={today} items={visible} color={color} href={href} open={open} busy={Boolean(selected || dialog)} onCreate={onCreate} />
          ) : view === 'bang' ? (
            <div className="p-4"><ItemTable items={visible} label={label} basePath={basePath} title={title} /></div>
          ) : view === 'lich-bieu' ? (
            <Agenda anchor={anchor} today={today} items={visible} color={color} href={href} open={open} />
          ) : (
            <TimeGrid days={view === 'ngay' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDay(weekStart(anchor), i))}
              today={today} items={visible} color={color} href={href} open={open}
              busy={Boolean(selected || dialog)} onCreate={onCreate} onMove={onMove}
              ghost={dialog && !dialog.edit && dialog.start && dialog.end ? { start: dialog.start, end: dialog.end, allDay: Boolean(dialog.allDay) } : null} />
          )}
        </div>
      </div>

      {selected && (
        <Detail sel={selected} color={color.get(selected.it.source) ?? '#039be5'} sourceLabel={label.get(selected.it.source) ?? ''}
          onClose={() => setSelected(null)} deleteAction={deleteAction}
          onEdit={editForm && selected.it.editId ? () => openDialog({ edit: selected.it }) : undefined} />
      )}

      {dialog && (dialog.edit ? editForm : createForm) && (
        <div className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 p-4 pt-16" onClick={() => setDialog(null)}>
          <div role="dialog" aria-modal="true" aria-label={dialog.edit ? 'Sửa lịch' : 'Tạo lịch'} className="card max-h-[85dvh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{dialog.edit ? 'Sửa lịch' : createTitle}</h2>
              <button type="button" onClick={() => setDialog(null)} aria-label="Đóng" className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
            </div>
            <DraftProvider dialog={dialog} close={closeDialog}>
              {dialog.edit ? editForm : createForm}
            </DraftProvider>
          </div>
        </div>
      )}
    </div>
  );
}

// Truyền khung giờ / mục đang sửa cho biểu mẫu; key buộc biểu mẫu dựng lại với giá trị mới.
function DraftProvider({ dialog, close, children }: { dialog: Dialog; close: () => void; children: React.ReactNode }) {
  const value = useMemo<CalDraft>(
    () => ({ start: dialog.start, end: dialog.end, allDay: dialog.allDay, edit: dialog.edit, close }),
    [dialog, close],
  );
  return <CalDraftContext.Provider value={value}><div key={dialog.n}>{children}</div></CalDraftContext.Provider>;
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

type CreateFn = (start: string, end: string, allDay: boolean) => void;
type MoveFn = (it: CalItem, starts_at: string, ends_at: string) => void;

// Đang kéo: tạo mục mới có giờ (new), tạo mục cả ngày (newAllDay), dời mục (move) hoặc đổi giờ kết thúc (resize).
type Drag =
  | { kind: 'new'; day: string; a: number; b: number; moved: boolean }
  | { kind: 'newAllDay'; a: number; b: number }
  | { kind: 'move' | 'resize'; it: CalItem; x0: number; y0: number; col0: number; dDay: number; dMin: number; moved: boolean };

const snapDown = (m: number) => Math.floor(m / SNAP) * SNAP;
const snapUp = (m: number) => Math.ceil(m / SNAP) * SNAP;
const clampMin = (m: number) => Math.max(0, Math.min(24 * 60, m));
const iso = (ms: number) => new Date(ms).toISOString();

// Khung giờ (phút trong ngày) của thao tác kéo để tạo: từ ô bấm đầu tiên tới ô đang trỏ.
function newRange(a: number, b: number, moved: boolean): [number, number] {
  if (!moved) return [a, Math.min(a + 60, 24 * 60)];
  if (b >= a) return [a, Math.max(a + SNAP, Math.min(snapUp(b), 24 * 60))];
  return [snapDown(b), a + SNAP];
}

function TimeGrid({ days, today, items, color, href, open, busy, onCreate, onMove, ghost }: {
  days: string[]; today: string; items: CalItem[]; color: Map<string, string>; href: Href; open: Opener;
  busy: boolean; onCreate?: CreateFn; onMove?: MoveFn; ghost: { start: string; end: string; allDay: boolean } | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const allDayCols = useRef<(HTMLDivElement | null)[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const justDragged = useRef(false);
  const pointerType = useRef('mouse');
  const update = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };
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

  // Cột (ngày) dưới con trỏ, và số phút tính từ đầu ngày theo vị trí dọc.
  const colAt = (x: number, refs: (HTMLDivElement | null)[]) => {
    let best = 0;
    refs.forEach((el, i) => {
      if (el && x >= el.getBoundingClientRect().left) best = i;
    });
    return best;
  };
  const minuteAt = (y: number) => {
    const el = cols.current[0];
    if (!el) return 0;
    return clampMin(((y - el.getBoundingClientRect().top) / HOUR_PX) * 60);
  };

  // Theo dõi chuột trên cả cửa sổ trong lúc kéo.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMoveEv = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Tự cuộn khi kéo sát mép trên / dưới.
      const sc = scroller.current;
      if (sc && d.kind !== 'newAllDay') {
        const r = sc.getBoundingClientRect();
        if (e.clientY > r.bottom - 32) sc.scrollTop += 12;
        else if (e.clientY < r.top + 32) sc.scrollTop -= 12;
      }
      if (d.kind === 'new') {
        const b = minuteAt(e.clientY);
        update({ ...d, b, moved: d.moved || Math.abs(b - d.a) >= 8 });
      } else if (d.kind === 'newAllDay') {
        update({ ...d, b: colAt(e.clientX, allDayCols.current) });
      } else {
        const moved = d.moved || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4;
        if (!moved) return;
        const dMin = Math.round((((e.clientY - d.y0) / HOUR_PX) * 60) / SNAP) * SNAP;
        const dDay = d.kind === 'move' ? colAt(e.clientX, cols.current) - d.col0 : 0;
        update({ ...d, moved, dMin, dDay });
      }
    };
    const onUp = () => {
      const d = dragRef.current;
      update(null);
      if (!d) return;
      if (d.kind === 'new') {
        const [s, e] = newRange(snapDown(d.a), d.b, d.moved);
        const base = dayStart(d.day);
        setTimeout(() => onCreate?.(iso(base + s * MIN_MS), iso(base + e * MIN_MS), false), 0);
      } else if (d.kind === 'newAllDay') {
        const lo = Math.min(d.a, d.b);
        const hi = Math.max(d.a, d.b);
        setTimeout(() => onCreate?.(iso(dayStart(days[lo])), iso(dayStart(addDay(days[hi], 1))), true), 0);
      } else if (d.moved) {
        justDragged.current = true;
        setTimeout(() => { justDragged.current = false; }, 0);
        const p = preview(d);
        if (p.starts_at !== d.it.starts_at || p.ends_at !== d.it.ends_at) onMove?.(d.it, p.starts_at, p.ends_at);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') update(null); };
    window.addEventListener('pointermove', onMoveEv);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMoveEv);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // Giờ mới của mục đang được kéo.
  function preview(d: Extract<Drag, { kind: 'move' | 'resize' }>) {
    const s = new Date(d.it.starts_at).getTime();
    const e = new Date(d.it.ends_at).getTime();
    if (d.kind === 'resize') return { starts_at: d.it.starts_at, ends_at: iso(Math.max(s + SNAP * MIN_MS, e + d.dMin * MIN_MS)) };
    const shift = d.dDay * DAY_MS + d.dMin * MIN_MS;
    return { starts_at: iso(s + shift), ends_at: iso(e + shift) };
  }

  // Bắt đầu kéo trên vùng trống của cột ngày (chuột) để tạo lịch.
  const startNew = (day: string) => (e: React.PointerEvent) => {
    pointerType.current = e.pointerType;
    if (!onCreate || busy || e.button !== 0 || e.pointerType !== 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-cal-item]')) return;
    e.preventDefault();
    const a = minuteAt(e.clientY);
    update({ kind: 'new', day, a, b: a, moved: false });
  };
  // Màn hình cảm ứng: chạm vào ô trống để tạo lịch 1 giờ (kéo thì vẫn cuộn như thường).
  const tapNew = (day: string) => (e: React.MouseEvent) => {
    if (!onCreate || busy || pointerType.current === 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-cal-item]')) return;
    e.stopPropagation();
    const [s, en] = newRange(snapDown(minuteAt(e.clientY)), 0, false);
    onCreate(iso(dayStart(day) + s * MIN_MS), iso(dayStart(day) + en * MIN_MS), false);
  };
  const startAllDay = (i: number) => (e: React.PointerEvent) => {
    pointerType.current = e.pointerType;
    if (!onCreate || busy || e.button !== 0 || e.pointerType !== 'mouse') return;
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.preventDefault();
    update({ kind: 'newAllDay', a: i, b: i });
  };
  const tapAllDay = (i: number) => (e: React.MouseEvent) => {
    if (!onCreate || busy || pointerType.current === 'mouse') return;
    if ((e.target as HTMLElement).closest('button, a')) return;
    e.stopPropagation();
    onCreate(iso(dayStart(days[i])), iso(dayStart(addDay(days[i], 1))), true);
  };
  // Bắt đầu kéo một mục (dời) hoặc mép dưới của mục (đổi giờ kết thúc).
  const startItem = (it: CalItem, day: string, kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    pointerType.current = e.pointerType;
    if (!onMove || !it.editId || e.button !== 0 || e.pointerType !== 'mouse') return;
    e.stopPropagation();
    if (kind === 'resize') e.preventDefault();
    update({ kind, it, x0: e.clientX, y0: e.clientY, col0: days.indexOf(day), dDay: 0, dMin: 0, moved: false });
  };

  const active = drag && (drag.kind === 'move' || drag.kind === 'resize') && drag.moved ? drag : null;
  const shown = active ? items.map((i) => (i.key === active.it.key ? { ...i, ...preview(active) } : i)) : items;
  const allDay = shown.filter(isAllDayLike);
  const timed = shown.filter((i) => !isAllDayLike(i));
  const grid = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const minW = days.length > 1 ? 'min-w-[640px]' : '';

  // Khối mờ cho khung giờ đang chọn (đang kéo, hoặc hộp thoại tạo đang mở).
  let sel: { day: string; s: number; e: number } | null = null;
  if (drag?.kind === 'new') {
    const [s, e] = newRange(snapDown(drag.a), drag.b, drag.moved);
    sel = { day: drag.day, s, e };
  } else if (ghost && !ghost.allDay) {
    const day = vnDayOf(ghost.start);
    sel = { day, s: vnMinutesOf(ghost.start), e: Math.min(24 * 60, Math.max(vnMinutesOf(ghost.start) + SNAP, (new Date(ghost.end).getTime() - dayStart(day)) / MIN_MS)) };
  }
  let selDays: [number, number] | null = null;
  if (drag?.kind === 'newAllDay') selDays = [Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)];
  else if (ghost?.allDay) selDays = [days.indexOf(vnDayOf(ghost.start)), days.indexOf(addDay(vnDayOf(ghost.end), -1))];
  const label = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

  return (
    <div className={`overflow-x-auto ${drag ? 'select-none' : ''} ${active?.kind === 'resize' ? 'cursor-ns-resize' : active ? 'cursor-grabbing' : ''}`}>
      <div className={minW}>
        <div className="grid overflow-y-hidden border-b border-slate-200 [scrollbar-gutter:stable] dark:border-slate-800" style={grid}>
          <div className="self-end pb-1 pr-2 text-right text-[10px] muted">GMT+07</div>
          {days.map((d) => <div key={d} className="border-l border-slate-200 dark:border-slate-800"><DayHeader day={d} today={today} href={href} big={days.length === 1} /></div>)}
          <div />
          {days.map((d, i) => (
            <div key={d} ref={(el) => { allDayCols.current[i] = el; }} onPointerDown={startAllDay(i)} onClick={tapAllDay(i)}
              className={`min-h-6 space-y-0.5 border-l border-slate-200 p-0.5 dark:border-slate-800 ${selDays && i >= selDays[0] && i <= selDays[1] && selDays[0] >= 0 ? 'bg-brand-50 dark:bg-slate-800' : ''}`}>
              {allDay.filter((it) => daysOf(it).includes(d)).map((it) => <Chip key={it.key} it={it} color={color.get(it.source) ?? '#039be5'} open={open} />)}
            </div>
          ))}
        </div>
        <div ref={scroller} className="h-[calc(100dvh-230px)] min-h-[420px] overflow-y-auto [scrollbar-gutter:stable]">
          <div className="relative grid" style={{ ...grid, height: 24 * HOUR_PX }}>
            <div className="relative">
              {Array.from({ length: 23 }, (_, h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] muted" style={{ top: (h + 1) * HOUR_PX }}>{String(h + 1).padStart(2, '0')}:00</span>
              ))}
            </div>
            {days.map((d, di) => (
              <div key={d} ref={(el) => { cols.current[di] = el; }} onPointerDown={startNew(d)} onClick={tapNew(d)}
                className="relative border-l border-slate-200 dark:border-slate-800">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-slate-100 dark:border-slate-800/70" style={{ height: HOUR_PX }} />
                ))}
                {layoutDay(timed.filter((it) => daysOf(it).includes(d)), d).map((s) => {
                  const c = color.get(s.it.source) ?? '#039be5';
                  const short = s.height < 34;
                  const editable = Boolean(onMove && s.it.editId);
                  const isActive = active?.it.key === s.it.key;
                  const endsHere = vnDayOf(new Date(new Date(s.it.ends_at).getTime() - 1).toISOString()) === d;
                  return (
                    <div key={s.it.key + d} data-cal-item=""
                      className={`group/ev absolute overflow-hidden rounded-md border border-white text-white shadow-sm hover:z-10 dark:border-slate-900 ${isActive ? 'z-20 opacity-90 shadow-lg ring-2 ring-white/70' : ''}`}
                      style={{ top: s.top, height: s.height, left: isActive ? '1px' : `calc(${(s.col / s.cols) * 100}% + 1px)`, width: isActive ? 'calc(100% - 3px)' : `calc(${(1 / s.cols) * 100}% - 3px)`, background: c }}>
                      <button type="button" title={`${hhmm(s.it.starts_at)} ${s.it.title}${editable ? ' · kéo để dời giờ' : ''}`}
                        onPointerDown={startItem(s.it, d, 'move')}
                        onClick={(e) => { if (justDragged.current) { e.stopPropagation(); return; } open(s.it)(e); }}
                        className={`flex h-full w-full flex-col items-stretch justify-start px-1.5 py-0.5 text-left text-[11px] leading-tight hover:brightness-95 ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
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
                      {editable && endsHere && (
                        <span aria-hidden="true" onPointerDown={startItem(s.it, d, 'resize')} title="Kéo để đổi giờ kết thúc"
                          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center opacity-0 group-hover/ev:opacity-100">
                          <span className="mb-0.5 h-0.5 w-5 rounded bg-white/80" />
                        </span>
                      )}
                    </div>
                  );
                })}
                {sel && sel.day === d && (
                  <div className="pointer-events-none absolute inset-x-0.5 z-20 rounded-md bg-brand-600/85 px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-lg"
                    style={{ top: (sel.s / 60) * HOUR_PX, height: Math.max(((sel.e - sel.s) / 60) * HOUR_PX - 2, 16) }}>
                    <span className="block font-semibold">(Chưa có tiêu đề)</span>
                    <span className="block opacity-90">{label(sel.s)} đến {label(sel.e)}</span>
                  </div>
                )}
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

function MonthGrid({ anchor, today, items, color, href, open, busy, onCreate }: {
  anchor: string; today: string; items: CalItem[]; color: Map<string, string>; href: Href; open: Opener; busy: boolean; onCreate?: CreateFn;
}) {
  // Bấm vào chỗ trống của một ngày để tạo lịch cả ngày (như Google Calendar).
  const create = (d: string) => (e: React.MouseEvent) => {
    if (!onCreate || busy || (e.target as HTMLElement).closest('button, a')) return;
    e.stopPropagation();
    onCreate(new Date(dayStart(d)).toISOString(), new Date(dayStart(addDay(d, 1))).toISOString(), true);
  };
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
            <div key={d} onClick={create(d)} className={`min-w-0 border-b border-r border-slate-200 p-1 dark:border-slate-800 ${onCreate ? 'cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40' : ''}`}>
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

function Detail({ sel, color, sourceLabel, onClose, deleteAction, onEdit }: {
  sel: { it: CalItem; x: number; y: number }; color: string; sourceLabel: string; onClose: () => void; deleteAction?: (f: FormData) => Promise<void>; onEdit?: () => void;
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
        {onEdit && (
          <button type="button" onClick={onEdit} aria-label="Sửa" title="Sửa lịch" className="rounded-full p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>
          </button>
        )}
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

const TABLE_COLUMNS: Column[] = [
  { key: 'day', label: 'Ngày', type: 'date', nowrap: true },
  { key: 'weekday', label: 'Thứ', type: 'enum', nowrap: true },
  { key: 'time', label: 'Giờ', type: 'text', nowrap: true },
  { key: 'title', label: 'Nội dung', type: 'text', wide: true },
  { key: 'source', label: 'Loại lịch', type: 'enum' },
  { key: 'location', label: 'Địa điểm', type: 'enum' },
  { key: 'hours', label: 'Số giờ', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'description', label: 'Mô tả', type: 'text', hidden: true, wide: true },
  { key: 'links', label: 'Liên kết', type: 'tags', hidden: true },
];

// Kiểu xem Bảng: mọi mục trong tháng, lọc theo loại lịch, địa điểm, thứ; chọn cột; tải Excel.
function ItemTable({ items, label, basePath, title }: { items: CalItem[]; label: Map<string, string>; basePath: string; title: string }) {
  const rows: Row[] = [...items].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((it) => {
    const d = vnDayOf(it.starts_at);
    const span = daysOf(it);
    const dur = (new Date(it.ends_at).getTime() - new Date(it.starts_at).getTime()) / 3600000;
    return {
      id: it.key,
      cells: {
        day: { v: d, sub: span.length > 1 ? `đến ${dmy(span[span.length - 1])}` : undefined },
        weekday: WEEKDAY[weekdayOf(d)],
        time: isAllDayLike(it) ? 'Cả ngày' : `${hhmm(it.starts_at)}–${hhmm(it.ends_at)}`,
        title: { v: it.title, sub: it.sub ?? undefined, href: it.links?.[0]?.href, ext: it.links?.[0]?.external },
        source: label.get(it.source) ?? '',
        location: it.location ?? '',
        hours: isAllDayLike(it) ? null : Math.round(dur * 100) / 100,
        description: it.description ?? '',
        links: { items: (it.links ?? []).map((l) => ({ t: l.label, href: l.href, ext: l.external })) },
      },
    };
  });
  return <DataTable id={`lich-bang${basePath.replace(/\//g, '-')}`} columns={TABLE_COLUMNS} rows={rows} exportName={`lich-${title.replace(/[^0-9a-zA-Z]+/g, '-').toLowerCase()}`} empty="Không có lịch nào trong tháng này." />;
}
