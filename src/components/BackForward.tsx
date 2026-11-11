'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Nút lùi/tiến theo lịch sử trình duyệt và nút lên cấp trên, để đi lại giữa các không gian lồng nhau.
export function BackForward({ up }: { up?: { id: string; name: string } | null }) {
  const router = useRouter();
  const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <button type="button" onClick={() => router.back()} className={btn} aria-label="Quay lại trang trước" title="Quay lại">←</button>
      <button type="button" onClick={() => router.forward()} className={btn} aria-label="Tiến tới trang sau" title="Tiến tới">→</button>
      {up && (
        <Link href={`/nhom/${up.id}`} className="ml-1 inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800" title="Lên không gian cấp trên">
          ↑ <span className="max-w-[16rem] truncate">{up.name}</span>
        </Link>
      )}
    </div>
  );
}
