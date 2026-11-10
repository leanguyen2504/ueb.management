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
