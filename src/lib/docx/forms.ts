// Biểu mẫu Word (.docx) dùng chung cho thẻ Template: mỗi mẫu khai báo các ô cần điền và cách dựng văn bản.
// Trình bày theo Nghị định 30/2020/NĐ-CP: A4, Times New Roman, lề 20-20-30-15 mm.
import { encode } from './xml';
import { packDocx } from './template';
import { numberToWords, vnd } from '@/lib/xlsx/budget';

// ---------- Khai báo ô nhập ----------
export type Col = { k: string; label: string; w: number; type?: 'text' | 'money' | 'number' };
export type Field =
  | { k: string; label: string; type?: 'text' | 'textarea' | 'date' | 'money' | 'number'; ph?: string; def?: string; wide?: boolean; me?: boolean; rows?: number }
  | { k: string; label: string; type: 'select'; options: string[]; def?: string; wide?: boolean }
  | { k: string; label: string; type: 'checks'; options: string[]; def?: string; wide?: boolean } // giá trị: các lựa chọn, mỗi dòng một
  | { k: string; label: string; type: 'rows'; cols: Col[]; def?: string[][]; sum?: string; note?: string };
export type Values = Record<string, string | string[][]>;
export type FormDef = {
  key: string;
  label: string;
  group: 'Tài chính' | 'Hành chính' | 'Giảng dạy, nghiên cứu';
  note: string;
  fields: Field[];
  file: (v: Values) => string;
  body: (v: Values) => string;
  build?: (v: Values) => Promise<Uint8Array>; // dựng từ file mẫu gốc thay cho body
  original?: { href: string; label: string };
};

// ---------- Dựng XML ----------
const F = 'Times New Roman';
const TSZ = 28; // chữ trong bảng cùng cỡ với thân văn bản (14)
const TW = 9354; // bề rộng vùng chữ (twip) với lề trái 30 mm, phải 15 mm
type R = { b?: boolean; i?: boolean; u?: boolean; sz?: number };
const run = (t: string, o: R = {}) =>
  t.split('\n').map((line, n) => `<w:r><w:rPr><w:rFonts w:ascii="${F}" w:hAnsi="${F}" w:cs="${F}" w:eastAsia="${F}"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${o.sz ?? 28}"/><w:szCs w:val="${o.sz ?? 28}"/></w:rPr>${n ? '<w:br/>' : ''}<w:t xml:space="preserve">${encode(line)}</w:t></w:r>`).join('');
type P = R & { jc?: 'left' | 'center' | 'right' | 'both'; before?: number; after?: number; first?: number; left?: number; keep?: boolean; line?: number };
const pPr = (o: P) => `<w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}" w:line="${o.line ?? 276}" w:lineRule="auto"/>${o.first || o.left ? `<w:ind${o.left ? ` w:left="${o.left}"` : ''}${o.first ? ` w:firstLine="${o.first}"` : ''}/>` : ''}<w:jc w:val="${o.jc ?? 'both'}"/></w:pPr>`;
export const P = (t: string, o: P = {}) => `<w:p>${pPr(o)}${t ? run(t, o) : ''}</w:p>`;
// Đoạn gồm nhiều đoạn chữ có kiểu khác nhau.
export const PR = (parts: [string, R?][], o: P = {}) => `<w:p>${pPr(o)}${parts.map(([t, r]) => run(t, { sz: o.sz, ...r })).join('')}</w:p>`;
const rule = (indent: number) => `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="120" w:line="120" w:lineRule="exact"/><w:ind w:left="${indent}" w:right="${indent}"/><w:jc w:val="center"/></w:pPr></w:p>`;
const NB = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
const B1 = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:color="000000"/></w:tblBorders>';
const tc = (w: number, inner: string, extra = '') => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${extra}<w:vAlign w:val="center"/></w:tcPr>${inner || '<w:p/>'}</w:tc>`;
// Bảng không viền (bố cục 2-4 cột), mỗi ô là chuỗi XML đoạn văn.
export const layout = (cells: [number, string][], keep = false) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${cells.reduce((a, c) => a + c[0], 0)}" w:type="dxa"/><w:tblInd w:w="-108" w:type="dxa"/>${NB}<w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${cells.map((c) => `<w:gridCol w:w="${c[0]}"/>`).join('')}</w:tblGrid><w:tr>${keep ? '<w:trPr><w:cantSplit/></w:trPr>' : ''}${cells.map(([w, x]) => tc(w, x)).join('')}</w:tr></w:tbl>`;

const parseMoney = (s: string) => Number(String(s).replace(/[^\d-]/g, '')) || 0;
const fmtCell = (c: Col, v: string) => (c.type === 'money' ? (parseMoney(v) ? vnd(parseMoney(v)) : '') : v);
// Bảng có viền: tiêu đề cột đậm, nền xám; tùy chọn dòng tổng.
export function grid(cols: Col[], rows: string[][], o: { sum?: string; minRows?: number; sz?: number; stt?: boolean } = {}) {
  const sz = o.sz ?? TSZ;
  const all = o.stt === false ? cols : [{ k: '_stt', label: 'TT', w: 600 } as Col, ...cols];
  const total = all.reduce((a, c) => a + c.w, 0);
  const scale = TW / total;
  const ws = all.map((c) => Math.round(c.w * scale));
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${all.map((c, i) => tc(ws[i], P(c.label, { b: true, sz, jc: 'center', after: 0, line: 240 }))).join('')}</w:tr>`;
  const filled = rows.filter((r) => r.some((x) => String(x ?? '').trim()));
  const body = [...filled, ...Array(Math.max(0, (o.minRows ?? 2) - filled.length)).fill(cols.map(() => ''))];
  const tr = body.map((r, ri) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="400"/></w:trPr>${all.map((c, i) => {
    const v = c.k === '_stt' ? (filled[ri] ? String(ri + 1) : '') : fmtCell(c, String(r[i - (o.stt === false ? 0 : 1)] ?? ''));
    return tc(ws[i], P(v, { sz, jc: c.k === '_stt' ? 'center' : c.type === 'money' || c.type === 'number' ? 'right' : 'left', after: 0, line: 240 }));
  }).join('')}</w:tr>`).join('');
  let sum = '';
  if (o.sum) {
    const si = cols.findIndex((c) => c.k === o.sum);
    const t = filled.reduce((a, r) => a + parseMoney(r[si] ?? ''), 0);
    const span = all.findIndex((c) => c.k === o.sum);
    sum = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(ws.slice(0, span).reduce((a, b) => a + b, 0), P('Tổng cộng', { b: true, sz, jc: 'center', after: 0 }), `<w:gridSpan w:val="${span}"/>`)}${tc(ws[span], P(t ? vnd(t) : '', { b: true, sz, jc: 'right', after: 0 }))}${all.slice(span + 1).map((_, k) => tc(ws[span + 1 + k], '')).join('')}</w:tr>`;
  }
  return `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${B1}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${tr}${sum}</w:tbl>${P('', { after: 60 })}`;
}

// ---------- Khối dùng chung ----------
const S = (v: Values, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const RW = (v: Values, k: string) => (Array.isArray(v[k]) ? (v[k] as string[][]) : []);
export const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const dots = '……………………………………………';
// "Nhãn: giá trị" (để trống thì in dấu chấm để điền tay).
const kv = (label: string, value: string, o: P = {}) => PR([[`${label}: `, {}], [value || dots, value ? {} : {}]], { after: 60, ...o });

const kvS = (label: string, value: string) => kv(label, value || dots.slice(0, 9));

export function dateLine(place: string, iso: string) {
  const p = place.trim() || 'Hà Nội';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${p}, ngày      tháng      năm ${new Date().getFullYear()}`;
  const [y, m, d] = iso.split('-').map(Number);
  return `${p}, ngày ${String(d).padStart(2, '0')} tháng ${m <= 2 ? String(m).padStart(2, '0') : m} năm ${y}`;
}
const vnDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '…/…/……');

// Phần đầu văn bản của đơn vị: cơ quan (trái) và Quốc hiệu (phải).
function orgHeader(v: Values, extraLeft = '') {
  const left = [
    P(S(v, 'chuQuan').toUpperCase() || 'ĐẠI HỌC QUỐC GIA HÀ NỘI', { sz: 26, jc: 'center', after: 0 }),
    P(S(v, 'coQuan').toUpperCase() || 'TRƯỜNG ĐẠI HỌC KINH TẾ', { sz: 26, b: true, jc: 'center', after: 0 }),
    S(v, 'boPhan') ? P(S(v, 'boPhan').toUpperCase(), { sz: 24, b: true, jc: 'center', after: 0 }) : '',
    rule(1150),
    extraLeft,
  ].join('');
  const right = [
    P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 24, b: true, jc: 'center', after: 0 }),
    P('Độc lập - Tự do - Hạnh phúc', { sz: 26, b: true, jc: 'center', after: 0 }),
    rule(950),
    P(dateLine(S(v, 'diaDanh'), S(v, 'ngay')), { sz: 26, i: true, jc: 'center', after: 0 }),
  ].join('');
  return layout([[3900, left], [5560, right]]);
}
// Phần đầu của đơn cá nhân: chỉ Quốc hiệu, Tiêu ngữ canh giữa.
const nationHeader = () => P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 26, b: true, jc: 'center', after: 0 }) + P('Độc lập - Tự do - Hạnh phúc', { b: true, jc: 'center', after: 0 }) + rule(3000);
const title = (t: string, sub = '') => P(t, { b: true, sz: 30, jc: 'center', before: 240, after: sub ? 0 : 200, keep: true }) + (sub ? P(sub, { b: true, jc: 'center', after: 200 }) : '');
const section = (t: string) => P(t, { b: true, before: 120, after: 60, keep: true });
const textBlock = (s: string, o: P = {}) => (lines(s).length ? lines(s).map((t) => P(t, { first: 567, ...o })).join('') : P(dots + dots.slice(0, 13)));
function kinhGui(s: string) {
  const ls = lines(s);
  if (ls.length <= 1) return PR([['Kính gửi: ', { b: true }], [ls[0] ?? dots, {}]], { jc: 'center', before: 120, after: 200 });
  return ls.map((t, n) => (n === 0 ? PR([['Kính gửi: ', { b: true }], [t, {}]], { left: 1985, jc: 'left', before: 120, after: 0 }) : P(t, { left: 3100, jc: 'left', after: n === ls.length - 1 ? 200 : 0 }))).join('');
}
// Khối chữ ký nhiều cột; dòng ngày (nếu có) ở cột cuối.
function signs(cols: { t: string; sub?: string; name?: string }[], date = '') {
  const w = Math.floor((TW + 108) / cols.length);
  const sz = cols.length >= 4 ? 22 : 26;
  const cell = (c: { t: string; sub?: string; name?: string }, last: boolean) => [
    last && date ? P(date, { i: true, sz: 26, jc: 'center', after: 0, keep: true }) : cols.length > 1 && date ? P(' ', { sz: 26, after: 0 }) : '',
    P(c.t, { b: true, sz, jc: 'center', after: 0, keep: true }),
    P(c.sub ?? '(Ký, ghi rõ họ tên)', { i: true, sz: sz - 2, jc: 'center', after: 0, keep: true }),
    P('', { after: 0 }), P('', { after: 0 }), P('', { after: 0 }), P('', { after: 0 }),
    P(c.name ?? '', { b: true, sz, jc: 'center', after: 0 }),
  ].join('');
  return P('', { after: 60, keep: true }) + layout(cols.map((c, i) => [w, cell(c, i === cols.length - 1)]), true);
}
// Câu "Số tiền ... Bằng chữ ...".
const money = (label: string, n: number) => PR([[`${label}: `, {}], [n ? `${vnd(n)} đồng` : dots, { b: !!n }]], { after: 60 }) + PR([['Bằng chữ: ', {}], [n ? `${numberToWords(n)}./.` : dots, { i: true }]], { after: 60 });

export function buildFormXml(def: FormDef, v: Values) {
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="720"/><w:titlePg/><w:docGrid w:linePitch="381"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${def.body(v)}${sect}</w:body></w:document>`;
}
export const buildFormDocx = (def: FormDef, v: Values) => (def.build ? def.build(v) : packDocx(buildFormXml(def, v)));

// ---------- Phiếu đánh giá, phân loại ĐG.01 (công chức) và ĐG.02 (viên chức, người lao động) của ĐHQGHN ----------
// Dựng lại theo đúng bố cục, câu chữ của mẫu ĐHQGHN; phần nhận xét của tập thể, lãnh đạo, cấp có thẩm quyền để dòng chấm điền tay.
const PHAN_LOAI = ['Hoàn thành xuất sắc nhiệm vụ', 'Hoàn thành tốt nhiệm vụ', 'Hoàn thành nhiệm vụ', 'Không hoàn thành nhiệm vụ'];
// Dòng chấm kín bề ngang trang (tab có dấu chấm dẫn), không bị xuống dòng như chuỗi dấu chấm.
const dotLine = `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TW}"/></w:tabs><w:spacing w:before="0" w:after="60" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${F}" w:hAnsi="${F}" w:cs="${F}"/><w:sz w:val="28"/></w:rPr><w:tab/></w:r></w:p>`;
const dotLines = (n: number) => dotLine.repeat(n);
const answer = (s: string, n = 1) => (lines(s).length ? lines(s).map((t) => P(t, { first: 567, after: 60 })).join('') : dotLines(n));
const dgDate = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `Ngày ${m[3]} tháng ${m[2]} năm ${m[1]}` : 'Ngày…… tháng…… năm 20……';
};
const signRight = (date: string, t: string, sub: string, name = '') =>
  layout([[4200, P('', { after: 0 })], [5260, P(date, { i: true, sz: 26, jc: 'center', after: 0, keep: true }) + P(t, { b: true, jc: 'center', after: 0, keep: true }) + P(sub, { i: true, sz: 26, jc: 'center', after: 0, keep: true }) + P('', { after: 0 }) + P('', { after: 0 }) + P('', { after: 0 }) + P(name, { b: true, jc: 'center', after: 120 })]], true);
function dgHeader(v: Values, mau: string, mauSo: string) {
  const box = `<w:tbl><w:tblPr><w:tblW w:w="2700" w:type="dxa"/><w:jc w:val="right"/>${B1}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="2700"/></w:tblGrid><w:tr>${tc(2700, P(mau, { b: true, i: true, sz: 24, jc: 'center', after: 0 }) + P(`(Mẫu số ${mauSo} theo Nghị định số 02/VBHN-BNV, ngày 09/11/2017)`, { i: true, sz: 22, jc: 'center', after: 0, line: 240 }))}</w:tr></w:tbl>`;
  const left = P('ĐẠI HỌC QUỐC GIA HÀ NỘI', { sz: 26, jc: 'center', after: 0 }) + P(S(v, 'coQuan').toUpperCase() || 'TÊN ĐƠN VỊ……………………', { sz: 26, b: true, jc: 'center', after: 0 }) + rule(1150);
  const right = P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 24, b: true, jc: 'center', after: 0 }) + P('Độc lập - Tự do - Hạnh phúc', { sz: 26, b: true, jc: 'center', after: 0 }) + rule(950);
  return box + P('', { after: 0 }) + layout([[3900, left], [5560, right]]);
}
const kvDots = (label: string, value: string) => PR([[`${label}: `, {}], [value || dots + dots, {}]], { after: 60 });

// ---------- Ô dùng chung ----------
const ORG: Field[] = [
  { k: 'chuQuan', label: 'Cơ quan chủ quản', def: 'ĐẠI HỌC QUỐC GIA HÀ NỘI', me: true },
  { k: 'coQuan', label: 'Cơ quan', def: 'TRƯỜNG ĐẠI HỌC KINH TẾ', me: true },
  { k: 'boPhan', label: 'Bộ phận, đơn vị', ph: 'Khoa Kinh tế phát triển', me: true },
  { k: 'diaDanh', label: 'Địa danh', def: 'Hà Nội', me: true },
  { k: 'ngay', label: 'Ngày', type: 'date' },
];
const ME: Field[] = [
  { k: 'hoTen', label: 'Họ và tên', me: true },
  { k: 'chucVu', label: 'Chức vụ, chức danh', me: true },
  { k: 'donVi', label: 'Đơn vị công tác', ph: 'Khoa Kinh tế phát triển', me: true },
];
const KINH_GUI_TRUONG = '- Hiệu trưởng Trường Đại học Kinh tế - ĐHQGHN;\n- Lãnh đạo đơn vị.';
const sumRows = (v: Values, k: string, col: number) => RW(v, k).reduce((a, r) => a + parseMoney(r[col] ?? ''), 0);
const slugFile = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const HD_NC = ['Nghiên cứu lý thuyết', 'Điều tra khảo sát', 'Xây dựng mô hình thử nghiệm', 'Sổ tay nghiên cứu', 'Viết báo cáo khoa học', 'Hội thảo khoa học', 'Tập huấn', 'Các hoạt động khác'];
const KP_ROWS = ['Trả công lao động trực tiếp và thuê chuyên gia', 'Nguyên, vật liệu, năng lượng', 'Thiết bị, máy móc', 'Xây dựng, sửa chữa nhỏ', 'Chi khác'];
// "01/2027" → "01 năm 2027"; trống thì để chỗ điền tay.
const monthYear = (s: string) => { const m = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{4})$/); return m ? `${m[1].padStart(2, '0')} năm ${m[2]}` : s || '…… năm ……'; };

// ---------- Đề cương NCKH: tiến độ và phụ lục dự toán ----------
const PAGE = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
// "0,8" hoặc "0.8" → 0.8; "25.000.000" → 25000000.
const num = (s: string) => { const t = String(s ?? '').trim(); if (!t) return 0; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const isTitle = (t: string) => /^\s*(chuyên đề|thù lao)/i.test(t);
const isTask = (t: string) => /^\s*công việc/i.test(t);
// Bảng có cột TT tự đánh cho dòng chuyên đề; dòng "Công việc …" in nghiêng, không đánh số.
function rowsTable(cols: Col[], rows: { cells: string[]; no: string; b?: boolean; i?: boolean }[], foot?: string[]) {
  const total = cols.reduce((a, c) => a + c.w, 0);
  const ws = cols.map((c) => Math.round((c.w * TW) / total));
  const cell = (w: number, t: string, c: Col, o: R = {}) => tc(w, P(t, { sz: TSZ, jc: c.type === 'money' || c.type === 'number' ? 'right' : c.k === '_stt' ? 'center' : 'left', after: 0, line: 240, ...o }));
  const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cols.map((c, i) => tc(ws[i], P(c.label, { b: true, sz: TSZ, jc: 'center', after: 0, line: 240 }))).join('')}</w:tr>`;
  const body = rows.map((r) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="400"/></w:trPr>${cols.map((c, i) => cell(ws[i], i === 0 ? r.no : r.cells[i - 1] ?? '', c, { b: r.b, i: r.i })).join('')}</w:tr>`).join('');
  const f = foot ? `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cols.map((c, i) => cell(ws[i], foot[i] ?? '', c, { b: true })).join('')}</w:tr>` : '';
  return `<w:tbl><w:tblPr><w:tblW w:w="${TW}" w:type="dxa"/>${B1}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${body}${f}</w:tbl>${P('', { after: 60 })}`;
}
const TT: Col = { k: '_stt', label: 'TT', w: 600 };
function tienDoTable(rows: string[][]) {
  const f = rows.filter((r) => r.some((x) => String(x ?? '').trim()));
  let n = 0;
  const out = (f.length ? f : [['', '', '', ''], ['', '', '', ''], ['', '', '', '']]).map((r) => (isTask(r[0] ?? '') ? { cells: r, no: '', i: true } : { cells: r, no: r.some((x) => x?.trim()) ? String(++n) : '' }));
  return rowsTable([TT, { k: 'hd', label: 'Hoạt động nghiên cứu', w: 4000 }, { k: 'tu', label: 'Từ tháng', w: 1000 }, { k: 'den', label: 'Đến tháng', w: 1000 }, { k: 'sp', label: 'Sản phẩm khoa học', w: 2600 }], out);
}
type CongLd = { rows: { cells: string[]; no: string; b?: boolean; i?: boolean }[]; total: number };
// Phụ lục 2: thành tiền = hệ số × định mức × số tháng quy đổi (cột 7 = 3 × 5 × 6); dòng tiêu đề cộng các dòng bên dưới.
function congLd(rows: string[][]): CongLd {
  const f = rows.filter((r) => r.some((x) => String(x ?? '').trim()));
  const amt = f.map((r) => (num(r[1]) && num(r[4]) ? Math.round(num(r[1]) * parseMoney(r[3] ?? '') * num(r[4])) : 0));
  const head = f.map((r) => !num(r[1]) && !num(r[4]));
  const sub = f.map((r, i) => {
    if (!head[i]) return amt[i];
    let t = 0;
    for (let j = i + 1; j < f.length; j++) {
      if ((head[j] && (!isTask(f[j][0] ?? '') || isTask(r[0] ?? ''))) || (!head[j] && isTitle(f[j][0] ?? ''))) break; // chuyên đề cộng cả các công việc; dừng ở tiêu đề kế tiếp hoặc dòng thù lao
      if (!head[j]) t += amt[j];
    }
    return t;
  });
  let n = 0;
  return {
    total: amt.reduce((a, b) => a + b, 0),
    rows: f.map((r, i) => ({
      cells: [r[0] ?? '', r[1] ?? '', r[2] ?? '', parseMoney(r[3] ?? '') ? vnd(parseMoney(r[3] ?? '')) : '', r[4] ?? '', sub[i] ? vnd(sub[i]) : ''],
      no: (head[i] && !isTask(r[0] ?? '')) || (!head[i] && isTitle(r[0] ?? '')) ? String(++n) : '',
      b: head[i] && !isTask(r[0] ?? ''),
      i: isTask(r[0] ?? ''),
    })),
  };
}
function phuLuc(tong: number[], khoan: number[], nam2: number[], pl2: CongLd, chiKhac: string[][]) {
  const m = (n: number) => (n ? vnd(n) : '');
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const nam1 = tong.map((t, i) => Math.max(0, t - nam2[i]));
  const title = (a: string, b: string) => P(a, { b: true, jc: 'center', after: 0, keep: true }) + P(b, { b: true, jc: 'center', after: 60, keep: true }) + P('Đơn vị tính: đồng', { i: true, jc: 'right', after: 0, keep: true });
  const pl1 = rowsTable([TT, { k: 'nd', label: 'Nội dung các khoản chi', w: 2300 }, { k: 't', label: 'Tổng kinh phí', w: 1600, type: 'money' }, { k: 'k', label: 'Trong đó, khoán chi theo quy định', w: 1600, type: 'money' }, { k: 'n1', label: 'Năm thứ nhất', w: 1600, type: 'money' }, { k: 'n2', label: 'Năm thứ hai', w: 1600, type: 'money' }],
    KP_ROWS.map((name, i) => ({ cells: [name, m(tong[i]), m(khoan[i]), m(nam1[i]), m(nam2[i])], no: String(i + 1) })),
    ['', 'Tổng cộng', m(sum(tong)), m(sum(khoan)), m(sum(nam1)), m(sum(nam2))]);
  const pl2t = pl2.rows.length ? pl2.rows : [{ cells: ['', '', '', '', '', ''], no: '' }, { cells: ['', '', '', '', '', ''], no: '' }];
  const pl2Table = rowsTable([TT, { k: 'nd', label: 'Các nội dung, công việc', w: 2900 }, { k: 'hs', label: 'Hệ số lao động khoa học', w: 900, type: 'number' }, { k: 'sn', label: 'Số người', w: 800, type: 'number' }, { k: 'dm', label: 'Định mức thù lao tháng', w: 1500, type: 'money' }, { k: 'th', label: 'Số tháng quy đổi', w: 900, type: 'number' }, { k: 'tt', label: 'Thành tiền (7=3×5×6)', w: 1600, type: 'money' }],
    pl2t, ['', 'CỘNG', '', '', '', '', m(pl2.total)]);
  const ck = chiKhac.filter((r) => r.some((x) => String(x ?? '').trim()));
  const pl3 = rowsTable([TT, { k: 'nd', label: 'Nội dung', w: 3300 }, { k: 'dg', label: 'Diễn giải (số lượng × đơn giá)', w: 3300 }, { k: 't', label: 'Thành tiền', w: 1800, type: 'money' }],
    (ck.length ? ck : [['', '', ''], ['', '', '']]).map((r, i) => ({ cells: [r[0] ?? '', r[1] ?? '', m(parseMoney(r[2] ?? ''))], no: ck.length ? String(i + 1) : '' })),
    ['', 'CỘNG', '', m(ck.reduce((a, r) => a + parseMoney(r[2] ?? ''), 0))]);
  return PAGE + P('Phụ lục 1', { b: true, i: true, after: 0 }) + title('DỰ TOÁN KINH PHÍ', '') + pl1
    + PAGE + P('Phụ lục 2', { b: true, i: true, after: 0 }) + title('DỰ TOÁN CÔNG LAO ĐỘNG KHOA HỌC', '') + pl2Table
    + PAGE + P('Phụ lục 3', { b: true, i: true, after: 0 }) + title('DỰ TOÁN CHI KHÁC', '') + pl3;
}

// ---------- Các mẫu ----------
export const FORMS: FormDef[] = [
  {
    key: 'de-nghi-thanh-toan', label: 'Giấy đề nghị thanh toán', group: 'Tài chính',
    note: 'Đề nghị thanh toán các khoản đã chi, kèm chứng từ gốc. Số tiền và bằng chữ tự tính từ bảng.',
    fields: [...ORG, { k: 'kinhGui', label: 'Kính gửi', type: 'textarea', def: '- Hiệu trưởng Trường Đại học Kinh tế - ĐHQGHN;\n- Phòng Kế hoạch - Tài chính.', wide: true }, { k: 'hoTen', label: 'Họ tên người đề nghị', me: true }, { k: 'donVi', label: 'Bộ phận (hoặc địa chỉ)', me: true },
      { k: 'noiDung', label: 'Nội dung thanh toán', type: 'textarea', wide: true, ph: 'Thanh toán chi phí tổ chức Hội thảo …' },
      { k: 'khoan', label: 'Các khoản đề nghị thanh toán', type: 'rows', cols: [{ k: 'nd', label: 'Nội dung', w: 5200 }, { k: 'ct', label: 'Số chứng từ', w: 1600 }, { k: 'tien', label: 'Số tiền (đồng)', w: 2000, type: 'money' }], sum: 'tien', def: [['', '', '']] },
      { k: 'kemTheo', label: 'Số chứng từ gốc kèm theo', type: 'number', def: '' }],
    file: (v) => `De_nghi_thanh_toan_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => orgHeader(v) + title('GIẤY ĐỀ NGHỊ THANH TOÁN') + kinhGui(S(v, 'kinhGui')) + kv('Họ và tên người đề nghị thanh toán', S(v, 'hoTen')) + kv('Bộ phận (hoặc địa chỉ)', S(v, 'donVi')) + kv('Nội dung thanh toán', S(v, 'noiDung'))
      + grid([{ k: 'nd', label: 'Nội dung', w: 5200 }, { k: 'ct', label: 'Số chứng từ', w: 1600 }, { k: 'tien', label: 'Số tiền (đồng)', w: 2000, type: 'money' }], RW(v, 'khoan'), { sum: 'tien' })
      + money('Tổng số tiền đề nghị thanh toán', sumRows(v, 'khoan', 2)) + kv('Kèm theo', S(v, 'kemTheo') ? `${S(v, 'kemTheo')} chứng từ gốc.` : '')
      + signs([{ t: 'NGƯỜI DUYỆT' }, { t: 'KẾ TOÁN TRƯỞNG' }, { t: 'PHỤ TRÁCH BỘ PHẬN' }, { t: 'NGƯỜI ĐỀ NGHỊ', name: S(v, 'hoTen') }]),
  },
  {
    key: 'de-nghi-tam-ung', label: 'Giấy đề nghị tạm ứng', group: 'Tài chính',
    note: 'Đề nghị tạm ứng kinh phí trước khi thực hiện công việc, có thời hạn thanh toán tạm ứng.',
    fields: [...ORG, { k: 'kinhGui', label: 'Kính gửi', type: 'textarea', def: '- Hiệu trưởng Trường Đại học Kinh tế - ĐHQGHN;\n- Phòng Kế hoạch - Tài chính.', wide: true }, { k: 'hoTen', label: 'Họ tên người đề nghị', me: true }, { k: 'donVi', label: 'Bộ phận (hoặc địa chỉ)', me: true },
      { k: 'soTien', label: 'Số tiền đề nghị tạm ứng (đồng)', type: 'money' }, { k: 'lyDo', label: 'Lý do tạm ứng', type: 'textarea', wide: true, ph: 'Tạm ứng kinh phí tổ chức Hội thảo … theo dự toán đã duyệt' }, { k: 'thoiHan', label: 'Thời hạn thanh toán', ph: 'Trước ngày 31/12/2026' }],
    file: (v) => `De_nghi_tam_ung_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => orgHeader(v) + title('GIẤY ĐỀ NGHỊ TẠM ỨNG') + kinhGui(S(v, 'kinhGui')) + kv('Tên tôi là', S(v, 'hoTen')) + kv('Bộ phận (hoặc địa chỉ)', S(v, 'donVi'))
      + money('Đề nghị cho tạm ứng số tiền', parseMoney(S(v, 'soTien'))) + kv('Lý do tạm ứng', S(v, 'lyDo')) + kv('Thời hạn thanh toán', S(v, 'thoiHan'))
      + signs([{ t: 'THỦ TRƯỞNG ĐƠN VỊ' }, { t: 'KẾ TOÁN TRƯỞNG' }, { t: 'PHỤ TRÁCH BỘ PHẬN' }, { t: 'NGƯỜI ĐỀ NGHỊ TẠM ỨNG', name: S(v, 'hoTen') }]),
  },
  {
    key: 'danh-sach-chi-tra', label: 'Danh sách chi trả, ký nhận', group: 'Tài chính',
    note: 'Danh sách người nhận tiền (bồi dưỡng, thù lao, hỗ trợ…) có cột ký nhận, tự cộng tổng và viết bằng chữ.',
    fields: [...ORG, { k: 'tieuDe', label: 'Tên danh sách', def: 'DANH SÁCH CHI TRẢ VÀ KÝ NHẬN', wide: true }, { k: 'noiDung', label: 'Nội dung chi', wide: true, ph: 'Chi bồi dưỡng báo cáo viên Hội thảo … ngày …' },
      { k: 'ds', label: 'Danh sách', type: 'rows', cols: [{ k: 'ten', label: 'Họ và tên', w: 2400 }, { k: 'dv', label: 'Đơn vị', w: 1900 }, { k: 'nd', label: 'Nội dung', w: 1900 }, { k: 'tien', label: 'Số tiền (đồng)', w: 1500, type: 'money' }], sum: 'tien', def: [['', '', '', ''], ['', '', '', '']] }],
    file: (v) => `Danh_sach_chi_tra_${slugFile(S(v, 'noiDung'))}`,
    body: (v) => {
      const rows = RW(v, 'ds').map((r) => [...r, '']);
      const total = sumRows(v, 'ds', 3);
      return orgHeader(v) + title((S(v, 'tieuDe') || 'DANH SÁCH CHI TRẢ VÀ KÝ NHẬN').toUpperCase(), S(v, 'noiDung'))
        + grid([{ k: 'ten', label: 'Họ và tên', w: 2400 }, { k: 'dv', label: 'Đơn vị', w: 1800 }, { k: 'nd', label: 'Nội dung', w: 1800 }, { k: 'tien', label: 'Số tiền (đồng)', w: 1500, type: 'money' }, { k: 'ky', label: 'Ký nhận', w: 1300 }], rows, { sum: 'tien', minRows: 5 })
        + PR([['Tổng số tiền bằng chữ: ', {}], [total ? `${numberToWords(total)}./.` : dots, { i: true }]], { after: 60 })
        + signs([{ t: 'NGƯỜI LẬP' }, { t: 'KẾ TOÁN' }, { t: 'THỦ TRƯỞNG ĐƠN VỊ' }]);
    },
  },
  {
    key: 'phieu-trinh', label: 'Phiếu trình giải quyết công việc', group: 'Hành chính',
    note: 'Điền thẳng vào mẫu Phiếu trình của Trường (giữ nguyên bảng luân chuyển: ngày giờ nhận, ký, trả, chuyển cho). Mục để trống giữ dấu chấm để điền tay.',
    original: { href: '/mau/Phieu_trinh_giai_quyet_cong_viec.docx', label: 'Tải mẫu gốc (trống)' },
    build: async (v) => (await import('./phieuTrinh')).buildPhieuTrinh(v),
    fields: [
      { k: 'boPhan', label: 'Khoa, phòng trình', ph: 'Khoa Kinh tế phát triển', me: true },
      { k: 'kinhGui', label: 'Kính gửi', def: 'Ban Giám hiệu Trường Đại học Kinh tế', wide: true },
      { k: 'tenCongViec', label: 'Tên công việc', type: 'textarea', wide: true, ph: 'Trình kế hoạch tổ chức chương trình …' },
      { k: 'deXuat', label: 'Đề xuất', type: 'textarea', wide: true, ph: 'Kính trình BGH và Phòng … xem xét, phê duyệt' },
      { k: 'hoSo', label: 'Hồ sơ kèm theo (mỗi dòng một tài liệu)', type: 'textarea', wide: true },
      { k: 'canBo', label: 'Cán bộ thực hiện (mỗi dòng một người)', type: 'textarea', me: true },
    ],
    file: (v) => `Phieu_trinh_${slugFile(S(v, 'tenCongViec').slice(0, 40))}`,
    body: (v) => title('PHIẾU TRÌNH GIẢI QUYẾT CÔNG VIỆC') + kv('Tên công việc', S(v, 'tenCongViec')) + kv('Đề xuất', S(v, 'deXuat')),
  },
  {
    key: 'danh-gia-cong-chuc', label: 'Phiếu đánh giá, phân loại công chức (ĐG.01)', group: 'Hành chính',
    note: 'Mẫu ĐG.01 của ĐHQGHN (Mẫu số 02 theo Nghị định 02/VBHN-BNV). Bạn điền phần tự đánh giá; phần ý kiến tập thể, lãnh đạo và kết quả của Giám đốc ĐHQGHN để dòng chấm điền tay. Tiêu chí phân loại (Điều 18 đến 21) có trong mẫu gốc.',
    original: { href: 'https://docs.google.com/document/d/1bEDSKVQcABC2u4046j1xHS8XzLXF_t0O/edit', label: 'Mở mẫu gốc (tài khoản VNU)' },
    fields: [
      { k: 'nam', label: 'Năm đánh giá', ph: '2026' }, { k: 'coQuan', label: 'Tên đơn vị', def: 'Trường Đại học Kinh tế', me: true },
      { k: 'hoTen', label: 'Họ và tên', me: true }, { k: 'chucVu', label: 'Chức vụ, chức danh', me: true }, { k: 'donVi', label: 'Đơn vị công tác', me: true },
      { k: 'ngach', label: 'Ngạch công chức' }, { k: 'bac', label: 'Bậc' }, { k: 'heSo', label: 'Hệ số lương' },
      { k: 'c1', label: '1. Chấp hành đường lối, chủ trương, chính sách của Đảng và pháp luật của Nhà nước', type: 'textarea', wide: true },
      { k: 'c2', label: '2. Phẩm chất chính trị, đạo đức, lối sống, tác phong và lề lối làm việc', type: 'textarea', wide: true },
      { k: 'c3', label: '3. Năng lực, trình độ chuyên môn, nghiệp vụ', type: 'textarea', wide: true },
      { k: 'c4', label: '4. Tiến độ và kết quả thực hiện nhiệm vụ', type: 'textarea', wide: true },
      { k: 'c5', label: '5. Tinh thần trách nhiệm và phối hợp trong thực hiện nhiệm vụ', type: 'textarea', wide: true },
      { k: 'c6', label: '6. Thái độ phục vụ nhân dân', type: 'textarea', wide: true },
      { k: 'c7', label: '7. Kết quả hoạt động của cơ quan, tổ chức, đơn vị được giao lãnh đạo, quản lý (nếu có)', type: 'textarea', wide: true },
      { k: 'c8', label: '8. Năng lực lãnh đạo, quản lý (nếu có)', type: 'textarea', wide: true },
      { k: 'c9', label: '9. Năng lực tập hợp, đoàn kết công chức (nếu có)', type: 'textarea', wide: true },
      { k: 'uuNhuoc', label: 'II.1. Đánh giá ưu, nhược điểm', type: 'textarea', wide: true },
      { k: 'phanLoai', label: 'II.2. Tự phân loại', type: 'select', options: ['', 'Hoàn thành xuất sắc nhiệm vụ', 'Hoàn thành tốt nhiệm vụ', 'Hoàn thành nhiệm vụ nhưng còn hạn chế về năng lực', 'Không hoàn thành nhiệm vụ'], def: '' },
      { k: 'ngay', label: 'Ngày tự đánh giá', type: 'date' },
    ],
    file: (v) => `DG01_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => {
      const items = ['1. Chấp hành đường lối, chủ trương, chính sách của Đảng và pháp luật của Nhà nước:', '2. Phẩm chất chính trị, đạo đức, lối sống, tác phong và lề lối làm việc:', '3. Năng lực, trình độ chuyên môn, nghiệp vụ:', '4. Tiến độ và kết quả thực hiện nhiệm vụ:', '5. Tinh thần trách nhiệm và phối hợp trong thực hiện nhiệm vụ:', '6. Thái độ phục vụ nhân dân:', '7. Kết quả hoạt động của cơ quan, tổ chức, đơn vị được giao lãnh đạo, quản lý:', '8. Năng lực lãnh đạo, quản lý:', '9. Năng lực tập hợp, đoàn kết công chức:'];
      return dgHeader(v, 'Mẫu ĐG 01', '02') + title('PHIẾU ĐÁNH GIÁ VÀ PHÂN LOẠI CÔNG CHỨC', `Năm ${S(v, 'nam') || '……'}`)
        + kvDots('Họ và tên', S(v, 'hoTen')) + kvDots('Chức vụ, chức danh', S(v, 'chucVu')) + kvDots('Đơn vị công tác', S(v, 'donVi'))
        + P(`Ngạch công chức: ${S(v, 'ngach') || '……………………'}    Bậc: ${S(v, 'bac') || '…………'}    Hệ số lương: ${S(v, 'heSo') || '…………'}`, { after: 60 })
        + section('I. TỰ ĐÁNH GIÁ KẾT QUẢ CÔNG TÁC, TU DƯỠNG, RÈN LUYỆN CỦA CÔNG CHỨC')
        + items.map((t, i) => P(t, { after: 0, keep: true }) + answer(S(v, `c${i + 1}`))).join('')
        + section('II. TỰ ĐÁNH GIÁ, PHÂN LOẠI CỦA CÔNG CHỨC') + P('1. Đánh giá ưu, nhược điểm:', { after: 0, keep: true }) + answer(S(v, 'uuNhuoc'), 2)
        + P('2. Phân loại đánh giá:', { after: 0, keep: true })
        + P('Công chức căn cứ các tiêu chí từ điều 18 đến điều 21 Nghị định số 02/VBHN-BNV để tự phân loại đánh giá theo một trong bốn mức sau: Hoàn thành xuất sắc nhiệm vụ; hoàn thành tốt nhiệm vụ; hoàn thành nhiệm vụ nhưng còn hạn chế về năng lực; không hoàn thành nhiệm vụ.', { i: true, sz: 26, after: 60 })
        + (S(v, 'phanLoai') ? P(S(v, 'phanLoai'), { b: true, first: 567, after: 60 }) : dotLines(1))
        + signRight(dgDate(S(v, 'ngay')), 'Công chức tự đánh giá', '(ký, ghi rõ họ và tên)', S(v, 'hoTen'))
        + section('III. Ý KIẾN CỦA TẬP THỂ ĐƠN VỊ VÀ LÃNH ĐẠO TRỰC TIẾP QUẢN LÝ CÔNG CHỨC')
        + P('1. Ý kiến của tập thể đơn vị nơi công chức công tác:', { after: 0, keep: true }) + dotLines(2)
        + P('2. Nhận xét của lãnh đạo trực tiếp quản lý công chức:', { after: 0, keep: true }) + dotLines(2)
        + signRight(dgDate(''), 'Thủ trưởng trực tiếp đánh giá', '(ký, ghi rõ họ và tên)')
        + section('IV. KẾT QUẢ ĐÁNH GIÁ, PHÂN LOẠI CÔNG CHỨC CỦA GIÁM ĐỐC ĐHQGHN')
        + P('1. Nhận xét ưu, nhược điểm:', { after: 0, keep: true }) + dotLines(2)
        + P('2. Kết quả đánh giá, phân loại công chức:', { after: 0, keep: true })
        + P('(Phân loại đánh giá theo 1 trong 4 mức sau: Hoàn thành xuất sắc nhiệm vụ; hoàn thành tốt nhiệm vụ; hoàn thành nhiệm vụ nhưng còn hạn chế về năng lực; không hoàn thành nhiệm vụ)', { i: true, sz: 26, after: 60 }) + dotLines(2)
        + signRight(dgDate(''), 'Giám đốc', '(ký, ghi rõ họ và tên, đóng dấu)');
    },
  },
  {
    key: 'danh-gia-vien-chuc', label: 'Phiếu đánh giá, phân loại viên chức, người lao động (ĐG.02)', group: 'Hành chính',
    note: 'Mẫu ĐG.02 của ĐHQGHN (Mẫu số 03 theo Nghị định 02/VBHN-BNV), dùng cho giảng viên, chuyên viên, người lao động. Bạn điền phần tự đánh giá; phần ý kiến tập thể, lãnh đạo và cấp có thẩm quyền để dòng chấm điền tay. Tiêu chí phân loại (Điều 25 đến 28) có trong mẫu gốc.',
    original: { href: 'https://docs.google.com/document/d/1eOFPVzBqSBorPlK5mRSAVh_1YmyE76ge/edit', label: 'Mở mẫu gốc (tài khoản VNU)' },
    fields: [
      { k: 'nam', label: 'Năm đánh giá', ph: '2026' }, { k: 'coQuan', label: 'Tên đơn vị', def: 'Trường Đại học Kinh tế', me: true },
      { k: 'hoTen', label: 'Họ và tên', me: true }, { k: 'chucVu', label: 'Chức danh nghề nghiệp', me: true }, { k: 'donVi', label: 'Đơn vị công tác', me: true },
      { k: 'hang', label: 'Hạng chức danh nghề nghiệp (viên chức)' }, { k: 'bac', label: 'Bậc' }, { k: 'heSo', label: 'Hệ số lương' },
      { k: 'c1', label: '1. Kết quả thực hiện công việc hoặc nhiệm vụ theo hợp đồng làm việc/hợp đồng lao động đã ký kết và những nhiệm vụ đột xuất', type: 'textarea', wide: true },
      { k: 'c2', label: '2. Việc thực hiện quy định về đạo đức nghề nghiệp', type: 'textarea', wide: true },
      { k: 'c3', label: '3. Tinh thần trách nhiệm, thái độ phục vụ nhân dân, tinh thần hợp tác với đồng nghiệp và việc thực hiện quy tắc ứng xử', type: 'textarea', wide: true },
      { k: 'c4', label: '4. Việc thực hiện các nghĩa vụ khác của viên chức/người lao động', type: 'textarea', wide: true },
      { k: 'c5', label: '5. Năng lực lãnh đạo, quản lí, điều hành và tổ chức thực hiện nhiệm vụ (viên chức quản lí)', type: 'textarea', wide: true },
      { k: 'c6', label: '6. Kết quả hoạt động của đơn vị được giao phụ trách (viên chức quản lí)', type: 'textarea', wide: true },
      { k: 'uuNhuoc', label: 'II.1. Đánh giá ưu, nhược điểm', type: 'textarea', wide: true },
      { k: 'phanLoai', label: 'II.2. Tự phân loại', type: 'select', options: ['', ...PHAN_LOAI], def: '' },
      { k: 'ngay', label: 'Ngày tự đánh giá', type: 'date' },
    ],
    file: (v) => `DG02_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => {
      const items = ['1. Kết quả thực hiện công việc hoặc nhiệm vụ theo hợp đồng làm việc/hợp đồng lao động đã ký kết và những nhiệm vụ đột xuất', '2. Việc thực hiện quy định về đạo đức nghề nghiệp', '3. Tinh thần trách nhiệm, thái độ phục vụ nhân dân, tinh thần hợp tác với đồng nghiệp và việc thực hiện quy tắc ứng xử của viên chức/người lao động', '4. Việc thực hiện các nghĩa vụ khác của viên chức/người lao động'];
      const ql = ['5. Năng lực lãnh đạo, quản lí, điều hành và tổ chức thực hiện nhiệm vụ', '6. Kết quả hoạt động của đơn vị được giao phụ trách'];
      return dgHeader(v, 'Mẫu ĐG 02', '03') + title('PHIẾU ĐÁNH GIÁ VÀ PHÂN LOẠI VIÊN CHỨC, NGƯỜI LAO ĐỘNG', `Năm ${S(v, 'nam') || '……'}`)
        + kvDots('Họ và tên', S(v, 'hoTen')) + kvDots('Chức danh nghề nghiệp', S(v, 'chucVu')) + kvDots('Đơn vị công tác', S(v, 'donVi'))
        + P(`Hạng chức danh nghề nghiệp (đối với viên chức): ${S(v, 'hang') || '…………'}    Bậc: ${S(v, 'bac') || '…………'}    Hệ số lương: ${S(v, 'heSo') || '…………'}`, { after: 60 })
        + section('I. TỰ ĐÁNH GIÁ KẾT QUẢ CÔNG TÁC, TU DƯỠNG, RÈN LUYỆN')
        + items.map((t, i) => P(t, { after: 0, keep: true }) + answer(S(v, `c${i + 1}`))).join('')
        + P('Viên chức quản lí đánh giá thêm các nội dung sau:', { i: true, after: 0, keep: true })
        + ql.map((t, i) => P(t, { after: 0, keep: true }) + answer(S(v, `c${i + 5}`))).join('')
        + section('II. TỰ ĐÁNH GIÁ, PHÂN LOẠI CỦA VIÊN CHỨC, NGƯỜI LAO ĐỘNG') + P('1. Đánh giá ưu, nhược điểm', { after: 0, keep: true }) + answer(S(v, 'uuNhuoc'), 3)
        + P('2. Phân loại đánh giá', { after: 0, keep: true })
        + P('VC, NLĐ căn cứ vào quy định tại điều 25 đến điều 28 Nghị định số 02/VBHN để tự phân loại đánh giá theo một trong bốn mức sau: Hoàn thành xuất sắc nhiệm vụ; hoàn thành tốt nhiệm vụ; hoàn thành nhiệm vụ; không hoàn thành nhiệm vụ.', { i: true, sz: 26, after: 60 })
        + (S(v, 'phanLoai') ? P(S(v, 'phanLoai'), { b: true, first: 567, after: 60 }) : dotLines(2))
        + signRight(dgDate(S(v, 'ngay')), 'Viên chức/NLĐ tự đánh giá', '(ký, ghi rõ họ và tên)', S(v, 'hoTen'))
        + section('III. Ý KIẾN CỦA TẬP THỂ ĐƠN VỊ VÀ LÃNH ĐẠO TRỰC TIẾP QUẢN LÍ VIÊN CHỨC VÀ NGƯỜI LAO ĐỘNG')
        + P('1. Ý kiến của tập thể đơn vị nơi viên chức và người lao động công tác', { after: 0, keep: true }) + dotLines(3)
        + P('2. Nhận xét của lãnh đạo trực tiếp quản lý viên chức và người lao động', { after: 0, keep: true }) + dotLines(3)
        + P('3. Nhận xét ưu, nhược điểm', { after: 0, keep: true }) + dotLines(3)
        + signRight(dgDate(''), 'Thủ trưởng trực tiếp đánh giá', '(ký, ghi rõ họ và tên)')
        + section('IV. KẾT QUẢ ĐÁNH GIÁ, PHÂN LOẠI VIÊN CHỨC, NGƯỜI LAO ĐỘNG CỦA CẤP CÓ THẨM QUYỀN')
        + P('1. Đánh giá ưu, nhược điểm', { after: 0, keep: true }) + dotLines(3)
        + P('2. Kết quả phân loại viên chức, người lao động', { after: 0, keep: true })
        + P('(Phân loại đánh giá theo 1 trong 4 mức sau: Hoàn thành xuất sắc nhiệm vụ; hoàn thành tốt nhiệm vụ; hoàn thành nhiệm vụ; không hoàn thành nhiệm vụ)', { i: true, sz: 26, after: 60 }) + dotLines(3)
        + signRight(dgDate(''), 'THỦ TRƯỞNG ĐƠN VỊ', '(ký, ghi rõ họ và tên, đóng dấu)');
    },
  },
  {
    key: 'bao-cao-cong-viec', label: 'Báo cáo công việc tuần, tháng', group: 'Hành chính',
    note: 'Kết quả kỳ này, tồn tại, kế hoạch kỳ tới và đề xuất; dùng cho báo cáo tuần hoặc tháng.',
    fields: [...ORG, { k: 'ky', label: 'Loại báo cáo', type: 'select', options: ['tuần', 'tháng'], def: 'tuần' }, { k: 'kyBaoCao', label: 'Kỳ báo cáo', ph: 'Tuần 46 (từ 09/11 đến 13/11/2026)' }, { k: 'hoTen', label: 'Người báo cáo', me: true }, { k: 'chucVu', label: 'Chức vụ', me: true },
      { k: 'ketQua', label: 'I. Kết quả thực hiện', type: 'rows', cols: [{ k: 'cv', label: 'Công việc', w: 3600 }, { k: 'kq', label: 'Kết quả, tiến độ', w: 3400 }, { k: 'gc', label: 'Ghi chú', w: 1800 }], def: [['', '', '']] },
      { k: 'tonTai', label: 'II. Tồn tại, khó khăn', type: 'textarea', wide: true },
      { k: 'keHoach', label: 'III. Kế hoạch kỳ tới', type: 'rows', cols: [{ k: 'cv', label: 'Công việc', w: 4600 }, { k: 'han', label: 'Thời hạn', w: 1800 }, { k: 'ng', label: 'Người phụ trách', w: 2400 }], def: [['', '', '']] },
      { k: 'deXuat', label: 'IV. Đề xuất, kiến nghị', type: 'textarea', wide: true }],
    file: (v) => `Bao_cao_${S(v, 'ky') === 'tháng' ? 'thang' : 'tuan'}_${slugFile(S(v, 'kyBaoCao'))}`,
    body: (v) => orgHeader(v) + title(`BÁO CÁO CÔNG VIỆC ${(S(v, 'ky') || 'tuần').toUpperCase()}`, S(v, 'kyBaoCao'))
      + kv('Người báo cáo', [S(v, 'hoTen'), S(v, 'chucVu')].filter(Boolean).join(' - '))
      + section('I. KẾT QUẢ THỰC HIỆN') + grid([{ k: 'cv', label: 'Công việc', w: 3600 }, { k: 'kq', label: 'Kết quả, tiến độ', w: 3400 }, { k: 'gc', label: 'Ghi chú', w: 1800 }], RW(v, 'ketQua'), { minRows: 3 })
      + section('II. TỒN TẠI, KHÓ KHĂN') + textBlock(S(v, 'tonTai'))
      + section('III. KẾ HOẠCH ' + ((S(v, 'ky') || 'tuần') === 'tháng' ? 'THÁNG TỚI' : 'TUẦN TỚI')) + grid([{ k: 'cv', label: 'Công việc', w: 4600 }, { k: 'han', label: 'Thời hạn', w: 1800 }, { k: 'ng', label: 'Người phụ trách', w: 2400 }], RW(v, 'keHoach'), { minRows: 3 })
      + section('IV. ĐỀ XUẤT, KIẾN NGHỊ') + textBlock(S(v, 'deXuat'))
      + signs([{ t: 'XÁC NHẬN CỦA PHỤ TRÁCH ĐƠN VỊ' }, { t: 'NGƯỜI BÁO CÁO', name: S(v, 'hoTen') }]),
  },
  {
    key: 'don-cong-tac', label: 'Đơn xin đi công tác', group: 'Hành chính',
    note: 'Đơn cá nhân xin đi công tác trong nước hoặc nước ngoài, có ý kiến của lãnh đạo đơn vị.',
    fields: [{ k: 'kinhGui', label: 'Kính gửi', type: 'textarea', def: KINH_GUI_TRUONG, wide: true }, ...ME, { k: 'noiDen', label: 'Nơi đến công tác', ph: 'Đại học Kyoto, Nhật Bản' }, { k: 'tuNgay', label: 'Từ ngày', type: 'date' }, { k: 'denNgay', label: 'Đến ngày', type: 'date' },
      { k: 'mucDich', label: 'Mục đích, nội dung công tác', type: 'textarea', wide: true }, { k: 'phuongTien', label: 'Phương tiện', ph: 'Máy bay' }, { k: 'kinhPhi', label: 'Kinh phí', type: 'select', options: ['Đơn vị chi trả', 'Bên mời chi trả', 'Đề tài, dự án chi trả', 'Tự túc'], def: 'Đơn vị chi trả' },
      { k: 'banGiao', label: 'Người nhận bàn giao công việc', wide: true }, { k: 'diaDanh', label: 'Địa danh', def: 'Hà Nội', me: true }, { k: 'ngay', label: 'Ngày làm đơn', type: 'date' }],
    file: (v) => `Don_di_cong_tac_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => nationHeader() + title('ĐƠN XIN ĐI CÔNG TÁC') + kinhGui(S(v, 'kinhGui'))
      + kv('Tôi tên là', S(v, 'hoTen')) + kv('Chức vụ, chức danh', S(v, 'chucVu')) + kv('Đơn vị công tác', S(v, 'donVi'))
      + P(`Tôi làm đơn này kính đề nghị cho phép tôi đi công tác tại ${S(v, 'noiDen') || dots} từ ngày ${vnDate(S(v, 'tuNgay'))} đến ngày ${vnDate(S(v, 'denNgay'))}.`, { first: 567 })
      + kv('Mục đích, nội dung công tác', S(v, 'mucDich')) + kv('Phương tiện', S(v, 'phuongTien')) + kv('Kinh phí', S(v, 'kinhPhi'))
      + P(`Trong thời gian đi công tác, công việc của tôi được bàn giao cho ${S(v, 'banGiao') || dots}. Tôi xin chấp hành đúng quy định và báo cáo kết quả sau chuyến công tác.`, { first: 567 })
      + P('Trân trọng cảm ơn./.', { first: 567 })
      + signs([{ t: 'Ý KIẾN CỦA LÃNH ĐẠO ĐƠN VỊ', sub: '(Ký, ghi rõ họ tên)' }, { t: 'NGƯỜI LÀM ĐƠN', name: S(v, 'hoTen') }], dateLine(S(v, 'diaDanh'), S(v, 'ngay'))),
  },
  {
    key: 'de-cuong-hoc-phan', label: 'Đề cương học phần', group: 'Giảng dạy, nghiên cứu',
    note: 'Bố cục đề cương học phần thông dụng: thông tin chung, mục tiêu, chuẩn đầu ra, nội dung, học liệu, đánh giá. Đối chiếu mẫu hiện hành của Trường trước khi nộp.',
    fields: [...ORG.slice(0, 3), { k: 'tenHp', label: 'Tên học phần', wide: true }, { k: 'tenTa', label: 'Tên tiếng Anh', wide: true }, { k: 'maHp', label: 'Mã học phần' }, { k: 'soTc', label: 'Số tín chỉ', type: 'number' }, { k: 'loai', label: 'Loại học phần', type: 'select', options: ['Bắt buộc', 'Tự chọn'], def: 'Bắt buộc' }, { k: 'tienQuyet', label: 'Học phần tiên quyết' },
      { k: 'gioHoc', label: 'Phân bổ giờ', ph: 'Lý thuyết 30; Thảo luận 15; Tự học 90', wide: true }, { k: 'giangVien', label: 'Giảng viên (mỗi dòng một người)', type: 'textarea', wide: true, me: true },
      { k: 'mucTieu', label: 'Mục tiêu học phần', type: 'textarea', wide: true }, { k: 'clo', label: 'Chuẩn đầu ra (CLO)', type: 'rows', cols: [{ k: 'ma', label: 'Mã CLO', w: 1100 }, { k: 'mt', label: 'Mô tả chuẩn đầu ra', w: 5800 }, { k: 'md', label: 'Mức độ (Bloom)', w: 1900 }], def: [['CLO1', '', ''], ['CLO2', '', '']] },
      { k: 'tomTat', label: 'Tóm tắt nội dung', type: 'textarea', wide: true },
      { k: 'noiDung', label: 'Nội dung chi tiết, lịch trình', type: 'rows', cols: [{ k: 'tuan', label: 'Tuần/Buổi', w: 1100 }, { k: 'nd', label: 'Nội dung', w: 4600 }, { k: 'clo', label: 'CLO', w: 1100 }, { k: 'ht', label: 'Hình thức dạy học', w: 2000 }], def: [['1', '', '', ''], ['2', '', '', '']] },
      { k: 'hocLieuBb', label: 'Học liệu bắt buộc (mỗi dòng một tài liệu)', type: 'textarea', wide: true }, { k: 'hocLieuTk', label: 'Học liệu tham khảo', type: 'textarea', wide: true },
      { k: 'danhGia', label: 'Kiểm tra, đánh giá', type: 'rows', cols: [{ k: 'ht', label: 'Hình thức', w: 3600 }, { k: 'tt', label: 'Tỷ trọng (%)', w: 1500 }, { k: 'clo', label: 'CLO đánh giá', w: 1800 }, { k: 'gc', label: 'Ghi chú', w: 1900 }], def: [['Chuyên cần', '10', '', ''], ['Bài tập, kiểm tra giữa kỳ', '30', '', ''], ['Thi cuối kỳ', '60', '', '']] },
      { k: 'diaDanh', label: 'Địa danh', def: 'Hà Nội', me: true }, { k: 'ngay', label: 'Ngày', type: 'date' }],
    file: (v) => `De_cuong_${slugFile(S(v, 'maHp') || S(v, 'tenHp'))}`,
    body: (v) => orgHeader(v) + title('ĐỀ CƯƠNG HỌC PHẦN', S(v, 'tenHp').toUpperCase())
      + section('1. Thông tin chung') + kv('Tên học phần (tiếng Việt)', S(v, 'tenHp'), { left: 284 }) + kv('Tên học phần (tiếng Anh)', S(v, 'tenTa'), { left: 284 }) + kv('Mã học phần', S(v, 'maHp'), { left: 284 }) + kv('Số tín chỉ', S(v, 'soTc'), { left: 284 })
      + kv('Loại học phần', S(v, 'loai'), { left: 284 }) + kv('Học phần tiên quyết', S(v, 'tienQuyet') || 'Không', { left: 284 }) + kv('Phân bổ giờ', S(v, 'gioHoc'), { left: 284 }) + kv('Giảng viên', lines(S(v, 'giangVien')).join('; '), { left: 284 })
      + section('2. Mục tiêu học phần') + textBlock(S(v, 'mucTieu'))
      + section('3. Chuẩn đầu ra học phần') + grid([{ k: 'ma', label: 'Mã CLO', w: 1100 }, { k: 'mt', label: 'Mô tả chuẩn đầu ra', w: 5800 }, { k: 'md', label: 'Mức độ (Bloom)', w: 1900 }], RW(v, 'clo'), { stt: false })
      + section('4. Tóm tắt nội dung học phần') + textBlock(S(v, 'tomTat'))
      + section('5. Nội dung chi tiết và lịch trình') + grid([{ k: 'tuan', label: 'Tuần/ Buổi', w: 1100 }, { k: 'nd', label: 'Nội dung', w: 4600 }, { k: 'clo', label: 'CLO', w: 1100 }, { k: 'ht', label: 'Hình thức dạy học', w: 2000 }], RW(v, 'noiDung'), { stt: false, minRows: 3 })
      + section('6. Học liệu') + P('6.1. Học liệu bắt buộc', { i: true, after: 0 }) + (lines(S(v, 'hocLieuBb')).map((t, n) => P(`[${n + 1}] ${t}`, { left: 284 })).join('') || P(`[1] ${dots}`, { left: 284 }))
      + P('6.2. Học liệu tham khảo', { i: true, after: 0 }) + (lines(S(v, 'hocLieuTk')).map((t, n) => P(`[${n + 1}] ${t}`, { left: 284 })).join('') || P(`[1] ${dots}`, { left: 284 }))
      + section('7. Phương pháp, hình thức kiểm tra, đánh giá') + grid([{ k: 'ht', label: 'Hình thức', w: 3600 }, { k: 'tt', label: 'Tỷ trọng (%)', w: 1500 }, { k: 'clo', label: 'CLO đánh giá', w: 1800 }, { k: 'gc', label: 'Ghi chú', w: 1900 }], RW(v, 'danhGia'))
      + signs([{ t: 'TRƯỞNG KHOA' }, { t: 'CHỦ NHIỆM BỘ MÔN' }, { t: 'GIẢNG VIÊN BIÊN SOẠN', name: lines(S(v, 'giangVien'))[0] ?? '' }], dateLine(S(v, 'diaDanh'), S(v, 'ngay'))),
  },
  {
    key: 'thuyet-minh-de-tai', label: 'Đề cương đề tài NCKH', group: 'Giảng dạy, nghiên cứu',
    note: 'Đề cương chi tiết đề án/dự án/dự án tư vấn chính sách/dự án chuyển giao thương mại hóa theo mẫu của Trường Đại học Kinh tế (21 mục). Phần thông tin chủ trì được nhớ cho lần sau; dự toán chi tiết (Phụ lục) lập ở mẫu "Dự toán, quyết toán kinh phí".',
    fields: [
      { k: 'ten', label: '1. Tên (tiếng Việt)', type: 'textarea', wide: true }, { k: 'tenTa', label: 'Tên tiếng Anh', type: 'textarea', wide: true },
      { k: 'soThang', label: '2. Thời gian thực hiện (tháng)', type: 'number', def: '12' }, { k: 'batDau', label: 'Bắt đầu (tháng/năm)', ph: '01/2027' }, { k: 'ketThuc', label: 'Kết thúc (tháng/năm)', ph: '12/2027' },
      { k: 'linhVuc', label: '3. Lĩnh vực ưu tiên', ph: 'Giải pháp xã hội' },
      { k: 'trung', label: '4. Có trùng với đề án/dự án đã hoặc đang tiến hành? (nếu có, nêu lý do)', type: 'textarea', def: 'Không trùng.', wide: true },
      { k: 'hoTen', label: '5.1 Chủ trì: Họ và tên', me: true }, { k: 'ngaySinh', label: 'Ngày, tháng, năm sinh', me: true }, { k: 'gioiTinh', label: 'Nam/Nữ', type: 'select', options: ['', 'Nam', 'Nữ'], def: '' }, { k: 'chuyenMon', label: 'Chuyên môn đào tạo', ph: 'Tiến sĩ Kinh tế', me: true },
      { k: 'chucVu', label: 'Chức vụ', me: true }, { k: 'donVi', label: 'Đơn vị công tác', ph: 'Khoa …, Trường Đại học Kinh tế, ĐHQGHN', me: true }, { k: 'dienThoai', label: 'Điện thoại', me: true }, { k: 'email', label: 'E-mail', me: true },
      { k: 'diaChi', label: 'Địa chỉ liên hệ', def: '144 Xuân Thủy, Cầu Giấy, Hà Nội', wide: true, me: true },
      { k: 'hoatDong', label: 'Tóm tắt hoạt động nghiên cứu của chủ trì', type: 'rows', cols: [{ k: 'tg', label: 'Thời gian', w: 1000 }, { k: 'ten', label: 'Tên đề tài/công trình', w: 3600 }, { k: 'tc', label: 'Tư cách tham gia', w: 1600 }, { k: 'cap', label: 'Cấp quản lý/nơi công bố', w: 2600 }], def: [['', '', '', '']] },
      { k: 'sdh', label: 'Đào tạo sau đại học trong 5 năm gần nhất', type: 'rows', cols: [{ k: 'tg', label: 'Thời gian', w: 1400 }, { k: 'ncs', label: 'Tên nghiên cứu sinh', w: 3700 }, { k: 'ths', label: 'Tên học viên cao học', w: 3700 }], def: [['', '', '']] },
      { k: 'phoiHop', label: '6. Cơ quan phối hợp và cộng tác viên chính', type: 'rows', cols: [{ k: 'cq', label: 'Cơ quan phối hợp', w: 3200 }, { k: 'ten', label: 'Họ và tên', w: 3000 }, { k: 'vt', label: 'Vai trò', w: 2600 }], def: [['', '', 'Thành viên chính'], ['', '', 'Thư ký khoa học']] },
      { k: 'tongQuan', label: '7.1 Tổng quan cơ sở lý luận và các nghiên cứu liên quan', type: 'textarea', wide: true, rows: 4 },
      { k: 'boiCanh', label: '7.2 Bối cảnh chính sách và tính thời sự', type: 'textarea', wide: true, rows: 3 },
      { k: 'khoangTrong', label: '7.3 Vấn đề thực tiễn đặt ra và khoảng trống cần nghiên cứu', type: 'textarea', wide: true, rows: 3 },
      { k: 'lyDo', label: '7.4 Lý do lựa chọn', type: 'textarea', wide: true }, { k: 'nhiemVu', label: '7.5 Các nhiệm vụ nghiên cứu chính', type: 'textarea', wide: true },
      { k: 'diaBan', label: '8. Địa bàn tiến hành nghiên cứu', type: 'textarea', wide: true },
      { k: 'mucTieuTq', label: '9.1 Mục tiêu tổng quát', type: 'textarea', wide: true }, { k: 'mucTieuCt', label: '9.2 Mục tiêu cụ thể (mỗi dòng một mục tiêu)', type: 'textarea', wide: true },
      { k: 'doiTuong', label: '10. Đối tượng và phạm vi nghiên cứu', type: 'textarea', wide: true }, { k: 'phuongPhap', label: '11. Các phương pháp nghiên cứu được sử dụng', type: 'textarea', wide: true, rows: 3 },
      { k: 'chuyenDe', label: '12. Các chuyên đề nghiên cứu dự kiến', type: 'rows', cols: [{ k: 'ten', label: 'Tên chuyên đề', w: 5200 }, { k: 'sp', label: 'Sản phẩm', w: 3600 }], def: [['', 'Báo cáo chuyên đề'], ['', 'Báo cáo chuyên đề']] },
      { k: 'cauTruc', label: '13. Cấu trúc dự kiến báo cáo kết quả (mỗi dòng một phần)', type: 'textarea', wide: true, def: 'Phần 1. Cơ sở lý luận\nPhần 2. Thực trạng\nPhần 3. Giải pháp và kiến nghị' },
      { k: 'daNganh', label: '14. Tính đa ngành và liên ngành', type: 'textarea', wide: true }, { k: 'coSo', label: '15. Khả năng sử dụng cơ sở vật chất, trang thiết bị', type: 'textarea', wide: true }, { k: 'hopTac', label: '16. Khả năng hợp tác quốc tế', type: 'textarea', wide: true },
      { k: 'hoatDongNc', label: '17. Các hoạt động nghiên cứu', type: 'checks', options: HD_NC, def: 'Nghiên cứu lý thuyết\nĐiều tra khảo sát\nViết báo cáo khoa học\nHội thảo khoa học', wide: true },
      { k: 'kqKhoaHoc', label: '18.1 Kết quả khoa học', type: 'textarea', wide: true },
      { k: 'sanPham', label: '18.2 Kết quả ứng dụng (sản phẩm)', type: 'rows', cols: [{ k: 'nhom', label: 'Nhóm sản phẩm', w: 3000 }, { k: 'sp', label: 'Sản phẩm dự kiến/minh chứng nghiệm thu', w: 5800 }], def: [['Báo cáo tổng hợp', ''], ['Bài báo khoa học', '']] },
      { k: 'tiepNhan', label: 'Địa chỉ tiếp nhận dự kiến', wide: true },
      { k: 'kqDaoTao', label: '18.3 Kết quả đào tạo', type: 'textarea', wide: true }, { k: 'kqNangLuc', label: '18.4 Tăng cường năng lực và khả năng ứng dụng', type: 'textarea', wide: true },
      { k: 'khungTienDo', label: '19. Khung tiến độ', type: 'textarea', wide: true, def: 'Khung tiến độ dự kiến: 12 tháng kể từ khi nhiệm vụ được phê duyệt. Các mốc thời gian trong bảng được ký hiệu từ T1 đến T12, tương ứng với các tháng thực hiện.' },
      { k: 'tienDo', label: '19. Nội dung và tiến độ thực hiện (dòng "Công việc …" ghi dưới chuyên đề)', type: 'rows', cols: [{ k: 'hd', label: 'Hoạt động nghiên cứu', w: 4000 }, { k: 'tu', label: 'Từ tháng', w: 1100 }, { k: 'den', label: 'Đến tháng', w: 1100 }, { k: 'sp', label: 'Sản phẩm khoa học', w: 2600 }],
        def: [['Xây dựng đề cương chi tiết, kế hoạch khảo sát và phân công nhiệm vụ', 'T1', 'T1', 'Đề cương triển khai'], ['Chuyên đề 1: ', 'T1', 'T2', 'Báo cáo chuyên đề'], ['Công việc 1: ', '', '', ''], ['Chuyên đề 2: ', 'T2', 'T3', 'Báo cáo chuyên đề'], ['Hoàn thiện báo cáo tổng hợp, hồ sơ nghiệm thu', 'T12', 'T12', 'Báo cáo tổng hợp']] },
      { k: 'luuY', label: 'Lưu ý về tiến độ (nếu có)', type: 'textarea', wide: true },
      { k: 'nguon', label: '20. Nguồn kinh phí', type: 'select', options: ['Quỹ phát triển tiềm lực KH&CN', 'Nguồn ngân sách nhà nước', 'Nguồn khác'], def: 'Quỹ phát triển tiềm lực KH&CN' },
      { k: 'canCuKp', label: '20. Căn cứ xác định kinh phí', type: 'textarea', wide: true, ph: 'Kinh phí được xác định theo khối lượng thực hiện các chuyên đề, phạm vi khảo sát, số buổi hội thảo và định mức chi của đơn vị chủ trì.' },
      { k: 'kinhPhi', label: '20. Phân bổ kinh phí dự kiến (để trống "Trả công lao động" và "Chi khác" thì lấy tổng từ Phụ lục 2, Phụ lục 3)', type: 'rows', cols: [{ k: 'kc', label: 'Khoản chi', w: 3400 }, { k: 'tong', label: 'Tổng số (đồng)', w: 1800, type: 'money' }, { k: 'khoan', label: 'Trong đó khoán chi (đồng)', w: 1800, type: 'money' }, { k: 'nam2', label: 'Phần chi năm thứ hai (đồng)', w: 1800, type: 'money' }], def: KP_ROWS.map((r) => [r, '', '', '']) },
      { k: 'phuLuc', label: 'Kèm phụ lục dự toán', type: 'select', options: ['Có', 'Không'], def: 'Có' },
      { k: 'congLd', label: 'Phụ lục 2. Dự toán công lao động khoa học (dòng "Chuyên đề …", "Công việc …" để trống hệ số; thành tiền = hệ số × định mức × số tháng)', type: 'rows', cols: [{ k: 'nd', label: 'Nội dung, công việc / chức danh', w: 3800 }, { k: 'hs', label: 'Hệ số', w: 900 }, { k: 'sn', label: 'Số người', w: 900 }, { k: 'dm', label: 'Định mức (đồng/tháng)', w: 1800, type: 'money' }, { k: 'th', label: 'Số tháng quy đổi', w: 1100 }],
        def: [['Chuyên đề 1: ', '', '', '', ''], ['Công việc 1: ', '', '', '', ''], ['Thành viên chính đề tài', '0,8', '1', '25000000', '0,3'], ['Chuyên đề 2: ', '', '', '', ''], ['Công việc 1: ', '', '', '', ''], ['Thành viên chính đề tài', '0,8', '1', '25000000', '0,3'], ['Thù lao chủ nhiệm đề tài', '1,0', '1', '25000000', '1,2'], ['Thù lao thư ký khoa học', '0,3', '1', '25000000', '1,2']] },
      { k: 'chiKhac', label: 'Phụ lục 3. Dự toán chi khác', type: 'rows', cols: [{ k: 'nd', label: 'Nội dung', w: 3400 }, { k: 'dg', label: 'Diễn giải (số lượng × đơn giá)', w: 3400 }, { k: 'tien', label: 'Thành tiền (đồng)', w: 2000, type: 'money' }], sum: 'tien',
        def: [['Kinh phí quản lý, điều phối nhiệm vụ', '', ''], ['Hội thảo khoa học', '', ''], ['Nghiệm thu và đánh giá kết quả', '', ''], ['In ấn, văn phòng phẩm', '', '']] },
      { k: 'tlViet', label: '21.1 Tài liệu tiếng Việt (mỗi dòng một tài liệu)', type: 'textarea', wide: true, rows: 3 }, { k: 'tlAnh', label: '21.2 Tài liệu tiếng Anh', type: 'textarea', wide: true, rows: 3 },
      { k: 'diaDanh', label: 'Địa danh', def: 'Hà Nội', me: true }, { k: 'ngay', label: 'Ngày', type: 'date' }],
    file: (v) => `De_cuong_NCKH_${slugFile(S(v, 'ten'))}`,
    body: (v) => {
      const L = { left: 0, first: 0 } as P;
      const head = layout([[3900, P('ĐẠI HỌC QUỐC GIA HÀ NỘI', { sz: 26, jc: 'center', after: 0 }) + P('TRƯỜNG ĐẠI HỌC KINH TẾ', { sz: 26, b: true, jc: 'center', after: 0 }) + rule(1150)],
        [5560, P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { sz: 24, b: true, jc: 'center', after: 0 }) + P('Độc lập - Tự do - Hạnh phúc', { sz: 26, b: true, jc: 'center', after: 0 }) + rule(950)]]);
      const sub = (t: string) => P(t, { b: true, i: true, before: 60, after: 60, keep: true });
      const kp = RW(v, 'kinhPhi');
      const kpCols: Col[] = [{ k: 'n', label: 'Nguồn kinh phí', w: 2150 }, { k: 't', label: 'Tổng số', w: 1200, type: 'number' }, ...KP_ROWS.map((l, i) => ({ k: `c${i}`, label: l, w: 1200, type: 'number' as const }))];
      const byKhoan = (col: number) => KP_ROWS.map((name, i) => parseMoney((kp.find((r) => r[0] === name) ?? kp[i] ?? [])[col] ?? ''));
      const pl2 = congLd(RW(v, 'congLd'));
      const pl3 = RW(v, 'chiKhac').reduce((a, r) => a + parseMoney(r[2] ?? ''), 0);
      const tong = byKhoan(1).map((n, i) => n || (i === 0 ? pl2.total : i === 4 ? pl3 : 0)), khoan = byKhoan(2), khong = tong.map((t, i) => Math.max(0, t - khoan[i]));
      const nam2 = byKhoan(3);
      const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0);
      const tr = (n: number) => { if (!n) return ''; const t = Math.round(n / 1000) / 1000; const [i, f] = String(t).split('.'); return vnd(Number(i)) + (f ? `,${f}` : ''); };
      const row = (label: string, a: number[]) => [label, tr(sumOf(a)), ...a.map(tr)];
      const quy = S(v, 'nguon') !== 'Nguồn ngân sách nhà nước';
      const kpRows = [row('Tổng kinh phí', tong), row(`Trong đó: ${S(v, 'nguon') || 'Quỹ phát triển tiềm lực KH&CN'}`, tong), row('a. Kinh phí khoán chi', khoan), row('b. Kinh phí không khoán chi', khong), ...(quy ? [row('Nguồn ngân sách nhà nước', [0, 0, 0, 0, 0])] : [])];
      const checks = lines(S(v, 'hoatDongNc'));
      const tl = (s: string) => (lines(s).length ? lines(s).map((t, i) => P(`${i + 1}. ${t.replace(/^\d+[.)]\s*/, '')}`, { left: 284, first: -284 })).join('') : P(dots + dots.slice(0, 13)));
      return head + P('ĐỀ CƯƠNG CHI TIẾT', { b: true, sz: 30, jc: 'center', before: 240, after: 0, keep: true })
        + P('(đề án/dự án/dự án tư vấn chính sách/dự án chuyển giao thương mại hóa)', { i: true, jc: 'center', after: 240 })
        + section('1. Tên đề án/dự án/dự án tư vấn chính sách/dự án chuyển giao thương mại hóa') + kv('Tiếng Việt', S(v, 'ten'), L) + kv('Tiếng Anh', S(v, 'tenTa'), L)
        + PR([['2. Thời gian thực hiện: ', { b: true }], [S(v, 'soThang') ? `${S(v, 'soThang')} tháng` : '…… tháng', {}]], { after: 60, keep: true })
        + P(`Bắt đầu từ tháng ${monthYear(S(v, 'batDau'))} đến tháng ${monthYear(S(v, 'ketThuc'))}`, { after: 60 })
        + section('3. Đề tài thuộc lĩnh vực ưu tiên:') + P(S(v, 'linhVuc') || dots)
        + section('4. Đề án/dự án/dự án tư vấn chính sách/dự án chuyển giao thương mại hóa có trùng với một Đề án/dự án/dự án tư vấn chính sách/dự án chuyển giao thương mại hóa đã hoặc đang tiến hành không? Nếu có, nêu lý do') + textBlock(S(v, 'trung'))
        + section('5. Chủ trì') + kv('5.1 Họ và tên', S(v, 'hoTen'))
        + layout([[5200, kvS('Ngày, tháng, năm sinh', S(v, 'ngaySinh'))], [4260, kvS('Nam/Nữ', S(v, 'gioiTinh'))]])
        + kv('Chuyên môn đào tạo', S(v, 'chuyenMon')) + kv('Chức vụ', S(v, 'chucVu')) + kv('Đơn vị công tác', S(v, 'donVi')) + kv('Địa chỉ liên hệ', S(v, 'diaChi'))
        + layout([[5200, kvS('Điện thoại', S(v, 'dienThoai'))], [4260, kvS('E-mail', S(v, 'email'))]])
        + P('Tóm tắt hoạt động nghiên cứu của chủ trì (các chương trình, đề tài nghiên cứu khoa học đã tham gia, các công trình đã công bố liên quan tới phương hướng của đề tài)', { i: true, before: 60, keep: true })
        + grid([{ k: 'tg', label: 'Thời gian', w: 1000 }, { k: 'ten', label: 'Tên đề tài/công trình', w: 3600 }, { k: 'tc', label: 'Tư cách tham gia', w: 1600 }, { k: 'cap', label: 'Cấp quản lý/nơi công bố', w: 2600 }], RW(v, 'hoatDong'), { stt: false, minRows: 3 })
        + P('Đào tạo sau đại học trong 5 năm gần nhất', { i: true, keep: true })
        + grid([{ k: 'tg', label: 'Thời gian', w: 1400 }, { k: 'ncs', label: 'Tên nghiên cứu sinh', w: 3700 }, { k: 'ths', label: 'Tên học viên cao học', w: 3700 }], RW(v, 'sdh'), { stt: false })
        + section('6. Cơ quan phối hợp và cộng tác viên chính') + P('(Ghi rõ các đơn vị và cá nhân đã được mời và nhận lời mời tham gia đề tài; mỗi cá nhân tham gia đề tài phải có bản Lý lịch khoa học theo biểu mẫu BM 02/2008/ĐHKT-NCKH và ý kiến xác nhận đồng ý tham gia thực hiện đề tài)', { i: true, keep: true })
        + grid([{ k: 'cq', label: 'Cơ quan phối hợp', w: 3200 }, { k: 'ten', label: 'Họ và tên', w: 3000 }, { k: 'vt', label: 'Vai trò', w: 2600 }], RW(v, 'phoiHop'))
        + section('7. THUYẾT MINH SỰ CẦN THIẾT HÌNH THÀNH ĐỀ ÁN/DỰ ÁN')
        + sub('7.1. Tổng quan cơ sở lý luận và các nghiên cứu liên quan') + textBlock(S(v, 'tongQuan'))
        + sub('7.2. Bối cảnh chính sách và tính thời sự') + textBlock(S(v, 'boiCanh'))
        + sub('7.3. Vấn đề thực tiễn đặt ra và khoảng trống cần nghiên cứu') + textBlock(S(v, 'khoangTrong'))
        + sub('7.4. Lý do lựa chọn') + textBlock(S(v, 'lyDo'))
        + sub('7.5. Các nhiệm vụ nghiên cứu chính') + textBlock(S(v, 'nhiemVu'))
        + section('8. ĐỊA BÀN TIẾN HÀNH NGHIÊN CỨU') + textBlock(S(v, 'diaBan'))
        + section('9. MỤC TIÊU') + sub('9.1. Mục tiêu tổng quát') + textBlock(S(v, 'mucTieuTq')) + sub('9.2. Mục tiêu cụ thể') + textBlock(S(v, 'mucTieuCt'))
        + section('10. ĐỐI TƯỢNG VÀ PHẠM VI NGHIÊN CỨU') + textBlock(S(v, 'doiTuong'))
        + section('11. CÁC PHƯƠNG PHÁP NGHIÊN CỨU ĐƯỢC SỬ DỤNG') + textBlock(S(v, 'phuongPhap'))
        + section('12. CÁC CHUYÊN ĐỀ NGHIÊN CỨU DỰ KIẾN')
        + (RW(v, 'chuyenDe').filter((r) => r.some(Boolean)).map((r, i) => PR([[`Chuyên đề ${i + 1}: `, { b: true }], [r[0] || dots, {}]], { first: 567, after: 0 }) + PR([['Sản phẩm: ', { i: true }], [r[1] || dots, {}]], { first: 567 })).join('') || P(dots + dots, { first: 567 }))
        + section('13. CẤU TRÚC DỰ KIẾN BÁO CÁO KẾT QUẢ') + textBlock(S(v, 'cauTruc'))
        + section('14. TÍNH ĐA NGÀNH VÀ LIÊN NGÀNH') + textBlock(S(v, 'daNganh'))
        + section('15. KHẢ NĂNG SỬ DỤNG CƠ SỞ VẬT CHẤT, TRANG THIẾT BỊ') + textBlock(S(v, 'coSo'))
        + section('16. KHẢ NĂNG HỢP TÁC QUỐC TẾ') + textBlock(S(v, 'hopTac'))
        + section('17. CÁC HOẠT ĐỘNG NGHIÊN CỨU')
        + layout([[4730, HD_NC.slice(0, 4).map((o) => P(`${checks.includes(o) ? '☒' : '☐'}  ${o}`, { after: 40 })).join('')], [4730, HD_NC.slice(4).map((o) => P(`${checks.includes(o) ? '☒' : '☐'}  ${o}`, { after: 40 })).join('')]])
        + section('18. KẾT QUẢ DỰ KIẾN') + sub('18.1. Kết quả khoa học') + textBlock(S(v, 'kqKhoaHoc'))
        + sub('18.2. Kết quả ứng dụng') + grid([{ k: 'nhom', label: 'Nhóm sản phẩm', w: 3000 }, { k: 'sp', label: 'Sản phẩm dự kiến/minh chứng nghiệm thu', w: 5800 }], RW(v, 'sanPham'))
        + kv('Địa chỉ tiếp nhận dự kiến', S(v, 'tiepNhan'))
        + sub('18.3. Kết quả đào tạo') + textBlock(S(v, 'kqDaoTao'))
        + sub('18.4. Tăng cường năng lực và khả năng ứng dụng') + textBlock(S(v, 'kqNangLuc'))
        + section('19. NỘI DUNG VÀ TIẾN ĐỘ THỰC HIỆN') + (S(v, 'khungTienDo') ? P(`- ${S(v, 'khungTienDo').replace(/^-\s*/, '')}`, { first: 567 }) : '')
        + tienDoTable(RW(v, 'tienDo')) + (S(v, 'luuY') ? PR([['Lưu ý: ', { b: true, i: true }], [S(v, 'luuY'), { i: true }]]) : '')
        + section('20. PHÂN BỔ KINH PHÍ DỰ KIẾN') + (S(v, 'canCuKp') ? textBlock(S(v, 'canCuKp'), { keep: true }) : '') + P('Đơn vị tính: triệu đồng', { i: true, jc: 'right', after: 0, keep: true })
        + grid(kpCols, kpRows, { stt: false, minRows: kpRows.length })
        + section('21. TÀI LIỆU THAM KHẢO') + sub('21.1. Tài liệu tiếng Việt') + tl(S(v, 'tlViet')) + sub('21.2. Tài liệu tiếng Anh') + tl(S(v, 'tlAnh'))
        + signs([{ t: '', sub: '' }, { t: 'CHỦ NHIỆM NHIỆM VỤ', name: S(v, 'hoTen') }], dateLine(S(v, 'diaDanh'), S(v, 'ngay')))
        + (S(v, 'phuLuc') === 'Không' ? '' : phuLuc(tong, khoan, nam2, pl2, RW(v, 'chiKhac')));
    },
  },
  {
    key: 'ly-lich-khoa-hoc', label: 'Lý lịch khoa học (Mẫu 04/KHCN)', group: 'Giảng dạy, nghiên cứu',
    note: 'Điền thẳng vào file Mẫu 04/KHCN gốc của ĐHQGHN (giữ nguyên phông, cỡ chữ, bố cục). Mục để trống giữ dấu chấm để điền tay.',
    build: async (v) => (await import('./mau04')).buildMau04(v),
    original: { href: '/mau/Mau_04_KHCN_Ly_lich_khoa_hoc.docx', label: 'Tải mẫu gốc (trống)' },
    fields: [
      { k: 'hoTen', label: '1. Họ và tên', me: true }, { k: 'namSinh', label: '2. Năm sinh', me: true }, { k: 'gioiTinh', label: 'Giới tính', type: 'select', options: ['', 'Nam', 'Nữ'], def: '' },
      { k: 'diaChi', label: '3. Địa chỉ liên hệ', wide: true, me: true }, { k: 'dienThoai', label: 'Điện thoại', me: true }, { k: 'email', label: 'Email', me: true },
      { k: 'hocVi', label: '4.1. Học vị', me: true }, { k: 'hocHam', label: '4.2. Học hàm', me: true }, { k: 'pgsNam', label: 'Năm bổ nhiệm PGS', me: true }, { k: 'pgsNoi', label: 'Tổ chức bổ nhiệm PGS', me: true }, { k: 'gsNam', label: 'Năm bổ nhiệm GS', me: true }, { k: 'gsNoi', label: 'Tổ chức bổ nhiệm GS', me: true },
      { k: 'coQuanCt', label: '5. Tên cơ quan', def: 'Trường Đại học Kinh tế - ĐHQGHN', me: true }, { k: 'boMon', label: 'Phòng TN, Bộ môn, Trung tâm, Khoa, Viện', me: true }, { k: 'diaChiCq', label: 'Địa chỉ cơ quan', def: '144 Xuân Thủy, Cầu Giấy, Hà Nội', wide: true, me: true }, { k: 'dtCq', label: 'Điện thoại cơ quan', me: true }, { k: 'emailCq', label: 'Email cơ quan', me: true },
      { k: 'daoTao', label: '6. Quá trình đào tạo', type: 'rows', cols: [{ k: 'bac', label: 'Bậc đào tạo', w: 1500 }, { k: 'noi', label: 'Nơi đào tạo', w: 3400 }, { k: 'cm', label: 'Chuyên môn', w: 2600 }, { k: 'nam', label: 'Năm tốt nghiệp', w: 1300 }], def: [['Đại học', '', '', ''], ['Thạc sĩ', '', '', ''], ['Tiến sĩ', '', '', ''], ['TSKH', '', '', '']] },
      { k: 'khoaKhac', label: '7. Các khóa đào tạo khác', type: 'rows', cols: [{ k: 'vb', label: 'Văn bằng', w: 1800 }, { k: 'ten', label: 'Tên khóa đào tạo', w: 3200 }, { k: 'noi', label: 'Nơi đào tạo', w: 2400 }, { k: 'tg', label: 'Thời gian đào tạo', w: 1400 }], def: [['', '', '', '']] },
      { k: 'sach', label: '8. Sách chuyên khảo, giáo trình (mỗi dòng một sách)', type: 'textarea', wide: true },
      { k: 'wos', label: '9.1. Số bài WoS/Scopus', type: 'number' }, { k: 'qtKhac', label: '9.2. Số bài tạp chí quốc tế khác', type: 'number' }, { k: 'trongNuoc', label: '9.3. Số bài tạp chí trong nước', type: 'number' }, { k: 'hoiNghi', label: '9.4. Số báo cáo hội nghị quốc tế', type: 'number' },
      { k: 'congBo', label: 'Danh mục công bố (mỗi dòng một công trình)', type: 'textarea', wide: true, rows: 4 },
      { k: 'shtt', label: '10. Bằng sở hữu trí tuệ', type: 'rows', cols: [{ k: 'ten', label: 'Tên và nội dung văn bằng', w: 3800 }, { k: 'so', label: 'Số, ký hiệu', w: 1800 }, { k: 'noi', label: 'Nơi cấp', w: 1800 }, { k: 'nam', label: 'Năm cấp', w: 1400 }], def: [['', '', '', '']] },
      { k: 'spNuocNgoai', label: '11.1. Số sản phẩm ứng dụng ở nước ngoài', type: 'number' }, { k: 'spTrongNuoc', label: '11.2. Số sản phẩm ứng dụng trong nước', type: 'number' },
      { k: 'sanPham', label: '11.3. Sản phẩm ứng dụng, chuyển giao', type: 'rows', cols: [{ k: 'ten', label: 'Tên sản phẩm', w: 3200 }, { k: 'tg', label: 'Thời gian, hình thức, quy mô, địa chỉ áp dụng', w: 3400 }, { k: 'cd', label: 'Công dụng', w: 2200 }], def: [['', '', '']] },
      { k: 'chuNhiem', label: '12.1. Nhiệm vụ KH&CN đã và đang chủ nhiệm', type: 'rows', cols: [{ k: 'ten', label: 'Tên nhiệm vụ/Mã số', w: 3000 }, { k: 'tg', label: 'Thời gian (bắt đầu - kết thúc)', w: 1800 }, { k: 'cq', label: 'Cơ quan quản lý nhiệm vụ, thuộc Chương trình (nếu có)', w: 2200 }, { k: 'tt', label: 'Tình trạng nhiệm vụ', w: 1800 }], def: [['', '', '', '']] },
      { k: 'thamGia', label: '12.2. Nhiệm vụ KH&CN đã và đang tham gia', type: 'rows', cols: [{ k: 'ten', label: 'Tên nhiệm vụ/Mã số', w: 3000 }, { k: 'tg', label: 'Thời gian (bắt đầu - kết thúc)', w: 1800 }, { k: 'cq', label: 'Cơ quan quản lý nhiệm vụ, thuộc Chương trình (nếu có)', w: 2200 }, { k: 'tt', label: 'Tình trạng nhiệm vụ', w: 1800 }], def: [['', '', '', '']] },
      { k: 'tsDaDt', label: '13.1. Số tiến sĩ đã đào tạo', type: 'number' }, { k: 'ncsDang', label: '13.2. Số NCS đang hướng dẫn', type: 'number' }, { k: 'thsDaDt', label: '13.3. Số thạc sĩ đã đào tạo', type: 'number' },
      { k: 'ncs', label: '13.4. Nghiên cứu sinh đã/đang hướng dẫn', type: 'rows', cols: [{ k: 'ten', label: 'Họ tên NCS', w: 1800 }, { k: 'la', label: 'Tên luận án', w: 2600 }, { k: 'vt', label: 'Vai trò hướng dẫn (chính hay phụ)', w: 1400 }, { k: 'tg', label: 'Thời gian đào tạo', w: 1300 }, { k: 'cq', label: 'Cơ quan công tác, địa chỉ liên hệ', w: 1700 }], def: [['', '', '', '', '']] },
      { k: 'ths', label: 'Thạc sĩ đã hướng dẫn', type: 'rows', cols: [{ k: 'ten', label: 'Họ tên ThS', w: 1800 }, { k: 'la', label: 'Tên luận văn', w: 2600 }, { k: 'vt', label: 'Vai trò hướng dẫn (chính hay phụ)', w: 1400 }, { k: 'tg', label: 'Thời gian đào tạo', w: 1300 }, { k: 'cq', label: 'Cơ quan công tác, địa chỉ liên hệ', w: 1700 }], def: [['', '', '', '', '']] },
      { k: 'khac', label: 'Những thông tin khác về các hoạt động KH&CN', type: 'textarea', wide: true },
      { k: 'diaDanh', label: 'Địa danh', def: 'Hà Nội', me: true }, { k: 'ngay', label: 'Ngày khai', type: 'date' },
    ],
    file: (v) => `Ly_lich_khoa_hoc_${slugFile(S(v, 'hoTen'))}`,
    body: (v) => {
      const n = (k: string) => S(v, k) || '……';
      const L = { left: 284 };
      const ncsCols: Col[] = [{ k: 'ten', label: 'Họ tên NCS/ThS', w: 1800 }, { k: 'la', label: 'Tên luận án của NCS (đã bảo vệ luận án TS hoặc đang làm NCS), luận văn của ThS', w: 2600 }, { k: 'vt', label: 'Vai trò hướng dẫn (chính hay phụ)', w: 1400 }, { k: 'tg', label: 'Thời gian đào tạo', w: 1300 }, { k: 'cq', label: 'Cơ quan công tác của TS, NCS, ThS, địa chỉ liên hệ (nếu có)', w: 1700 }];
      const sub = (label: string) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(Math.round(600 * TW / 9400), P(label.split(' ')[0], { b: true, sz: TSZ, jc: 'center', after: 0 }))}${tc(TW - Math.round(600 * TW / 9400), P(label.split(' ').slice(1).join(' '), { b: true, sz: TSZ, after: 0 }), '<w:gridSpan w:val="5"/>')}</w:tr>`;
      const ncsTable = grid(ncsCols, [], { minRows: 0 }).replace(/<\/w:tbl>/, () => {
        const scale = TW / (600 + ncsCols.reduce((a, c) => a + c.w, 0));
        const ws = [600, ...ncsCols.map((c) => c.w)].map((w) => Math.round(w * scale));
        const rowsOf = (rs: string[][]) => {
          const f = rs.filter((r) => r.some((x) => x?.trim()));
          return (f.length ? f : [['', '', '', '', ''], ['', '', '', '', '']]).map((r, i) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(ws[0], P(String(i + 1), { sz: TSZ, jc: 'center', after: 0 }))}${r.map((c, j) => tc(ws[j + 1], P(c ?? '', { sz: TSZ, after: 0, line: 240 }))).join('')}</w:tr>`).join('');
        };
        return `${sub('I Nghiên cứu sinh')}${rowsOf(RW(v, 'ncs'))}${sub('II Thạc sĩ')}${rowsOf(RW(v, 'ths'))}</w:tbl>`;
      });
      const head = layout([[5600, ''], [3860, P('MẪU 04/ KHCN', { b: true, sz: 26, jc: 'center', after: 0 }) + P('(Ban hành kèm theo Quyết định số     /QĐ-ĐHQGHN ngày     tháng     năm 2022 của Giám đốc Đại học Quốc gia Hà Nội)', { i: true, sz: 22, jc: 'center', after: 0, line: 240 })]]);
      const titleRow = layout([[7600, P('LÝ LỊCH KHOA HỌC', { b: true, sz: 32, jc: 'center', before: 240, after: 0 }) + P('(Dành cho các cán bộ đăng ký chủ nhiệm và tham gia thực hiện các nhiệm vụ KH&CN của ĐHQGHN)', { i: true, sz: 26, jc: 'center' })],
        [1700, `<w:tbl><w:tblPr><w:tblW w:w="1500" w:type="dxa"/>${B1}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="1500"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="2000" w:hRule="exact"/></w:trPr>${tc(1500, P('Ảnh', { jc: 'center', sz: 24, after: 0 }) + P('3x4', { jc: 'center', sz: 24, after: 0 }))}</w:tr></w:tbl><w:p/>`]]);
      const list = (k: string) => (lines(S(v, k)).length ? lines(S(v, k)) : ['……………………………………………………………………', '……………………………………………………………………']).map((t, i) => P(`[${i + 1}] ${t}`, { left: 0 })).join('');
      return head + titleRow
        + kv('1. Họ và tên', S(v, 'hoTen')) + PR([[`2. Năm sinh: ${n('namSinh')}`, {}], [`\t\t\tGiới tính: ${n('gioiTinh')}`, {}]])
        + kv('3. Địa chỉ liên hệ', S(v, 'diaChi')) + kvS('Điện thoại', S(v, 'dienThoai')) + kv('Email', S(v, 'email'))
        + P('4. Học hàm, học vị:', { after: 60 }) + kv('4.1. Học vị', S(v, 'hocVi')) + kv('4.2. Học hàm', S(v, 'hocHam'))
        + kv('Năm được bổ nhiệm chức danh Phó Giáo sư, tổ chức bổ nhiệm', [S(v, 'pgsNam'), S(v, 'pgsNoi')].filter(Boolean).join(', ')) + kv('Năm được bổ nhiệm chức danh Giáo sư, tổ chức bổ nhiệm', [S(v, 'gsNam'), S(v, 'gsNoi')].filter(Boolean).join(', '))
        + P('5. Cơ quan công tác:', { after: 60 }) + kv('Tên cơ quan', S(v, 'coQuanCt')) + kv('Phòng TN, Bộ môn, Trung tâm, Khoa, Viện', S(v, 'boMon')) + kv('Địa chỉ Cơ quan', S(v, 'diaChiCq'))
        + section('6. Quá trình đào tạo') + grid([{ k: 'bac', label: 'Bậc đào tạo', w: 1500 }, { k: 'noi', label: 'Nơi đào tạo', w: 3400 }, { k: 'cm', label: 'Chuyên môn', w: 2600 }, { k: 'nam', label: 'Năm tốt nghiệp', w: 1300 }], RW(v, 'daoTao').length ? RW(v, 'daoTao') : [['Đại học'], ['Thạc sĩ'], ['Tiến sĩ'], ['TSKH']], { stt: false, minRows: 4 })
        + section('7. Các khoá đào tạo khác (nếu có)') + grid([{ k: 'vb', label: 'Văn bằng', w: 1800 }, { k: 'ten', label: 'Tên khoá đào tạo', w: 3200 }, { k: 'noi', label: 'Nơi đào tạo', w: 2400 }, { k: 'tg', label: 'Thời gian đào tạo', w: 1400 }], RW(v, 'khoaKhac'), { stt: false })
        + section('8. Sách chuyên khảo, giáo trình (Tên tác giả; tên sách, giáo trình; NXB; nơi xuất bản; năm xuất bản)') + list('sach')
        + section('9. Các công trình khoa học đã công bố')
        + P(`9.1. Số bài đăng trên các tạp chí quốc tế thuộc danh mục Web of Science/SCOPUS: ${n('wos')}`, L) + P(`9.2. Số bài báo đăng trên các tạp chí quốc tế không thuộc danh mục Web of Science/SCOPUS: ${n('qtKhac')}`, L)
        + P(`9.3. Số bài báo đăng trên các tạp chí chuyên ngành trong nước: ${n('trongNuoc')}`, L) + P(`9.4. Số báo cáo tham gia các Hội nghị khoa học Quốc tế: ${n('hoiNghi')}`, L)
        + P('Liệt kê đầy đủ các công bố nêu trên từ trước đến nay theo thứ tự thời gian, ưu tiên các dòng đầu cho 5 công trình tiêu biểu, xuất sắc nhất, các công trình có liên quan tới vấn đề chuyên môn của nhiệm vụ (tên tác giả, năm xuất bản, tên công trình, tên tạp chí, volume, trang số):', L) + list('congBo')
        + section('10. Bằng sở hữu trí tuệ đã được cấp') + grid([{ k: 'ten', label: 'Tên và nội dung văn bằng', w: 3800 }, { k: 'so', label: 'Số, Ký hiệu', w: 1800 }, { k: 'noi', label: 'Nơi cấp', w: 1800 }, { k: 'nam', label: 'Năm cấp', w: 1400 }], RW(v, 'shtt'))
        + section('11. Sản phẩm được ứng dụng, chuyển giao') + P(`11.1. Số lượng sản phẩm KH&CN ứng dụng ở nước ngoài: ${n('spNuocNgoai')}`) + P(`11.2. Số lượng sản phẩm KH&CN ứng dụng trong nước: ${n('spTrongNuoc')}`) + P('11.3. Liệt kê chi tiết các sản phẩm theo bảng sau:')
        + grid([{ k: 'ten', label: 'Tên sản phẩm', w: 3200 }, { k: 'tg', label: 'Thời gian, hình thức, quy mô, địa chỉ áp dụng', w: 3400 }, { k: 'cd', label: 'Công dụng', w: 2200 }], RW(v, 'sanPham'))
        + section('12. Nhiệm vụ KH&CN các cấp đã chủ trì hoặc tham gia') + P('12.1. Nhiệm vụ KH&CN đã và đang chủ nhiệm')
        + grid([{ k: 'ten', label: 'Tên nhiệm vụ/Mã số', w: 3000 }, { k: 'tg', label: 'Thời gian (bắt đầu - kết thúc)', w: 1800 }, { k: 'cq', label: 'Cơ quan quản lý nhiệm vụ, thuộc Chương trình (nếu có)', w: 2200 }, { k: 'tt', label: 'Tình trạng nhiệm vụ (đã nghiệm thu/ chưa nghiệm thu/ không hoàn thành)', w: 1800 }], RW(v, 'chuNhiem'), { stt: false })
        + P('12.2. Nhiệm vụ KH&CN đã và đang tham gia với tư cách thành viên')
        + grid([{ k: 'ten', label: 'Tên nhiệm vụ/Mã số', w: 3000 }, { k: 'tg', label: 'Thời gian (bắt đầu - kết thúc)', w: 1800 }, { k: 'cq', label: 'Cơ quan quản lý nhiệm vụ, thuộc Chương trình (nếu có)', w: 2200 }, { k: 'tt', label: 'Tình trạng nhiệm vụ (đã nghiệm thu/ chưa nghiệm thu/ không hoàn thành)', w: 1800 }], RW(v, 'thamGia'), { stt: false })
        + section('13. Quá trình tham gia đào tạo sau đại học') + P(`13.1. Số lượng tiến sĩ đã đào tạo: ${n('tsDaDt')}`) + P(`13.2. Số lượng NCS đang hướng dẫn: ${n('ncsDang')}`) + P(`13.3. Số lượng thạc sĩ đã đào tạo: ${n('thsDaDt')}`) + P('13.4. Thông tin chi tiết:')
        + ncsTable
        + P('NHỮNG THÔNG TIN KHÁC VỀ CÁC HOẠT ĐỘNG KH&CN', { b: true, before: 120 }) + P('Tham gia các tổ chức, hiệp hội ngành nghề; thành viên Ban biên tập các tạp chí khoa học trong và ngoài nước; thành viên các hội đồng khoa học quốc gia, quốc tế; ...', { i: true }) + textBlock(S(v, 'khac'))
        + signs([{ t: 'XÁC NHẬN CỦA\nĐƠN VỊ CHỦ TRÌ', sub: '' }, { t: 'NGƯỜI KHAI', sub: '(Họ tên và chữ ký)', name: S(v, 'hoTen') }], dateLine(S(v, 'diaDanh'), S(v, 'ngay')));
    },
  },
];

export const formFile = (def: FormDef, v: Values) => `${def.file(v).replace(/_+$/, '') || def.key}.docx`;
