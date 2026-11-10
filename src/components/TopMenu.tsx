'use client';

// Menu thả xuống trên thanh trên (Tạo mới, ảnh đại diện). Tự đóng khi bấm ra ngoài,
// nhấn Esc hoặc chuyển trang.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export function TopMenu({ button, label, children, buttonClass }: { button: React.ReactNode; label: string; children: React.ReactNode; buttonClass: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>{button}</button>
      {open && <div className="menu" role="menu" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setOpen(false); }}>{children}</div>}
    </div>
  );
}

export function ThemeMenuItem() {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  };
  return (
    <button type="button" role="menuitem" onClick={toggle} className="menu-item">
      <span className="dark:hidden">Chuyển giao diện tối</span><span className="hidden dark:inline">Chuyển giao diện sáng</span>
    </button>
  );
}
