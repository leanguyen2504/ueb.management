'use client';

// Biểu đồ Gantt cho trang Việc. Cột trái là cây nhóm / dự án (thu gọn được), bên phải là thanh thời
// gian: mỗi nhóm có một thanh tổng từ việc sớm nhất tới việc muộn nhất, bên dưới là thanh của từng
// việc tô màu theo trạng thái, việc quá hạn viền đỏ, vạch dọc "Hôm nay".
// Bản đầy đủ: kéo thanh để dời ngày, kéo mép trái / phải để đổi ngày bắt đầu / hạn (chỉ việc mình
// có quyền Sửa; cơ sở dữ liệu kiểm tra lại). Bản thu nhỏ (Dashboard): 4 tuần từ đầu tuần này, chỉ xem.
import Link from 'next/link';
import { useMemo, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from 'react';
import { useRouter } from 'next/navigation';
import { moveTaskDates } from '@/lib/work';
import type { TaskStatus } from '@/lib/types';

export type GanttTask = {
  id: string;
  title: string;
  group_id: string;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  progress: number | null;
  assignee_id: string | null;
  assignee: string;
  canEdit: boolean;
  /** Nhãn lặp lại (ví dụ "Hằng tuần") nếu là việc lặp lại. */
  repeat?: string | null;
};
export type GanttGroup = { id: string; name: string; parent_id: string | null };

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ duyệt', done: 'Hoàn thành' };
const BAR: Record<TaskStatus, string> = {
  todo: 'bg-slate-400 dark:bg-slate-500',
  doing: 'bg-sky-500 dark:bg-sky-500',
  review: 'bg-amber-500 dark:bg-amber-500',
  done: 'bg-emerald-500/70 dark:bg-emerald-600/70',
};
const FILL: Record<TaskStatus, string> = {
  todo: 'bg-slate-600',
  doing: 'bg-sky-700',
  review: 'bg-amber-700',
  done: 'bg-emerald-700',
};

// Ngày "YYYY-MM-DD" <-> số ngày tính từ 1970 (UTC, không lệch múi giờ).
const DAY = 86400000;
const num = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);
const str = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const dow = (n: number) => (new Date(n * DAY).getUTCDay() + 6) % 7; // 0 = thứ Hai
const dm = (n: number) => { const [, m, d] = str(n).split('-'); return `${d}/${m}`; };
const WD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

type Scale = 'tuan' | 'thang';
type Drag = { id: string; mode: 'move' | 'start' | 'end'; x0: number; s: number; e: number; d: number };
type Row =
  | { kind: 'group'; g: GanttGroup; depth: number; s: number | null; e: number | null; total: number; done: number; overdue: number; undated: number; hasKids: boolean }
  | { kind: 'task'; t: GanttTask; depth: number; s: number | null; e: number | null };

export function TaskGantt({
  tasks,
  groups,
  today,
  me,
  mini = false,
  fullHref,
}: {
  tasks: GanttTask[];
  groups: GanttGroup[];
  /** Hôm nay theo giờ Việt Nam, "YYYY-MM-DD". */
  today: string;
  me: string;
  mini?: boolean;
  /** Bản thu nhỏ: link mở chế độ Gantt đầy đủ. */
  fullHref?: string;
}) {
  const router = useRouter();
  const [scale, setScale] = useState<Scale>('tuan');
  const [who, setWho] = useState('');
  const [hideDone, setHideDone] = useState(false);
  // Bản đầy đủ mở hết; bản thu nhỏ chỉ hiện thanh nhóm, bấm vào nhóm mới mở việc.
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [moved, setMoved] = useState<Map<string, { start_date: string | null; due_date: string | null }>>(new Map());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, start] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  const t0 = num(today);
  const dayW = mini ? 0 : scale === 'tuan' ? 32 : 9;
  const leftW = mini ? 240 : 260;

  // Ngày đã đổi trên máy (chờ máy chủ lưu) đè lên dữ liệu gốc.
  const items = useMemo(
    () =>
      tasks
        .map((t) => ({ ...t, ...(moved.get(t.id) ?? {}) }))
        .filter((t) => (who === '' ? true : who === 'trong' ? !t.assignee_id : t.assignee_id === who))
        .filter((t) => !(hideDone && t.status === 'done')),
    [tasks, moved, who, hideDone],
  );

  const span = (t: { start_date: string | null; due_date: string | null }) => {
    const s = t.start_date ?? t.due_date;
    const e = t.due_date ?? t.start_date;
    if (!s || !e) return [null, null] as const;
    const a = num(s);
    const b = num(e);
    return [Math.min(a, b), Math.max(a, b)] as const;
  };

  // Khung thời gian. Thu nhỏ: 4 tuần từ thứ Hai tuần này. Đầy đủ: bao mọi việc có ngày (tối đa
  // nửa năm trước, một năm sau hôm nay), mở rộng tới đầu tuần / cuối tuần.
  const [from, days] = useMemo(() => {
    const mon = t0 - dow(t0);
    if (mini) return [mon, 28] as const;
    let lo = t0;
    let hi = t0 + 14;
    for (const t of items) {
      const [s, e] = span(t);
      if (s == null || e == null) continue;
      lo = Math.min(lo, s);
      hi = Math.max(hi, e);
    }
    lo = Math.max(lo - 3, t0 - 183);
    hi = Math.min(hi + 7, t0 + 366);
    lo -= dow(lo);
    hi += 6 - dow(hi);
    return [lo, hi - lo + 1] as const;
  }, [items, mini, t0]);
  const to = from + days - 1;

  // Bản thu nhỏ chỉ giữ việc chưa xong chạm vào 4 tuần, cộng việc quá hạn (hiện dấu ở mép trái).
  const visible = useMemo(
    () =>
      mini
        ? items.filter((t) => {
            if (t.status === 'done') return false;
            const [s, e] = span(t);
            return s != null && e != null && ((e >= from && s <= to) || e < t0);
          })
        : items,
    [items, mini, from, to, t0],
  );

  // Cây nhóm: chỉ nhóm có việc và các nhóm cha của chúng.
  const rows = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    const used = new Set<string>();
    for (const t of visible) {
      let g = byId.get(t.group_id);
      for (let i = 0; g && i < 10 && !used.has(g.id); i++) {
        used.add(g.id);
        g = g.parent_id ? byId.get(g.parent_id) : undefined;
      }
    }
    const kids = new Map<string | null, GanttGroup[]>();
    for (const id of used) {
      const g = byId.get(id)!;
      const p = g.parent_id && used.has(g.parent_id) ? g.parent_id : null;
      kids.set(p, [...(kids.get(p) ?? []), g]);
    }
    for (const v of kids.values()) v.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    const tasksOf = new Map<string, GanttTask[]>();
    for (const t of visible) tasksOf.set(t.group_id, [...(tasksOf.get(t.group_id) ?? []), t]);
    for (const v of tasksOf.values())
      v.sort((a, b) => (span(a)[0] ?? Infinity) - (span(b)[0] ?? Infinity) || (span(a)[1] ?? Infinity) - (span(b)[1] ?? Infinity) || a.title.localeCompare(b.title, 'vi'));

    const out: Row[] = [];
    const walk = (g: GanttGroup, depth: number): GanttTask[] => {
      const head: Row = { kind: 'group', g, depth, s: null, e: null, total: 0, done: 0, overdue: 0, undated: 0, hasKids: false };
      out.push(head);
      const open = mini ? toggled.has(g.id) : !toggled.has(g.id);
      const all: GanttTask[] = [];
      const mark = out.length;
      for (const c of kids.get(g.id) ?? []) all.push(...walk(c, depth + 1));
      const own = tasksOf.get(g.id) ?? [];
      const ownRows: Row[] = own.map((t) => ({ kind: 'task', t, depth: depth + 1, ...((([s, e]) => ({ s, e }))(span(t))) }));
      // Việc của chính nhóm nằm trên các nhóm con.
      out.splice(mark, 0, ...ownRows);
      all.push(...own);
      head.hasKids = all.length > 0;
      for (const t of all) {
        const [s, e] = span(t);
        head.total++;
        if (t.status === 'done') head.done++;
        else if (t.due_date && t.due_date < today) head.overdue++;
        if (s == null || e == null) head.undated++;
        else {
          head.s = head.s == null ? s : Math.min(head.s, s);
          head.e = head.e == null ? e : Math.max(head.e, e);
        }
      }
      if (!open) out.splice(out.indexOf(head) + 1);
      return all;
    };
    for (const g of kids.get(null) ?? []) walk(g, 0);
    return out;
  }, [groups, visible, toggled, mini, today]);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    let none = false;
    for (const t of tasks) {
      if (t.assignee_id) m.set(t.assignee_id, t.assignee_id === me ? 'Tôi' : t.assignee);
      else none = true;
    }
    return { list: [...m.entries()].sort((a, b) => (a[0] === me ? -1 : b[0] === me ? 1 : a[1].localeCompare(b[1], 'vi'))), none };
  }, [tasks, me]);

  // Vị trí theo % để bản thu nhỏ co giãn theo khung; bản đầy đủ có bề rộng cố định theo ngày.
  const pct = (n: number) => `${((n - from) / days) * 100}%`;
  const width = mini ? undefined : days * dayW;

  const toggle = (id: string) =>
    setToggled((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // ---- Kéo thả ----
  const begin = (t: GanttTask, s: number, e: number, mode: Drag['mode']) => (ev: RPointerEvent) => {
    if (mini || !t.canEdit || ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    setDrag({ id: t.id, mode, x0: ev.clientX, s, e, d: 0 });
    setMsg(null);
  };
  const onMove = (ev: RPointerEvent) => {
    if (!drag) return;
    const d = Math.round((ev.clientX - drag.x0) / dayW);
    if (d !== drag.d) setDrag({ ...drag, d });
  };
  const preview = (id: string, s: number, e: number): [number, number] => {
    if (!drag || drag.id !== id) return [s, e];
    if (drag.mode === 'move') return [drag.s + drag.d, drag.e + drag.d];
    if (drag.mode === 'start') return [Math.min(drag.s + drag.d, drag.e), drag.e];
    return [drag.s, Math.max(drag.e + drag.d, drag.s)];
  };
  const onUp = (t: GanttTask) => () => {
    if (!drag || drag.id !== t.id) return;
    const cur = drag;
    setDrag(null);
    if (!cur.d) return;
    const [s, e] = preview(t.id, cur.s, cur.e);
    // Giữ nguyên kiểu ngày của việc: việc chỉ có hạn thì dời hạn; kéo mép trái mới thêm ngày bắt đầu.
    const next = {
      start_date: cur.mode === 'start' || t.start_date ? str(s) : null,
      due_date: cur.mode === 'end' || t.due_date ? str(e) : null,
    };
    if (next.start_date && next.due_date && next.start_date === next.due_date && !t.start_date) next.start_date = null;
    const before = { start_date: t.start_date, due_date: t.due_date };
    setMoved((m) => new Map(m).set(t.id, next));
    start(async () => {
      const r = await moveTaskDates({ id: t.id, ...next });
      if (r?.error) {
        setMoved((m) => new Map(m).set(t.id, before));
        setMsg(r.error);
      } else {
        setMsg(`Đã đổi ngày "${t.title}": ${next.start_date ? `${dm(num(next.start_date))} → ` : ''}${next.due_date ? `hạn ${dm(num(next.due_date))}` : ''}`);
        router.refresh();
      }
    });
  };

  // ---- Đầu thanh thời gian ----
  const header = useMemo(() => {
    const top: { s: number; n: number; label: string }[] = [];
    const bottom: { s: number; n: number; label: string; weekend?: boolean; today?: boolean }[] = [];
    for (let n = from; n <= to; n++) {
      const d = str(n);
      const monthKey = d.slice(0, 7);
      if (mini || scale === 'tuan') {
        if (!mini) {
          const last = top[top.length - 1];
          if (last && str(last.s).slice(0, 7) === monthKey) last.n++;
          else top.push({ s: n, n: 1, label: `Tháng ${Number(d.slice(5, 7))}/${d.slice(0, 4)}` });
        }
        if (mini) {
          if (dow(n) === 0) top.push({ s: n, n: 7, label: `Tuần ${dm(n)}` });
          bottom.push({ s: n, n: 1, label: WD[dow(n)].replace('T', ''), weekend: dow(n) >= 5, today: n === t0 });
        } else bottom.push({ s: n, n: 1, label: `${Number(d.slice(8))}`, weekend: dow(n) >= 5, today: n === t0 });
      } else {
        const last = top[top.length - 1];
        if (last && str(last.s).slice(0, 7) === monthKey) last.n++;
        else top.push({ s: n, n: 1, label: `Th ${Number(d.slice(5, 7))}/${d.slice(2, 4)}` });
        if (dow(n) === 0) bottom.push({ s: n, n: 7, label: dm(n) });
      }
    }
    return { top, bottom };
  }, [from, to, scale, mini, t0]);

  const showToday = t0 >= from && t0 <= to;
  const todayLeft = mini ? `calc(${leftW}px + (100% - ${leftW}px) * ${(t0 - from + 0.5) / days})` : `${leftW + (t0 - from + 0.5) * dayW}px`;

  // Cuộn tới hôm nay khi mở bản đầy đủ.
  const didScroll = useRef(false);
  const setScroller = (el: HTMLDivElement | null) => {
    scroller.current = el;
    if (el && !mini && !didScroll.current) {
      didScroll.current = true;
      el.scrollLeft = Math.max(0, (t0 - from - 7) * dayW);
    }
  };

  const empty = !rows.length;
  const rowH = mini ? 30 : 34;

  return (
    <div>
      {!mini && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <nav className="seg" aria-label="Thang thời gian">
            <button type="button" onClick={() => setScale('tuan')} aria-current={scale === 'tuan' ? 'page' : undefined}>Theo tuần</button>
            <button type="button" onClick={() => { setScale('thang'); didScroll.current = false; }} aria-current={scale === 'thang' ? 'page' : undefined}>Theo tháng</button>
          </nav>
          <label className="flex items-center gap-1.5">
            <span className="muted">Người làm</span>
            <select className="input w-auto py-1.5" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Tất cả</option>
              {people.list.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              {people.none && <option value="trong">Chưa giao</option>}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            <span>Ẩn việc đã xong</span>
          </label>
          <button type="button" className="btn-secondary py-1.5" onClick={() => { if (scroller.current) scroller.current.scrollLeft = Math.max(0, (t0 - from - 7) * dayW); }}>Hôm nay</button>
          <span className="ml-auto flex flex-wrap items-center gap-3 text-xs muted">
            {(['todo', 'doing', 'review', 'done'] as TaskStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1"><i className={`inline-block h-2.5 w-4 rounded-sm ${BAR[s]}`} />{STATUS_LABEL[s]}</span>
            ))}
            <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-4 rounded-sm bg-slate-400 ring-2 ring-red-500" />Quá hạn</span>
          </span>
        </div>
      )}
      {msg && <p role="status" className="mb-2 rounded-xl bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-800">{msg}</p>}
      {empty ? (
        <p className="text-sm muted">{mini ? 'Không có việc nào trong 4 tuần tới.' : 'Không có việc nào để vẽ Gantt.'}</p>
      ) : (
        <div ref={setScroller} className={`relative rounded-xl border border-slate-200 dark:border-slate-800 ${mini ? 'overflow-hidden' : 'max-h-[70vh] overflow-auto'}`}>
          <div className="relative" style={{ width: mini ? '100%' : leftW + (width ?? 0) }}>
            {/* Đầu cột */}
            <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-200 bg-white px-3 pb-1.5 font-semibold muted dark:border-slate-800 dark:bg-slate-900" style={{ width: leftW }}>
                Nhóm / việc
              </div>
              <div className="relative min-w-0 flex-1" style={{ width }}>
                {header.top.length > 0 && (
                  <div className="relative h-6 border-b border-slate-100 dark:border-slate-800">
                    {header.top.map((h) => (
                      <div key={h.s} className="absolute top-0 h-full truncate border-l border-slate-200 px-1.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300" style={{ left: pct(h.s), width: `${(h.n / days) * 100}%` }}>{h.label}</div>
                    ))}
                  </div>
                )}
                <div className="relative h-6">
                  {header.bottom.map((h) => (
                    <div key={h.s} className={`absolute top-0 h-full truncate border-l border-slate-100 py-1 text-center tabular-nums dark:border-slate-800 ${h.weekend ? 'bg-slate-50 text-slate-400 dark:bg-slate-800/50' : 'muted'} ${h.today ? 'font-bold text-red-600 dark:text-red-400' : ''}`} style={{ left: pct(h.s), width: `${(h.n / days) * 100}%` }}>{h.label}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Các hàng */}
            {rows.map((r) => {
              const key = r.kind === 'group' ? `g:${r.g.id}` : `t:${r.t.id}`;
              return (
                <div key={key} className={`flex border-b border-slate-100 dark:border-slate-800 ${r.kind === 'group' ? 'bg-slate-50/70 dark:bg-slate-800/30' : ''}`} style={{ height: rowH }}>
                  <div className={`sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-slate-200 pr-2 text-sm dark:border-slate-800 ${r.kind === 'group' ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'}`} style={{ width: leftW, paddingLeft: 8 + r.depth * 14 }}>
                    {r.kind === 'group' ? (
                      <>
                        <button type="button" onClick={() => toggle(r.g.id)} className="w-4 shrink-0 text-xs muted hover:text-slate-900 dark:hover:text-white" aria-label={(mini ? toggled.has(r.g.id) : !toggled.has(r.g.id)) ? 'Thu gọn' : 'Mở ra'}>
                          {(mini ? toggled.has(r.g.id) : !toggled.has(r.g.id)) ? '▾' : '▸'}
                        </button>
                        <button type="button" onClick={() => toggle(r.g.id)} className="min-w-0 truncate text-left font-semibold" title={r.g.name}>{r.g.name}</button>
                        <span className="ml-auto shrink-0 text-xs tabular-nums muted" title={mini ? 'Việc chưa xong' : 'Đã xong / tổng số việc'}>{mini ? `${r.total} việc` : `${r.done}/${r.total}`}</span>
                        {r.overdue > 0 && <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300" title={`${r.overdue} việc quá hạn`}>{r.overdue}</span>}
                      </>
                    ) : (
                      <>
                        <i className={`inline-block h-2 w-2 shrink-0 rounded-full ${BAR[r.t.status]}`} />
                        <Link href={`/nhom/${r.t.group_id}`} className={`min-w-0 truncate hover:underline ${r.t.status === 'done' ? 'text-slate-400 line-through' : ''}`} title={r.t.repeat ? `${r.t.title} (lặp lại ${r.t.repeat.toLowerCase()})` : r.t.title}>{r.t.title}</Link>
                        {r.t.repeat && <span className="shrink-0 text-xs muted" title={`Lặp lại ${r.t.repeat.toLowerCase()}`}>↻</span>}
                        {r.s == null && <span className="ml-auto shrink-0 text-xs italic muted">chưa có ngày</span>}
                      </>
                    )}
                  </div>
                  <div className="relative min-w-0 flex-1" style={{ width }} onPointerMove={onMove}>
                    {/* Kẻ cột cuối tuần (bản theo tuần) */}
                    {!mini && scale === 'tuan' && header.bottom.filter((h) => h.weekend).map((h) => (
                      <div key={h.s} className="absolute inset-y-0 bg-slate-50 dark:bg-slate-800/40" style={{ left: pct(h.s), width: `${(1 / days) * 100}%` }} />
                    ))}
                    {r.kind === 'group' ? <GroupBar r={r} from={from} to={to} pct={pct} days={days} mini={mini} /> : <TaskBar r={r} from={from} to={to} t0={t0} today={today} pct={pct} days={days} mini={mini} preview={preview} begin={begin} onUp={onUp} dragging={drag?.id === r.t.id} />}
                  </div>
                </div>
              );
            })}

            {showToday && (
              <div className="pointer-events-none absolute bottom-0 top-0 z-[5] w-0 border-l-2 border-red-500/80" style={{ left: todayLeft }} title="Hôm nay" />
            )}
          </div>
        </div>
      )}
      {mini ? (
        fullHref && <p className="mt-2 text-right text-sm"><Link href={fullHref} className="link">Mở Gantt đầy đủ →</Link></p>
      ) : (
        <p className="mt-2 text-xs muted">Kéo thanh để dời cả việc; kéo mép trái / phải để đổi ngày bắt đầu / hạn. Chỉ kéo được việc bạn có quyền Sửa. Việc chưa đặt ngày hiện ở cột trái, đặt ngày bằng nút Sửa trong danh sách.</p>
      )}
    </div>
  );
}

function GroupBar({ r, from, to, pct, days, mini }: { r: Extract<Row, { kind: 'group' }>; from: number; to: number; pct: (n: number) => string; days: number; mini: boolean }) {
  if (r.s == null || r.e == null) return null;
  if (r.e < from || r.s > to) return null;
  const s = Math.max(r.s, from);
  const e = Math.min(r.e, to);
  const done = r.total ? r.done / r.total : 0;
  return (
    <div
      className="absolute top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-sm bg-slate-700/80 dark:bg-slate-300/70"
      style={{ left: pct(s), width: `${((e - s + 1) / days) * 100}%` }}
      title={`${r.g.name}: ${dm(r.s)} → ${dm(r.e)} · xong ${r.done}/${r.total}${r.overdue ? ` · ${r.overdue} quá hạn` : ''}`}
    >
      <div className="h-full bg-emerald-500" style={{ width: `${done * 100}%` }} />
      {!mini && r.s >= from && <i className="absolute left-0 top-0 h-full w-1 bg-slate-900 dark:bg-white" />}
      {!mini && r.e <= to && <i className="absolute right-0 top-0 h-full w-1 bg-slate-900 dark:bg-white" />}
    </div>
  );
}

function TaskBar({
  r, from, to, t0, today, pct, days, mini, preview, begin, onUp, dragging,
}: {
  r: Extract<Row, { kind: 'task' }>;
  from: number; to: number; t0: number; today: string;
  pct: (n: number) => string; days: number; mini: boolean;
  preview: (id: string, s: number, e: number) => [number, number];
  begin: (t: GanttTask, s: number, e: number, mode: Drag['mode']) => (ev: RPointerEvent) => void;
  onUp: (t: GanttTask) => () => void;
  dragging: boolean;
}) {
  const t = r.t;
  if (r.s == null || r.e == null) return null;
  const overdue = t.status !== 'done' && !!t.due_date && t.due_date < today;
  const [s0, e0] = preview(t.id, r.s, r.e);
  // Bản thu nhỏ: việc quá hạn kết thúc trước khung thì hiện dấu ở mép trái.
  if (e0 < from) {
    return overdue ? (
      <span className="absolute inset-y-0 left-1 flex items-center">
        <span className="rounded bg-red-100 px-1.5 text-[11px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300" title={`${t.title}: quá hạn từ ${dm(r.e)}`}>◂ quá hạn {dm(r.e)}</span>
      </span>
    ) : null;
  }
  if (s0 > to) return null;
  const s = Math.max(s0, from);
  const e = Math.min(e0, to);
  const drag = !mini && t.canEdit;
  const tip = `${t.title}\n${s0 === e0 ? dm(s0) : `${dm(s0)} → ${dm(e0)}`} · ${STATUS_LABEL[t.status]}${t.progress != null ? ` ${t.progress}%` : ''}${t.assignee ? ` · ${t.assignee}` : ''}${overdue ? ` · quá hạn ${t0 - r.e} ngày` : ''}${drag ? '\nKéo để dời ngày' : ''}`;
  return (
    <>
      <div
        className={`group absolute top-1/2 -translate-y-1/2 rounded ${mini ? 'h-3' : 'h-5'} ${BAR[t.status]} ${overdue ? 'ring-2 ring-red-500 ring-offset-1 dark:ring-offset-slate-900' : ''} ${drag ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${dragging ? 'opacity-80 shadow-lg' : ''}`}
        style={{ left: pct(s), width: `max(${((e - s + 1) / days) * 100}%, 6px)` }}
        title={tip}
        onPointerDown={begin(t, r.s, r.e, 'move')}
        onPointerUp={onUp(t)}
        onPointerCancel={onUp(t)}
      >
        {t.progress != null && t.status !== 'done' && <div className={`h-full rounded-l ${FILL[t.status]}`} style={{ width: `${t.progress}%` }} />}
        {drag && (
          <>
            <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-black/20 opacity-0 group-hover:opacity-100" onPointerDown={begin(t, r.s, r.e, 'start')} />
            <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-black/20 opacity-0 group-hover:opacity-100" onPointerDown={begin(t, r.s, r.e, 'end')} />
          </>
        )}
      </div>
      {!mini && (
        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 truncate whitespace-nowrap pl-1.5 text-xs muted" style={{ left: `calc(${pct(e + 1)})` }}>
          {dragging ? (s0 === e0 ? dm(s0) : `${dm(s0)} → ${dm(e0)}`) : t.assignee}
        </span>
      )}
    </>
  );
}
