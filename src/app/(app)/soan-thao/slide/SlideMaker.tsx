'use client';

// Tạo slide bài giảng phong cách UEB ngay trên trình duyệt: nhập dàn ý, xem trước, tải file .pptx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { H, PPTX_MIME, SAMPLE_CONFERENCE, SAMPLE_OUTLINE, SNIPPETS, W, layoutDeck, parseOutline, type DeckInfo, type Para, type Shape, type SlideOut } from '@/lib/pptx/ueb-slides';
import { download } from '../ReviewBox';

const STORE = 'soan-thao:slide';
const DEFAULTS: DeckInfo = {
  khoa: 'Trường Đại học Kinh tế - ĐHQGHN', monHoc: '', tieuDe: '', phuDe: '', giangVien: '', dienThoai: '', email: '', loiCamOn: 'XIN CẢM ƠN!',
};
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const fs = (sz: number) => `calc(${sz} * 100cqw / 960)`;

function Paras({ paras }: { paras: Para[] }) {
  return paras.map((p, i) => (
    <div
      key={i}
      style={{
        fontSize: fs(Math.max(...p.runs.map((r) => r.sz))),
        textAlign: p.align === 'ctr' ? 'center' : p.align === 'r' ? 'right' : 'left',
        lineHeight: (p.line ?? 100) / 100 * 1.17,
        marginTop: i ? fs(p.before ?? 0) : 0,
        paddingLeft: p.bullet ? `calc(${p.bullet.lvl ? 54 : 27} * 100cqw / 960)` : 0,
        position: 'relative',
      }}
    >
      {p.bullet && (
        <span style={{ position: 'absolute', left: p.bullet.lvl ? `calc(31.5 * 100cqw / 960)` : 0, color: `#${p.bullet.color}`, fontSize: fs(p.runs[0].sz * (p.bullet.lvl ? 1 : 0.7)), lineHeight: 1, top: p.bullet.lvl ? '0.15em' : '0.4em' }}>{p.bullet.char}</span>
      )}
      {p.runs.map((r, j) => (
        <span key={j} style={{ fontSize: fs(r.sz), fontWeight: r.b ? 700 : 400, fontStyle: r.i ? 'italic' : undefined, color: `#${r.color ?? '262626'}` }}>{r.text}</span>
      ))}
    </div>
  ));
}

function ShapeView({ s }: { s: Shape }) {
  const box = { position: 'absolute' as const, left: pct(s.x, W), top: pct(s.y, H), width: pct(s.w, W) };
  if (s.t === 'pic') return <img src={`/ueb-slide/${s.img}.png`} alt="" style={{ ...box, height: pct(s.h, H) }} />;
  if (s.t === 'box') {
    const d = (Math.min(s.w, s.h) * 0.3 / s.w) * 100;
    const clip = s.geom === 'homePlate' ? `polygon(0 0, ${100 - d}% 0, 100% 50%, ${100 - d}% 100%, 0 100%)`
      : s.geom === 'chevron' ? `polygon(0 0, ${100 - d}% 0, 100% 50%, ${100 - d}% 100%, 0 100%, ${d}% 50%)` : undefined;
    return <div style={{ ...box, height: pct(s.h, H), background: s.fill ? `#${s.fill}` : 'transparent', border: s.line ? `0.2cqw solid #${s.line}` : undefined, boxSizing: 'border-box', clipPath: clip, borderRadius: s.geom === 'roundRect' ? '1.2cqw' : s.geom === 'ellipse' ? '50%' : 0 }} />;
  }
  if (s.t === 'pie') {
    return <div style={{ ...box, height: pct(s.h, H), borderRadius: '50%', background: `conic-gradient(transparent 0 ${s.a0}deg, #${s.fill} ${s.a0}deg ${s.a1}deg, transparent ${s.a1}deg 360deg)` }} />;
  }
  if (s.t === 'text') {
    return (
      <div style={{ ...box, height: pct(s.h, H), display: 'flex', flexDirection: 'column', justifyContent: s.anchor === 'ctr' ? 'center' : s.anchor === 'b' ? 'flex-end' : 'flex-start', overflow: 'hidden' }}>
        <Paras paras={s.paras} />
      </div>
    );
  }
  return (
    <table style={{ ...box, borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: fs(s.sz) }}>
      <tbody>
        {s.rows.map((r, i) => (
          <tr key={i} style={{ height: pct(s.rowHs[i], H) }}>
            {r.map((c, j) => (
              <td key={j} style={{ background: i === 0 ? '#0C3E3E' : i % 2 ? '#F7F7F7' : '#F2F2F2', color: i === 0 ? '#fff' : '#262626', fontWeight: i === 0 ? 700 : 400, border: '1px solid #fff', padding: '0.3cqw 0.75cqw', lineHeight: 1.2 }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SlideView({ slide, n }: { slide: SlideOut; n: number }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700" style={{ containerType: 'inline-size', fontFamily: 'Arial, Helvetica, sans-serif' }} aria-label={`Slide ${n}`}>
      <img src="/ueb-slide/khung.png" alt="" style={{ position: 'absolute', left: 0, top: pct(4691, H), width: '100%', height: pct(6960479, H) }} />
      {slide.shapes.map((s, i) => <ShapeView key={i} s={s} />)}
    </div>
  );
}

const HELP: [string, string][] = [
  ['## Tên phần', 'Trang chuyển phần (PHẦN 1, PHẦN 2…). Tên phần thành nhãn đỏ của các trang sau.'],
  ['# Tiêu đề', 'Bắt đầu một trang nội dung mới.'],
  ['- Ý chính', 'Gạch đầu dòng; thụt vào 2 dấu cách (hoặc Tab) để thành ý phụ. Dòng không có gạch là đoạn văn thường.'],
  ['### Tên thẻ', 'Khối thẻ nền xanh nhạt, 2-4 thẻ một hàng; các ý ngay dưới thuộc thẻ đó.'],
  ['| A | B |', 'Bảng; dòng đầu là tiêu đề cột (dán được bảng Markdown).'],
  ['! Câu chốt', 'Dòng nhấn mạnh màu đỏ cuối trang.'],
  ['@ NHÃN', 'Đổi nhãn đỏ nhỏ phía trên tiêu đề của riêng trang đó.'],
  [':: bieu-do-cot', 'Biểu đồ cột; mỗi dòng "- Nhãn: số". Chữ sau tên loại là chú thích (đơn vị, nguồn). Thêm * cuối dòng để tô đỏ cột cần nhấn. Dòng không gạch đầu dòng thành khung giải thích bên phải. Tương tự: bieu-do-ngang (thanh ngang), bieu-do-tron (tròn, tự tính %).'],
  [':: quy-trinh', 'Sơ đồ các bước nối tiếp; "- Bước: mô tả", ý phụ thụt lề bổ sung cho bước.'],
  [':: dong-thoi-gian', 'Dòng thời gian; "- Năm: sự kiện".'],
  [':: so-lieu', 'Ô số liệu lớn; "- 50,4 tỷ USD | giải thích", * để tô đỏ.'],
  [':: cau-hoi', 'Câu hỏi lựa chọn A, B, C; dòng thường là tình huống (khung xanh bên trái).'],
  [':: danh-sach-so', 'Danh sách đánh số; "- Từ khóa: phần còn lại" (từ khóa tô đỏ).'],
  [':: trich-dan', 'Câu trích dẫn lớn; dòng thứ hai là nguồn.'],
];

export function SlideMaker() {
  const [info, setInfo] = useState<DeckInfo>(DEFAULTS);
  const [outline, setOutline] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Chèn mẫu một loại trang vào vị trí con trỏ (hoặc cuối dàn ý).
  function insert(text: string) {
    const el = area.current;
    const at = el && document.activeElement === el ? el.selectionEnd : outline.length;
    const before = outline.slice(0, at).replace(/\s*$/, '');
    const next = (before ? before + '\n\n' : '') + text + '\n' + outline.slice(at).replace(/^\s*/, (m) => (m ? '\n' : ''));
    setOutline(next);
    requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = (before ? before.length + 2 : 0) + text.length; } });
  }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}') as { info?: Partial<DeckInfo>; outline?: string };
      if (saved.info) setInfo((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(saved.info!).filter(([k, v]) => k in cur && typeof v === 'string')) }));
      if (typeof saved.outline === 'string') setOutline(saved.outline);
    } catch {}
    setLoaded(true);
  }, []);
  // Lưu bản nháp trên máy để mở lại không mất (không gửi lên máy chủ).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify({ info, outline })); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [info, outline, loaded]);

  const slides = useMemo(() => layoutDeck(info, parseOutline(outline)), [info, outline]);
  const set = (k: keyof DeckInfo, v: string) => setInfo((cur) => ({ ...cur, [k]: v }));

  async function make() {
    setBusy(true);
    setErr('');
    try {
      const get = async (f: string) => {
        const r = await fetch(`/ueb-slide/${f}.png`);
        if (!r.ok) throw new Error(`Không tải được ảnh ${f}.png`);
        return new Uint8Array(await r.arrayBuffer());
      };
      const [khung, logo] = await Promise.all([get('khung'), get('logo')]);
      const { buildDeckPptx } = await import('@/lib/pptx/ueb-slides');
      const bytes = await buildDeckPptx(slides, { khung, logo }, info.tieuDe.trim() || 'Bài giảng', info.giangVien.trim());
      download(bytes, `${slug(info.tieuDe) || 'bai_giang_UEB'}.pptx`, PPTX_MIME);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Không tạo được file.');
    } finally {
      setBusy(false);
    }
  }

  const txt = (k: keyof DeckInfo, label: string, ph = '', cls = '') => (
    <label className={cls}>
      <span className="label">{label}</span>
      <input className="input" value={info[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Trang bìa</h2>
            <div role="radiogroup" aria-label="Loại slide" className="flex rounded-xl border border-slate-200 p-0.5 text-sm dark:border-slate-700">
              {([['bai-giang', 'Bài giảng'], ['hoi-thao', 'Báo cáo hội thảo']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={(info.kieu ?? 'bai-giang') === k} onClick={() => set('kieu', k)} className={`rounded-lg px-3 py-1.5 ${(info.kieu ?? 'bai-giang') === k ? 'bg-brand-600 text-white' : ''}`}>{l}</button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-sm muted">Khung đỏ - xanh, chữ Arial, logo UEB như bộ slide mẫu của Trường. Thông tin được lưu trên máy này cho lần sau.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {txt('tieuDe', 'Tên bài giảng', 'Đầu tư trực tiếp nước ngoài và phát triển', 'sm:col-span-2')}
          {info.kieu === 'hoi-thao' ? txt('monHoc', 'Tên hội thảo · thời gian (nhãn đỏ)', 'Hội thảo khoa học quốc gia · Hà Nội, 12/2026', 'sm:col-span-2') : txt('monHoc', 'Học phần · mã · chương (nhãn đỏ)', 'Tài chính cho phát triển · INE2016 · Chương 5', 'sm:col-span-2')}
          {txt('phuDe', 'Phụ đề', 'Khái niệm, tác động, chính sách', 'sm:col-span-2')}
          {txt('khoa', 'Khoa / Trường (dòng trên cùng)', 'Khoa Kinh tế phát triển - Trường Đại học Kinh tế - ĐHQGHN', 'sm:col-span-2')}
          {txt('giangVien', info.kieu === 'hoi-thao' ? 'Báo cáo viên' : 'Giảng viên', 'ThS. Nguyễn Văn A')}
          {txt('dienThoai', 'Điện thoại')}
          {txt('email', 'Email', 'ten@vnu.edu.vn')}
          {txt('loiCamOn', 'Trang cuối (để trống: không có)', 'XIN CẢM ƠN!')}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Dàn ý</h2>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => { if (!outline.trim() || confirm('Thay dàn ý hiện tại bằng template mẫu?')) setOutline(info.kieu === 'hoi-thao' ? SAMPLE_CONFERENCE : SAMPLE_OUTLINE); }}>Dùng template mẫu</button>
              {outline.trim() && <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => { if (confirm('Xóa toàn bộ dàn ý?')) setOutline(''); }}>Xóa dàn ý</button>}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Thêm trang">
            <span className="self-center text-xs muted">Thêm trang:</span>
            {SNIPPETS.map((sn) => <button key={sn.key} type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => insert(sn.text)}>{sn.label}</button>)}
          </div>
          <textarea
            ref={area}
            className="input min-h-[420px] font-mono text-[13px] leading-relaxed"
            value={outline}
            onChange={(e) => setOutline(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Tab') return;
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: a, selectionEnd: b } = el;
              setOutline(outline.slice(0, a) + '  ' + outline.slice(b));
              requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 2; });
            }}
            placeholder={'## Khái niệm\n# FDI là gì?\n- Ý chính\n  - Ý phụ\n! Câu chốt cuối trang'}
            aria-label="Dàn ý bài giảng"
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Cách viết dàn ý</summary>
            <table className="table mt-2">
              <tbody>
                {HELP.map(([a, b]) => <tr key={a}><td className="whitespace-nowrap py-1.5 font-mono text-xs">{a}</td><td className="py-1.5">{b}</td></tr>)}
              </tbody>
            </table>
            <p className="mt-2 text-xs muted">Có thể dán dàn ý từ Word hoặc từ ChatGPT/Claude (dạng Markdown). Chữ tự thu nhỏ cho vừa trang; trang quá dài nên tách thành hai trang.</p>
          </details>
        </section>

        <section className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Xem trước <span className="text-sm font-normal muted">({slides.length} trang)</span></h2>
            <button type="button" className="btn" disabled={busy} onClick={make}>{busy ? 'Đang tạo…' : 'Tải slide (.pptx)'}</button>
          </div>
          {err && <p role="alert" className="text-sm text-orange-700 dark:text-orange-300">{err}</p>}
          <div className="grid max-h-[760px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {slides.map((s, i) => (
              <div key={i}>
                <SlideView slide={s} n={i + 1} />
                <div className="mt-1 text-center text-xs muted">{i + 1}</div>
              </div>
            ))}
          </div>
          <p className="text-xs muted">File mở được bằng PowerPoint, Google Slides, Keynote. Mọi chữ, khung, bảng đều sửa tiếp được trong PowerPoint.</p>
        </section>
      </div>
    </div>
  );
}
