'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; short?: string; icon: string; badge?: number };

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  explore: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  tasks: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12 3 3 5-6" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h4M7.5 17h7" /></>,
  booking: <><rect x="3.5" y="5" width="13" height="13" rx="2" /><path d="M3.5 10h13M7 3v4M13 3v4" /><circle cx="17.5" cy="17.5" r="3.5" /><path d="M17.5 16v1.7l1 .8" /></>,
  folder: <><path d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><path d="M8 13h8M8 16.5h5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  admin: <><path d="M5 4v6M5 14v6M12 4v3M12 11v9M19 4v9M19 17v3" /><path d="M3 12h4M10 9h4M17 15h4" /></>,
  groups: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  users: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  log: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  invite: <><circle cx="10" cy="8" r="4" /><path d="M3 21a7 7 0 0 1 13-3.5M19 14v6M16 17h6" /></>,
  account: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.5 18.5a7 7 0 0 1 11 0" /></>,
};

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));

export function NavLinks({ items, variant }: { items: NavItem[]; variant: 'side' | 'bottom' }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = isActive(path, it.href);
        const icon = (
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[it.icon]}
          </svg>
        );
        return variant === 'side' ? (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${active ? 'bg-brand-50 font-semibold text-brand-700 dark:bg-slate-800 dark:text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
            {icon}<span className="flex-1">{it.label}</span>
            {Boolean(it.badge) && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white" aria-label={`${it.badge} chưa đọc`}>{it.badge! > 99 ? '99+' : it.badge}</span>}
          </Link>
        ) : (
          <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined}
            className={`relative flex min-w-16 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${active ? 'font-semibold text-brand-600 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
            {icon}<span className="whitespace-nowrap">{it.short ?? it.label}</span>
            {Boolean(it.badge) && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-red-600" aria-label={`${it.badge} chưa đọc`} />}
          </Link>
        );
      })}
    </>
  );
}
