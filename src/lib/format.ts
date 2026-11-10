import { TIMEZONE } from '@/lib/env';

const dt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const fmtDateTime = (iso: string | null | undefined) => (iso ? dt.format(new Date(iso)) : '');

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
}

export const todayLabel = (now = new Date()) =>
  new Intl.DateTimeFormat('vi-VN', { timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }).format(now);

// Thông báo lỗi Supabase/Postgres bằng tiếng Việt cho người dùng.
export function errText(e: { message?: string; code?: string } | null | undefined): string {
  if (!e) return 'Đã có lỗi xảy ra.';
  if (e.code === '42501' || /row-level security|permission denied/i.test(e.message || '')) {
    return e.message && !/row-level security|permission denied/i.test(e.message) ? e.message : 'Bạn không có quyền thực hiện thao tác này.';
  }
  if (e.code === '23505') return 'Dữ liệu này đã tồn tại.';
  return e.message || 'Đã có lỗi xảy ra.';
}

// Giờ Việt Nam cố định UTC+7 (không có giờ mùa hè).
const VN_OFFSET = '+07:00';
const parts = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute', string>;
};

// "2026-11-10" theo giờ Việt Nam.
export const vnDay = (iso: string | Date = new Date()) => {
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}`;
};
export const fmtTime = (iso: string) => {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
};
export const fmtDate = (day: string | null | undefined) => {
  if (!day) return '';
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
// Giá trị cho <input type="datetime-local"> và ngược lại.
export const toLocalInput = (iso: string) => {
  const p = parts(iso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
export const fromLocalInput = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00${VN_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
// Đầu ngày (giờ Việt Nam) của một ngày "YYYY-MM-DD", dạng ISO.
export const dayStartIso = (day: string) => new Date(`${day}T00:00:00${VN_OFFSET}`).toISOString();
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const weekdayShort = (day: string) => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${day}T00:00:00Z`).getUTCDay()];
