'use client';

// Sửa liên kết trang cá nhân và file hồ sơ (CV…) trên trang Hồ sơ cá nhân.
// File: kéo thả vào ô (tải thẳng lên Supabase Storage) hoặc thả/dán link Google Drive.
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { FormMessage, type FormState } from '@/components/FormMessage';
import { PROFILE_FILE_ACCEPT, PROFILE_FILE_MAX, fileHref, fileSize, hostOf, linkTitle, type ProfileLink } from '@/lib/profile-links';
import { addProfileLink, attachProfileFiles, moveProfileLink, prepareProfileUpload, removeProfileLink } from './actions';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function linksFrom(dt: DataTransfer): string[] {
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
  return [...new Set(raw.split(/\s+/).filter((u) => /^https:\/\/\S+$/i.test(u)))].slice(0, 10);
}

function ItemRow({ item, first, last }: { item: ProfileLink; first: boolean; last: boolean }) {
  const [pending, start] = useTransition();
  const href = item.file_path ? fileHref(item.file_path) : item.url!;
  const sub = item.file_path ? fileSize(item.file_size) : hostOf(item.url!);
  return (
    <li className={`flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm dark:border-slate-700 ${pending ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <a href={href} target="_blank" rel={item.file_path ? 'noopener' : 'noopener noreferrer'} className="block truncate font-medium hover:underline">{linkTitle(item)}</a>
        {sub && <span className="block truncate text-xs muted">{sub}</span>}
      </div>
      <button type="button" className="rounded px-1.5 py-0.5 text-xs muted hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={first || pending} aria-label="Đưa lên" title="Đưa lên" onClick={() => start(() => moveProfileLink(item.id, -1))}>↑</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-xs muted hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={last || pending} aria-label="Đưa xuống" title="Đưa xuống" onClick={() => start(() => moveProfileLink(item.id, 1))}>↓</button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 text-xs text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950"
        disabled={pending}
        onClick={() => { if (confirm(`Gỡ "${linkTitle(item)}" khỏi hồ sơ?`)) start(() => removeProfileLink(item.id)); }}
      >Gỡ</button>
    </li>
  );
}

function ItemList({ items, empty }: { items: ProfileLink[]; empty: string }) {
  if (!items.length) return <p className="text-sm muted">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((l, i) => <ItemRow key={l.id} item={l} first={i === 0} last={i === items.length - 1} />)}
    </ul>
  );
}

function PageLinkForm() {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [state, setState] = useState<FormState>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('kind', 'link');
        fd.set('url', url);
        fd.set('label', label);
        start(async () => {
          const res = await addProfileLink(null, fd);
          setState(res);
          if (res?.ok) { setUrl(''); setLabel(''); }
        });
      }}
    >
      <input value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" required maxLength={1000} className="input" aria-label="Link trang cá nhân" placeholder="Dán link: Facebook, LinkedIn, Google Scholar, website…" />
      <div className="flex gap-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className="input" aria-label="Tên hiển thị" placeholder="Tên hiển thị (không bắt buộc)" />
        <button type="submit" className="btn-secondary shrink-0" disabled={pending || !url.trim()}>{pending ? 'Đang thêm…' : 'Thêm'}</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function DocDropBox() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [label, setLabel] = useState('');
  const [link, setLink] = useState('');

  async function sendLinks(urls: string[]) {
    for (const url of urls) {
      const fd = new FormData();
      fd.set('kind', 'doc');
      fd.set('url', url);
      fd.set('label', urls.length === 1 ? label : '');
      const res = await addProfileLink(null, fd);
      if (res?.error) return res;
    }
    return { ok: urls.length === 1 ? 'Đã gắn link hồ sơ.' : `Đã gắn ${urls.length} link hồ sơ.` };
  }

  async function send(files: File[], urls: string[]) {
    if (busy) return;
    setMsg(null);
    const tooBig = files.find((f) => f.size > PROFILE_FILE_MAX);
    if (tooBig) { setMsg({ error: `"${tooBig.name}" nặng ${mb(tooBig.size)}, quá 10 MB. Tệp lớn hãy để trên Google Drive và dán link.` }); return; }
    if (!files.length && !urls.length) { setMsg({ error: 'Không đọc được tệp hoặc link. Thử chọn tệp bằng nút bấm.' }); return; }
    try {
      let res: { ok?: string; error?: string } | null;
      if (files.length) {
        setBusy(`Đang chuẩn bị ${files.length} tệp…`);
        const prep = await prepareProfileUpload(files.map((f) => ({ name: f.name, size: f.size })));
        if ('error' in prep) { setMsg({ error: prep.error }); return; }
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
        const uploaded: { path: string; name: string; size: number }[] = [];
        for (let i = 0; i < files.length; i++) {
          setBusy(`Đang tải lên ${i + 1}/${files.length}: ${files[i].name}`);
          const { error } = await sb.storage.from('profile-files').uploadToSignedUrl(prep.uploads[i].path, prep.uploads[i].token, files[i], { contentType: files[i].type || undefined });
          if (error) {
            setMsg({ error: /mime|type/i.test(error.message) ? `"${files[i].name}": loại tệp này chưa được nhận (chỉ PDF, Word, PowerPoint, ảnh).` : `Không tải được "${files[i].name}": ${error.message}` });
            return;
          }
          uploaded.push({ path: prep.uploads[i].path, name: files[i].name, size: files[i].size });
        }
        setBusy('Đang gắn vào hồ sơ…');
        res = await attachProfileFiles({ files: uploaded, label });
      } else {
        setBusy('Đang gắn link…');
        res = await sendLinks(urls);
      }
      setMsg(res);
      if (res?.ok) { setLabel(''); setLink(''); router.refresh(); }
    } catch (e) {
      setMsg({ error: `Có lỗi khi tải lên: ${(e as Error).message}` });
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input aria-label="Tên file hồ sơ" className="input py-1.5 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Tên hiển thị, ví dụ: CV tiếng Anh (không bắt buộc)" />
      <div
        role="button"
        tabIndex={0}
        aria-label="Thả file hồ sơ vào đây"
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
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-4 text-center text-sm transition-colors ${over ? 'border-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-300 hover:border-brand-600 hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900'} ${busy ? 'pointer-events-none opacity-70' : ''}`}
      >
        <svg className="mb-1.5 h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        {busy ? <span className="font-medium">{busy}</span> : (
          <>
            <span className="font-medium">Kéo thả CV, lý lịch khoa học vào đây</span>
            <span className="text-xs muted">hoặc bấm để chọn tệp · PDF, Word, PowerPoint, ảnh · tối đa 10 MB/tệp · thả cả link Google Drive được</span>
          </>
        )}
        <input ref={input} type="file" multiple accept={PROFILE_FILE_ACCEPT} className="hidden" onChange={(e) => send([...(e.target.files ?? [])], [])} />
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) send([], [link.trim()]); }}>
        <input aria-label="Dán link Google Drive" type="text" inputMode="url" className="input py-1.5 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="hoặc dán link Google Drive rồi bấm Gắn" />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-sm" disabled={!link.trim() || !!busy}>Gắn</button>
      </form>
      {msg?.error && <p role="alert" className="text-sm text-orange-700 dark:text-orange-300">{msg.error}</p>}
      {msg?.ok && <p role="status" className="text-sm text-green-700 dark:text-green-300">{msg.ok}</p>}
    </div>
  );
}

export function ProfileLinksForm({ links }: { links: ProfileLink[] }) {
  const pages = links.filter((l) => l.kind === 'link');
  const docs = links.filter((l) => l.kind === 'doc');
  return (
    <section className="card space-y-5">
      <div className="space-y-3">
        <h2 className="font-semibold">Trang cá nhân</h2>
        <ItemList items={pages} empty="Chưa có liên kết nào." />
        <PageLinkForm />
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h2 className="font-semibold">File hồ sơ (CV…)</h2>
        <ItemList items={docs} empty="Chưa có file hồ sơ nào." />
        <DocDropBox />
      </div>
      <p className="text-xs muted">Chỉ đồng nghiệp đã đăng nhập xem và mở được. Link Google Drive cần được chia sẻ cho người xem thì họ mới mở được.</p>
    </section>
  );
}
