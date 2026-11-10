import Link from 'next/link';

export function PageHead({ title, sub, actions, eyebrow }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 font-display text-xs font-medium uppercase tracking-[0.08em] text-gold-600 dark:text-gold-500">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold md:text-[28px] md:leading-tight">{title}</h1>
        {sub && <p className="mt-1.5 max-w-3xl text-sm muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Thẻ chuyển giữa các trang cùng một mục (Lịch ↔ Trang đặt lịch; Họp ↔ Bảng tổng hợp ↔ Mảng và đầu mối).
export function SectionTabs({ tabs, current }: { tabs: { href: string; label: string; key: string; count?: number }[]; current: string }) {
  return (
    <nav className="-mt-2 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Các trang trong mục">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm ${t.key === current ? 'border-gold-500 font-semibold text-slate-900 dark:text-white' : 'border-transparent font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
          {t.label}
          {Boolean(t.count) && <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 text-xs font-semibold text-gold-600 dark:bg-gold-600/20 dark:text-gold-500">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function HopTabs({ current, day }: { current: 'hop' | 'tong-hop' | 'mang'; day?: string }) {
  const q = day ? `?ngay=${day}` : '';
  return (
    <SectionTabs current={current} tabs={[
      { key: 'hop', href: `/hop${q}`, label: 'Theo buổi họp' },
      { key: 'tong-hop', href: `/hop/tong-hop${q}`, label: 'Bảng tổng hợp' },
      { key: 'mang', href: '/quan-tri/mang-cong-tac', label: 'Mảng và đầu mối' },
    ]} />
  );
}
