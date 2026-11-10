'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// match: các đường dẫn khác cũng tính là đang ở mục này (ví dụ Trang đặt lịch thuộc Lịch).
export type NavItem = { href: string; label: string; icon: string; badge?: number; match?: string[] };

export const ICONS: Record<string, React.ReactNode> = {
  today: <path d="M3.5 10.5 12 4l8.5 6.5V20h-5.5v-5.5h-6V20H3.5z" />,
  explore: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  tasks: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="m8 12 3 3 5-6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  folder: <><path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M8 13h8" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
};

export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const under = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
const isActive = (path: string, it: NavItem) => under(path, it.href) || (it.match ?? []).some((m) => under(path, m));

export function NavLinks({ items, variant }: { items: NavItem[]; variant: 'side' | 'bottom' }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = isActive(path, it);
        const badge = Boolean(it.badge) && (it.badge! > 99 ? '99+' : it.badge);
        return variant === 'side' ? (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${active ? 'bg-brand-50 font-semibold text-brand-600 before:absolute before:-left-3 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-r before:bg-gold-500 dark:bg-brand-900 dark:text-brand-100' : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}>
            <Icon name={it.icon} /><span className="flex-1">{it.label}</span>
            {badge && <span className="rounded-full bg-orange-700 px-1.5 text-[11px] font-semibold text-white">{badge}</span>}
          </Link>
        ) : (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${active ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icon name={it.icon} /><span className="whitespace-nowrap">{it.label}</span>
            {badge && <span className="absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full bg-orange-700" aria-label={`${it.badge} việc quá hạn`} />}
          </Link>
        );
      })}
    </>
  );
}
