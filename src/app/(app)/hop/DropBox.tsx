'use client';

// Ô kéo thả tài liệu cho phần A (trước họp) hoặc B (sau họp) của một buổi họp.
// Thả tệp từ máy (tải thẳng lên Supabase Storage) hoặc thả/dán link Google Drive.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { ACCEPT_FILES, DOC_TYPES, MAX_FILE_BYTES, POST_DOC_TYPES, PRE_DOC_TYPES } from '@/lib/meeting-rules';
import { attachMeetingDrop, prepareMeetingUpload } from './actions';
import type { MeetingRef } from './MeetingForms';

type Pending = { id: string; label: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;

function linksFrom(dt: DataTransfer): { url: string; title: string }[] {
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
  return [...new Set(raw.split(/\s+/).filter((u) => /^https:\/\/\S+$/i.test(u)))].slice(0, 20).map((url) => ({ url, title: '' }));
}

export function DropBox({ meeting, kind, pending, partiesListId, uid }: { meeting: MeetingRef; kind: 'pre' | 'minutes'; pending: Pending[]; partiesListId: string; uid: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [party, setParty] = useState('');
  const [docType, setDocType] = useState('');
  const [target, setTarget] = useState('');
  const [link, setLink] = useState('');
  const types = kind === 'pre' ? PRE_DOC_TYPES : POST_DOC_TYPES;

  async function send(files: File[], links: { url: string; title: string }[]) {
    if (busy) return;
    setMsg(null);
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) { setMsg({ error: `"${tooBig.name}" nặng ${mb(tooBig.size)}, quá 25 MB. Tệp lớn hãy để trên Google Drive và dán link.` }); return; }
    if (!files.length && !links.length) { setMsg({ error: 'Không đọc được tệp hoặc link. Thử chọn tệp bằng nút bấm.' }); return; }
    try {
      const uploaded: { path: string; name: string; size: number }[] = [];
      if (files.length) {
        setBusy(`Đang chuẩn bị ${files.length} tệp…`);
        const prep = await prepareMeetingUpload({ source_id: meeting.source_id, files: files.map((f) => ({ name: f.name, size: f.size })) });
        if ('error' in prep) { setMsg({ error: prep.error }); return; }
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
        for (let i = 0; i < files.length; i++) {
          setBusy(`Đang tải lên ${i + 1}/${files.length}: ${files[i].name}`);
          const { error } = await sb.storage.from('meeting-files').uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, files[i], { contentType: files[i].type || undefined });
          if (error) {
            setMsg({ error: /mime|type/i.test(error.message) ? `"${files[i].name}": loại tệp này chưa được nhận (chỉ PDF, Word, Excel, PowerPoint, ảnh, CSV, ZIP).` : `Không tải được "${files[i].name}": ${error.message}` });
            return;
          }
          uploaded.push({ path: prep.uploads[i].path, name: files[i].name, size: files[i].size });
        }
      }
      setBusy('Đang gắn vào buổi họp…');
      const res = await attachMeetingDrop({ meeting, kind, party, doc_type: docType, target_id: target, files: uploaded, links });
      setMsg(res);
      if (res?.ok) { setTarget(''); setLink(''); router.refresh(); }
    } catch (e) {
      setMsg({ error: `Có lỗi khi tải lên: ${(e as Error).message}` });
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {pending.length > 0 && (
          <select aria-label="Gắn cho bên đang chờ" className="input py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Tài liệu mới</option>
            {pending.map((p) => <option key={p.id} value={p.id}>Gắn cho: {p.label}</option>)}
          </select>
        )}
        {!target && <input aria-label="Bên gửi" className="input py-1.5 text-sm" list={partiesListId} value={party} onChange={(e) => setParty(e.target.value)} placeholder="Bên gửi (không bắt buộc)" />}
        <select aria-label="Loại tài liệu" className="input py-1.5 text-sm" value={docType} onChange={(e) => setDocType(e.target.value)}>
          <option value="">Loại tài liệu…</option>
          {types.map((d) => <option key={d} value={d}>{DOC_TYPES[d]}</option>)}
        </select>
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={kind === 'pre' ? 'Thả tài liệu trước họp vào đây' : 'Thả biên bản, tài liệu sau họp vào đây'}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files];
          send(files, files.length ? [] : linksFrom(e.dataTransfer));
        }}
        className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition-colors ${over ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 hover:border-brand-600 hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900'} ${busy ? 'pointer-events-none opacity-70' : ''}`}
      >
        <svg className="mb-1.5 h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        {busy ? <span className="font-medium">{busy}</span> : (
          <>
            <span className="font-medium">{kind === 'pre' ? 'Kéo thả tài liệu trước họp vào đây' : 'Kéo thả biên bản, tài liệu sau họp vào đây'}</span>
            <span className="text-xs muted">hoặc bấm để chọn tệp · PDF, Word, Excel, PowerPoint, ảnh · tối đa 25 MB/tệp · thả cả link Google Drive được</span>
          </>
        )}
        <input ref={input} id={`${uid}-file`} type="file" multiple accept={ACCEPT_FILES} className="hidden" onChange={(e) => send([...(e.target.files ?? [])], [])} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send([], link.trim() ? [{ url: link.trim(), title: '' }] : []); }}>
        <input aria-label="Dán link Google Drive" type="url" className="input py-1.5 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="hoặc dán link Google Drive rồi bấm Gắn" />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-sm" disabled={!link.trim() || !!busy}>Gắn</button>
      </form>
      {msg?.error && <p role="alert" className="text-sm text-orange-700 dark:text-orange-300">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-sm text-green-700 dark:text-green-300">{msg.ok}</p>}
    </div>
  );
}
