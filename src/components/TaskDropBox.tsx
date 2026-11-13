'use client';

// Ô gắn sản phẩm cho đầu việc: kéo thả tệp từ máy (tải thẳng lên Supabase Storage),
// thả/dán link, hoặc gõ thẳng nội dung rồi bấm Enter.
// Mặc định thu gọn thành nút nhỏ "Gắn sản phẩm" cho danh sách đỡ rối; bấm (hoặc kéo tệp vào nút) mới mở ra.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { attachTaskDrop, prepareTaskUpload } from '@/lib/work';

const MAX = 25 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.jpg,.jpeg,.png,.webp,.zip';
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;
// Link Google Drive/Docs thành sản phẩm dạng link; link khác lưu như nội dung.
const URL_RE = /^https:\/\/(drive|docs)\.google\.com\/\S*$/;

export function TaskDropBox({ taskId, groupId }: { taskId: string; groupId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function send(files: File[], raw: string) {
    if (busy) return;
    setMsg(null);
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    // Toàn link Drive thì gắn từng link; có chữ thì lưu cả đoạn thành nội dung.
    const links = parts.length && parts.every((p) => URL_RE.test(p)) ? parts : [];
    const body = links.length ? '' : raw.trim();
    const tooBig = files.find((f) => f.size > MAX);
    if (tooBig) { setMsg({ error: `"${tooBig.name}" nặng ${mb(tooBig.size)}, quá 25 MB. Tệp lớn hãy để trên Google Drive và dán link.` }); return; }
    if (!files.length && !links.length && !body) return;
    try {
      const uploaded: { path: string; name: string; size: number }[] = [];
      if (files.length) {
        setBusy(`Đang chuẩn bị ${files.length} tệp…`);
        const prep = await prepareTaskUpload({ task_id: taskId, files: files.map((f) => ({ name: f.name, size: f.size })) });
        if ('error' in prep) { setMsg({ error: prep.error }); return; }
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
        for (let i = 0; i < files.length; i++) {
          setBusy(`Đang tải lên ${i + 1}/${files.length}: ${files[i].name}`);
          const { error } = await sb.storage.from('task-files').uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, files[i], { contentType: files[i].type || undefined });
          if (error) {
            setMsg({ error: /mime|type/i.test(error.message) ? `"${files[i].name}": loại tệp này chưa được nhận (chỉ PDF, Word, Excel, PowerPoint, ảnh, CSV, ZIP).` : `Không tải được "${files[i].name}": ${error.message}` });
            return;
          }
          uploaded.push({ path: prep.uploads[i].path, name: files[i].name, size: files[i].size });
        }
      }
      setBusy('Đang gắn…');
      const res = await attachTaskDrop({ task_id: taskId, group_id: groupId, files: uploaded, links, body });
      setMsg(res);
      if (res?.ok) { setText(''); setOpen(false); router.refresh(); }
    } catch (e) {
      setMsg({ error: `Có lỗi khi tải lên: ${(e as Error).message}` });
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const dropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files];
    send(files, files.length ? '' : e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
  };
  const status = (
    <>
      {msg?.error && <p role="alert" className="mt-1 text-xs text-orange-700 dark:text-orange-300">{msg.error}</p>}
      {msg?.ok && <p role="status" className="mt-1 text-xs text-green-700 dark:text-green-300">{msg.ok}</p>}
    </>
  );

  if (!open && !busy) {
    return (
      <div className="mt-1">
        <button type="button" onClick={() => setOpen(true)}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={dropFiles}
          title="Gắn tệp, link hoặc nội dung sản phẩm (có thể kéo thả tệp vào đây)"
          className={`rounded-lg px-1.5 py-0.5 text-xs transition-colors ${over ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-600 dark:bg-brand-900/30' : 'muted hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800'}`}>
          📎 Gắn sản phẩm
        </button>
        {status}
      </div>
    );
  }

  return (
    <div className="mt-1.5 max-w-xl">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={dropFiles}
        className={`flex items-start gap-2 rounded-xl border border-dashed px-2.5 py-1.5 transition-colors ${over ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-700'} ${busy ? 'opacity-70' : ''}`}
      >
        <textarea
          aria-label="Gắn sản phẩm: gõ nội dung, dán link hoặc kéo thả tệp"
          rows={1}
          value={busy || text}
          disabled={!!busy}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send([], text); }
            if (e.key === 'Escape' && !text.trim()) setOpen(false);
          }}
          placeholder="Kéo thả tệp vào đây, dán link hoặc gõ nội dung sản phẩm rồi Enter"
          className="min-h-7 flex-1 resize-y bg-transparent py-1 text-sm placeholder:text-slate-400 focus:outline-none field-sizing-content"
        />
        <button type="button" disabled={!!busy} onClick={() => fileInput.current?.click()} title="Chọn tệp từ máy"
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-900/30">📎 Chọn tệp</button>
        {text.trim() && !busy && (
          <button type="button" onClick={() => send([], text)} className="btn-secondary shrink-0 px-2 py-1 text-xs">Gắn</button>
        )}
        {!text.trim() && !busy && (
          <button type="button" onClick={() => setOpen(false)} aria-label="Thu gọn" title="Thu gọn" className="shrink-0 rounded-lg px-1.5 py-1 text-xs muted hover:text-slate-900 dark:hover:text-white">✕</button>
        )}
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => send([...(e.target.files ?? [])], '')} />
      </div>
      {status}
    </div>
  );
}
