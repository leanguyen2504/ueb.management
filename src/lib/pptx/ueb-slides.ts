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
};

// ---------- Phân tích dàn ý ----------
type Bullet = { text: string; lvl: number; plain: boolean };
type Card = { title: string; items: Bullet[] };
export type SlideSpec =
  | { kind: 'section'; no: number; title: string }
  | { kind: 'content'; kicker: string; title: string; items: Bullet[]; cards: Card[]; table: string[][]; note: string };

/**
 * Cú pháp dàn ý (mỗi dòng một ý):
 *   ## Tên phần         → trang chuyển phần (PHẦN 1, PHẦN 2…), tên phần thành nhãn đỏ các trang sau
 *   # Tiêu đề trang     → trang nội dung mới
 *   - ý chính / ␣␣- ý phụ (thụt 2 dấu cách hoặc tab), dòng thường là đoạn không gạch đầu dòng
 *   ### Tên thẻ         → khối thẻ (2-4 thẻ một hàng), các ý bên dưới thuộc thẻ đó
 *   | cột | cột |       → bảng, dòng đầu là tiêu đề cột
 *   ! câu chốt          → dòng nhấn mạnh màu đỏ cuối trang
 *   @ NHÃN              → đổi nhãn đỏ nhỏ phía trên tiêu đề của trang này
 */
export function parseOutline(src: string): SlideSpec[] {
  const out: SlideSpec[] = [];
  let section = '';
  let sectionNo = 0;
  let cur: Extract<SlideSpec, { kind: 'content' }> | null = null;
  let card: Card | null = null;
  const ensure = () => {
    if (!cur) {
      cur = { kind: 'content', kicker: section.toUpperCase(), title: '', items: [], cards: [], table: [], note: '' };
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
  | { t: 'box'; geom: 'rect' | 'roundRect'; fill: string; x: number; y: number; w: number; h: number }
  | { t: 'text'; x: number; y: number; w: number; h: number; anchor?: 't' | 'ctr' | 'b'; paras: Para[]; title?: boolean }
  | { t: 'table'; x: number; y: number; w: number; rows: string[][]; sz: number; rowHs: number[] };
export type SlideOut = { shapes: Shape[] };

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
  const info = ([['Giảng viên:', d.giangVien], ['Điện thoại:', d.dienThoai], ['Email:', d.email]] as const).filter(([, v]) => v.trim());
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
      { t: 'text', x: MX, y: 2452078, w: CW, h: 477300, paras: [{ align: 'ctr', runs: [{ text: `PHẦN ${s.no}`, b: true, color: UEB.red, sz: 28 }] }] },
      { t: 'text', title: true, x: MX, y: 3050000, w: CW, h: 1700000, anchor: 't', paras: [{ align: 'ctr', line: 95, runs: [{ text: s.title || `Phần ${s.no}`, b: true, color: UEB.green, sz: tsz }] }] },
      numShape(n),
    ],
  };
}

function contentSlide(s: Extract<SlideSpec, { kind: 'content' }>, n: number): SlideOut {
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

export function layoutDeck(info: DeckInfo, specs: SlideSpec[]): SlideOut[] {
  const slides: SlideOut[] = [titleSlide(info)];
  for (const s of specs) {
    const n = slides.length + 1;
    slides.push(s.kind === 'section' ? sectionSlide(s, n) : contentSlide(s, n));
  }
  if (info.loiCamOn.trim()) slides.push(thanksSlide(info.loiCamOn));
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
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Hình ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s.x, s.y, s.w, s.h)}<a:prstGeom prst="${s.geom}"><a:avLst>${s.geom === 'roundRect' ? '<a:gd name="adj" fmla="val 6000"/>' : ''}</a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="${s.fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="vi-VN"/></a:p></p:txBody></p:sp>`;
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

export const SAMPLE_OUTLINE = `## Khái niệm FDI
# FDI là gì?
- Đầu tư trực tiếp nước ngoài: nhà đầu tư nắm quyền kiểm soát hoặc ảnh hưởng đáng kể tới doanh nghiệp ở nước khác
  - Chuẩn quốc tế (IMF BPM6, OECD BD4): sở hữu từ 10% quyền biểu quyết
  - Luật Đầu tư 2020: thành lập tổ chức kinh tế, góp vốn, mua cổ phần, hợp đồng BCC
- Khác với đầu tư gián tiếp (FPI): chỉ hưởng cổ tức, không tham gia quản lý
! FDI là về ảnh hưởng, không chỉ là dòng tiền qua biên giới.

# Bốn cách phân loại dự án FDI
### Hình thức vào
- Xây mới (greenfield)
- Mua lại, sáp nhập (M&A)
### Động cơ
- Tìm thị trường, tìm hiệu quả, tìm tài nguyên
### Chuỗi giá trị
- Theo chiều ngang hoặc chiều dọc
### Ngành và đối tác
- Chế tạo, năng lượng, bất động sản, dịch vụ

## Tác động của FDI
# Ba kênh dòng vốn FDI
| | FDI | Đầu tư gián tiếp | Vay thương mại |
| Ai chịu rủi ro? | Nhà đầu tư | Nhà đầu tư | Bên vay |
| Rút nhanh được không? | Khó | Dễ | Theo kỳ hạn |
| Chi phí về sau | Lợi nhuận chuyển về | Cổ tức | Lãi vay |
`;
