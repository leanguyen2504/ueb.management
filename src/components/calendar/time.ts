// Tính ngày giờ theo giờ Việt Nam (UTC+7, không có giờ mùa hè), chạy được cả ở
// máy chủ lẫn trình duyệt mà không phụ thuộc múi giờ của máy.
const OFFSET_MS = 7 * 3600 * 1000;

export const vnDayOf = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_MS).toISOString().slice(0, 10);
export const vnMinutesOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const dayStart = (day: string) => new Date(`${day}T00:00:00+07:00`).getTime();
export const addDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// Thứ Hai đầu tuần chứa ngày day.
export const weekStart = (day: string) => addDay(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
export const monthGridStart = (day: string) => weekStart(`${day.slice(0, 7)}-01`);
export const hhmm = (iso: string) => {
  const m = vnMinutesOf(iso);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const dmy = (day: string) => `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
