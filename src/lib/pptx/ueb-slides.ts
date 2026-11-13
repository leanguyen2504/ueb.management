// Tạo bài giảng PowerPoint (.pptx) theo phong cách slide UEB: khung đỏ đậm - xanh lục đậm,
// chữ Arial, nhãn nhỏ màu đỏ, tiêu đề xanh lá, logo UEB ở trang bìa và trang cảm ơn.
// Chạy hoàn toàn trên trình duyệt: dàn trang thành danh sách hình (Shape) dùng chung cho
// bản xem trước (HTML) và file .pptx, nên xem trước giống file tải về.
import { makeEntry, writeZip } from '@/lib/docx/zip';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

// Bảng màu lấy từ bộ slide mẫu của Trường.
export const UEB = {
  red: '8F191C',
  teal: '0C3E3E',
  green: '336600',
  ink: '262626',
  gray: '595959',
  light: 'F2F2F2',
  mint: 'E6EEEE',
  white: 'FFFFFF',
  font: 'Arial',
};

// Khổ 16:9 (EMU). 1 pt = 12700 EMU; ngang slide = 960 pt.
export const W = 12192000;
export const H = 6858000;
const PT = 12700;
const MX = 548640; // lề trái/phải nội dung như slide mẫu
const CW = W - 2 * MX;
const BODY_TOP = 1783080;
const BODY_BOTTOM = 6035040;

export type DeckInfo = {
  khoa: string; // dòng nhỏ trên cùng trang bìa
  monHoc: string; // nhãn đỏ trang bìa, ví dụ TÀI CHÍNH CHO PHÁT TRIỂN · INE2016 · CHƯƠNG 5
  tieuDe: string;
  phuDe: string;
  giangVien: string;
  dienThoai: string;
  email: string;
  loiCamOn: string; // để trống thì không thêm trang cuối
  kieu?: 'bai-giang' | 'hoi-thao' | 'bao-ve';
};

// ---------- Phân tích dàn ý ----------
type Bullet = { text: string; lvl: number; plain: boolean };
type Card = { title: string; items: Bullet[] };
export type SlideSpec =
  | { kind: 'section'; no: number; title: string }
  | { kind: 'content'; kicker: string; title: string; items: Bullet[]; cards: Card[]; table: string[][]; note: string; layout: Layout; arg: string };

export const LAYOUTS = ['bieu-do-cot', 'bieu-do-ngang', 'bieu-do-tron', 'quy-trinh', 'so-lieu', 'cau-hoi', 'dong-thoi-gian', 'danh-sach-so', 'trich-dan'] as const;
export type Layout = '' | (typeof LAYOUTS)[number];

/**
 * Cú pháp dàn ý (mỗi dòng một ý):
 *   ## Tên phần         → trang chuyển phần (PHẦN 1, PHẦN 2…), tên phần thành nhãn đỏ các trang sau
 *   # Tiêu đề trang     → trang nội dung mới
 *   - ý chính / ␣␣- ý phụ (thụt 2 dấu cách hoặc tab), dòng thường là đoạn không gạch đầu dòng
 *   ### Tên thẻ         → khối thẻ (2-4 thẻ một hàng), các ý bên dưới thuộc thẻ đó
 *   | cột | cột |       → bảng, dòng đầu là tiêu đề cột
 *   ! câu chốt          → dòng nhấn mạnh màu đỏ cuối trang
 *   @ NHÃN              → đổi nhãn đỏ nhỏ phía trên tiêu đề của trang này
 *   :: loại [chú thích] → trang minh họa: bieu-do-cot, bieu-do-ngang, bieu-do-tron, quy-trinh,
 *                          so-lieu, cau-hoi, dong-thoi-gian, danh-sach-so, trich-dan (xem LAYOUT_HELP)
 */
export function parseOutline(src: string): SlideSpec[] {
  const out: SlideSpec[] = [];
  let section = '';
  let sectionNo = 0;
  let cur: Extract<SlideSpec, { kind: 'content' }> | null = null;
  let card: Card | null = null;
  const ensure = () => {
    if (!cur) {
      cur = { kind: 'content', kicker: section.toUpperCase(), title: '', items: [], cards: [], table: [], note: '', layout: '', arg: '' };
      out.push(cur);
      card = null;
    }
    return cur;
  };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const indent = raw.replace(/\t/g, '  ').match(/^ */)![0].length;
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^##(?!#)\s*(.*)$/))) {
      section = m[1].trim();
      sectionNo++;
      out.push({ kind: 'section', no: sectionNo, title: section });
      cur = null;
      card = null;
    } else if ((m = line.match(/^#(?!#)\s*(.*)$/))) {
      cur = null;
      ensure().title = m[1].trim();
    } else if ((m = line.match(/^###\s*(.*)$/))) {
      const s = ensure();
      card = { title: m[1].trim(), items: [] };
      s.cards.push(card);
    } else if ((m = line.match(/^::\s*([\w-]+)\s*(.*)$/))) {
      const s = ensure();
      const key = m[1].toLowerCase();
      s.layout = (LAYOUTS as readonly string[]).includes(key) ? (key as Layout) : '';
      s.arg = m[2].trim();
    } else if ((m = line.match(/^@\s*(.*)$/))) {
      ensure().kicker = m[1].trim().toUpperCase();
    } else if ((m = line.match(/^!\s*(.*)$/))) {
      ensure().note = m[1].trim();
    } else if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // dòng phân cách kiểu Markdown
      ensure().table.push(cells);
    } else {
      m = line.match(/^(?:[-*•+–]|\d+[.)])\s+(.*)$/);
      const b: Bullet = { text: (m ? m[1] : line).trim(), lvl: indent >= 2 && m ? 1 : 0, plain: !m };
      const s = ensure();
      (card ? card.items : s.items).push(b);
    }
  }
  return out;
}

// ---------- Dàn trang ----------
export type Run = { text: string; b?: boolean; i?: boolean; color?: string; sz: number };
export type Para = { runs: Run[]; align?: 'l' | 'ctr' | 'r'; bullet?: { char: string; color: string; lvl: number }; before?: number; line?: number };
export type Shape =
  | { t: 'pic'; img: 'khung' | 'logo'; x: number; y: number; w: number; h: number }
  | { t: 'box'; geom: Geom; fill: string; x: number; y: number; w: number; h: number; line?: string }
  | { t: 'pie'; fill: string; x: number; y: number; w: number; h: number; a0: number; a1: number }
  | { t: 'text'; x: number; y: number; w: number; h: number; anchor?: 't' | 'ctr' | 'b'; paras: Para[]; title?: boolean }
  | { t: 'table'; x: number; y: number; w: number; rows: string[][]; sz: number; rowHs: number[] };
export type SlideOut = { shapes: Shape[] };
export type Geom = 'rect' | 'roundRect' | 'ellipse' | 'chevron' | 'homePlate';

// Ước lượng số dòng khi xuống dòng tự động (Arial: bề ngang trung bình một ký tự ≈ 0,5 cỡ chữ).
function lineCount(text: string, sz: number, widthEmu: number) {
  const perLine = Math.max(8, Math.floor(widthEmu / PT / (sz * 0.5)));
  return text.split('\n').reduce((s, t) => s + Math.max(1, Math.ceil(t.length / perLine)), 0);
}
function fitSize(texts: { text: string; scale?: number; indent?: number }[], widthEmu: number, heightEmu: number, max: number, min: number, gap = 0.45) {
  for (let sz = max; sz > min; sz--) {
    const h = texts.reduce((s, t) => {
      const z = sz * (t.scale ?? 1);
      return s + lineCount(t.text, z, widthEmu - (t.indent ?? 0)) * z * 1.2 + z * gap;
    }, 0);
    if (h * PT <= heightEmu) return sz;
  }
  return min;
}

const kickerShape = (text: string): Shape => ({ t: 'text', x: MX, y: 566928, w: CW, h: 274320, paras: [{ runs: [{ text, b: true, color: UEB.red, sz: 12 }] }] });
const titleShape = (text: string, sz = 26): Shape => ({ t: 'text', title: true, x: MX, y: 841248, w: CW, h: 868680, paras: [{ runs: [{ text, b: true, color: UEB.green, sz }], line: 95 }] });
const numShape = (n: number): Shape => ({ t: 'text', x: W - MX - 1200000, y: 6080000, w: 1200000, h: 260000, anchor: 'b', paras: [{ align: 'r', runs: [{ text: String(n), color: 'A6A6A6', sz: 10 }] }] });

function bulletParas(items: Bullet[], sz: number, color = UEB.ink): Para[] {
  return items.map((b) => ({
    runs: [{ text: b.text, sz: b.lvl ? Math.max(10, sz - 2) : sz, color }],
    bullet: b.plain ? undefined : { char: b.lvl ? '–' : '■', color: b.lvl ? UEB.gray : UEB.red, lvl: b.lvl },
    before: Math.round(sz * 0.45),
    line: 110,
  }));
}
const bulletTexts = (items: Bullet[]) => items.map((b) => ({ text: b.text, scale: b.lvl ? 0.9 : 1, indent: (b.lvl ? 2 : 1) * 342900 }));

function titleSlide(d: DeckInfo): SlideOut {
  const sh: Shape[] = [];
  const x = 822960;
  const w = 7315200;
  sh.push({ t: 'pic', img: 'logo', x: 8900000, y: 1450000, w: 1720000, h: 2125000 });
  if (d.khoa.trim()) sh.push({ t: 'text', x, y: 860000, w, h: 300000, paras: [{ runs: [{ text: d.khoa.trim(), color: UEB.gray, sz: 13 }] }] });
  let y = 1325880;
  if (d.monHoc.trim()) sh.push({ t: 'text', x, y, w, h: 320040, paras: [{ runs: [{ text: d.monHoc.trim().toUpperCase(), b: true, color: UEB.red, sz: 13 }] }] });
  y += 365760;
  const title = d.tieuDe.trim() || 'Tên bài giảng';
  const tsz = fitSize([{ text: title }], w, 1463040, 36, 24, 0);
  sh.push({ t: 'text', title: true, x, y, w, h: 1463040, paras: [{ runs: [{ text: title, b: true, color: UEB.green, sz: tsz }], line: 95 }] });
  y += 1508760;
  if (d.phuDe.trim()) sh.push({ t: 'text', x, y, w, h: 600000, paras: [{ runs: [{ text: d.phuDe.trim(), color: UEB.gray, sz: 16 }] }] });
  const info = ([[d.kieu === 'hoi-thao' ? 'Báo cáo viên:' : d.kieu === 'bao-ve' ? 'Chủ nhiệm:' : 'Giảng viên:', d.giangVien], ['Điện thoại:', d.dienThoai], ['Email:', d.email]] as const).filter(([, v]) => v.trim());
  info.forEach(([k, v], n) => {
    const ry = 4300000 + n * 320000;
    sh.push({ t: 'text', x: 2000000, y: ry, w: 1500000, h: 300000, paras: [{ runs: [{ text: k, b: true, color: UEB.red, sz: 14 }] }] });
    sh.push({ t: 'text', x: 3550000, y: ry, w: 6000000, h: 300000, paras: [{ runs: [{ text: v.trim(), color: UEB.green, sz: 14 }] }] });
  });
  return { shapes: sh };
}

function sectionSlide(s: Extract<SlideSpec, { kind: 'section' }>, n: number): SlideOut {
  const tsz = fitSize([{ text: s.title }], CW, 1600000, 48, 28, 0);
  return {
    shapes: [
      { t: 'box', geom: 'rect', fill: UEB.red, x: W / 2 - 457200, y: 2250000, w: 914400, h: 54864 },
      { t: 'text', x: MX, y: 2452078, w: CW, h: 477300, paras: [{ align: 'ctr', runs: [{ text: isAppendix(s.title) ? 'PHỤ LỤC' : `PHẦN ${s.no}`, b: true, color: UEB.red, sz: 28 }] }] },
      { t: 'text', title: true, x: MX, y: 3050000, w: CW, h: 1700000, anchor: 't', paras: [{ align: 'ctr', line: 95, runs: [{ text: s.title || `Phần ${s.no}`, b: true, color: UEB.green, sz: tsz }] }] },
      numShape(n),
    ],
  };
}

function contentSlide(s: Extract<SlideSpec, { kind: 'content' }>, n: number): SlideOut {
  if (s.layout) return illustrated(s, n);
  const sh: Shape[] = [];
  if (s.kicker) sh.push(kickerShape(s.kicker));
  const title = s.title || ' ';
  sh.push(titleShape(title, fitSize([{ text: title }], CW, 868680, 26, 20, 0)));
  let top = BODY_TOP;
  let bottom = BODY_BOTTOM;
  if (s.note) {
    const nh = Math.min(960120, lineCount(s.note, 18, CW) * 18 * 1.25 * PT + 120000);
    bottom -= nh;
    sh.push({ t: 'text', x: MX, y: bottom + 80000, w: CW, h: nh, paras: [{ runs: [{ text: s.note, b: true, color: UEB.red, sz: 18 }] }] });
  }
  const hasBlock = s.cards.length > 0 || s.table.length > 0;
  if (s.items.length) {
    const avail = hasBlock ? Math.min(1700000, (bottom - top) * 0.4) : bottom - top;
    const sz = fitSize(bulletTexts(s.items), CW, avail, hasBlock ? 18 : 22, 11);
    const need = s.items.reduce((h, b) => h + lineCount(b.text, sz, CW - 342900) * sz * 1.32 + sz * 0.45, 0) * PT + 60000;
    const h = hasBlock ? Math.min(avail, need) : bottom - top;
    sh.push({ t: 'text', x: MX, y: top, w: CW, h, paras: bulletParas(s.items, sz) });
    top += h + (hasBlock ? 180000 : 0);
  }
  if (s.table.length) {
    const cols = Math.max(...s.table.map((r) => r.length));
    const rows = s.table.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
    const colW = CW / cols;
    const avail = (bottom - top) / (s.cards.length ? 2 : 1);
    const heights = (z: number) => rows.map((r) => Math.round(Math.max(...r.map((c) => lineCount(c, z, colW - 182880))) * z * 1.25 * PT + 150000));
    let sz = 16;
    while (sz > 10 && heights(sz).reduce((a, b) => a + b, 0) > avail) sz--;
    const rowHs = heights(sz);
    const total = rowHs.reduce((a, b) => a + b, 0);
    sh.push({ t: 'table', x: MX, y: top, w: CW, rows, sz, rowHs });
    top += Math.min(total, avail) + 200000;
  }
  if (s.cards.length) {
    const perRow = s.cards.length <= 4 ? s.cards.length : Math.ceil(s.cards.length / 2);
    const rowsN = Math.ceil(s.cards.length / perRow);
    const gap = 182880;
    const cw = (CW - gap * (perRow - 1)) / perRow;
    const maxH = Math.max(900000, (bottom - top - gap * (rowsN - 1)) / rowsN);
    const pad = 182880;
    const inner = cw - pad * 2;
    const headSz = Math.min(...s.cards.map((c) => fitSize([{ text: c.title }], inner, 640080, perRow >= 4 ? 18 : 20, 13, 0)));
    const headH = (c: Card) => lineCount(c.title, headSz, inner) * headSz * 1.25 * PT + 120000;
    const bodySz = Math.min(...s.cards.map((c) => fitSize(bulletTexts(c.items), inner, maxH - pad * 2 - headH(c), perRow <= 2 ? 18 : 16, 10)));
    const needH = Math.max(...s.cards.map((c) => headH(c) + c.items.reduce((h, b) => h + lineCount(b.text, bodySz, inner - 342900) * bodySz * 1.3 + bodySz * 0.45, 0) * PT)) + pad * 2 + 120000;
    const chH = Math.min(maxH, Math.max(needH, Math.min(maxH, 2200000)));
    s.cards.forEach((c, i) => {
      const x = MX + (i % perRow) * (cw + gap);
      const y = top + Math.floor(i / perRow) * (chH + gap);
      sh.push({ t: 'box', geom: 'roundRect', fill: UEB.mint, x, y, w: cw, h: chH });
      const paras: Para[] = [{ runs: [{ text: c.title, b: true, color: UEB.teal, sz: headSz }], line: 100 }, ...bulletParas(c.items, bodySz)];
      sh.push({ t: 'text', x: x + pad, y: y + pad, w: inner, h: chH - pad * 2, paras });
    });
  }
  sh.push(numShape(n));
  return { shapes: sh };
}

// ---------- Trang minh họa (biểu đồ, sơ đồ, số liệu…) ----------
const PALETTE = [UEB.teal, UEB.red, UEB.green, 'A6A6A6', '6E9C9C', 'C46A6D', '8FB27F', 'D9D9D9'];

// "50,4" → 50.4; "1.234,5" → 1234.5; "1,234.5" → 1234.5
export function parseNum(raw: string) {
  let t = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (/,\d{1,2}$/.test(t) || (/,/.test(t) && !/\./.test(t) && !/,\d{3}$/.test(t))) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
// Tách "nhãn: giá trị" hoặc "nhãn | giá trị".
function kv(text: string): [string, string] {
  const i = text.indexOf(' | ');
  if (i >= 0) return [text.slice(0, i).trim(), text.slice(i + 3).trim()];
  const j = text.indexOf(':');
  return j > 0 ? [text.slice(0, j).trim(), text.slice(j + 1).trim()] : [text.trim(), ''];
}
const starred = (t: string) => /\*\s*$/.test(t) || /\*\s*(\||:)/.test(t);
const unstar = (t: string) => t.replace(/\s*\*\s*$/, '');

type TOpt = { sz: number; b?: boolean; color?: string; align?: 'l' | 'ctr' | 'r'; anchor?: 't' | 'ctr' | 'b'; i?: boolean };
const T = (x: number, y: number, w: number, h: number, text: string, o: TOpt): Shape => ({
  t: 'text', x, y, w, h, anchor: o.anchor, paras: text.split('\n').map((line) => ({ align: o.align, line: 100, runs: [{ text: line, sz: o.sz, b: o.b, i: o.i, color: o.color ?? UEB.ink }] })),
});
const fitOne = (text: string, w: number, h: number, max: number, min: number) => fitSize([{ text }], w, h, max, min, 0);

function illustrated(s: Extract<SlideSpec, { kind: 'content' }>, n: number): SlideOut {
  const sh: Shape[] = [];
  if (s.kicker) sh.push(kickerShape(s.kicker));
  const title = s.title || ' ';
  sh.push(titleShape(title, fitSize([{ text: title }], CW, 868680, 26, 20, 0)));
  const top = BODY_TOP;
  let bottom = BODY_BOTTOM;
  if (s.note) {
    const nh = Math.min(960120, lineCount(s.note, 18, CW) * 18 * 1.25 * PT + 120000);
    bottom -= nh;
    sh.push({ t: 'text', x: MX, y: bottom + 80000, w: CW, h: nh, paras: [{ runs: [{ text: s.note, b: true, color: UEB.red, sz: 18 }] }] });
  }
  const data = s.items.filter((b) => !b.plain);
  const plain = s.items.filter((b) => b.plain).map((b) => b.text);
  const H0 = bottom - top;

  // Khối chữ phụ bên phải (nền xanh đậm, chữ trắng) cho trang biểu đồ / câu hỏi.
  const sidePanel = (x: number, w: number, y = top, h = H0) => {
    sh.push({ t: 'box', geom: 'roundRect', fill: UEB.teal, x, y, w, h });
    const pad = 228600;
    const sz = fitSize(plain.map((t) => ({ text: t })), w - pad * 2, h - pad * 2, 18, 11, 0.6);
    sh.push({ t: 'text', x: x + pad, y: y + pad, w: w - pad * 2, h: h - pad * 2, paras: plain.map((t, i) => ({ before: i ? sz * 0.6 : 0, line: 105, runs: [{ text: t, sz: i === 0 && plain.length > 1 ? sz + 1 : sz, b: i === 0 && plain.length > 1, color: UEB.white }] })) });
  };

  const L = s.layout;
  if (L === 'bieu-do-cot' || L === 'bieu-do-ngang' || L === 'bieu-do-tron') {
    const rows = data.map((b) => { const [k, v] = kv(b.text); return { label: unstar(k), value: parseNum(v), raw: unstar(v) || '0', hi: starred(b.text) }; });
    const aw = plain.length ? CW * 0.6 : CW;
    if (plain.length) sidePanel(MX + aw + 365760, CW - aw - 365760);
    const capH = s.arg ? 260000 : 0;
    if (s.arg) sh.push(T(MX, bottom - capH, aw, capH, s.arg, { sz: 11, i: true, color: UEB.gray, anchor: 'b' }));
    const ph = H0 - capH;
    const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
    const colorOf = (r: (typeof rows)[number], i: number) => (rows.some((x) => x.hi) ? (r.hi ? UEB.red : UEB.teal) : PALETTE[i % 3]);
    if (!rows.length) sh.push(T(MX, top, aw, 400000, 'Thêm dữ liệu dạng "- Nhãn: số", ví dụ "- 2024: 36,6"', { sz: 14, color: UEB.gray, i: true }));
    else if (L === 'bieu-do-cot') {
      const slot = aw / rows.length;
      const labSz = Math.min(14, ...rows.map((r) => fitOne(r.label, slot - 60000, 420000, 14, 9)));
      const labH = 480000;
      const valH = 330000;
      const base = top + ph - labH;
      const plotH = base - top - valH;
      rows.forEach((r, i) => {
        const bw = Math.min(slot * 0.6, 1600000);
        const x = MX + i * slot + (slot - bw) / 2;
        const h = Math.max(19050, (plotH * Math.abs(r.value)) / max);
        sh.push({ t: 'box', geom: 'rect', fill: colorOf(r, i), x, y: base - h, w: bw, h });
        sh.push(T(MX + i * slot, base - h - valH, slot, valH - 30000, r.raw, { sz: rows.length > 8 ? 11 : 14, b: true, align: 'ctr', anchor: 'b' }));
        sh.push(T(MX + i * slot + 30000, base + 60000, slot - 60000, labH - 60000, r.label, { sz: labSz, color: UEB.gray, align: 'ctr' }));
      });
      sh.push({ t: 'box', geom: 'rect', fill: 'BFBFBF', x: MX, y: base, w: aw, h: 12700 });
    } else if (L === 'bieu-do-ngang') {
      const labW = aw * 0.3;
      const valW = 900000;
      const slot = Math.min(640000, ph / rows.length);
      const bh = slot * 0.62;
      const sz = Math.min(16, ...rows.map((r) => fitOne(r.label, labW - 120000, slot, 16, 9)));
      rows.forEach((r, i) => {
        const y = top + i * slot;
        const w = Math.max(19050, ((aw - labW - valW) * Math.abs(r.value)) / max);
        sh.push(T(MX, y, labW - 120000, slot, r.label, { sz, align: 'r', anchor: 'ctr' }));
        sh.push({ t: 'box', geom: 'rect', fill: colorOf(r, i), x: MX + labW, y: y + (slot - bh) / 2, w, h: bh });
        sh.push(T(MX + labW + w + 80000, y, valW, slot, r.raw, { sz: Math.min(sz, 14), b: true, anchor: 'ctr' }));
      });
      sh.push({ t: 'box', geom: 'rect', fill: 'BFBFBF', x: MX + labW - 6350, y: top, w: 12700, h: slot * rows.length });
    } else {
      const total = rows.reduce((a, r) => a + Math.abs(r.value), 0) || 1;
      const d = Math.min(ph, aw * 0.48);
      const cx = MX + 100000;
      const cy = top + (ph - d) / 2;
      let a = 0;
      rows.forEach((r, i) => {
        const span = (Math.abs(r.value) / total) * 360;
        if (span > 0) sh.push({ t: 'pie', fill: PALETTE[i % PALETTE.length], x: cx, y: cy, w: d, h: d, a0: a, a1: a + span });
        a += span;
      });
      const lx = cx + d + 400000;
      const lw = MX + aw - lx;
      const rowH = Math.min(520000, ph / rows.length);
      const sz = Math.min(18, ...rows.map((r) => fitOne(`${r.label}  ${r.raw}`, lw - 380000, rowH, 18, 10)));
      const y0 = top + (ph - rowH * rows.length) / 2;
      rows.forEach((r, i) => {
        const y = y0 + i * rowH;
        sh.push({ t: 'box', geom: 'rect', fill: PALETTE[i % PALETTE.length], x: lx, y: y + rowH / 2 - 100000, w: 200000, h: 200000 });
        const pctTxt = `${String(Math.round((Math.abs(r.value) / total) * 1000) / 10).replace('.', ',')}%`;
        sh.push({ t: 'text', x: lx + 320000, y, w: lw - 320000, h: rowH, anchor: 'ctr', paras: [{ line: 100, runs: [{ text: r.label + '  ', sz, color: UEB.ink }, { text: r.raw === pctTxt ? pctTxt : `${r.raw} (${pctTxt})`, sz, b: true, color: UEB.ink }] }] });
      });
    }
  } else if (L === 'quy-trinh' || L === 'dong-thoi-gian') {
    const steps: { head: string; body: string[]; hi: boolean }[] = [];
    for (const b of data) {
      if (b.lvl && steps.length) steps[steps.length - 1].body.push(b.text);
      else { const [k, v] = kv(b.text); steps.push({ head: unstar(k), body: v ? [unstar(v)] : [], hi: starred(b.text) }); }
    }
    let y = top;
    if (plain.length) {
      const sz = fitSize(plain.map((t) => ({ text: t })), CW, 700000, 18, 12, 0.3);
      const h = Math.min(800000, plain.reduce((a, t) => a + lineCount(t, sz, CW) * sz * 1.3, 0) * PT + 80000);
      sh.push({ t: 'text', x: MX, y, w: CW, h, paras: plain.map((t) => ({ line: 105, runs: [{ text: t, sz, color: UEB.gray }] })) });
      y += h + 120000;
    }
    const k = Math.max(1, steps.length);
    if (L === 'quy-trinh') {
      const gap = 45720;
      const slot = (CW - gap * (k - 1)) / k;
      const ch = Math.min(900000, (bottom - y) * 0.32);
      const headSz = Math.min(...steps.map((st) => fitOne(st.head, slot - 380000, ch - 60000, 20, 10)), 20);
      steps.forEach((st, i) => {
        const x = MX + i * (slot + gap);
        sh.push({ t: 'box', geom: i === 0 ? 'homePlate' : 'chevron', fill: st.hi ? UEB.red : i % 2 ? '1D5A5A' : UEB.teal, x, y, w: slot, h: ch });
        sh.push(T(x + (i ? 300000 : 120000), y, slot - (i ? 520000 : 360000), ch, st.head, { sz: headSz, b: true, color: UEB.white, align: 'ctr', anchor: 'ctr' }));
      });
      const by = y + ch + 200000;
      const bodySz = Math.min(16, ...steps.map((st) => fitSize(st.body.map((t) => ({ text: t, indent: 0 })), slot - 120000, bottom - by, 16, 10, 0.4)));
      steps.forEach((st, i) => {
        const x = MX + i * (slot + gap);
        sh.push({ t: 'box', geom: 'ellipse', fill: st.hi ? UEB.red : UEB.teal, x: x + 60000, y: by - 60000, w: 330000, h: 330000 });
        sh.push(T(x + 60000, by - 60000, 330000, 330000, String(i + 1), { sz: 13, b: true, color: UEB.white, align: 'ctr', anchor: 'ctr' }));
        if (st.body.length) sh.push({ t: 'text', x: x + 60000, y: by + 360000, w: slot - 120000, h: bottom - by - 360000, paras: st.body.map((t, j) => ({ before: j ? bodySz * 0.4 : 0, line: 105, runs: [{ text: t, sz: bodySz }] })) });
      });
    } else {
      const slot = CW / k;
      const ly = y + (bottom - y) * 0.42;
      sh.push({ t: 'box', geom: 'rect', fill: UEB.teal, x: MX, y: ly - 19050, w: CW, h: 38100 });
      const headSz = Math.min(22, ...steps.map((st) => fitOne(st.head, slot - 80000, ly - y - 260000, 22, 11)));
      const bodySz = Math.min(15, ...steps.map((st) => fitSize(st.body.map((t) => ({ text: t })), slot - 120000, bottom - ly - 300000, 15, 9, 0.4)));
      steps.forEach((st, i) => {
        const cx = MX + i * slot + slot / 2;
        sh.push({ t: 'box', geom: 'ellipse', fill: st.hi ? UEB.red : UEB.white, line: st.hi ? UEB.red : UEB.teal, x: cx - 120000, y: ly - 120000, w: 240000, h: 240000 });
        sh.push(T(MX + i * slot + 40000, y, slot - 80000, ly - y - 200000, st.head, { sz: headSz, b: true, color: st.hi ? UEB.red : UEB.teal, align: 'ctr', anchor: 'b' }));
        if (st.body.length) sh.push({ t: 'text', x: MX + i * slot + 60000, y: ly + 260000, w: slot - 120000, h: bottom - ly - 260000, paras: st.body.map((t, j) => ({ align: 'ctr', before: j ? bodySz * 0.4 : 0, line: 105, runs: [{ text: t, sz: bodySz }] })) });
      });
    }
  } else if (L === 'so-lieu') {
    const tiles = data.map((b) => { const [k, v] = kv(b.text); return { big: unstar(k), small: unstar(v), hi: starred(b.text) }; });
    let y = top;
    if (plain.length) {
      const sz = fitSize(plain.map((t) => ({ text: t })), CW, 900000, 18, 12, 0.3);
      sh.push({ t: 'text', x: MX, y, w: CW, h: 900000, paras: plain.map((t) => ({ line: 105, runs: [{ text: t, sz, color: UEB.ink }] })) });
      y += 1000000;
    }
    const per = tiles.length <= 4 ? Math.max(1, tiles.length) : Math.ceil(tiles.length / 2);
    const rowsN = Math.ceil(tiles.length / per) || 1;
    const gap = 228600;
    const tw = (CW - gap * (per - 1)) / per;
    const th = Math.min(2300000, (bottom - y - gap * (rowsN - 1)) / rowsN);
    const pad = 228600;
    const bigSz = Math.min(...tiles.map((t) => fitOne(t.big, tw - pad * 2, th * 0.45, per <= 2 ? 54 : 40, 18)), 54);
    const smallSz = Math.min(...tiles.map((t) => fitOne(t.small, tw - pad * 2, th * 0.45, 16, 10)), 16);
    tiles.forEach((t, i) => {
      const x = MX + (i % per) * (tw + gap);
      const ty = y + Math.floor(i / per) * (th + gap);
      sh.push({ t: 'box', geom: 'roundRect', fill: t.hi ? UEB.red : UEB.light, x, y: ty, w: tw, h: th });
      sh.push(T(x + pad, ty + pad, tw - pad * 2, th * 0.5 - pad, t.big, { sz: bigSz, b: true, color: t.hi ? UEB.white : UEB.teal, anchor: 'b' }));
      if (t.small) sh.push(T(x + pad, ty + th * 0.5 + 60000, tw - pad * 2, th * 0.5 - pad - 60000, t.small, { sz: smallSz, color: t.hi ? UEB.white : UEB.gray }));
    });
  } else if (L === 'cau-hoi') {
    const ow = plain.length ? CW * 0.52 : CW;
    if (plain.length) sidePanel(MX, CW - ow - 365760);
    const ox = MX + CW - ow;
    const gap = 160000;
    const rh = Math.min(900000, (H0 - gap * (data.length - 1)) / Math.max(1, data.length));
    const sz = Math.min(20, ...data.map((b) => fitOne(b.text, ow - 1000000, rh - 80000, 20, 11)));
    const y0 = top + (H0 - (rh * data.length + gap * (data.length - 1))) / 2;
    data.forEach((b, i) => {
      const y = y0 + i * (rh + gap);
      const hi = starred(b.text);
      sh.push({ t: 'box', geom: 'roundRect', fill: hi ? 'F7EAEA' : UEB.light, x: ox, y, w: ow, h: rh });
      const d = Math.min(420000, rh - 120000);
      sh.push({ t: 'box', geom: 'ellipse', fill: UEB.red, x: ox + 200000, y: y + (rh - d) / 2, w: d, h: d });
      sh.push(T(ox + 200000, y + (rh - d) / 2, d, d, String.fromCharCode(65 + i), { sz: 16, b: true, color: UEB.white, align: 'ctr', anchor: 'ctr' }));
      sh.push(T(ox + 200000 + d + 240000, y, ow - d - 640000, rh, unstar(b.text), { sz, b: true, anchor: 'ctr' }));
    });
  } else if (L === 'danh-sach-so') {
    const cols = data.length > 6 ? 2 : 1;
    const per = Math.ceil(data.length / cols);
    const gap = 140000;
    const cg = 274320;
    const cw = (CW - cg * (cols - 1)) / cols;
    let y = top;
    if (plain.length) {
      sh.push(T(MX, y, CW, 330000, plain.join(' '), { sz: 12, b: true, color: UEB.gray }));
      y += 420000;
    }
    const rh = Math.min(1000000, (bottom - y - gap * (per - 1)) / Math.max(1, per));
    const sz = Math.min(20, ...data.map((b) => fitOne(b.text, cw - 900000, rh - 100000, 20, 11)));
    data.forEach((b, i) => {
      const x = MX + Math.floor(i / per) * (cw + cg);
      const ry = y + (i % per) * (rh + gap);
      sh.push({ t: 'box', geom: 'roundRect', fill: 'F4F1E8', x, y: ry, w: cw, h: rh });
      const d = Math.min(400000, rh - 140000);
      sh.push({ t: 'box', geom: 'ellipse', fill: UEB.green, x: x + 180000, y: ry + (rh - d) / 2, w: d, h: d });
      sh.push(T(x + 180000, ry + (rh - d) / 2, d, d, String(i + 1), { sz: 14, b: true, color: UEB.white, align: 'ctr', anchor: 'ctr' }));
      const [k, v] = kv(b.text);
      sh.push({ t: 'text', x: x + 180000 + d + 220000, y: ry, w: cw - d - 560000, h: rh, anchor: 'ctr', paras: [{ line: 105, runs: v ? [{ text: k + ' ', sz: sz + 2, b: true, color: UEB.red }, { text: v, sz, color: UEB.ink }] : [{ text: k, sz, color: UEB.ink }] }] });
    });
  } else if (L === 'trich-dan') {
    const lines = s.items.map((b) => b.text);
    const quote = lines[0] ?? '';
    const by = lines.slice(1).join('\n');
    sh.push(T(MX, top - 200000, 1200000, 1400000, '“', { sz: 120, b: true, color: UEB.red }));
    const qh = H0 - (by ? 700000 : 0) - 200000;
    sh.push(T(MX + 1100000, top + 200000, CW - 1300000, qh, quote, { sz: fitOne(quote, CW - 1300000, qh, 32, 16), b: true, color: UEB.green, anchor: 'ctr' }));
    if (by) sh.push(T(MX + 1100000, top + 200000 + qh, CW - 1300000, 600000, by, { sz: 16, color: UEB.gray }));
  }
  sh.push(numShape(n));
  return { shapes: sh };
}

function thanksSlide(text: string): SlideOut {
  const t = text.trim();
  return {
    shapes: [
      { t: 'box', geom: 'rect', fill: UEB.teal, x: 0, y: 2240000, w: W, h: 2380000 },
      { t: 'text', x: MX + 400000, y: 2240000, w: 6600000, h: 2380000, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ text: t, b: true, color: UEB.white, sz: fitSize([{ text: t }], 6600000, 2000000, 44, 24, 0) }] }] },
      { t: 'pic', img: 'logo', x: 7900000, y: 1650000, w: 2900000, h: 3580000 },
    ],
  };
}

// Phần "## Phụ lục…" ghi nhãn PHỤ LỤC; trang cảm ơn đặt ngay trước phụ lục để kết thúc phần trình bày.
const isAppendix = (t: string) => /^phụ lục/i.test(t.trim());

export function layoutDeck(info: DeckInfo, specs: SlideSpec[]): SlideOut[] {
  const slides: SlideOut[] = [titleSlide(info)];
  const thanks = info.loiCamOn.trim();
  let thanked = false;
  for (const s of specs) {
    if (thanks && !thanked && s.kind === 'section' && isAppendix(s.title)) {
      slides.push(thanksSlide(info.loiCamOn));
      thanked = true;
    }
    const n = slides.length + 1;
    slides.push(s.kind === 'section' ? sectionSlide(s, n) : contentSlide(s, n));
  }
  if (thanks && !thanked) slides.push(thanksSlide(info.loiCamOn));
  return slides;
}

// ---------- Ghi file .pptx ----------
const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const R = Math.round;
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const font = `<a:latin typeface="${UEB.font}"/><a:ea typeface="${UEB.font}"/><a:cs typeface="${UEB.font}"/>`;
const xfrm = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${R(x)}" y="${R(y)}"/><a:ext cx="${R(w)}" cy="${R(h)}"/></a:xfrm>`;

function runXml(r: Run) {
  return `<a:r><a:rPr lang="vi-VN" sz="${R(r.sz * 100)}"${r.b ? ' b="1"' : ' b="0"'}${r.i ? ' i="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${r.color ?? UEB.ink}"/></a:solidFill>${font}</a:rPr><a:t>${esc(r.text)}</a:t></a:r>`;
}
function paraXml(p: Para) {
  const ind = p.bullet ? (p.bullet.lvl ? ` marL="685800" indent="-285750"` : ` marL="342900" indent="-342900"`) : ' marL="0" indent="0"';
  const bu = p.bullet
    ? `<a:buClr><a:srgbClr val="${p.bullet.color}"/></a:buClr><a:buSzPct val="${p.bullet.lvl ? 100 : 70}000"/><a:buFont typeface="Arial"/><a:buChar char="${esc(p.bullet.char)}"/>`
    : '<a:buNone/>';
  return `<a:p><a:pPr algn="${p.align ?? 'l'}"${ind}${p.bullet ? ` lvl="${p.bullet.lvl}"` : ''}>${p.line ? `<a:lnSpc><a:spcPct val="${p.line * 1000}"/></a:lnSpc>` : ''}<a:spcBef><a:spcPts val="${R((p.before ?? 0) * 100)}"/></a:spcBef>${bu}</a:pPr>${p.runs.map(runXml).join('')}</a:p>`;
}

function shapeXml(s: Shape, id: number, rel: Record<string, string>) {
  if (s.t === 'pic') {
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${s.img === 'logo' ? 'Logo UEB' : 'Khung'} ${id}" descr="${s.img === 'logo' ? 'Logo Trường Đại học Kinh tế - ĐHQGHN' : ''}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rel[s.img]}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(s.x, s.y, s.w, s.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  if (s.t === 'box') {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Hình ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s.x, s.y, s.w, s.h)}<a:prstGeom prst="${s.geom}"><a:avLst>${s.geom === 'roundRect' ? '<a:gd name="adj" fmla="val 6000"/>' : s.geom === 'chevron' || s.geom === 'homePlate' ? '<a:gd name="adj" fmla="val 30000"/>' : ''}</a:avLst></a:prstGeom>${s.fill ? `<a:solidFill><a:srgbClr val="${s.fill}"/></a:solidFill>` : '<a:noFill/>'}${s.line ? `<a:ln w="19050"><a:solidFill><a:srgbClr val="${s.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>'}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>`;
  }
  if (s.t === 'pie') {
    // Góc của PowerPoint tính theo chiều kim đồng hồ từ hướng 3 giờ, đơn vị 1/60000 độ.
    const ang = (d: number) => R((((d - 90) % 360) + 360) % 360 * 60000);
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Lát ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s.x, s.y, s.w, s.h)}<a:prstGeom prst="${s.a1 - s.a0 >= 359.99 ? 'ellipse' : 'pie'}"><a:avLst>${s.a1 - s.a0 >= 359.99 ? '' : `<a:gd name="adj1" fmla="val ${ang(s.a0)}"/><a:gd name="adj2" fmla="val ${ang(s.a1)}"/>`}</a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="${s.fill}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>`;
  }
  if (s.t === 'text') {
    const ph = s.title ? '<p:ph type="title"/>' : '';
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${s.title ? 'Tiêu đề' : 'Chữ'} ${id}"/><p:cNvSpPr${s.title ? '><a:spLocks noGrp="1"/></p:cNvSpPr>' : ' txBox="1"/>'}<p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(s.x, s.y, s.w, s.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${s.anchor ?? 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${s.paras.map(paraXml).join('')}</p:txBody></p:sp>`;
  }
  const cols = s.rows[0]?.length ?? 1;
  const colW = R(s.w / cols);
  const cell = (text: string, head: boolean, band: boolean) =>
    `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paraXml({ runs: [{ text, b: head, color: head ? UEB.white : UEB.ink, sz: s.sz }] })}</a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr"><a:lnL w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="${head ? UEB.teal : band ? UEB.light : 'F7F7F7'}"/></a:solidFill></a:tcPr></a:tc>`;
  const rows = s.rows.map((r, i) => `<a:tr h="${R(s.rowHs[i])}">${r.map((c) => cell(c, i === 0, i % 2 === 0)).join('')}</a:tr>`).join('');
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Bảng ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${R(s.x)}" y="${R(s.y)}"/><a:ext cx="${R(s.w)}" cy="${R(s.rowHs.reduce((a, b) => a + b, 0))}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const spTreeOpen = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function slideXml(s: SlideOut) {
  const rel = { logo: 'rId2', khung: '' };
  return `${XML}<p:sld ${NS}><p:cSld><p:spTree>${spTreeOpen}${s.shapes.map((sh, i) => shapeXml(sh, i + 2, rel)).join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="UEB"><a:themeElements><a:clrScheme name="UEB"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="${UEB.teal}"/></a:dk2><a:lt2><a:srgbClr val="${UEB.light}"/></a:lt2><a:accent1><a:srgbClr val="${UEB.red}"/></a:accent1><a:accent2><a:srgbClr val="${UEB.teal}"/></a:accent2><a:accent3><a:srgbClr val="${UEB.green}"/></a:accent3><a:accent4><a:srgbClr val="BFD6D6"/></a:accent4><a:accent5><a:srgbClr val="${UEB.gray}"/></a:accent5><a:accent6><a:srgbClr val="F7EAEA"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="UEB"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="UEB"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const lvl = (sz: number, color: string, b = false) => `<a:lvl1pPr algn="l"><a:defRPr sz="${sz}" b="${b ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${font}</a:defRPr></a:lvl1pPr>`;
const TITLE_PH = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Tiêu đề"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(MX, 841248, CW, 868680)}</p:spPr><p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="vi-VN"/><a:t>Tiêu đề</a:t></a:r></a:p></p:txBody></p:sp>`;

const MASTER = `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${spTreeOpen}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Khung UEB" descr=""/><p:cNvPicPr><a:picLocks noGrp="1" noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(0, 4691, W, 6960479)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>${TITLE_PH}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${lvl(2600, UEB.green, true)}</p:titleStyle><p:bodyStyle>${lvl(2000, UEB.ink)}</p:bodyStyle><p:otherStyle>${lvl(1800, UEB.ink)}</p:otherStyle></p:txStyles></p:sldMaster>`;

const LAYOUT = `${XML}<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="UEB - Tiêu đề"><p:spTree>${spTreeOpen}${TITLE_PH}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

const relsXml = (items: [string, string, string][]) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/${type}" Target="${target}"/>`).join('')}</Relationships>`;
const OD = 'officeDocument/2006/relationships/';

export async function buildDeckPptx(slides: SlideOut[], images: { khung: Uint8Array; logo: Uint8Array }, title: string, author: string): Promise<Uint8Array> {
  const n = slides.length;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files: [string, string | Uint8Array][] = [
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', relsXml([['rId1', `${OD}officeDocument`, 'ppt/presentation.xml'], ['rId2', 'package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['rId3', `${OD}extended-properties`, 'docProps/app.xml']])],
    ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`],
    ['docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>UEB - Soạn thảo</Application><Slides>${n}</Slides></Properties>`],
    ['ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle>${lvl(1800, UEB.ink)}</p:defaultTextStyle></p:presentation>`],
    ['ppt/_rels/presentation.xml.rels', relsXml([
      ['rId1', `${OD}slideMaster`, 'slideMasters/slideMaster1.xml'],
      ['rId2', `${OD}theme`, 'theme/theme1.xml'],
      ['rId3', `${OD}presProps`, 'presProps.xml'],
      ['rId4', `${OD}viewProps`, 'viewProps.xml'],
      ['rId5', `${OD}tableStyles`, 'tableStyles.xml'],
      ...slides.map((_, i) => [`rId${10 + i}`, `${OD}slide`, `slides/slide${i + 1}.xml`] as [string, string, string]),
    ])],
    ['ppt/presProps.xml', `${XML}<p:presentationPr ${NS}/>`],
    ['ppt/viewProps.xml', `${XML}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`],
    ['ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`],
    ['ppt/theme/theme1.xml', THEME],
    ['ppt/slideMasters/slideMaster1.xml', MASTER],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([['rId1', `${OD}slideLayout`, '../slideLayouts/slideLayout1.xml'], ['rId2', `${OD}theme`, '../theme/theme1.xml'], ['rId3', `${OD}image`, '../media/khung.png']])],
    ['ppt/slideLayouts/slideLayout1.xml', LAYOUT],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([['rId1', `${OD}slideMaster`, '../slideMasters/slideMaster1.xml']])],
    ['ppt/media/khung.png', images.khung],
    ['ppt/media/logo.png', images.logo],
  ];
  slides.forEach((s, i) => {
    files.push([`ppt/slides/slide${i + 1}.xml`, slideXml(s)]);
    files.push([`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml([['rId1', `${OD}slideLayout`, '../slideLayouts/slideLayout1.xml'], ['rId2', `${OD}image`, '../media/logo.png']])]);
  });
  return writeZip(await Promise.all(files.map(([name, data]) => makeEntry(name, data))));
}

// Mẫu chèn nhanh từng loại trang (nút "Thêm trang" trên giao diện).
export const SNIPPETS: { key: string; label: string; text: string }[] = [
  { key: 'phan', label: 'Chuyển phần', text: '## Tên phần' },
  { key: 'noi-dung', label: 'Nội dung', text: '# Tiêu đề trang\n- Ý chính thứ nhất\n  - Ý phụ\n- Ý chính thứ hai\n! Câu chốt cuối trang' },
  { key: 'the', label: 'Thẻ (2-4 cột)', text: '# So sánh hai phương án\n### Phương án A\n- Ưu điểm\n- Nhược điểm\n### Phương án B\n- Ưu điểm\n- Nhược điểm' },
  { key: 'bang', label: 'Bảng', text: '# Bảng so sánh\n| Tiêu chí | Cột 1 | Cột 2 |\n| Dòng 1 | ... | ... |\n| Dòng 2 | ... | ... |' },
  { key: 'cot', label: 'Biểu đồ cột', text: '# Vốn FDI 9 tháng năm 2026\n:: bieu-do-cot Đơn vị: tỷ USD. Nguồn: Cục Thống kê\n- Đăng ký: 50,4\n- Thực hiện: 21,1 *\n- Chế biến, chế tạo: 17,4\nĐăng ký là cam kết, thực hiện mới là vốn đã giải ngân.' },
  { key: 'ngang', label: 'Biểu đồ thanh', text: '# Đối tác đầu tư lớn nhất\n:: bieu-do-ngang Đơn vị: tỷ USD\n- Singapore: 7,6 *\n- Hàn Quốc: 4,1\n- Trung Quốc: 3,8\n- Nhật Bản: 2,9' },
  { key: 'tron', label: 'Biểu đồ tròn', text: '# Cơ cấu vốn theo ngành\n:: bieu-do-tron\n- Chế biến, chế tạo: 64\n- Bất động sản: 18\n- Năng lượng: 9\n- Khác: 9' },
  { key: 'quy-trinh', label: 'Sơ đồ quy trình', text: '# Quy trình cấp phép dự án\n:: quy-trinh\n- Đề xuất: nhà đầu tư nộp hồ sơ\n- Thẩm định: cơ quan chuyên môn xem xét\n- Chấp thuận *: cấp chủ trương đầu tư\n- Triển khai: xây dựng, vận hành' },
  { key: 'so-lieu', label: 'Số liệu nổi bật', text: '# Những con số đáng chú ý\n:: so-lieu\n- 50,4 tỷ USD | vốn đăng ký 9 tháng\n- 21,1 tỷ USD * | vốn thực hiện, cao nhất 5 năm\n- 10.000 | việc làm mới trong 3 năm' },
  { key: 'cau-hoi', label: 'Câu hỏi lựa chọn', text: '# Bạn có ký không?\n:: cau-hoi\nDỰ ÁN X\nMột tập đoàn điện tử đề xuất đầu tư 1 tỷ USD, đổi lại miễn thuế 4 năm.\n- Ký ngay\n- Ký, nhưng kèm điều kiện\n- Cần thêm thông tin' },
  { key: 'thoi-gian', label: 'Dòng thời gian', text: '# Các mốc chính sách\n:: dong-thoi-gian\n- 1987: Luật Đầu tư nước ngoài đầu tiên\n- 2005: Luật Đầu tư chung\n- 2014: Luật Đầu tư sửa đổi\n- 2020 *: Luật Đầu tư hiện hành' },
  { key: 'muc-tieu', label: 'Danh sách đánh số', text: '# Mục tiêu buổi học\n:: danh-sach-so\nKẾT THÚC BUỔI HỌC, CÁC EM CÓ THỂ\n- Định nghĩa: FDI và phân biệt với đầu tư gián tiếp\n- Giải thích: FDI thúc đẩy phát triển như thế nào\n- Đánh giá: một dự án thực tế bằng bằng chứng' },
  { key: 'trich-dan', label: 'Trích dẫn', text: '# Một câu để nhớ\n:: trich-dan\nCâu hỏi không phải là có bao nhiêu vốn vào, mà là bao nhiêu năng lực ở lại.\n— Ghi chú bài giảng' },
];

export const SAMPLE_OUTLINE = [
  `# Nội dung buổi học
:: danh-sach-so
BỐN PHẦN CHÍNH
- Khái niệm: FDI là gì, phân loại ra sao
- Số liệu: FDI vào Việt Nam qua các con số
- Tác động: lợi ích, rủi ro và bằng chứng
- Chính sách: ưu đãi, sàng lọc và bài học`,
  SNIPPETS.find((x) => x.key === 'muc-tieu')!.text,
  '## Khái niệm FDI',
  `# FDI là gì?
- Đầu tư trực tiếp nước ngoài: nhà đầu tư nắm quyền kiểm soát hoặc ảnh hưởng đáng kể tới doanh nghiệp ở nước khác
  - Chuẩn quốc tế (IMF BPM6, OECD BD4): sở hữu từ 10% quyền biểu quyết
  - Luật Đầu tư 2020: thành lập tổ chức kinh tế, góp vốn, mua cổ phần, hợp đồng BCC
- Khác với đầu tư gián tiếp (FPI): chỉ hưởng cổ tức, không tham gia quản lý
! FDI là về ảnh hưởng, không chỉ là dòng tiền qua biên giới.`,
  `# Phân biệt FDI và đầu tư gián tiếp
| Tiêu chí | FDI | Đầu tư gián tiếp (FPI) |
| Tỷ lệ sở hữu | Từ 10% trở lên | Dưới 10% |
| Quyền quản lý | Tham gia điều hành | Không tham gia |
| Thời hạn | Dài hạn | Ngắn, trung hạn |
| Khả năng rút vốn | Khó, chậm | Dễ, nhanh |
| Ví dụ | Samsung xây nhà máy | Quỹ mua cổ phiếu niêm yết |`,
  `# Bốn cách phân loại dự án FDI
### Hình thức vào
- Xây mới (greenfield)
- Mua lại, sáp nhập (M&A)
### Động cơ
- Tìm thị trường, tìm hiệu quả, tìm tài nguyên
### Chuỗi giá trị
- Theo chiều ngang hoặc chiều dọc
### Ngành và đối tác
- Chế tạo, năng lượng, bất động sản, dịch vụ`,
  SNIPPETS.find((x) => x.key === 'cau-hoi')!.text,
  '## Số liệu FDI vào Việt Nam',
  SNIPPETS.find((x) => x.key === 'so-lieu')!.text,
  SNIPPETS.find((x) => x.key === 'cot')!.text,
  SNIPPETS.find((x) => x.key === 'ngang')!.text,
  SNIPPETS.find((x) => x.key === 'tron')!.text,
  `# FDI theo vùng kinh tế
| Vùng | Số dự án mới | Vốn đăng ký (tỷ USD) | Tỷ trọng |
| Đồng bằng sông Hồng | 1.250 | 18,6 | 37% |
| Đông Nam Bộ | 1.410 | 15,2 | 30% |
| Bắc Trung Bộ, Duyên hải miền Trung | 380 | 7,9 | 16% |
| Các vùng còn lại | 290 | 8,7 | 17% |
! Hai vùng kinh tế trọng điểm thu hút gần 70% vốn đăng ký. (Số liệu minh họa)`,
  '## Tác động của FDI',
  `# Lợi ích và rủi ro
### Lợi ích
- Bổ sung vốn, tạo việc làm
- Chuyển giao công nghệ, kỹ năng quản lý
- Mở rộng xuất khẩu
### Rủi ro
- Chuyển giá, ưu đãi thuế quá mức
- Ô nhiễm môi trường
- Phụ thuộc vào doanh nghiệp nước ngoài`,
  `# Ba kênh dòng vốn
| | FDI | Đầu tư gián tiếp | Vay thương mại |
| Ai chịu rủi ro? | Nhà đầu tư | Nhà đầu tư | Bên vay |
| Rút nhanh được không? | Khó | Dễ | Theo kỳ hạn |
| Chi phí về sau | Lợi nhuận chuyển về | Cổ tức | Lãi vay |`,
  `# Lan tỏa công nghệ diễn ra thế nào?
:: quy-trinh
- Liên kết: doanh nghiệp trong nước làm nhà cung ứng
- Học hỏi: tiếp nhận tiêu chuẩn, quy trình
- Dịch chuyển lao động *: kỹ sư chuyển sang doanh nghiệp nội
- Nâng cấp: tự sản xuất linh kiện giá trị cao`,
  '## Chính sách thu hút FDI',
  SNIPPETS.find((x) => x.key === 'thoi-gian')!.text,
  `# Ưu đãi đầu tư theo Luật Đầu tư 2020
| Hình thức ưu đãi | Nội dung | Áp dụng |
| Thuế thu nhập doanh nghiệp | Thuế suất thấp, miễn, giảm có thời hạn | Ngành, địa bàn ưu đãi |
| Thuế nhập khẩu | Miễn thuế hàng hóa tạo tài sản cố định | Dự án ưu đãi đầu tư |
| Tiền thuê đất | Miễn, giảm tiền thuê đất | Địa bàn khó khăn |
| Khấu hao | Khấu hao nhanh, tăng chi phí được trừ | Dự án quy mô lớn |`,
  SNIPPETS.find((x) => x.key === 'quy-trinh')!.text,
  SNIPPETS.find((x) => x.key === 'trich-dan')!.text,
  '## Tổng kết và bài tập',
  `# Tóm tắt bài học
:: danh-sach-so
BA ĐIỀU CẦN NHỚ
- FDI gắn với quyền kiểm soát: từ 10% quyền biểu quyết
- Tác động phụ thuộc liên kết: lan tỏa chỉ xảy ra khi doanh nghiệp trong nước đủ năng lực
- Chính sách cần sàng lọc: ưu đãi gắn với cam kết công nghệ, việc làm`,
  `# Thảo luận nhóm
### Nhóm 1, 2
- Đánh giá một dự án FDI lớn tại địa phương em
### Nhóm 3, 4
- Đề xuất điều kiện kèm ưu đãi cho dự án công nghệ cao
! Mỗi nhóm trình bày 5 phút vào buổi sau.`,
  `# Bài tập và tài liệu đọc
| Nội dung | Yêu cầu | Hạn nộp |
| Bài tập cá nhân | Phân tích số liệu FDI một ngành (2 trang) | Tuần 7 |
| Bài tập nhóm | Báo cáo đánh giá một dự án FDI | Tuần 9 |
| Đọc trước | Giáo trình Chương 6; UNCTAD World Investment Report | Buổi sau |`,
].join('\n\n') + '\n';

// Template báo cáo bảo vệ, nghiệm thu đề tài khoa học, kèm phần phụ lục (trang cảm ơn tự đặt trước phụ lục).
export const SAMPLE_DEFENSE = [
  `# Nội dung trình bày
:: danh-sach-so
BÁO CÁO GỒM SÁU PHẦN
- Giới thiệu: tính cấp thiết, mục tiêu, câu hỏi nghiên cứu
- Tổng quan: các nghiên cứu liên quan và khoảng trống
- Phương pháp: khung phân tích, dữ liệu, mô hình
- Kết quả: phát hiện chính
- Kết luận: đóng góp, kiến nghị, hạn chế
- Sản phẩm: kết quả đã đạt so với đăng ký`,
  '## Giới thiệu',
  `# Tính cấp thiết của đề tài
- Bối cảnh: chuyển đổi số là ưu tiên của Chính phủ giai đoạn 2021-2030
- Thực tiễn: doanh nghiệp nhỏ và vừa chiếm 97% số doanh nghiệp nhưng mức độ số hóa thấp
- Lý luận: chưa có bằng chứng định lượng về tác động tới năng suất tại Việt Nam
! Đề tài cung cấp bằng chứng cho chính sách hỗ trợ chuyển đổi số.`,
  `# Mục tiêu và câu hỏi nghiên cứu
### Mục tiêu tổng quát
- Đánh giá tác động của chuyển đổi số tới năng suất doanh nghiệp nhỏ và vừa
### Mục tiêu cụ thể
- Đo lường mức độ chuyển đổi số
- Ước lượng tác động
- Đề xuất giải pháp
### Câu hỏi nghiên cứu
- Mức độ ra sao? Tác động thế nào? Cần chính sách gì?`,
  `# Đối tượng và phạm vi nghiên cứu
| Nội dung | Phạm vi |
| Đối tượng | Chuyển đổi số và năng suất của doanh nghiệp nhỏ và vừa |
| Không gian | 63 tỉnh, thành phố; trọng tâm Hà Nội, TP. Hồ Chí Minh |
| Thời gian | Dữ liệu 2019-2025; đề xuất đến năm 2030 |
| Nội dung | Mức độ, tác động, rào cản và giải pháp |`,
  '## Tổng quan nghiên cứu',
  `# Tổng quan và khoảng trống
### Nghiên cứu quốc tế
- Bằng chứng tác động năng suất
- Vai trò kỹ năng số
### Nghiên cứu trong nước
- Chủ yếu khảo sát mô tả
- Thiếu dữ liệu bảng
### Khoảng trống
- Chưa ước lượng tác động nhân quả
- Chưa so sánh theo quy mô`,
  '## Phương pháp nghiên cứu',
  `# Khung phân tích
:: quy-trinh
- Lý thuyết: năng suất, nguồn lực, đổi mới
- Dữ liệu: điều tra doanh nghiệp, khảo sát bổ sung
- Mô hình *: tác động cố định, biến công cụ
- Kiểm định: độ vững, nhóm ngành`,
  `# Dữ liệu sử dụng
| Nguồn | Mô tả | Quy mô |
| Điều tra doanh nghiệp | Dữ liệu bảng 2019-2025 | 3.214 doanh nghiệp |
| Khảo sát của nhóm | Bảng hỏi 42 câu | 480 phiếu hợp lệ |
| Phỏng vấn sâu | Lãnh đạo doanh nghiệp, cơ quan quản lý | 24 người |`,
  `# Mẫu nghiên cứu
:: so-lieu
- 3.214 | doanh nghiệp trong mẫu
- 480 * | phiếu khảo sát hợp lệ
- 24 | cuộc phỏng vấn sâu`,
  '## Kết quả nghiên cứu',
  `# Mức độ chuyển đổi số theo quy mô
:: bieu-do-cot Điểm chỉ số (0-100). Nguồn: tính toán của nhóm nghiên cứu
- Siêu nhỏ: 28
- Nhỏ: 41
- Vừa: 57 *
- Lớn: 72`,
  `# Kết quả ước lượng chính
| Biến | Hệ số | Sai số chuẩn | Ý nghĩa |
| Chỉ số chuyển đổi số | 0,183 | 0,041 | *** |
| Quy mô (log lao động) | 0,094 | 0,022 | *** |
| Tuổi doanh nghiệp | -0,012 | 0,008 | |
| Số quan sát | 18.420 | | |
! Tăng 10 điểm chỉ số chuyển đổi số gắn với năng suất cao hơn khoảng 1,8%.`,
  `# Rào cản lớn nhất
:: bieu-do-ngang Tỷ lệ doanh nghiệp lựa chọn (%)
- Thiếu nhân lực số: 62 *
- Chi phí đầu tư: 55
- Thiếu thông tin giải pháp: 38
- An toàn dữ liệu: 27`,
  '## Kết luận và kiến nghị',
  `# Đóng góp của đề tài
### Về khoa học
- Bộ chỉ số đo lường chuyển đổi số cấp doanh nghiệp
- Bằng chứng tác động nhân quả
### Về thực tiễn
- Cơ sở cho chương trình hỗ trợ doanh nghiệp
- Bộ công cụ tự đánh giá cho doanh nghiệp`,
  `# Kiến nghị
:: danh-sach-so
BA NHÓM GIẢI PHÁP
- Nhân lực: đào tạo kỹ năng số theo nhu cầu doanh nghiệp
- Tài chính: gói tín dụng ưu đãi cho đầu tư công nghệ
- Thông tin: cổng kết nối doanh nghiệp với nhà cung cấp giải pháp`,
  `# Hạn chế và hướng nghiên cứu tiếp
### Hạn chế
- Dữ liệu tự báo cáo
- Chưa đo được chất lượng công nghệ
### Hướng tiếp theo
- Nghiên cứu theo ngành
- Đánh giá tác động chính sách`,
  '## Sản phẩm của đề tài',
  `# Sản phẩm đã đạt so với đăng ký
| Sản phẩm | Đăng ký | Đạt được | Ghi chú |
| Báo cáo tổng hợp | 01 | 01 | |
| Bài báo tạp chí trong nước | 02 | 03 | Vượt 01 bài |
| Bài báo quốc tế (Scopus) | 01 | 01 | Đã chấp nhận đăng |
| Hỗ trợ đào tạo thạc sĩ | 01 | 02 | |`,
  `# Tiến độ thực hiện
:: dong-thoi-gian
- T1-T2: Tổng quan, hoàn thiện đề cương
- T3-T6: Khảo sát, thu thập dữ liệu
- T7-T10: Phân tích, viết chuyên đề
- T11-T12 *: Hoàn thiện báo cáo, nghiệm thu`,
  '## Phụ lục',
  `# Phụ lục 1. Biến số và thang đo
| Biến | Đo lường | Nguồn |
| Năng suất lao động | Log doanh thu / lao động | Điều tra doanh nghiệp |
| Chỉ số chuyển đổi số | Trung bình 5 trụ cột (0-100) | Khảo sát của nhóm |
| Quy mô | Log số lao động | Điều tra doanh nghiệp |
| Tuổi doanh nghiệp | Số năm từ khi thành lập | Điều tra doanh nghiệp |`,
  `# Phụ lục 2. Kiểm định độ vững
| Mô hình | Hệ số chuyển đổi số | Sai số chuẩn | Số quan sát |
| Cơ sở (FE) | 0,183 | 0,041 | 18.420 |
| Biến công cụ (IV) | 0,201 | 0,067 | 18.420 |
| Loại bỏ doanh nghiệp lớn | 0,176 | 0,045 | 16.902 |
| Chỉ ngành chế biến | 0,214 | 0,058 | 7.315 |`,
  `# Phụ lục 3. Danh mục công bố
- Bài báo 1: Tên tác giả (2026), Tên bài, Tạp chí Kinh tế và Phát triển, số …
- Bài báo 2: Tên tác giả (2026), Tên bài, VNU Journal of Economics and Business, …
- Bài báo 3: Tên tác giả (2026), Tên bài, Journal …, Scopus Q2 (đã chấp nhận đăng)`,
].join('\n\n') + '\n';

// Template báo cáo hội thảo khoa học: đặt vấn đề, phương pháp, kết quả, kết luận.
export const SAMPLE_CONFERENCE = [
  '## Đặt vấn đề',
  `# Câu hỏi nghiên cứu
:: danh-sach-so
BÀI VIẾT TRẢ LỜI BA CÂU HỎI
- Thực trạng: chuyển đổi số của doanh nghiệp nhỏ và vừa đang ở đâu?
- Tác động: chuyển đổi số ảnh hưởng thế nào tới năng suất?
- Chính sách: cần hỗ trợ gì để lan tỏa?`,
  `# Tổng quan nghiên cứu
### Nghiên cứu quốc tế
- Bằng chứng về tác động năng suất
- Vai trò của kỹ năng số
### Nghiên cứu tại Việt Nam
- Chủ yếu là khảo sát mô tả
- Thiếu dữ liệu bảng
### Khoảng trống
- Chưa ước lượng tác động nhân quả
! Bài viết lấp khoảng trống bằng dữ liệu bảng 2019-2025.`,
  '## Dữ liệu và phương pháp',
  `# Khung phân tích
:: quy-trinh
- Dữ liệu: điều tra doanh nghiệp 2019-2025
- Biến số: chỉ số chuyển đổi số, năng suất lao động
- Mô hình *: hồi quy tác động cố định, biến công cụ
- Kiểm định: độ vững, nhóm ngành`,
  `# Mẫu nghiên cứu
:: so-lieu
- 3.214 | doanh nghiệp trong mẫu
- 7 năm | dữ liệu bảng 2019-2025
- 18 ngành * | chế biến, dịch vụ, thương mại`,
  '## Kết quả',
  `# Mức độ chuyển đổi số theo quy mô
:: bieu-do-cot Điểm chỉ số (0-100). Nguồn: tính toán của tác giả
- Siêu nhỏ: 28
- Nhỏ: 41
- Vừa: 57 *
- Lớn: 72`,
  `# Kết quả hồi quy chính
| Biến | Hệ số | Sai số chuẩn | Ý nghĩa |
| Chỉ số chuyển đổi số | 0,183 | 0,041 | *** |
| Quy mô (log lao động) | 0,094 | 0,022 | *** |
| Tuổi doanh nghiệp | -0,012 | 0,008 | |
! Tăng 10 điểm chỉ số chuyển đổi số gắn với năng suất cao hơn khoảng 1,8%.`,
  `# Rào cản lớn nhất
:: bieu-do-ngang Tỷ lệ doanh nghiệp lựa chọn (%)
- Thiếu nhân lực số: 62 *
- Chi phí đầu tư: 55
- Thiếu thông tin giải pháp: 38
- An toàn dữ liệu: 27`,
  '## Kết luận',
  `# Kết luận và hàm ý chính sách
### Kết luận
- Chuyển đổi số có tác động dương, có ý nghĩa thống kê
- Tác động lớn hơn ở doanh nghiệp vừa
### Hàm ý chính sách
- Hỗ trợ đào tạo kỹ năng số
- Gói tín dụng cho đầu tư công nghệ`,
].join('\n\n') + '\n';
