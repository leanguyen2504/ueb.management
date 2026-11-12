'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildXlsx, XLSX_MIME, type XCell } from '@/lib/xlsx';
import { TONE_CLASS, cellObj, cellText, cellValue, cellValues, fmtDay, type Cell, type Column, type Row } from './types';

// Bảng dùng chung: tìm nhanh, lọc theo từng cột, sắp xếp, chọn cột hiển thị (nhớ trên máy),
// mật độ gọn/thoáng, mở rộng dòng xem chi tiết, cộng tổng và tải Excel đúng phần đang lọc.

type Filter =
  | { kind: 'text'; q: string }
  | { kind: 'set'; values: string[] }
  | { kind: 'range'; min: string; max: string };

type Props = {
  // Khóa để nhớ cột đã chọn trên máy (mỗi bảng một khóa).
  id: string;
  columns: Column[];
  rows: Row[];
  empty?: string;
  pageSize?: number;
  // Tên file khi tải Excel phần đang xem; bỏ trống thì ẩn nút.
  exportName?: string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  // Nút thêm ở thanh công cụ (ví dụ chọn vai trò).
  toolbar?: React.ReactNode;
  searchPlaceholder?: string;
};

const nf = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function DataTable({ id, columns, rows, empty = 'Không có dữ liệu.', pageSize = 50, exportName, initialSort, toolbar, searchPlaceholder }: Props) {
  const defaults = useMemo(() => columns.filter((c) => !c.hidden).map((c) => c.key), [columns]);
  const [shown, setShown] = useState<string[]>(defaults);
  const [dense, setDense] = useState(false);
  const [filters, setFilters] = useState<Record<string, Filter>>({});
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);
  const [limit, setLimit] = useState(pageSize);
  const [open, setOpen] = useState<string | null>(null); // cột đang mở hộp lọc, hoặc "__cot"
  // Vị trí hộp lọc (cố định theo màn hình để không bị khung cuộn ngang của bảng cắt mất).
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);

  // Nhớ cột đã chọn và mật độ trên máy này.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`bang:${id}:cot`) || 'null');
      if (Array.isArray(saved)) setShown(saved.filter((k: string) => columns.some((c) => c.key === k)));
      setDense(localStorage.getItem('bang:gon') === '1');
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const saveShown = (next: string[]) => {
    setShown(next);
    localStorage.setItem(`bang:${id}:cot`, JSON.stringify(next));
  };
  const toggleDense = () => {
    setDense(!dense);
    localStorage.setItem('bang:gon', dense ? '0' : '1');
  };

  // Đóng hộp lọc khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-pop]')) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    const onScroll = (e: Event) => {
      if (open !== '__cot' && !(e.target instanceof Element && e.target.closest('[data-pop]'))) setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => setLimit(pageSize), [filters, q, sort, pageSize]);

  const cols = columns.filter((c) => shown.includes(c.key));
  // Giữ thứ tự cột như khai báo.
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    let out = rows.filter((r) => {
      for (const [key, f] of Object.entries(filters)) {
        const c = r.cells[key];
        if (f.kind === 'text' && f.q && !norm(cellText(c)).includes(norm(f.q))) return false;
        if (f.kind === 'set' && f.values.length && !cellValues(c).some((v) => f.values.includes(v || '(Trống)'))) return false;
        if (f.kind === 'range') {
          const v = cellValue(c);
          const isNum = colByKey.get(key)?.type === 'number';
          if (f.min !== '') {
            if (v === null || v === '') return false;
            if (isNum ? Number(v) < Number(f.min) : String(v).slice(0, 10) < f.min) return false;
          }
          if (f.max !== '') {
            if (v === null || v === '') return false;
            if (isNum ? Number(v) > Number(f.max) : String(v).slice(0, 10) > f.max) return false;
          }
        }
      }
      if (nq) return columns.some((col) => norm(cellText(r.cells[col.key])).includes(nq));
      return true;
    });
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = cellValue(a.cells[sort.key]);
        const y = cellValue(b.cells[sort.key]);
        // Ô trống luôn xuống cuối.
        if (x === null || x === '') return y === null || y === '' ? 0 : 1;
        if (y === null || y === '') return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x).localeCompare(String(y), 'vi', { numeric: true }) * dir;
      });
    }
    return out;
  }, [rows, filters, q, sort, columns, colByKey]);

  const active = Object.entries(filters).filter(([, f]) => (f.kind === 'text' ? f.q : f.kind === 'set' ? f.values.length : f.min || f.max));
  const setFilter = (key: string, f: Filter | null) => {
    const next = { ...filters };
    if (f) next[key] = f;
    else delete next[key];
    setFilters(next);
  };
  const cycleSort = (key: string) =>
    setSort(!sort || sort.key !== key ? { key, dir: 'asc' } : sort.dir === 'asc' ? { key, dir: 'desc' } : null);

  const hasTotals = cols.some((c) => c.total);
  const hasDetail = rows.some((r) => r.detail?.length);
  const pad = dense ? '!py-1 !px-2' : '';

  const download = () => {
    const xrows: XCell[][] = filtered.map((r) =>
      cols.map((c) => {
        const o = cellObj(r.cells[c.key]);
        const text = cellText(r.cells[c.key]);
        if (c.type === 'number' && typeof o.v === 'number') return o.v;
        if (c.type === 'date' && typeof o.v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(o.v)) return { date: o.v };
        if (o.href && /^https?:/.test(o.href)) return { link: o.href, text };
        return text + (o.sub ? ` (${o.sub})` : '');
      }),
    );
    const bytes = buildXlsx([{ name: exportName ?? 'Bảng', columns: cols.map((c) => ({ header: c.label, width: c.wide ? 48 : c.type === 'number' ? 12 : c.type === 'date' ? 12 : 22 })), rows: xrows }]);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: XLSX_MIME }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportName ?? 'bang'}.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div ref={root}>
      {/* Thanh công cụ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? 'Tìm trong bảng…'} aria-label="Tìm trong bảng" className="input !py-1.5 !pl-8" />
        </div>
        {toolbar}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative" data-pop>
            <button type="button" onClick={() => setOpen(open === '__cot' ? null : '__cot')} className="btn-secondary !px-3 !py-1.5" aria-expanded={open === '__cot'}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16v14H4zM10 5v14M16 5v14" /></svg>
              Cột <span className="text-xs muted">{cols.length}/{columns.length}</span>
            </button>
            {open === '__cot' && (
              <div className="menu max-h-[60vh] w-64 overflow-y-auto" role="dialog" aria-label="Chọn cột hiển thị">
                <div className="mb-1 flex justify-between gap-2 px-2 pt-1 text-xs">
                  <button type="button" className="link" onClick={() => saveShown(columns.map((c) => c.key))}>Hiện tất cả</button>
                  <button type="button" className="link" onClick={() => saveShown(defaults)}>Mặc định</button>
                </div>
                {columns.map((c) => (
                  <label key={c.key} className="menu-item cursor-pointer !py-1.5" title={c.help}>
                    <input type="checkbox" checked={shown.includes(c.key)} disabled={shown.length === 1 && shown.includes(c.key)}
                      onChange={() => saveShown(shown.includes(c.key) ? shown.filter((k) => k !== c.key) : columns.map((x) => x.key).filter((k) => k === c.key || shown.includes(k)))} />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={toggleDense} className="btn-secondary !px-3 !py-1.5" title="Đổi mật độ dòng">{dense ? 'Thoáng' : 'Gọn'}</button>
          {exportName && (
            <button type="button" onClick={download} className="btn-secondary !px-3 !py-1.5" title="Tải phần đang lọc, đúng các cột đang hiện">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
              Excel
            </button>
          )}
        </div>
      </div>

      {(active.length > 0 || q) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="muted">Đang lọc:</span>
          {q && <FilterChip label={`Tìm "${q}"`} onClear={() => setQ('')} />}
          {active.map(([key, f]) => (
            <FilterChip key={key} label={`${colByKey.get(key)?.label}: ${describe(f, colByKey.get(key)?.type)}`} onClear={() => setFilter(key, null)} />
          ))}
          <button type="button" className="link" onClick={() => { setFilters({}); setQ(''); }}>Bỏ lọc</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="table">
          <thead className="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              {hasDetail && <th className="w-8 !px-2"><span className="sr-only">Mở rộng</span></th>}
              {cols.map((c) => {
                const f = filters[c.key];
                const on = active.some(([k]) => k === c.key);
                return (
                  <th key={c.key} className={`relative whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''} ${pad}`} title={c.help}
                    aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <span className={`inline-flex items-center gap-0.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                      <button type="button" onClick={() => cycleSort(c.key)} className="hover:text-slate-900 dark:hover:text-white">
                        {c.label}
                        <span className="ml-0.5 inline-block w-2.5 text-[10px]">{sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span>
                      </button>
                      <span data-pop className="relative">
                        <button type="button" onClick={(e) => {
                          const b = e.currentTarget.getBoundingClientRect();
                          setAt({ top: b.bottom + 4, left: Math.max(8, Math.min(b.left - 8, window.innerWidth - 272)) });
                          setOpen(open === c.key ? null : c.key);
                        }} aria-label={`Lọc cột ${c.label}`}
                          className={`rounded p-0.5 ${on ? 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500' : 'opacity-50 hover:opacity-100'}`}>
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 5h16l-6 8v5l-4 2v-7z" /></svg>
                        </button>
                        {open === c.key && (
                          <FilterBox at={at} col={c} rows={rows} value={f} onChange={(nf) => setFilter(c.key, nf)} onClose={() => setOpen(null)}
                            sort={sort?.key === c.key ? sort.dir : null} setSort={(d) => setSort(d ? { key: c.key, dir: d } : null)} />
                        )}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r) => {
              const isOpen = expanded.has(r.id);
              const bg = r.tone === 'today' ? 'bg-gold-50 dark:bg-gold-600/10' : r.tone === 'weekend' ? 'bg-slate-50/70 dark:bg-slate-900/40' : r.tone === 'warn' ? 'bg-orange-50/60 dark:bg-orange-950/20' : '';
              return (
                <RowFrag key={r.id}>
                  <tr className={`${bg} hover:bg-slate-50 dark:hover:bg-slate-800/40`}>
                    {hasDetail && (
                      <td className={`!px-2 ${pad}`}>
                        {r.detail?.length ? (
                          <button type="button" aria-expanded={isOpen} aria-label={isOpen ? 'Thu gọn' : 'Xem chi tiết'}
                            onClick={() => { const n = new Set(expanded); if (isOpen) n.delete(r.id); else n.add(r.id); setExpanded(n); }}
                            className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                          </button>
                        ) : null}
                      </td>
                    )}
                    {cols.map((c) => (
                      <td key={c.key} className={`${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.nowrap ? 'whitespace-nowrap' : ''} ${c.wide ? 'min-w-64' : ''} ${pad}`}>
                        <CellView c={r.cells[c.key]} type={c.type} dense={dense} />
                      </td>
                    ))}
                  </tr>
                  {isOpen && r.detail && (
                    <tr className="bg-slate-50/60 dark:bg-slate-900/40">
                      <td />
                      <td colSpan={cols.length} className="!pt-1">
                        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
                          {r.detail.map((d) => (
                            <div key={d.label} className="min-w-0">
                              <dt className="text-xs muted">{d.label}</dt>
                              <dd className="min-w-0 break-words"><CellView c={d.value} /></dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </RowFrag>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={cols.length + (hasDetail ? 1 : 0)} className="py-6 text-center text-sm muted">{rows.length ? 'Không có dòng nào khớp bộ lọc.' : empty}</td></tr>
            )}
          </tbody>
          {hasTotals && filtered.length > 0 && (
            <tfoot>
              <tr className="font-semibold">
                {hasDetail && <td />}
                {cols.map((c, i) => (
                  <td key={c.key} className={`${c.align === 'right' ? 'text-right tabular-nums' : ''} ${pad}`}>
                    {c.total ? nf(filtered.reduce((s, r) => s + (Number(cellValue(r.cells[c.key])) || 0), 0)) : i === 0 ? 'Tổng' : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs muted">
        <span>{filtered.length < rows.length ? `${filtered.length} / ${rows.length} dòng` : `${rows.length} dòng`}</span>
        {filtered.length > limit && (
          <>
            <button type="button" className="link" onClick={() => setLimit(limit + pageSize * 2)}>Hiện thêm {Math.min(pageSize * 2, filtered.length - limit)} dòng</button>
            <button type="button" className="link" onClick={() => setLimit(filtered.length)}>Hiện tất cả</button>
          </>
        )}
      </div>
    </div>
  );
}

function RowFrag({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="chip !bg-gold-100 !text-gold-600 dark:!bg-gold-600/20 dark:!text-gold-500">
      <span className="max-w-64 truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Bỏ lọc ${label}`} className="-mr-1 rounded-full px-1 hover:bg-white/60">✕</button>
    </span>
  );
}

function describe(f: Filter, type?: string) {
  if (f.kind === 'text') return `có "${f.q}"`;
  if (f.kind === 'set') return f.values.length > 2 ? `${f.values.slice(0, 2).join(', ')} +${f.values.length - 2}` : f.values.join(', ');
  const show = (s: string) => (type === 'date' ? fmtDay(s) : s);
  return f.min && f.max ? `${show(f.min)} – ${show(f.max)}` : f.min ? `từ ${show(f.min)}` : `đến ${show(f.max)}`;
}

function FilterBox({ at, col, rows, value, onChange, onClose, sort, setSort }: {
  at: { top: number; left: number }; col: Column; rows: Row[]; value?: Filter; onChange: (f: Filter | null) => void; onClose: () => void;
  sort: 'asc' | 'desc' | null; setSort: (d: 'asc' | 'desc' | null) => void;
}) {
  const type = col.type ?? 'text';
  const [search, setSearch] = useState('');
  const options = useMemo(() => {
    if (type !== 'enum' && type !== 'tags') return [];
    const count = new Map<string, number>();
    for (const r of rows) for (const v of new Set(cellValues(r.cells[col.key]).map((x) => x || '(Trống)'))) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
  }, [rows, col.key, type]);
  const sel = value?.kind === 'set' ? value.values : [];
  const toggle = (v: string) => {
    const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    onChange(next.length ? { kind: 'set', values: next } : null);
  };
  const range = value?.kind === 'range' ? value : { kind: 'range' as const, min: '', max: '' };
  const setRange = (k: 'min' | 'max', v: string) => {
    const next = { ...range, [k]: v };
    onChange(next.min || next.max ? next : null);
  };

  return (
    <div data-pop style={{ position: 'fixed', top: at.top, left: at.left, right: 'auto', marginTop: 0 }} className="menu z-40 w-64 whitespace-normal text-left text-sm font-normal text-slate-800 dark:text-slate-100" role="dialog" aria-label={`Lọc ${col.label}`}>
      <div className="mb-1.5 flex gap-1 px-1 text-xs">
        <button type="button" onClick={() => setSort(sort === 'asc' ? null : 'asc')} className={`rounded px-2 py-1 ${sort === 'asc' ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Tăng dần</button>
        <button type="button" onClick={() => setSort(sort === 'desc' ? null : 'desc')} className={`rounded px-2 py-1 ${sort === 'desc' ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}>Giảm dần</button>
      </div>
      {type === 'text' && (
        <input autoFocus className="input !py-1.5" placeholder="Chứa chữ…" value={value?.kind === 'text' ? value.q : ''}
          onChange={(e) => onChange(e.target.value ? { kind: 'text', q: e.target.value } : null)} onKeyDown={(e) => e.key === 'Enter' && onClose()} />
      )}
      {(type === 'number' || type === 'date') && (
        <div className="grid grid-cols-2 gap-2 px-1">
          <label className="text-xs muted">Từ<input type={type === 'date' ? 'date' : 'number'} step="any" className="input mt-0.5 !px-2 !py-1" value={range.min} onChange={(e) => setRange('min', e.target.value)} /></label>
          <label className="text-xs muted">Đến<input type={type === 'date' ? 'date' : 'number'} step="any" className="input mt-0.5 !px-2 !py-1" value={range.max} onChange={(e) => setRange('max', e.target.value)} /></label>
        </div>
      )}
      {(type === 'enum' || type === 'tags') && (
        <>
          {options.length > 8 && <input autoFocus className="input mb-1 !py-1.5" placeholder="Tìm giá trị…" value={search} onChange={(e) => setSearch(e.target.value)} />}
          <div className="max-h-64 overflow-y-auto">
            {options.filter(([v]) => !search || norm(v).includes(norm(search))).map(([v, n]) => (
              <label key={v} className="menu-item cursor-pointer !py-1">
                <input type="checkbox" checked={sel.includes(v)} onChange={() => toggle(v)} />
                <span className="min-w-0 flex-1 truncate">{v}</span>
                <span className="text-xs muted">{n}</span>
              </label>
            ))}
            {!options.length && <p className="px-2 py-1 text-xs muted">Cột trống.</p>}
          </div>
        </>
      )}
      <div className="mt-2 flex justify-between border-t border-slate-100 px-1 pt-2 text-xs dark:border-slate-800">
        <button type="button" className="link" onClick={() => onChange(null)}>Xóa lọc cột này</button>
        <button type="button" className="link" onClick={onClose}>Xong</button>
      </div>
    </div>
  );
}

function CellView({ c, type, dense }: { c: Cell; type?: string; dense?: boolean }) {
  const o = cellObj(c);
  if (o.items) {
    if (!o.items.length) return <span className="muted">—</span>;
    return (
      <span className={o.items.every((i) => i.tone) ? 'flex min-w-52 max-w-72 flex-wrap gap-1' : dense ? 'flex flex-wrap gap-x-2 gap-y-0.5' : 'flex flex-col gap-0.5'}>
        {o.items.map((i, n) => (
          <span key={`${i.t}-${n}`} className={i.tone ? `chip ${TONE_CLASS[i.tone]}` : ''}>
            <Linked href={i.href} ext={i.ext}>{i.t}</Linked>
            {i.sub && !dense && <span className="text-xs muted"> {i.sub}</span>}
          </span>
        ))}
      </span>
    );
  }
  let text = o.t ?? (o.v === null || o.v === undefined ? '' : typeof o.v === 'number' ? nf(o.v) : o.v);
  if (o.t === undefined && type === 'date' && typeof o.v === 'string') text = fmtDay(o.v);
  if (text === '') return o.sub && !dense ? <div className="text-xs muted">{o.sub}</div> : null;
  const main = o.tone ? <span className={`chip ${TONE_CLASS[o.tone]}`} title={o.title}><Linked href={o.href} ext={o.ext}>{text}</Linked></span>
    : <span title={o.title}><Linked href={o.href} ext={o.ext}>{text}</Linked></span>;
  return (
    <>
      {main}
      {o.sub && !dense && <div className="text-xs muted">{o.sub}</div>}
    </>
  );
}

function Linked({ href, ext, children }: { href?: string; ext?: boolean; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return <a href={href} className="link" target={ext ? '_blank' : undefined} rel={ext ? 'noreferrer' : undefined}>{children}</a>;
}
