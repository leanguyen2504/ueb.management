'use client';

// Bảng nhóm có lọc ở đầu từng cột, sắp xếp và chọn cột hiển thị.
// Lọc chạy trên trình duyệt với dữ liệu người dùng đã được phép xem (RLS lọc từ trước).
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type GroupRow = {
  id: string;
  name: string;
  parent: string;
  kind: string;
  kindLabel: string;
  openTasks: number;
  members: number;
  role: string;
  updatedAt: string;
  updatedLabel: string;
};

type ColKey = 'name' | 'kind' | 'openTasks' | 'members' | 'role' | 'updatedAt';
const COLS: { key: ColKey; label: string; filter: 'text' | 'select' | 'number' | 'date' }[] = [
  { key: 'name', label: 'Tên', filter: 'text' },
  { key: 'kind', label: 'Loại', filter: 'select' },
  { key: 'openTasks', label: 'Việc đang mở', filter: 'number' },
  { key: 'members', label: 'Thành viên', filter: 'number' },
  { key: 'role', label: 'Vai trò của tôi', filter: 'select' },
  { key: 'updatedAt', label: 'Cập nhật', filter: 'date' },
];
const STORE = 'nhom.cot-an';
const NO_ROLE = 'Xem theo phạm vi';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function GroupTable({ rows }: { rows: GroupRow[] }) {
  const [hidden, setHidden] = useState<ColKey[]>([]);
  const [f, setF] = useState<Record<ColKey, string>>({ name: '', kind: '', openTasks: '', members: '', role: '', updatedAt: '' });
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? '[]');
      if (Array.isArray(saved)) setHidden(saved.filter((k) => COLS.some((c) => c.key === k && k !== 'name')));
    } catch {}
  }, []);
  const toggle = (k: ColKey) => {
    const next = hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k];
    setHidden(next);
    localStorage.setItem(STORE, JSON.stringify(next));
  };

  const options = useMemo(
    () => ({
      kind: [...new Map(rows.map((r) => [r.kind, r.kindLabel])).entries()],
      role: [...new Set(rows.map((r) => r.role || NO_ROLE))].sort().map((v) => [v, v] as [string, string]),
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = fold(f.name.trim());
    const min = (v: string) => (v.trim() === '' ? null : Number(v));
    const minTasks = min(f.openTasks);
    const minMembers = min(f.members);
    const out = rows.filter(
      (r) =>
        (!q || fold(`${r.name} ${r.parent}`).includes(q)) &&
        (!f.kind || r.kind === f.kind) &&
        (!f.role || (r.role || NO_ROLE) === f.role) &&
        (minTasks === null || r.openTasks >= minTasks) &&
        (minMembers === null || r.members >= minMembers) &&
        (!f.updatedAt || r.updatedAt.slice(0, 10) >= f.updatedAt),
    );
    return out.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi');
      return c * sort.dir;
    });
  }, [rows, f, sort]);

  const cols = COLS.filter((c) => !hidden.includes(c.key));
  const active = Object.values(f).some(Boolean);
  const set = (k: ColKey, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
        <span className="muted">
          {shown.length} / {rows.length} nhóm
          {active && (
            <button type="button" className="ml-3 text-brand-600 hover:underline dark:text-brand-100"
              onClick={() => setF({ name: '', kind: '', openTasks: '', members: '', role: '', updatedAt: '' })}>
              Xóa bộ lọc
            </button>
          )}
        </span>
        <details className="relative">
          <summary className="btn-secondary cursor-pointer list-none px-3 py-1">Cột hiển thị</summary>
          <div className="absolute right-0 z-10 mt-1 w-52 space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {COLS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-1 py-0.5">
                <input type="checkbox" checked={!hidden.includes(c.key)} disabled={c.key === 'name'} onChange={() => toggle(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </details>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="whitespace-nowrap">
                  <button type="button" className="uppercase hover:text-slate-900 dark:hover:text-white"
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                    aria-label={`Sắp xếp theo ${c.label}`}>
                    {c.label} {sort.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className="py-1 font-normal normal-case tracking-normal">
                  {c.filter === 'text' && (
                    <input value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} placeholder="Lọc tên…" className="input min-w-36 py-1" aria-label={`Lọc ${c.label}`} />
                  )}
                  {c.filter === 'select' && (
                    <select value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} className="input min-w-28 py-1" aria-label={`Lọc ${c.label}`}>
                      <option value="">Tất cả</option>
                      {options[c.key as 'kind' | 'role'].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  )}
                  {c.filter === 'number' && (
                    <input type="number" min={0} value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} placeholder="Từ" className="input w-20 py-1" aria-label={`${c.label} tối thiểu`} />
                  )}
                  {c.filter === 'date' && (
                    <input type="date" value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} className="input w-36 py-1" aria-label="Cập nhật từ ngày" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                {cols.map((c) => {
                  switch (c.key) {
                    case 'name':
                      return (
                        <td key={c.key}>
                          <Link href={`/nhom/${r.id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-100">{r.name}</Link>
                          {r.parent && <div className="text-xs muted">{r.parent}</div>}
                        </td>
                      );
                    case 'kind':
                      return <td key={c.key} className="whitespace-nowrap">{r.kindLabel}</td>;
                    case 'role':
                      return <td key={c.key} className="whitespace-nowrap">{r.role || <span className="muted">{NO_ROLE}</span>}</td>;
                    case 'updatedAt':
                      return <td key={c.key} className="whitespace-nowrap muted">{r.updatedLabel}</td>;
                    default:
                      return <td key={c.key}>{r[c.key]}</td>;
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-4 text-sm muted">Không có nhóm nào khớp bộ lọc.</p>}
      </div>
    </section>
  );
}
