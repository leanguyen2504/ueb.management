'use client';

// Mở thẻ <details data-hash-open> có id trùng với #neo trên địa chỉ (ví dụ từ Dashboard
// hoặc Lịch bấm sang Hồ sơ cuộc họp), rồi cuộn tới đó.
import { useEffect } from 'react';

export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement && el.hasAttribute('data-hash-open')) {
        el.open = true;
        el.scrollIntoView({ block: 'start' });
      }
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  return null;
}
