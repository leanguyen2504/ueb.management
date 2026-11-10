import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { NavLinks, type NavItem } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ROLE_LABEL } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, ctx } = await requireSession();
  const items: NavItem[] = [
    { href: '/', label: 'Tổng quan', icon: 'home' },
    { href: '/nhom', label: 'Nhóm', icon: 'groups' },
    { href: '/moi', label: 'Mời đồng nghiệp', icon: 'invite' },
  ];
  if (ctx.is_admin) items.push({ href: '/quan-tri/nguoi-dung', label: 'Người dùng', icon: 'users' });
  if (ctx.is_admin || ctx.role === 'principal') items.push({ href: '/quan-tri/nhat-ky', label: 'Nhật ký', icon: 'log' });
  items.push({ href: '/tai-khoan', label: 'Tài khoản', icon: 'account' });
  const roleText = ctx.is_admin ? `Quản trị hệ thống · ${ROLE_LABEL[profile.system_role]}` : ROLE_LABEL[profile.system_role];

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:flex dark:border-slate-800 dark:bg-slate-900">
        <Link href="/" className="mb-4 flex items-center gap-2 px-2 py-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-800 text-xs font-bold text-white">UEB</span>
          <span className="text-sm font-semibold leading-tight">Quản trị công việc<br /><span className="text-xs font-normal muted">Hiệu trưởng và tổ thư ký</span></span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Điều hướng chính"><NavLinks items={items} variant="side" /></nav>
        <p className="mt-auto px-2 text-xs muted">Mỗi tài khoản chỉ thấy dữ liệu của nhóm được cấp quyền.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-800 text-[10px] font-bold text-white md:hidden" aria-label="Trang tổng quan">UEB</Link>
          <div className="min-w-0 flex-1 truncate text-sm"><span className="font-medium">{profile.full_name || profile.email}</span> <span className="muted">· {roleText}</span></div>
          <ThemeToggle />
        </header>
        <main id="noi-dung" className="mx-auto w-full max-w-6xl flex-1 p-4 pb-24 md:p-6">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900" aria-label="Điều hướng nhanh">
        <NavLinks items={items} variant="bottom" />
      </nav>
    </div>
  );
}
