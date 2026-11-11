'use client';

// Mở thẻ <details data-hash-open> có id trùng với #neo trên địa chỉ (ví dụ từ Dashboard
// hoặc Lịch bấm sang Hồ sơ cuộc họp), rồi cuộn tới đó.
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function OpenFromHash() {
  const params = useSearchParams().toString();
  // Bấm link #neo ngay trên trang hiện tại (Next không bắn hashchange khi đổi bằng Link).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      const hash = a?.getAttribute('href')?.split('#')[1];
      if (!a || !hash) return;
      const url = new URL(a.href);
      if (url.pathname + url.search !== window.location.pathname + window.location.search) return;
      const el = document.getElementById(hash);
      if (!el) return;
      e.preventDefault();
      history.replaceState(null, '', '#' + hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement && el.hasAttribute('data-hash-open')) {
        el.open = true;
        el.scrollIntoView({ block: 'start' });
      } else if (el?.hasAttribute('data-hash-focus')) {
        // Khung nhập (ví dụ Tạo việc mới): cuộn tới và đặt con trỏ vào ô đầu tiên.
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        el.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select')?.focus({ preventScroll: true });
      }
    };
    // Chờ trang mới vẽ xong (chuyển thẻ ?tab=…#neo) rồi mới tìm phần tử.
    const t = setTimeout(open, 50);
    window.addEventListener('hashchange', open);
    return () => { clearTimeout(t); window.removeEventListener('hashchange', open); };
  }, [params]);
  return null;
}
