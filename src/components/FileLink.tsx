'use client';

// Link tới tài liệu: bấm là mở khung xem ngay trong web (PDF, ảnh, video, Word, Excel,
// PowerPoint, link Google Drive/Docs), không phải tải về hay chuyển sang tab khác.
// Ctrl/⌘ + bấm hoặc bấm chuột giữa vẫn mở tab mới như link thường; loại tệp không xem
// trước được thì link chạy như cũ.
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { previewTarget, type PreviewTarget } from '@/lib/file-preview';

export function FileLink({ href, label, className, title, children }: {
  href: string;
  label?: string | null; // tên hiển thị của tệp (đặt cho tiêu đề khung xem)
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<PreviewTarget | null>(null);
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = previewTarget(href, label ?? undefined);
    if (!t) return;
    e.preventDefault();
    setOpen(t);
  }
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title} onClick={onClick}>{children}</a>
      {open && <FileViewer target={open} onClose={() => setOpen(null)} />}
    </>
  );
}

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; msg: string }
  | { state: 'frame'; src: string; note?: string }
  | { state: 'image' | 'video' | 'audio'; src: string }
  | { state: 'docx' }
  | { state: 'none' };

const MIME: Record<string, string> = { pdf: 'application/pdf', text: 'text/plain;charset=utf-8' };

export function FileViewer({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const docx = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Loaded>(target.source === 'google' ? { state: 'frame', src: target.embed } : { state: 'loading' });
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const d = dlg.current!;
    if (!d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (target.source !== 'stored') return;
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        const r = await fetch(`${target.href}&xem=1`, { cache: 'no-store' });
        const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error || 'Không mở được tệp.');
        const url = j.url;
        const k = target.kind;
        if (k === 'image' || k === 'video' || k === 'audio') return !cancelled && setView({ state: k, src: url });
        if (k === 'office') {
          return !cancelled && setView({ state: 'frame', src: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`, note: 'Hiển thị qua trình xem Microsoft Office trực tuyến.' });
        }
        if (k === 'pdf' && typeof navigator !== 'undefined' && navigator.pdfViewerEnabled === false) {
          // Trình duyệt không tự hiện PDF trong khung (Chrome trên Android…): nhờ trình xem của Google.
          return !cancelled && setView({ state: 'frame', src: `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(url)}` });
        }
        if (k === 'none') return !cancelled && setView({ state: 'none' });
        const res = await fetch(url);
        if (!res.ok) throw new Error('Không tải được nội dung tệp.');
        const blob = await res.blob();
        if (cancelled) return;
        if (k === 'docx') {
          setDocxBlob(blob);
          return setView({ state: 'docx' });
        }
        objectUrl = URL.createObjectURL(new Blob([blob], { type: MIME[k] ?? blob.type }));
        setView({ state: 'frame', src: objectUrl });
      } catch (e) {
        if (!cancelled) setView({ state: 'error', msg: e instanceof Error ? e.message : 'Không mở được tệp.' });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target]);

  useEffect(() => {
    if (!docxBlob || !docx.current) return;
    let cancelled = false;
    const box = docx.current;
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        box.innerHTML = '';
        await renderAsync(docxBlob, box, box, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, useBase64URL: true, experimental: true });
        // Màn hình hẹp (điện thoại): thu nhỏ trang Word cho vừa bề ngang thay vì bị cắt hai bên.
        const page = box.querySelector<HTMLElement>('section.docx');
        const wrap = box.querySelector<HTMLElement>('.docx-wrapper');
        if (page && wrap) {
          const fit = (box.clientWidth - 16) / page.offsetWidth;
          if (fit < 1) {
            wrap.style.zoom = String(fit);
            wrap.style.padding = '8px';
          }
        }
      } catch {
        if (!cancelled) setView({ state: 'error', msg: 'Không đọc được file Word này, hãy tải về để mở.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docxBlob]);

  const download = target.source === 'stored' ? `${target.href}&tai=1` : null;
  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800';

  return (
    <dialog
      ref={dlg}
      onClose={onClose}
      onClick={(e) => e.target === dlg.current && dlg.current?.close()}
      aria-label={target.name}
      className="fixed inset-0 m-auto hidden open:flex h-[94dvh] max-h-none w-[min(1200px,97vw)] max-w-none flex-col overflow-hidden rounded-2xl bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
        <span className="min-w-0 flex-1 truncate font-medium" title={target.name}>{target.name}</span>
        {download && <a href={download} className={btn}>Tải về</a>}
        <a href={target.href} target="_blank" rel="noopener noreferrer" className={`${btn} hidden sm:inline-block`}>Mở tab mới ↗</a>
        <button type="button" onClick={() => dlg.current?.close()} className={`${btn} text-lg leading-none`} aria-label="Đóng" title="Đóng (Esc)">✕</button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-auto bg-slate-100 dark:bg-slate-950">
        {view.state === 'loading' && <p className="p-6 text-center text-sm muted">Đang mở tài liệu…</p>}
        {view.state === 'error' && <Notice msg={view.msg} download={download} href={target.href} />}
        {view.state === 'none' && <Notice msg="Loại tệp này chưa xem trước được trong web." download={download} href={target.href} />}
        {view.state === 'frame' && (
          <div className="flex h-full flex-col">
            <iframe src={view.src} title={target.name} className="min-h-0 w-full flex-1 border-0 bg-white" allow="autoplay; fullscreen" />
            {view.note && <p className="px-3 py-1 text-xs muted">{view.note}</p>}
          </div>
        )}
        {view.state === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={view.src} alt={target.name} className="mx-auto block h-full max-h-full w-auto max-w-full object-contain p-2" />
        )}
        {view.state === 'video' && <video src={view.src} controls autoPlay className="mx-auto block h-full max-w-full" />}
        {view.state === 'audio' && <div className="grid h-full place-items-center p-6"><audio src={view.src} controls autoPlay className="w-full max-w-xl" /></div>}
        {view.state === 'docx' && <div ref={docx} className="min-h-full" />}
      </div>
    </dialog>
  );
}

function Notice({ msg, download, href }: { msg: string; download: string | null; href: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm">{msg}</p>
        <div className="flex justify-center gap-2">
          {download && <a href={download} className="btn px-3 py-1.5 text-sm">Tải về</a>}
          <a href={href} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 py-1.5 text-sm">Mở tab mới ↗</a>
        </div>
      </div>
    </div>
  );
}
