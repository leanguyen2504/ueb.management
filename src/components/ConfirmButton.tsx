'use client';

import type { ReactNode } from 'react';

// Nút gửi form, hỏi xác nhận trước (ví dụ khi xóa hẳn).
export function ConfirmButton({ message, className, title, children }: { message: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <button className={className} title={title} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
