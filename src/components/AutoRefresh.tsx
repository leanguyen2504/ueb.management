'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Tải lại dữ liệu trang (không tải lại cả trang) định kỳ khi tab đang mở và khi quay lại tab,
// để dữ liệu nút đồng bộ vừa gửi lên hiện ngay.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (!document.hidden) router.refresh(); };
    const id = setInterval(tick, seconds * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [router, seconds]);
  return null;
}
