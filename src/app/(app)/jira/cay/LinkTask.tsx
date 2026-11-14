'use client';

import { useRef, useState, useTransition } from 'react';
import { saveTaskJira } from '@/lib/work';

export type PickGroup = { label: string; tasks: { id: string; label: string }[] };

// Gắn mã Jira của dòng này vào một Việc trên web, giống ô "+ Kết nối Jira" ở trang Việc:
// bấm "+ Link Việc", gõ vài chữ tên Việc (hoặc chọn trong Gợi ý), bấm vào Việc là lưu.
const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function LinkTask({ jiraKey, groups }: { jiraKey: string; groups: PickGroup[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  if (!open) {
    return (
      <button type="button" className="text-xs text-slate-500 hover:text-brand-600 hover:underline dark:hover:text-brand-300"
        onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 0); }}>+ Link Việc</button>
    );
  }
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const shown = groups
    .map((g) => ({
      label: g.label,
      tasks: g.tasks.filter((t) => {
        if (!terms.length) return g.label === 'Gợi ý';
        if (seen.has(t.id)) return false;
        const hay = fold(`${t.label} ${g.label}`);
        if (!terms.every((w) => hay.includes(w))) return false;
        seen.add(t.id);
        return true;
      }).slice(0, 15),
    }))
    .filter((g) => g.tasks.length);
  const link = (id: string) => {
    setError(null);
    start(async () => {
      const r = await saveTaskJira({ id, value: jiraKey });
      if (r?.error) setError(r.error);
      else { setOpen(false); setQ(''); }
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} disabled={pending}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQ(''); } }}
          aria-label={`Tìm Việc để link với ${jiraKey}`} placeholder="Gõ tên Việc hoặc nhóm…"
          className="h-7 w-56 rounded-lg border border-dashed border-slate-300 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
        {!pending && <button type="button" onClick={() => { setOpen(false); setQ(''); }} className="text-xs text-slate-500 hover:underline">Hủy</button>}
        {pending && <span className="muted">Đang lưu…</span>}
      </div>
      {shown.length > 0 ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          {shown.map((g) => (
            <div key={g.label}>
              <div className="px-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
              {g.tasks.map((t) => (
                <button key={t.id} type="button" disabled={pending} onClick={() => link(t.id)}
                  className="block w-full rounded px-1.5 py-1 text-left hover:bg-brand-50 disabled:opacity-50 dark:hover:bg-brand-900">{t.label}</button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{terms.length ? 'Không thấy Việc nào khớp.' : 'Gõ tên Việc để tìm.'}</p>
      )}
      {error && <p className="text-red-600 dark:text-red-400" role="alert">{error}</p>}
    </div>
  );
}

// Bỏ link (xóa mã Jira khỏi Việc của tôi).
export function UnlinkTask({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title="Bỏ link" aria-label="Bỏ link"
      onClick={() => start(async () => { await saveTaskJira({ id: taskId, value: '' }); })}
      className="text-slate-400 hover:text-orange-600 disabled:opacity-50">×</button>
  );
}
