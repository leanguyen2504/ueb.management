'use client';

// Kéo thả file Word để rà soát thể thức. File được đọc và chỉnh ngay trên trình duyệt,
// không tải lên máy chủ; kết quả là bảng lỗi và bản .docx đã chỉnh để tải về.
import { useRef, useState } from 'react';
import type { ReviewResult } from '@/lib/docx/review';
import { LEVEL_LABEL, type Level } from '@/lib/docx/text-rules';
import { DOCX_MIME } from '@/lib/docx/zip';

const LEVEL_TONE: Record<Level, string> = {
  'nghiem-trong': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  'trung-binh': 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500',
  nho: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  'goi-y': 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

const MAX_BYTES = 30 * 1024 * 1024;

export function download(bytes: Uint8Array, name: string, mime = DOCX_MIME) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ReviewBox() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [res, setRes] = useState<{ name: string; result: ReviewResult } | null>(null);

  async function handle(files: FileList | File[] | null) {
    const file = files ? Array.from(files)[0] : undefined;
    if (!file || busy) return;
    setError('');
    setCopied(false);
    if (/\.doc$/i.test(file.name)) { setError('File .doc (Word 97-2003) chưa đọc được. Mở bằng Word, chọn Lưu thành (Save As) dạng .docx rồi thả lại.'); return; }
    if (!/\.docx$/i.test(file.name)) { setError('Chỉ nhận file Word .docx.'); return; }
    if (file.size > MAX_BYTES) { setError('File lớn hơn 30 MB. Hãy bớt ảnh trong file rồi thử lại.'); return; }
    setBusy(true);
    try {
      const { reviewDocx } = await import('@/lib/docx/review');
      const result = await reviewDocx(new Uint8Array(await file.arrayBuffer()));
      setRes({ name: file.name, result });
    } catch (e) {
      setRes(null);
      setError((e as Error).message || 'Không rà soát được file này.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const outName = (name: string) => name.replace(/\.docx$/i, '') + ' (dung the thuc).docx';

  async function copyTable() {
    if (!res) return;
    const head = ['#', 'Vị trí', 'Hiện tại', 'Sửa thành', 'Lý do / căn cứ', 'Mức độ', 'Trong bản đã chỉnh'];
    const rows = res.result.issues.map((i, n) => [n + 1, i.where, i.current, i.fix, i.reason, LEVEL_LABEL[i.level], i.fixed ? 'Đã sửa' : 'Cần sửa tay'].join('\t'));
    await navigator.clipboard.writeText([res.result.verdict, 'Căn cứ: Nghị định 30/2020/NĐ-CP; đề nghị kiểm tra lại hiệu lực.', '', head.join('\t'), ...rows].join('\n'));
    setCopied(true);
  }

  const r = res?.result;
  const manual = r?.issues.filter((i) => !i.fixed).length ?? 0;

  return (
    <div className="space-y-5">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        className={`card flex flex-col items-center gap-3 border-2 border-dashed py-10 text-center transition-colors ${over ? 'border-brand-600 bg-brand-50 dark:border-brand-300 dark:bg-brand-900/40' : 'border-slate-300 dark:border-slate-700'}`}
      >
        <svg className="h-10 w-10 text-brand-600 dark:text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" /><path d="M14 3.5v5h5" /><path d="m8.5 13 1.2 4 1.3-3 1.3 3 1.2-4" />
        </svg>
        <div>
          <p className="font-semibold">{busy ? 'Đang rà soát…' : 'Kéo thả file Word (.docx) vào đây'}</p>
          <p className="mt-1 text-sm muted">Web kiểm tra thể thức theo Nghị định 30/2020/NĐ-CP, liệt kê lỗi và tạo bản đã chỉnh để tải về.</p>
        </div>
        <input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => handle(e.target.files)} />
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>Chọn file</button>
        <p className="text-xs muted">File chỉ được xử lý trên trình duyệt của bạn, không gửi lên máy chủ.</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">{error}</p>}

      {r && res && (
        <section className="card space-y-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs muted">{res.name} · hiểu là: {r.docType}</p>
              <h2 className="mt-1 text-lg font-semibold">{r.verdict}</h2>
              <p className="mt-1 text-sm muted">Căn cứ theo Nghị định 30/2020/NĐ-CP (Phụ lục I, III, VI); đề nghị kiểm tra lại hiệu lực.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => download(r.output, outName(res.name))}>Tải bản đã chỉnh (.docx)</button>
              {r.issues.length > 0 && <button type="button" className="btn-secondary" onClick={copyTable}>{copied ? 'Đã sao chép' : 'Sao chép bảng lỗi'}</button>}
            </div>
          </div>
          {r.issues.length > 0 && (
            <p className="text-sm">
              Bản tải về đã tự sửa <b>{r.fixedCount}</b> lỗi về định dạng, dấu câu, dấu cách.
              {manual > 0 && <> Còn <b>{manual}</b> lỗi cần sửa tay (đánh dấu &quot;Cần sửa tay&quot;) vì phụ thuộc nội dung.</>}
            </p>
          )}
          {r.issues.length > 0 && (
            <div className="-mx-4 overflow-x-auto md:-mx-5">
              <table className="table min-w-[860px]">
                <thead>
                  <tr><th>#</th><th>Vị trí</th><th>Hiện tại</th><th>Sửa thành</th><th>Lý do / căn cứ</th><th>Mức độ</th><th>Bản đã chỉnh</th></tr>
                </thead>
                <tbody>
                  {r.issues.map((i, n) => (
                    <tr key={n}>
                      <td className="muted">{n + 1}</td>
                      <td className="whitespace-nowrap font-medium">{i.where}</td>
                      <td className="max-w-64 break-words">{i.current}</td>
                      <td className="max-w-64 break-words">{i.fix}</td>
                      <td className="max-w-72 text-xs muted">{i.reason}</td>
                      <td><span className={`chip ${LEVEL_TONE[i.level]}`}>{LEVEL_LABEL[i.level]}</span></td>
                      <td className="whitespace-nowrap text-xs">{i.fixed ? <span className="text-green-700 dark:text-green-400">Đã sửa</span> : <span className="font-semibold text-orange-700 dark:text-orange-300">Cần sửa tay</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">Chưa kiểm tra được, cần tự xem</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm muted">
              {r.notChecked.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </div>
        </section>
      )}

      {!r && (
        <section className="grid gap-3 md:grid-cols-3">
          <Info title="Tự sửa trong bản tải về" items={['Khổ A4, lề trên/dưới 20-25 mm, trái 30-35 mm, phải 15-20 mm', 'Phông Times New Roman, chữ đen', 'Cỡ chữ, đậm, nghiêng, canh lề từng thành phần', 'Số ký hiệu, ngày tháng, nơi nhận, số trang', 'Dấu cách, dấu câu, "hoà" → "hòa", lỗi chính tả hay gặp']} />
          <Info title="Báo để sửa tay" items={['Thiếu Quốc hiệu, số ký hiệu, nơi nhận, chữ ký', 'Ký hiệu không khớp tên loại', 'Trích yếu viết hoa toàn bộ', 'Đánh số mục, số điều bị nhảy', 'Bố cục thiếu phần theo loại văn bản']} />
          <Info title="Lưu ý" items={['Chỉ rà soát hình thức, thể thức và chữ; không đánh giá nội dung', 'Văn bản không có Quốc hiệu, số ký hiệu được coi là văn bản nội bộ: chỉ soát chữ và định dạng nội dung', 'Mở bản tải về bằng Word để xem lại trước khi trình ký']} />
        </section>
      )}
    </div>
  );
}

function Info({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm muted">{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}
