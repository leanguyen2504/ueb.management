'use client';

import { useState, useTransition } from 'react';
import { saveTaskJira } from '@/lib/work';

export type PickGroup = { label: string; tasks: { id: string; label: string }[] };

// Chọn một Việc (chưa gắn mã) để gắn mã Jira của dòng này; Việc chia theo nhóm con của đơn vị.
export function LinkTask({ jiraKey, groups }: { jiraKey: string; groups: PickGroup[] }) {
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select value={id} onChange={(e) => setId(e.target.value)} disabled={pending} aria-label={`Chọn Việc để link với ${jiraKey}`}
        className="input h-7 w-64 py-0 text-xs">
        <option value="">Chọn Việc để link…</option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.tasks.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </optgroup>
        ))}
      </select>
      <button type="button" disabled={!id || pending}
        onClick={() => { setError(null); start(async () => { const r = await saveTaskJira({ id, value: jiraKey }); if (r?.error) setError(r.error); else setId(''); }); }}
        className="h-7 rounded-lg bg-brand-600 px-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-brand-300 dark:text-brand-900">
        {pending ? '…' : 'Link'}
      </button>
      {error && <span className="w-full text-red-600 dark:text-red-400" role="alert">{error}</span>}
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
