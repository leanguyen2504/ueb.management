'use client';

// Ô chọn lịch (Tất cả / từng lịch Google / Lịch nhóm của tôi) thay cho hàng nút.
import { useRouter } from 'next/navigation';

export function CalendarFilter({ value, options }: { value: string; options: { value: string; label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <select aria-label="Lọc theo lịch" className="input w-auto py-1.5" value={value}
      onChange={(e) => router.push(options.find((o) => o.value === e.target.value)?.href ?? '/')}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label === 'Tất cả' ? 'Tất cả lịch' : o.label}</option>)}
    </select>
  );
}
