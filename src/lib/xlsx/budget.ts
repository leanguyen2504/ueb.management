// Dự toán kinh phí (hội thảo, công tác, tập huấn, sự kiện) và file Excel (.xlsx) có công thức.
// Mức chi mẫu chỉ để tham khảo: đơn vị đối chiếu Quy chế chi tiêu nội bộ hiện hành trước khi trình.
import { makeEntry, writeZip } from '@/lib/docx/zip';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type BudgetItem = { noiDung: string; dvt: string; sl: number; lan: number; donGia: number; ghiChu: string; thucChi?: number };
export type BudgetGroup = { ten: string; items: BudgetItem[] };
export type Signer = { chucDanh: string; hoTen: string };
export type BudgetInput = {
  loai?: 'du-toan' | 'quyet-toan';
  chuQuan: string;
  donVi: string;
  boPhan: string;
  tieuDe: string; // ví dụ: Tổ chức Hội thảo khoa học quốc gia "..."
  thoiGian: string;
  diaDiem: string;
  soNguoi: number;
  soNgay: number;
  canCu: string; // mỗi dòng một căn cứ
  groups: BudgetGroup[];
  diaDanh: string;
  ngay: string; // YYYY-MM-DD hoặc rỗng
  signers: Signer[];
};

export const amount = (i: BudgetItem) => Math.round((Number(i.sl) || 0) * (Number(i.lan) || 0) * (Number(i.donGia) || 0));
export const groupTotal = (g: BudgetGroup) => g.items.reduce((a, i) => a + amount(i), 0);
export const grandTotal = (b: BudgetInput) => b.groups.reduce((a, g) => a + groupTotal(g), 0);
export const actualTotal = (b: BudgetInput) => b.groups.reduce((a, g) => a + g.items.reduce((x, i) => x + (Number(i.thucChi) || 0), 0), 0);
export const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN');

// ---------- Đọc số thành chữ ----------
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function block(n: number, full: boolean) {
  const tr = Math.floor(n / 100);
  const ch = Math.floor((n % 100) / 10);
  const dv = n % 10;
  const out: string[] = [];
  if (full || tr > 0) out.push(`${DIGITS[tr]} trăm`);
  if (ch > 1) {
    out.push(`${DIGITS[ch]} mươi`);
    if (dv === 1) out.push('mốt');
    else if (dv === 5) out.push('lăm');
    else if (dv > 0) out.push(DIGITS[dv]);
  } else if (ch === 1) {
    out.push('mười');
    if (dv === 5) out.push('lăm');
    else if (dv > 0) out.push(DIGITS[dv]);
  } else if (dv > 0) {
    if (full || tr > 0) out.push('lẻ');
    out.push(DIGITS[dv]);
  }
  return out.join(' ');
}
export function numberToWords(value: number): string {
  let n = Math.round(Math.abs(value));
  if (n === 0) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    parts.push(`${block(groups[i], parts.length > 0)} ${units[i]}`.trim());
  }
  const s = parts.join(' ');
  return (value < 0 ? 'Âm ' : '') + s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

// ---------- Mẫu dự toán ----------
const QC = 'Theo Quy chế chi tiêu nội bộ';
const TT40 = 'Thông tư số 40/2017/TT-BTC';
export const CAN_CU_CHUNG = [
  'Căn cứ Quy chế chi tiêu nội bộ của Trường Đại học Kinh tế - ĐHQGHN hiện hành;',
];
const it = (noiDung: string, dvt: string, sl: number, lan: number, donGia: number, ghiChu = ''): BudgetItem => ({ noiDung, dvt, sl, lan, donGia, ghiChu });

export type PresetKey = 'hoi-thao' | 'cong-tac' | 'tap-huan' | 'su-kien' | 'trong';
export const PRESETS: { key: PresetKey; label: string; tieuDe: string; canCu: string[]; build: (n: number, d: number) => BudgetGroup[] }[] = [
  {
    key: 'hoi-thao', label: 'Hội thảo, hội nghị', tieuDe: 'Tổ chức Hội thảo khoa học "..."',
    canCu: [`Căn cứ ${TT40} ngày 28/4/2017 của Bộ Tài chính quy định chế độ công tác phí, chế độ chi hội nghị và các văn bản sửa đổi, bổ sung (nếu có);`, ...CAN_CU_CHUNG],
    build: (n, d) => [
      { ten: 'Chi công tác chuẩn bị', items: [
        it('In ấn, photo tài liệu, kỷ yếu', 'bộ', n, 1, 50000, 'Theo thực tế, có hóa đơn'),
        it('Giấy mời, thư mời', 'cái', n, 1, 5000),
        it('Văn phòng phẩm', 'bộ', n, 1, 20000),
        it('Trang trí, khánh tiết (phông, hoa)', 'gói', 1, 1, 3000000, 'Theo hợp đồng'),
      ] },
      { ten: 'Chi tổ chức hội thảo', items: [
        it('Thuê hội trường, âm thanh, máy chiếu', 'ngày', 1, d, 5000000, 'Theo hợp đồng'),
        it('Nước uống giữa giờ', 'người', n, d, 40000, `Tối đa 40.000 đ/người/ngày (${TT40})`),
        it('Chủ trì hội thảo', 'người', 1, d, 1000000, QC),
        it('Thư ký hội thảo', 'người', 1, d, 500000, QC),
        it('Báo cáo tham luận', 'bài', 5, 1, 2000000, QC),
        it('Hỗ trợ tiền ăn đại biểu không hưởng lương', 'người', 0, d, 200000, `Mức tối đa theo cấp tổ chức (${TT40})`),
      ] },
      { ten: 'Chi khác', items: [it('Chụp ảnh, ghi hình tư liệu', 'gói', 1, 1, 1000000), it('Chi phí phát sinh khác', 'gói', 1, 1, 1000000)] },
    ],
  },
  {
    key: 'cong-tac', label: 'Công tác phí trong nước', tieuDe: 'Đoàn công tác đi ... từ ngày ... đến ngày ...',
    canCu: [`Căn cứ ${TT40} ngày 28/4/2017 của Bộ Tài chính quy định chế độ công tác phí, chế độ chi hội nghị và các văn bản sửa đổi, bổ sung (nếu có);`, ...CAN_CU_CHUNG],
    build: (n, d) => [
      { ten: 'Chi phí đi lại', items: [
        it('Vé máy bay/tàu/xe khứ hồi', 'vé', n, 1, 3000000, 'Theo vé, hóa đơn thực tế'),
        it('Taxi đưa đón sân bay, nhà ga', 'lượt', n, 2, 200000, 'Theo hóa đơn'),
      ] },
      { ten: 'Phụ cấp lưu trú', items: [it('Phụ cấp lưu trú', 'người', n, d, 200000, `200.000 đ/ngày (Điều 5, ${TT40})`)] },
      { ten: 'Tiền thuê phòng nghỉ', items: [it('Thuê phòng nghỉ (khoán)', 'người', n, Math.max(0, d - 1), 450000, `Khoán tối đa theo địa bàn (Điều 7, ${TT40})`)] },
      { ten: 'Chi khác', items: [it('Cước hành lý, tài liệu mang theo', 'gói', 1, 1, 0, 'Theo hóa đơn')] },
    ],
  },
  {
    key: 'tap-huan', label: 'Lớp tập huấn, bồi dưỡng', tieuDe: 'Tổ chức lớp tập huấn "..."',
    canCu: ['Căn cứ Thông tư số 36/2018/TT-BTC ngày 30/3/2018 của Bộ Tài chính hướng dẫn việc lập dự toán, quản lý, sử dụng và quyết toán kinh phí dành cho công tác đào tạo, bồi dưỡng cán bộ, công chức, viên chức và các văn bản sửa đổi, bổ sung;', ...CAN_CU_CHUNG],
    build: (n, d) => [
      { ten: 'Chi giảng dạy', items: [
        it('Thù lao giảng viên', 'buổi', 1, d * 2, 1500000, QC),
        it('Biên soạn tài liệu', 'trang', 50, 1, 50000, QC),
      ] },
      { ten: 'Chi tổ chức lớp', items: [
        it('In ấn tài liệu cho học viên', 'bộ', n, 1, 50000),
        it('Nước uống giữa giờ', 'người', n, d, 40000, `Tối đa 40.000 đ/người/ngày (${TT40})`),
        it('Thuê hội trường, thiết bị', 'ngày', 1, d, 3000000, 'Theo hợp đồng'),
        it('In giấy chứng nhận', 'cái', n, 1, 20000),
      ] },
      { ten: 'Chi quản lý lớp', items: [it('Cán bộ quản lý lớp', 'người', 1, d, 300000, QC)] },
    ],
  },
  {
    key: 'su-kien', label: 'Sự kiện, lễ kỷ niệm', tieuDe: 'Tổ chức sự kiện "..."',
    canCu: [...CAN_CU_CHUNG, 'Căn cứ Kế hoạch tổ chức sự kiện đã được phê duyệt;'],
    build: (n, d) => [
      { ten: 'Chi chuẩn bị', items: [
        it('Thiết kế, in backdrop, standee, banner', 'gói', 1, 1, 5000000, 'Theo hợp đồng'),
        it('Hoa, trang trí sân khấu', 'gói', 1, 1, 3000000),
        it('Giấy mời', 'cái', n, 1, 5000),
      ] },
      { ten: 'Chi tổ chức', items: [
        it('Âm thanh, ánh sáng, màn hình LED', 'ngày', 1, d, 10000000, 'Theo hợp đồng'),
        it('Dẫn chương trình', 'người', 1, d, 2000000, QC),
        it('Nước uống, teabreak', 'người', n, d, 40000),
        it('Chụp ảnh, quay phim', 'gói', 1, 1, 3000000),
        it('Quà tặng, hoa tặng đại biểu', 'phần', 10, 1, 500000, QC),
      ] },
      { ten: 'Chi khác', items: [it('Chi phí phát sinh khác', 'gói', 1, 1, 2000000)] },
    ],
  },
  { key: 'trong', label: 'Mẫu trống', tieuDe: '', canCu: [...CAN_CU_CHUNG], build: () => [{ ten: 'Nội dung chi', items: [it('', '', 1, 1, 0)] }] },
];

export function newBudget(key: PresetKey, base?: Partial<BudgetInput>): BudgetInput {
  const p = PRESETS.find((x) => x.key === key) ?? PRESETS[0];
  const soNguoi = base?.soNguoi ?? 50;
  const soNgay = base?.soNgay ?? 1;
  return {
    chuQuan: 'ĐẠI HỌC QUỐC GIA HÀ NỘI', donVi: 'TRƯỜNG ĐẠI HỌC KINH TẾ', boPhan: '', thoiGian: '', diaDiem: '', diaDanh: 'Hà Nội', ngay: '',
    signers: [{ chucDanh: 'NGƯỜI LẬP', hoTen: '' }, { chucDanh: 'PHÒNG KẾ HOẠCH - TÀI CHÍNH', hoTen: '' }, { chucDanh: 'THỦ TRƯỞNG ĐƠN VỊ', hoTen: '' }],
    ...base,
    soNguoi, soNgay,
    tieuDe: p.tieuDe,
    canCu: p.canCu.join('\n'),
    groups: p.build(soNguoi, soNgay),
  };
}

// ---------- Ghi file Excel ----------
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Kiểu ô (thứ tự trong cellXfs).
const S = { def: 0, hBold: 1, hNorm: 2, hItal: 3, title: 4, th: 5, td: 6, tdC: 7, tdN: 8, gTxt: 9, gNum: 10, totL: 11, left: 12, words: 13, sigT: 14, sigI: 15, gC: 16, subT: 17 } as const;
const STYLES = `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="5"><font><sz val="12"/><name val="Times New Roman"/><family val="1"/></font><font><b/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font><font><i/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font><font><b/><sz val="14"/><name val="Times New Roman"/><family val="1"/></font><font><b/><i/><sz val="12"/><name val="Times New Roman"/><family val="1"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="18">`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
  + `<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>`
  + `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `<xf numFmtId="164" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

type Cell = { s: number; v?: string | number; f?: string };
const COLS = 'ABCDEFGHIJ';

export function dateLine(diaDanh: string, ngay: string) {
  const place = diaDanh.trim() || 'Hà Nội';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return `${place}, ngày      tháng      năm ${new Date().getFullYear()}`;
  const [y, m, d] = ngay.split('-').map(Number);
  return `${place}, ngày ${String(d).padStart(2, '0')} tháng ${m <= 2 ? String(m).padStart(2, '0') : m} năm ${y}`;
}

export async function buildBudgetXlsx(b: BudgetInput): Promise<Uint8Array> {
  const qt = b.loai === 'quyet-toan';
  const N = qt ? 10 : 8; // số cột
  const LC = COLS[N - 1];
  const rows: Cell[][] = [];
  const heights: Record<number, number> = {};
  const merges: string[] = [];
  const put = (cells: Cell[], h?: number) => { rows.push(cells); if (h) heights[rows.length] = h; return rows.length; };
  const span = (r: number, a: string, z: string) => merges.push(`${a}${r}:${z}${r}`);
  const blank = (s: number = S.def): Cell => ({ s });
  const txt = (v: string, s: number): Cell => ({ s, v });
  const full = (c: Cell, s: number = S.def, h?: number) => { const rr = put([c, ...Array(N - 1).fill(0).map(() => blank(s))], h); span(rr, 'A', LC); return rr; };
  const pair = (l: Cell, rgt: Cell) => { const cells = Array(N).fill(0).map(() => blank()); cells[0] = l; cells[3] = rgt; const rr = put(cells); span(rr, 'A', 'C'); span(rr, 'D', LC); };

  // Phần đầu: cơ quan (A-C), Quốc hiệu (D-cột cuối).
  pair(txt(b.chuQuan.toUpperCase(), S.hNorm), txt('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', S.hBold));
  pair(txt(b.donVi.toUpperCase(), S.hBold), txt('Độc lập - Tự do - Hạnh phúc', S.hBold));
  pair(txt(b.boPhan.trim() ? b.boPhan.toUpperCase() : '', S.hBold), txt(dateLine(b.diaDanh, b.ngay), S.hItal));
  put([]);
  full(txt(qt ? 'QUYẾT TOÁN KINH PHÍ' : 'DỰ TOÁN KINH PHÍ', S.title), S.def, 24);
  if (b.tieuDe.trim()) full(txt(b.tieuDe.trim(), S.hBold), S.def, 32);
  const info = [b.thoiGian.trim() && `Thời gian: ${b.thoiGian.trim()}`, b.diaDiem.trim() && `Địa điểm: ${b.diaDiem.trim()}`, b.soNguoi ? `Số lượng: ${b.soNguoi} người` : ''].filter(Boolean).join('; ');
  if (info) full(txt(info, S.hItal));
  put([]);
  for (const line of b.canCu.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) full(txt(line.replace(/^[-–]\s*/, '- '), S.left), S.left, Math.max(18, Math.ceil(line.length / (qt ? 125 : 105)) * 17));
  put([...Array(N - 1).fill(0).map(() => blank()), txt('Đơn vị tính: đồng', S.hItal)]);

  const heads = qt
    ? ['STT', 'Nội dung chi', 'Đơn vị tính', 'Số lượng', 'Số ngày/ lần', 'Đơn giá', 'Dự toán được duyệt', 'Thực chi', 'Chênh lệch', 'Ghi chú']
    : ['STT', 'Nội dung chi', 'Đơn vị tính', 'Số lượng', 'Số ngày/ lần', 'Đơn giá', 'Thành tiền', 'Ghi chú'];
  const marks = qt ? ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)=(4)x(5)x(6)', '(8)', '(9)=(8)-(7)', '(10)'] : ['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(7)=(4)x(5)x(6)', '(8)'];
  put(heads.map((h) => txt(h, S.th)), 34);
  put(marks.map((h) => txt(h, S.tdC)));
  const groupRows: number[] = [];
  b.groups.forEach((g, gi) => {
    const gr = put([]);
    groupRows.push(gr);
    const first = gr + 1;
    g.items.forEach((item, ii) => {
      const rr = rows.length + 1;
      put([
        txt(String(ii + 1), S.tdC), txt(item.noiDung, S.td), txt(item.dvt, S.tdC),
        { s: S.tdN, v: Number(item.sl) || 0 }, { s: S.tdN, v: Number(item.lan) || 0 }, { s: S.tdN, v: Number(item.donGia) || 0 },
        { s: S.tdN, f: `D${rr}*E${rr}*F${rr}`, v: amount(item) },
        ...(qt ? [{ s: S.tdN, v: Number(item.thucChi) || 0 }, { s: S.tdN, f: `H${rr}-G${rr}`, v: (Number(item.thucChi) || 0) - amount(item) }] : []),
        txt(item.ghiChu, S.td),
      ]);
    });
    const last = rows.length;
    const sum = (c: string, v: number): Cell => ({ s: S.gNum, f: last >= first ? `SUM(${c}${first}:${c}${last})` : '0', v });
    const spent = g.items.reduce((a, i) => a + (Number(i.thucChi) || 0), 0);
    rows[gr - 1] = [txt(ROMAN[gi] ?? String(gi + 1), S.gC), txt(g.ten, S.gTxt), blank(S.td), blank(S.td), blank(S.td), blank(S.td),
      sum('G', groupTotal(g)), ...(qt ? [sum('H', spent), sum('I', spent - groupTotal(g))] : []), blank(S.td)];
  });
  const total = grandTotal(b);
  const spentAll = actualTotal(b);
  const tot = (c: string, v: number): Cell => ({ s: S.subT, f: groupRows.length ? groupRows.map((x) => `${c}${x}`).join('+') : '0', v });
  const r = put([txt('TỔNG CỘNG', S.totL), blank(S.totL), blank(S.totL), blank(S.totL), blank(S.totL), blank(S.totL), tot('G', total), ...(qt ? [tot('H', spentAll), tot('I', spentAll - total)] : []), blank(S.totL)], 22);
  span(r, 'A', 'F');
  full(txt(`${qt ? 'Số tiền quyết toán bằng chữ' : 'Bằng chữ'}: ${numberToWords(qt ? spentAll : total)}./.`, S.words), S.words, 20);
  put([]);
  // Chữ ký: 3 người.
  const cols3: [string, string][] = qt ? [['A', 'B'], ['C', 'F'], ['G', 'J']] : [['A', 'B'], ['C', 'E'], ['F', 'H']];
  const sig = b.signers.slice(0, 3);
  const line = (vals: string[], s: number, h?: number) => {
    const cells: Cell[] = Array(N).fill(0).map(() => blank(s));
    cols3.forEach(([a], i) => { cells[COLS.indexOf(a)] = txt(vals[i] ?? '', s); });
    const rr = put(cells, h);
    cols3.forEach(([a, z]) => span(rr, a, z));
  };
  line(sig.map((x) => x.chucDanh.toUpperCase()), S.sigT, 32);
  line(sig.map(() => '(Ký, ghi rõ họ tên)'), S.sigI);
  for (let k = 0; k < 4; k++) put([]);
  line(sig.map((x) => x.hoTen), S.sigT);

  const sheetRows = rows.map((cells, i) => {
    const rn = i + 1;
    const cx = cells.map((c, j) => {
      const ref = `${COLS[j]}${rn}`;
      if (c.f !== undefined) return `<c r="${ref}" s="${c.s}"><f>${esc(c.f)}</f><v>${c.v ?? 0}</v></c>`;
      if (typeof c.v === 'number') return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
      if (typeof c.v === 'string' && c.v) return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
      return `<c r="${ref}" s="${c.s}"/>`;
    }).join('');
    return `<row r="${rn}"${heights[rn] ? ` ht="${heights[rn]}" customHeight="1"` : ''}>${cx}</row>`;
  }).join('');
  const widths = qt ? [6, 38, 9, 8, 8, 12, 14, 14, 13, 20] : [6, 42, 10, 9, 9, 13, 15, 26];
  const sheet = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${LC}${rows.length}"/><sheetViews><sheetView workbookViewId="0" zoomScale="100"/></sheetViews><sheetFormatPr defaultRowHeight="16.5"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.6" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${qt ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;

  const files: [string, string][] = [
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${qt ? 'Quyết toán' : 'Dự toán'}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  return writeZip(await Promise.all(files.map(([n, t]) => makeEntry(n, t))));
}
