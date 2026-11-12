'use client';

// Bảng ghi chú nhanh: gõ rồi Ctrl+Enter để lưu, ghim lên đầu, sửa tại chỗ, sao chép, tìm.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDateTime } from '@/lib/format';
import { createNote, deleteNote, pinNote, updateNote } from './actions';

export type Note = { id: string; body: string; pinned: boolean; created_at: string; updated_at: string };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export function NotesBoard({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok?: string; error?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setMsg(res);
      if (res.ok) { after?.(); router.refresh(); }
    });

  const shown = useMemo(() => {
    const k = fold(q.trim());
    return k ? notes.filter((n) => fold(n.body).includes(k)) : notes;
  }, [notes, q]);

  const save = () => draft.trim() && run(() => createNote(draft), () => setDraft(''));

  return (
    <div className="space-y-4">
      <div className="card space-y-2">
        <label htmlFor="ghi-moi" className="sr-only">Ghi chú mới</label>
        <textarea id="ghi-moi" className="input min-h-24" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ghi nhanh… (Ctrl+Enter để lưu)" maxLength={20000}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs muted">{draft.trim() ? `${draft.trim().split(/\s+/).length} chữ` : 'Ghi chú chỉ mình bạn xem được.'}</p>
          <button type="button" className="btn" disabled={pending || !draft.trim()} onClick={save}>Lưu ghi chú</button>
        </div>
      </div>

      {msg?.error && <p role="alert" className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">{msg.error}</p>}

      {notes.length > 3 && (
        <input type="search" className="input max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Tìm trong ${notes.length} ghi chú…`} aria-label="Tìm ghi chú" />
      )}

      {shown.length === 0 ? (
        <p className="text-sm muted">{notes.length ? 'Không có ghi chú nào khớp.' : 'Chưa có ghi chú nào.'}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => <NoteCard key={n.id} note={n} busy={pending} run={run} />)}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, busy, run }: { note: Note; busy: boolean; run: (fn: () => Promise<{ ok?: string; error?: string }>, after?: () => void) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(note.body); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <article className={`card flex flex-col gap-2 ${note.pinned ? 'border-gold-500/60 dark:border-gold-500/40' : ''}`}>
      {editing ? (
        <textarea className="input min-h-32 flex-1" value={text} autoFocus onChange={(e) => setText(e.target.value)} maxLength={20000} aria-label="Sửa ghi chú"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(() => updateNote(note.id, text), () => setEditing(false)); }
            if (e.key === 'Escape') { setText(note.body); setEditing(false); }
          }} />
      ) : (
        <p className="flex-1 whitespace-pre-wrap break-words text-sm" onDoubleClick={() => setEditing(true)}>{note.body}</p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="muted">{note.pinned && '📌 '}{fmtDateTime(note.updated_at)}</span>
        <span className="flex-1" />
        {editing ? (
          <>
            <button type="button" className="link" disabled={busy} onClick={() => run(() => updateNote(note.id, text), () => setEditing(false))}>Lưu</button>
            <button type="button" className="muted hover:underline" onClick={() => { setText(note.body); setEditing(false); }}>Hủy</button>
          </>
        ) : (
          <>
            <button type="button" className="link" onClick={copy}>{copied ? 'Đã chép' : 'Sao chép'}</button>
            <button type="button" className="link" onClick={() => setEditing(true)}>Sửa</button>
            <button type="button" className="link" disabled={busy} onClick={() => run(() => pinNote(note.id, !note.pinned))}>{note.pinned ? 'Bỏ ghim' : 'Ghim'}</button>
            <button type="button" className="text-orange-700 hover:underline dark:text-orange-300" disabled={busy} onClick={() => { if (window.confirm('Xóa ghi chú này?')) run(() => deleteNote(note.id)); }}>Xóa</button>
          </>
        )}
      </div>
    </article>
  );
}
