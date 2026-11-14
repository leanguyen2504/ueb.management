'use client';

import { useRef, useState, useTransition } from 'react';
import { saveTaskJira } from '@/lib/work';
import type { JiraBrief } from '@/lib/jira/brief';

const chip = 'rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-100';

// Ô mã Jira trên đầu việc (không có ở việc Cá nhân): dán link Jira hoặc gõ mã rồi Enter là lưu.
// Đã gắn mã thì hiện mã dạng link, kèm thông tin đối chiếu từ "Jira của tôi" nếu có.
export function TaskJiraBox({ taskId, jiraKey, href, brief, canEdit, base }: {
  taskId: string;
  jiraKey: string | null;
  href: string | null;
  brief: JiraBrief | null;
  canEdit: boolean;
  /** Địa chỉ Jira của trường (JIRA_BASE_URL) để mở mã cha, mã con. */
  base: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const keyHref = (k: string) => (base ? `${base.replace(/\/+$/, '')}/browse/${encodeURIComponent(k)}` : null);

  const save = (raw = value) => {
    const v = raw.trim();
    if (!v && !jiraKey) return;
    setError(null);
    start(async () => {
      const res = await saveTaskJira({ id: taskId, value: v });
      if (res?.error) setError(res.error);
      else { setEditing(false); setOpen(false); setValue(''); }
    });
  };

  const keyLink = (k: string, cls = chip) => {
    const h = k === jiraKey ? href : keyHref(k);
    return h ? <a href={h} target="_blank" rel="noopener noreferrer" className={`${cls} hover:underline`} title="Mở trên Jira">{k} ↗</a> : <span className={cls}>{k}</span>;
  };

  if (jiraKey && !editing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs muted">
        {keyLink(jiraKey)}
        {brief ? (
          <>
            {brief.issueType && <span className="chip px-1.5 py-0">{brief.issueType}</span>}
            {brief.status && <span className={brief.done ? 'text-emerald-700 dark:text-emerald-400' : ''}>{brief.status}</span>}
            {brief.parent && <span>thuộc {keyLink(brief.parent.key, 'font-mono')}{brief.parent.summary ? ` ${brief.parent.summary}` : ''}</span>}
            {brief.children.length > 0 && <span>{brief.children.filter((c) => c.done).length}/{brief.children.length} việc con xong</span>}
            {brief.subtaskTotal > 0 && <span>{brief.subtaskDone}/{brief.subtaskTotal} sub-task xong</span>}
            {brief.myHours > 0 && <span>Bạn đã log {brief.myHours} giờ</span>}
          </>
        ) : (
          <span title="Mã này chưa có trong dữ liệu Jira trên web (chưa ai liên quan bấm Đồng bộ Jira).">chưa có dữ liệu Jira</span>
        )}
        {brief && (brief.parent || brief.children.length > 0 || brief.subtaskTotal > 0) && (
          <a href={`/jira/cay?q=${encodeURIComponent(brief.parent?.key ?? jiraKey)}`} className="text-brand-600 hover:underline dark:text-brand-300">Xem cây</a>
        )}
        {canEdit && (
          <button type="button" className="rounded px-1 text-slate-400 hover:text-brand-600 dark:hover:text-brand-300" aria-label="Sửa mã Jira" title="Sửa mã Jira"
            onClick={() => { setEditing(true); setTimeout(() => input.current?.focus(), 0); }}>✎</button>
        )}
      </div>
    );
  }
  if (!canEdit) return null;
  if (!open && !editing) {
    return (
      <button type="button" className="mt-1 text-xs text-slate-400 hover:text-brand-600 hover:underline dark:hover:text-brand-300"
        onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 0); }}>+ Gắn mã Jira</button>
    );
  }

  const cancel = () => { setEditing(false); setOpen(false); setValue(''); setError(null); };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onPaste={(e) => {
          // Dán link vào ô trống thì lưu luôn.
          const t = e.clipboardData.getData('text').trim();
          if (!value && /^https?:\/\//i.test(t)) { e.preventDefault(); setValue(t); save(t); }
        }}
        disabled={pending}
        aria-label="Link hoặc mã Jira"
        placeholder={jiraKey ? `Sửa ${jiraKey} (để trống rồi Enter là bỏ)` : 'Dán link Jira hoặc gõ mã, ví dụ KKTPT-7377'}
        className="h-7 w-64 rounded-lg border border-dashed border-slate-300 bg-white px-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <button type="button" disabled={pending} onClick={() => save()}
        className="h-7 rounded-lg bg-brand-600 px-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-brand-300 dark:text-brand-900">
        {pending ? 'Đang lưu…' : 'Lưu'}
      </button>
      {!pending && <button type="button" onClick={cancel} className="text-xs text-slate-500 hover:underline">Hủy</button>}
      {error && <span className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</span>}
    </div>
  );
}
