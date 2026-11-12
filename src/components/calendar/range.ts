import { addDay, monthGridStart, weekStart } from './time';
import type { CalView } from './types';

// Khoảng ngày [from, to) cần nạp cho mỗi kiểu xem, và tiêu đề hiện trên thanh công cụ.
export function rangeOf(view: CalView, anchor: string): { from: string; to: string; title: string } {
  const [y, m] = anchor.split('-').map(Number);
  if (view === 'ngay') return { from: anchor, to: addDay(anchor, 1), title: `${Number(anchor.slice(8))} tháng ${m}, ${y}` };
  if (view === 'tuan') {
    const s = weekStart(anchor);
    const e = addDay(s, 6);
    const [, m1] = s.split('-').map(Number);
    const [y2, m2] = e.split('-').map(Number);
    const title = m1 === m2 ? `Tháng ${m2}, ${y2}` : `Thg ${m1} – thg ${m2}, ${y2}`;
    return { from: s, to: addDay(s, 7), title };
  }
  if (view === 'thang') {
    const s = monthGridStart(anchor);
    return { from: s, to: addDay(s, 42), title: `Tháng ${m}, ${y}` };
  }
  if (view === 'bang') {
    const s = `${anchor.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    return { from: s, to: next, title: `Tháng ${m}, ${y}` };
  }
  return { from: anchor, to: addDay(anchor, 30), title: `Từ ${Number(anchor.slice(8))}/${m}/${y}` };
}
