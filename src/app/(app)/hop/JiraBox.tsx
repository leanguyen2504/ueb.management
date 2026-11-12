'use client';

import { useRef, useState, useTransition } from 'react';
import { saveMeetingJira } from './actions';
import type { MeetingRef } from './MeetingForms';

// Ô mã Jira ngay trên dòng buổi họp: dán link Jira hoặc gõ mã rồi bấm Enter là lưu.
// Đã có mã thì hiện mã dạng link, bấm ✎ để sửa.
// Ô nằm trong <summary> nên chặn cú bấm để không đóng/mở thẻ buổi họp.
export function JiraBox({ meeting, jiraKey, href, canEdit }: { meeting: MeetingRef; jiraKey: string | null; href: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const save = (raw = value) => {
    const v = raw.trim();
    if (!v && !jiraKey) return;
    setError(null);
    start(async () => {
      const res = await saveMeetingJira({ source_id: meeting.source_id, event_key: meeting.event_key, meeting_title: meeting.title, meeting_starts_at: meeting.starts_at, value: v });
      if (res?.error) setError(res.error);
      else { setEditing(false); setValue(''); }
    });
  };

  const stop = (e: React.MouseEvent) => {
    // Bấm vào ô nhập hay khoảng trống quanh ô: không mở/đóng thẻ. Nút và link vẫn chạy bình thường.
    if (!(e.target as Element).closest('a,button')) e.preventDefault();
  };

  if (jiraKey && !editing) {
    const chip = 'rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-medium text-brand-700 dark:bg-brand-900 dark:text-brand-100';
    return (
      <span className="inline-flex items-center gap-1" onClick={stop}>
        {href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className={`${chip} hover:underline`} title="Mở trên Jira">{jiraKey} ↗</a>
          : <span className={chip}>{jiraKey}</span>}
        {canEdit && (
          <button type="button" className="rounded px-1 text-xs text-slate-400 hover:text-brand-600 dark:hover:text-brand-300" aria-label="Sửa mã Jira" title="Sửa mã Jira"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); setTimeout(() => input.current?.focus(), 0); }}>✎</button>
        )}
      </span>
    );
  }
  if (!canEdit) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1" onClick={stop}>
      <input
        ref={input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setValue(''); setError(null); }
        }}
        onKeyUp={(e) => { if (e.key === ' ') e.preventDefault(); }}
        onPaste={(e) => {
          // Dán link vào ô trống thì lưu luôn.
          const t = e.clipboardData.getData('text').trim();
          if (!value && /^https?:\/\//i.test(t)) { e.preventDefault(); setValue(t); save(t); }
        }}
        disabled={pending}
        aria-label="Link hoặc mã Jira"
        placeholder={jiraKey ? `Sửa ${jiraKey} (để trống rồi Enter là xóa)` : 'Dán link Jira hoặc gõ mã'}
        className="h-7 w-56 rounded-lg border border-dashed border-slate-300 bg-white px-2 font-sans text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-brand-600 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      {(value.trim() || editing) && (
        <button type="button" disabled={pending} onClick={(e) => { e.preventDefault(); e.stopPropagation(); save(); }}
          className="h-7 rounded-lg bg-brand-600 px-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-brand-300 dark:text-brand-900">
          {pending ? 'Đang lưu…' : 'Lưu'}
        </button>
      )}
      {editing && !pending && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(false); setValue(''); setError(null); }}
          className="text-xs text-slate-500 hover:underline">Hủy</button>
      )}
      {error && <span className="text-xs font-normal text-red-600 dark:text-red-400" role="alert">{error}</span>}
    </span>
  );

}
