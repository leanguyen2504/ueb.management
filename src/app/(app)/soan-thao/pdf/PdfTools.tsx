'use client';

// Chuyển sang PDF (trong Công cụ soạn thảo) ngay trên trình duyệt: Word (.docx) qua hộp thoại In, ảnh và PDF gộp thành một file.
import { useEffect, useRef, useState } from 'react';
import { download } from '../ReviewBox';

const PDF_MIME = 'application/pdf';
const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;
const HEIC = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type);
const A4: [number, number] = [595.28, 841.89]; // pt
const baseName = (n: string) => n.replace(/\.[^.]+$/, '');

type Item = { id: number; file: File; kind: 'image' | 'pdf'; thumb?: string };
let seq = 0;

// Ảnh HEIC/HEIF (iPhone): trình duyệt Chrome, Edge không đọc được, đổi sang JPEG ngay trên máy (thư viện libheif).
async function fromHeic(f: File) {
  const { heicTo } = await import('heic-to/next');
  const blob = await heicTo({ blob: f, type: 'image/jpeg', quality: 0.92 });
  return new File([blob], `${baseName(f.name)}.jpg`, { type: 'image/jpeg' });
}

// Mức nén ảnh, thử lần lượt tới khi PDF vừa giới hạn dung lượng: cạnh dài tối đa (px), chất lượng JPEG,
// có đổi PNG sang JPEG hay không. 3508 px ≈ 300 dpi khổ A4; 1300 px vẫn đọc rõ chữ văn bản chụp.
const LEVELS: [number, number, boolean][] = [[3508, 0.9, false], [2800, 0.85, false], [2400, 0.8, true], [2000, 0.75, true], [1700, 0.7, true], [1500, 0.65, true], [1300, 0.6, true], [1100, 0.55, true]];
const MB = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

// Ảnh → bytes để nhúng vào PDF: xoay theo EXIF, thu nhỏ theo mức nén, nền trắng.
async function prepareImage(file: File, [maxPx, q, jpegOnly]: [number, number, boolean] = LEVELS[0]) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const png = !jpegOnly && /\.(png|gif|bmp)$/i.test(file.name); // ảnh chụp màn hình, sơ đồ: giữ nét
  const blob = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error('canvas'))), png ? 'image/png' : 'image/jpeg', q));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), png, w, h };
}

function MergeBox() {
  const [items, setItems] = useState<Item[]>([]);
  const [size, setSize] = useState<'a4' | 'fit'>('a4');
  const [margin, setMargin] = useState(true);
  const [limitOn, setLimitOn] = useState(true);
  const [limit, setLimit] = useState('10.9');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const [converting, setConverting] = useState(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb)), []);

  async function add(files: FileList | File[]) {
    setErr('');
    const list = Array.from(files);
    const bad: string[] = [];
    const broken: string[] = [];
    const next: Item[] = [];
    if (list.some(HEIC)) setConverting(true);
    for (let f of list) {
      if (IMG_EXT.test(f.name) || f.type.startsWith('image/')) {
        if (HEIC(f)) {
          try {
            f = await fromHeic(f);
          } catch {
            broken.push(f.name);
            continue;
          }
        }
        next.push({ id: ++seq, file: f, kind: 'image', thumb: URL.createObjectURL(f) });
      } else if (/\.pdf$/i.test(f.name) || f.type === PDF_MIME) next.push({ id: ++seq, file: f, kind: 'pdf' });
      else bad.push(f.name);
    }
    setConverting(false);
    setItems((cur) => [...cur, ...next]);
    const msg = [
      bad.length ? `Bỏ qua ${bad.join(', ')}: chỉ nhận ảnh và PDF ở đây (file Word dùng ô bên trên).` : '',
      broken.length ? `Không đọc được ảnh ${broken.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    if (msg) setErr(msg);
  }
  const move = (i: number, d: number) => setItems((cur) => {
    const j = i + d;
    if (j < 0 || j >= cur.length) return cur;
    const a = [...cur];
    [a[i], a[j]] = [a[j], a[i]];
    return a;
  });
  const remove = (id: number) => setItems((cur) => {
    const it = cur.find((x) => x.id === id);
    if (it?.thumb) URL.revokeObjectURL(it.thumb);
    return cur.filter((x) => x.id !== id);
  });

  // Dựng PDF ở một mức nén ảnh.
  async function build(level: [number, number, boolean]) {
    const { PDFDocument } = await import('pdf-lib');
    const out = await PDFDocument.create();
    for (const it of items) {
      if (it.kind === 'pdf') {
        let src;
        try {
          src = await PDFDocument.load(new Uint8Array(await it.file.arrayBuffer()));
        } catch {
          throw new Error(`Không đọc được "${it.file.name}" (file có mật khẩu hoặc bị hỏng).`);
        }
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        continue;
      }
      const im = await prepareImage(it.file, level).catch(() => { throw new Error(`Không đọc được ảnh "${it.file.name}".`); });
      const img = im.png ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
      if (size === 'fit') {
        const k = Math.min(1, 1190 / Math.max(im.w, im.h)); // tối đa khổ A3
        const pw = Math.max(1, im.w * k), ph = Math.max(1, im.h * k);
        out.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph });
      } else {
        const [pw, ph] = im.w > im.h ? [A4[1], A4[0]] : A4;
        const m = margin ? 28.35 : 0; // 10 mm
        const k = Math.min((pw - 2 * m) / im.w, (ph - 2 * m) / im.h);
        const w = im.w * k, h = im.h * k;
        out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
    }
    return out.save();
  }

  async function make() {
    if (!items.length) return;
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      const max = limitOn ? (Number(limit.replace(',', '.')) || Infinity) * 1e6 : Infinity;
      const hasImg = items.some((i) => i.kind === 'image');
      let bytes = await build(LEVELS[0]);
      for (let i = 1; bytes.length > max && hasImg && i < LEVELS.length; i++) {
        setInfo(`Bản đầu ${MB(bytes.length)}, đang nén ảnh cho vừa ${MB(max)}…`);
        bytes = await build(LEVELS[i]);
      }
      const name = items.length === 1 ? baseName(items[0].file.name) : `Gop_${items.length}_file`;
      download(bytes, `${name}.pdf`, PDF_MIME);
      setInfo(bytes.length > max
        ? `File PDF ${MB(bytes.length)}, vẫn lớn hơn ${MB(max)} dù đã nén ảnh hết mức (phần lớn dung lượng nằm ở các file PDF gộp vào). Hãy tách thành nhiều file.`
        : `Đã tải file PDF ${MB(bytes.length)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không tạo được PDF.');
      setInfo('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Chuyển ảnh sang PDF, gộp PDF</h2>
        <p className="mt-1 text-sm muted">Chọn nhiều ảnh (JPG, PNG, HEIC của iPhone, WebP…) và/hoặc file PDF, sắp xếp thứ tự rồi gộp thành một file PDF. Mỗi ảnh là một trang.</p>
      </div>
      <label
        className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center text-sm ${drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-600/10' : 'border-gray-300 dark:border-gray-600'}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
      >
        <input type="file" multiple accept="image/*,.heic,.heif,.pdf,application/pdf" className="sr-only" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
        <b>Chọn file</b> hoặc kéo thả ảnh, PDF vào đây
      </label>
      {converting && <p className="text-sm muted">Đang đọc ảnh HEIC…</p>}

      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 text-sm dark:border-gray-700">
              <span className="w-6 text-center muted">{i + 1}</span>
              {it.thumb
                ? <img src={it.thumb} alt="" className="h-12 w-12 rounded object-cover" />
                : <span className="flex h-12 w-12 items-center justify-center rounded bg-red-50 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">PDF</span>}
              <span className="min-w-0 flex-1 truncate">{it.file.name}</span>
              <span className="hidden text-xs muted sm:inline">{it.file.size < 1048576 ? `${Math.max(1, Math.round(it.file.size / 1024))} KB` : `${(it.file.size / 1048576).toFixed(1)} MB`}</span>
              <button type="button" className="btn-secondary px-2 py-1 text-xs" aria-label="Lên" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="btn-secondary px-2 py-1 text-xs" aria-label="Xuống" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className="link text-xs" aria-label="Bỏ file" onClick={() => remove(it.id)}>✕</button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="muted">Trang cho ảnh:</span>
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={size === 'a4'} onChange={() => setSize('a4')} /> Khổ A4 (tự xoay ngang/dọc)</label>
          <label className="inline-flex items-center gap-1.5"><input type="radio" checked={size === 'fit'} onChange={() => setSize('fit')} /> Vừa khít ảnh</label>
          {size === 'a4' && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={margin} onChange={(e) => setMargin(e.target.checked)} /> Chừa lề 1 cm</label>}
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={limitOn} onChange={(e) => setLimitOn(e.target.checked)} /> Không quá</label>
          <span className="-ml-2.5 inline-flex items-center gap-1"><input className="input w-20 py-1" inputMode="decimal" value={limit} disabled={!limitOn} onChange={(e) => setLimit(e.target.value)} aria-label="Dung lượng tối đa (MB)" /> MB</span>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => { items.forEach((x) => x.thumb && URL.revokeObjectURL(x.thumb)); setItems([]); }}>Xóa hết</button>}
          <button type="button" className="btn" disabled={busy || converting || !items.length} onClick={make}>{busy ? 'Đang tạo…' : 'Tải file PDF'}</button>
        </div>
      </div>
      {info && <p className="text-sm muted">{info}</p>}
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </section>
  );
}

// Word → PDF: dựng lại trang Word trên trình duyệt rồi in ra PDF (chọn "Lưu dưới dạng PDF").
function WordBox() {
  const body = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState({ size: '210mm 297mm', margin: '20mm 15mm 20mm 30mm' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function open(f: File) {
    setErr('');
    if (/\.doc$/i.test(f.name)) return setErr('File .doc (Word 97-2003) chưa đọc được: mở bằng Word, chọn Lưu thành .docx rồi chọn lại.');
    if (!/\.docx$/i.test(f.name)) return setErr('Chọn file Word .docx.');
    setBusy(true);
    try {
      const { renderAsync } = await import('docx-preview');
      body.current!.innerHTML = '';
      styles.current!.innerHTML = '';
      await renderAsync(f, body.current!, styles.current!, {
        inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderHeaders: false, renderFooters: false, useBase64URL: true, experimental: true,
      });
      const sec = body.current!.querySelector<HTMLElement>('section.docx');
      if (sec) {
        const st = sec.style;
        const h = st.minHeight || st.height;
        if (st.width && h) setPage({ size: `${st.width} ${h}`, margin: `${st.paddingTop || '20mm'} ${st.paddingRight || '15mm'} ${st.paddingBottom || '20mm'} ${st.paddingLeft || '30mm'}` });
      }
      setFile(f);
    } catch {
      setFile(null);
      setErr('Không đọc được file Word này.');
    } finally {
      setBusy(false);
    }
  }

  function print() {
    if (!file || !body.current) return;
    const title = baseName(file.name);
    const css = `@page{size:${page.size};margin:${page.margin}}
html,body{margin:0;padding:0;background:#fff}
.docx-wrapper{background:none!important;padding:0!important;display:block!important}
.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;padding:0!important;width:auto!important;min-height:0!important;height:auto!important;break-after:page}
.docx-wrapper>section.docx:last-child{break-after:auto}`;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '')}</title>${styles.current!.innerHTML}<style>${css}</style></head><body>${body.current.innerHTML}</body></html>`);
    doc.close();
    const old = document.title;
    document.title = title; // tên file PDF gợi ý
    setTimeout(() => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      document.title = old;
      setTimeout(() => frame.remove(), 1000);
    }, 300);
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Chuyển Word sang PDF</h2>
          <p className="mt-1 max-w-3xl text-sm muted">
            Chọn file .docx, xem trước rồi bấm <b>Lưu thành PDF</b>; ở hộp thoại In chọn máy in <b>Lưu dưới dạng PDF</b> (Save as PDF).
            Bản xem trước không có đầu trang, chân trang (số trang); văn bản cần giữ đúng từng chi tiết thì mở bằng Word, chọn Lưu thành PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="btn-secondary cursor-pointer px-3 py-1.5 text-sm">
            <input type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ''; }} />
            {file ? 'Chọn file khác' : 'Chọn file Word'}
          </label>
          <button type="button" className="btn" disabled={!file || busy} onClick={print}>Lưu thành PDF</button>
        </div>
      </div>
      {busy && <p className="text-sm muted">Đang đọc file…</p>}
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      {file && <p className="text-sm"><b>{file.name}</b></p>}
      <div ref={styles} />
      <div ref={body} className={`max-h-[70vh] overflow-auto rounded-lg ${file ? 'border border-gray-200 dark:border-gray-700' : ''}`} />
    </section>
  );
}

export function PdfTools() {
  return (
    <div className="space-y-5">
      <WordBox />
      <MergeBox />
    </div>
  );
}
