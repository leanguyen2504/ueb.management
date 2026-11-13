'use client';

// Ô chọn nhóm / dự án / tổ (hoặc Cá nhân) để lọc danh sách việc; đổi lựa chọn là chuyển trang ngay.
import { useRouter } from 'next/navigation';

export type FilterOption = { value: string; label: string; href: string };

export function TaskGroupFilter({ value, all, sections }: { value: string; all: FilterOption; sections: { label: string; options: FilterOption[] }[] }) {
  const router = useRouter();
  const flat = [all, ...sections.flatMap((s) => s.options)];
  return (
    <select aria-label="Lọc theo nhóm, dự án" className="input w-auto max-w-full py-1.5" value={value}
      onChange={(e) => router.push(flat.find((o) => o.value === e.target.value)?.href ?? all.href)}>
      <option value={all.value}>{all.label}</option>
      {sections.map((s) => (
        <optgroup key={s.label} label={s.label}>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
