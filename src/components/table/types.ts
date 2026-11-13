// Kiểu dữ liệu cho bảng dùng chung (DataTable). Chỉ là dữ liệu thuần để trang máy chủ truyền sang trình duyệt.

export type Tone = 'warn' | 'danger' | 'ok' | 'info' | 'gold' | 'muted' | 'plain';

export type CellItem = { t: string; href?: string; ext?: boolean; tone?: Tone; sub?: string };

export type CellObj = {
  // Giá trị để sắp xếp, lọc và xuất Excel. Ngày dạng "YYYY-MM-DD".
  v?: string | number | null;
  // Chữ hiển thị (mặc định lấy từ v).
  t?: string;
  href?: string;
  ext?: boolean;
  // Dòng phụ màu nhạt bên dưới.
  sub?: string;
  // Hiện như một nhãn màu.
  tone?: Tone;
  title?: string;
  // Danh sách nhiều giá trị (nhãn, việc trong ngày...).
  items?: CellItem[];
};

export type Cell = string | number | null | undefined | CellObj;

export type ColType = 'text' | 'number' | 'date' | 'enum' | 'tags';

export type Column = {
  key: string;
  label: string;
  // text: lọc theo chữ; number/date: lọc khoảng; enum/tags: chọn giá trị.
  type?: ColType;
  // Ẩn mặc định (người dùng bật lại trong "Cột").
  hidden?: boolean;
  align?: 'right';
  nowrap?: boolean;
  // Cột chữ dài: đặt độ rộng tối thiểu.
  wide?: boolean;
  // Cộng tổng ở cuối bảng (cột số).
  total?: boolean;
  help?: string;
};

export type Row = {
  id: string;
  cells: Record<string, Cell>;
  // Tô nền: hôm nay, cuối tuần, cần chú ý.
  tone?: 'today' | 'weekend' | 'warn';
  // Thông tin thêm khi mở rộng dòng. `cols`: mục này lặp lại nội dung các cột đó,
  // nên được ẩn khi tất cả các cột ấy đang hiện trên bảng (tránh thấy một thứ hai lần).
  detail?: { label: string; value: Cell; cols?: string[] }[];
};

export const TONE_CLASS: Record<Tone, string> = {
  warn: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  gold: 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500',
  muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  plain: '',
};

export const cellObj = (c: Cell): CellObj => (c !== null && typeof c === 'object' ? c : { v: c ?? null });

// Chữ của một ô (để tìm kiếm, lọc).
export function cellText(c: Cell): string {
  const o = cellObj(c);
  if (o.items) return o.items.map((i) => i.t).join(', ');
  if (o.t !== undefined) return o.t;
  if (o.v === null || o.v === undefined) return '';
  return typeof o.v === 'number' ? o.v.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : o.v;
}

// Giá trị để sắp xếp/lọc khoảng.
export function cellValue(c: Cell): string | number | null {
  const o = cellObj(c);
  if (o.v !== undefined) return o.v;
  if (o.items) return o.items.length;
  return o.t ?? null;
}

// Các giá trị rời của một ô (để lọc chọn giá trị).
export function cellValues(c: Cell): string[] {
  const o = cellObj(c);
  if (o.items) return o.items.map((i) => i.t);
  const t = cellText(c);
  return [t];
}

export const fmtDay = (d: string) => (/^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
