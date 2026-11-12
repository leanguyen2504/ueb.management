'use client';

// Biểu mẫu Word dùng chung: vẽ các ô theo khai báo của mẫu (FORMS), lưu nháp trên máy, tải .docx.
import { useEffect, useMemo, useState } from 'react';
import { FORMS, type Field, type Values } from '@/lib/docx/forms';
import { numberToWords, vnd } from '@/lib/xlsx/budget';
import { download } from '../ReviewBox';

const ME_STORE = 'soan-thao:ca-nhan'; // thông tin cá nhân dùng lại cho mọi mẫu
const draftKey = (k: string) => `soan-thao:mau:${k}`;
const money = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0;

function defaults(fields: Field[]): Values {
  const v: Values = {};
  for (const f of fields) v[f.k] = f.type === 'rows' ? (f.def ?? [f.cols.map(() => '')]).map((r) => [...r]) : (f.def ?? '');
  return v;
}

export function FormMaker({ formKey }: { formKey: string }) {
  const def = FORMS.find((f) => f.key === formKey);
  const [v, setV] = useState<Values>(() => (def ? defaults(def.fields) : {}));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!def) return;
    try {
      const me = JSON.parse(localStorage.getItem(ME_STORE) || '{}') as Record<string, string>;
      const draft = JSON.parse(localStorage.getItem(draftKey(def.key)) || '{}') as Values;
      const base = defaults(def.fields);
      for (const f of def.fields) {
        if (f.type !== 'rows' && 'me' in f && f.me && typeof me[f.k] === 'string' && me[f.k]) base[f.k] = me[f.k];
        const d = draft[f.k];
        if (f.type === 'rows' ? Array.isArray(d) : typeof d === 'string') base[f.k] = d;
      }
      setV(base);
    } catch {}
    setLoaded(true);
  }, [def]);
  useEffect(() => {
    if (!def || !loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(def.key), JSON.stringify(v));
        const me = JSON.parse(localStorage.getItem(ME_STORE) || '{}') as Record<string, string>;
        for (const f of def.fields) if (f.type !== 'rows' && 'me' in f && f.me && typeof v[f.k] === 'string') me[f.k] = v[f.k] as string;
        localStorage.setItem(ME_STORE, JSON.stringify(me));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [v, def, loaded]);

  const totals = useMemo(() => {
    if (!def) return [];
    return def.fields.flatMap((f) => (f.type === 'rows' && f.sum ? [{ label: f.label, n: (v[f.k] as string[][] ?? []).reduce((a, r) => a + money(r[f.cols.findIndex((c) => c.k === f.sum)] ?? ''), 0) }] : []));
  }, [def, v]);

  if (!def) return <p className="card text-sm">Không tìm thấy mẫu.</p>;
  const set = (k: string, val: string | string[][]) => setV((cur) => ({ ...cur, [k]: val }));
  const rowsOf = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[][]) : []);

  async function make() {
    if (!def) return;
    setBusy(true);
    try {
      const { buildFormDocx, formFile } = await import('@/lib/docx/forms');
      download(await buildFormDocx(def, v), formFile(def, v));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    if (!def || !confirm('Xóa các ô đã điền của mẫu này (giữ thông tin cá nhân)?')) return;
    const me = JSON.parse(localStorage.getItem(ME_STORE) || '{}') as Record<string, string>;
    const base = defaults(def.fields);
    for (const f of def.fields) if (f.type !== 'rows' && 'me' in f && f.me && me[f.k]) base[f.k] = me[f.k];
    setV(base);
  }

  // Giữ đúng thứ tự của mẫu: các ô đơn liền nhau gom một khối, mỗi bảng một khối.
  type Group = { kind: 'simple'; fields: Field[] } | { kind: 'rows'; field: Extract<Field, { type: 'rows' }> };
  const groups: Group[] = [];
  for (const f of def.fields) {
    const last = groups[groups.length - 1];
    if (f.type === 'rows') groups.push({ kind: 'rows', field: f });
    else if (last?.kind === 'simple') last.fields.push(f);
    else groups.push({ kind: 'simple', fields: [f] });
  }
  const input = (f: Field) => {
    if (f.type === 'rows') return null;
    const val = String(v[f.k] ?? '');
    const wide = 'wide' in f && f.wide;
    const cls = wide ? 'sm:col-span-2 lg:col-span-4' : '';
    if (f.type === 'select') {
      return (
        <label key={f.k} className={cls}>
          <span className="label">{f.label}</span>
          <select className="input" value={val} onChange={(e) => set(f.k, e.target.value)}>{f.options.map((o) => <option key={o} value={o}>{o || '(chọn)'}</option>)}</select>
        </label>
      );
    }
    if (f.type === 'checks') {
      const on = val.split('\n').filter(Boolean);
      return (
        <fieldset key={f.k} className={cls}>
          <legend className="label">{f.label}</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            {f.options.map((o) => (
              <label key={o} className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={on.includes(o)} onChange={(e) => set(f.k, (e.target.checked ? [...on, o] : on.filter((x) => x !== o)).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => f.options.indexOf(a) - f.options.indexOf(b)).join('\n'))} />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    if (f.type === 'textarea') {
      return (
        <label key={f.k} className={cls}>
          <span className="label">{f.label}</span>
          <textarea className="input" rows={f.rows ?? 2} value={val} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={f.k} className={cls}>
        <span className="label">{f.label}</span>
        <input
          className={`input${f.type === 'money' ? ' text-right tabular-nums' : ''}`}
          type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
          inputMode={f.type === 'money' ? 'numeric' : undefined}
          value={f.type === 'money' ? (money(val) ? vnd(money(val)) : '') : val}
          placeholder={f.ph}
          onChange={(e) => set(f.k, f.type === 'money' ? String(money(e.target.value)) : e.target.value)}
        />
        {f.type === 'money' && money(val) > 0 && <span className="mt-1 block text-xs italic muted">{numberToWords(money(val))}</span>}
      </label>
    );
  };

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{def.label}</h2>
            <p className="mt-1 max-w-3xl text-sm muted">{def.note}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {def.original && <a className="btn-secondary px-3 py-1.5 text-sm" href={def.original.href} download>{def.original.label}</a>}
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={reset}>Làm mới</button>
          </div>
        </div>
        {groups[0]?.kind === 'simple' && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{groups[0].fields.map(input)}</div>}
      </section>

      {groups.slice(groups[0]?.kind === 'simple' ? 1 : 0).map((g, gi) => {
        if (g.kind === 'simple') return <section key={`s${gi}`} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{g.fields.map(input)}</section>;
        const f = g.field;
        const rows = rowsOf(f.k);
        const setCell = (ri: number, ci: number, val: string) => set(f.k, rows.map((r, x) => (x !== ri ? r : r.map((c, y) => (y === ci ? val : c)))));
        const sumIdx = f.sum ? f.cols.findIndex((c) => c.k === f.sum) : -1;
        return (
          <section key={f.k} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{f.label}</h3>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => set(f.k, [...rows, f.cols.map(() => '')])}>Thêm dòng</button>
            </div>
            <div className="-mx-4 overflow-x-auto md:-mx-5">
              <table className="table text-sm" style={{ minWidth: Math.max(560, f.cols.length * 170) }}>
                <thead><tr><th className="w-8">TT</th>{f.cols.map((c) => <th key={c.k} style={{ width: `${(c.w / f.cols.reduce((a, x) => a + x.w, 0)) * 100}%` }}>{c.label}</th>)}<th className="w-8" /></tr></thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td className="text-center">{ri + 1}</td>
                      {f.cols.map((c, ci) => (
                        <td key={c.k}>
                          <input
                            className={`input px-2 py-1${c.type === 'money' ? ' text-right tabular-nums' : ''}`}
                            aria-label={`${c.label} dòng ${ri + 1}`}
                            inputMode={c.type === 'money' ? 'numeric' : undefined}
                            value={c.type === 'money' ? (money(r[ci] ?? '') ? vnd(money(r[ci] ?? '')) : '') : (r[ci] ?? '')}
                            onChange={(e) => setCell(ri, ci, c.type === 'money' ? String(money(e.target.value)) : e.target.value)}
                          />
                        </td>
                      ))}
                      <td><button type="button" className="link text-xs" aria-label="Xóa dòng" onClick={() => set(f.k, rows.filter((_, x) => x !== ri))}>✕</button></td>
                    </tr>
                  ))}
                  {sumIdx >= 0 && (
                    <tr className="font-semibold">
                      <td colSpan={sumIdx + 1} className="text-center">Tổng cộng</td>
                      <td className="text-right tabular-nums">{vnd(rows.reduce((a, r) => a + money(r[sumIdx] ?? ''), 0))}</td>
                      <td colSpan={f.cols.length - sumIdx} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">
          {totals.map((t) => <span key={t.label} className="mr-4">Tổng: <b className="tabular-nums">{vnd(t.n)} đồng</b> <i className="muted">({numberToWords(t.n)})</i></span>)}
          {!totals.length && <span className="muted">Ô để trống sẽ in dấu chấm để điền tay.</span>}
        </span>
        <button type="button" className="btn" disabled={busy} onClick={make}>{busy ? 'Đang tạo…' : 'Tải file Word (.docx)'}</button>
      </div>
    </div>
  );
}
