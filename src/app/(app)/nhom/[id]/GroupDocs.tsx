'use client';

// Mục Tài liệu của không gian: ô đặt link Drive chung và ô kéo thả tệp (tải thẳng lên
// Supabase Storage, bucket group-files), cùng cách làm với ô sản phẩm của đầu việc.
import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { attachGroupDocs, prepareGroupUpload, setGroupDrive } from '@/lib/group-docs';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';

const MAX = 50 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.zip,.rar';
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(n < 1024 * 1024 ? 2 : 1)} MB`;
const URL_RE = /^https:\/\/\S+$/i;

export function DriveLinkForm({ groupId, current }: { groupId: string; current: string | null }) {
  const [state, action] = useActionState(setGroupDrive, null);
  const [editing, setEditing] = useState(!current);
  if (current && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setEditing(true)} className="btn-secondary px-3 py-1 text-xs">Đổi link</button>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="group_id" value={groupId} />
      <div className="flex flex-wrap gap-2">
        <input name="drive_url" type="url" defaultValue={current ?? ''} maxLength={1000} placeholder="Dán link thư mục Google Drive chung, ví dụ https://drive.google.com/drive/folders/…" className="input min-w-0 flex-1" aria-label="Link Drive chung" />
        <SubmitButton>Lưu link</SubmitButton>
        {current && <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Thôi</button>}
      </div>
      {current && <p className="text-xs muted">Để trống rồi Lưu để gỡ link.</p>}
      <FormMessage state={state} />
    </form>
  );
}

export function GroupDropBox({ groupId }: { groupId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);

  async function send(files: File[], raw: string) {
    if (busy) return;
    setMsg(null);
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    const links = parts.filter((p) => URL_RE.test(p));
    if (parts.length && links.length !== parts.length) { setMsg({ error: 'Chỉ nhận link bắt đầu bằng https://. Muốn tải tệp thì kéo thả tệp vào ô hoặc bấm "Chọn tệp".' }); return; }
    const tooBig = files.find((f) => f.size > MAX);
    if (tooBig) { setMsg({ error: `"${tooBig.name}" nặng ${mb(tooBig.size)}, quá 50 MB. Tệp lớn hãy để trong Drive chung.` }); return; }
    if (!files.length && !links.length) return;
    try {
      const uploaded: { path: string; name: string; size: number }[] = [];
      if (files.length) {
        setBusy(`Đang chuẩn bị ${files.length} tệp…`);
        const prep = await prepareGroupUpload({ group_id: groupId, files: files.map((f) => ({ name: f.name, size: f.size })) });
        if ('error' in prep) { setMsg({ error: prep.error }); return; }
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
        for (let i = 0; i < files.length; i++) {
          setBusy(`Đang tải lên ${i + 1}/${files.length}: ${files[i].name}`);
          const { error } = await sb.storage.from('group-files').uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, files[i], { contentType: files[i].type || undefined });
          if (error) {
            setMsg({ error: /mime|type/i.test(error.message) ? `"${files[i].name}": loại tệp này chưa được nhận (chỉ PDF, Word, Excel, PowerPoint, ảnh, CSV, ZIP, RAR).` : `Không tải được "${files[i].name}": ${error.message}` });
            return;
          }
          uploaded.push({ path: prep.uploads[i].path, name: files[i].name, size: files[i].size });
        }
      }
      setBusy('Đang lưu…');
      const res = await attachGroupDocs({ group_id: groupId, files: uploaded, links });
      setMsg(res);
      if (res?.ok) { setText(''); router.refresh(); }
    } catch (e) {
      setMsg({ error: `Có lỗi khi tải lên: ${(e as Error).message}` });
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const files = [...e.dataTransfer.files];
          send(files, files.length ? '' : e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
        }}
        className={`rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${over ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 dark:border-slate-700'} ${busy ? 'opacity-70' : ''}`}
      >
        <p className="text-sm font-medium">{busy || 'Kéo thả tệp vào đây để tải lên'}</p>
        <p className="mt-1 text-xs muted">PDF, Word, Excel, PowerPoint, ảnh, CSV, ZIP · tối đa 50 MB mỗi tệp, 20 tệp mỗi lần</p>
        <div className="mx-auto mt-3 flex max-w-xl flex-wrap items-center justify-center gap-2">
          <button type="button" disabled={!!busy} onClick={() => fileInput.current?.click()} className="btn-secondary px-3 py-1.5 text-sm">📎 Chọn tệp</button>
          <span className="text-xs muted">hoặc</span>
          <input
            value={text}
            disabled={!!busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send([], text); } }}
            placeholder="dán link tài liệu rồi Enter"
            aria-label="Dán link tài liệu"
            className="input min-w-0 flex-1 py-1.5 text-sm"
          />
          {text.trim() && !busy && <button type="button" onClick={() => send([], text)} className="btn px-3 py-1.5 text-sm">Thêm</button>}
        </div>
        <input ref={fileInput} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => send([...(e.target.files ?? [])], '')} />
      </div>
      {msg?.error && <p role="alert" className="mt-2 text-sm text-orange-700 dark:text-orange-300">{msg.error}</p>}
      {msg?.ok && <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-300">{msg.ok}</p>}
    </div>
  );
}
