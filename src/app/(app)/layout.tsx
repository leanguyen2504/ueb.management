import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { Icon, NavLinks, type NavItem } from '@/components/NavLinks';
import { ThemeMenuItem, TopMenu } from '@/components/TopMenu';
import { OnlineCount } from '@/components/OnlineCount';
import { Avatar } from '@/components/Avatar';
import { avatarUrls } from '@/lib/avatars';
import { publicEnv } from '@/lib/env';
import { vnDay } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/types';
import { signOut } from '@/app/dang-nhap/actions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, ctx } = await requireSession();
  // Giới hạn số người dùng cùng lúc (mặc định 200). Người đang dùng dở và quản trị luôn được vào.
  const { data: gate } = await supabase.rpc('enter_app');
  const g = gate as { allowed: boolean; online: number; max: number } | null;
  if (g && !g.allowed) return <Busy online={g.online} max={g.max} />;
  const [{ count: unread }, { count: overdue }, avatars] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', profile.id).neq('status', 'done').lt('due_date', vnDay()),
    avatarUrls(supabase, [profile.avatar_path]),
  ]);
  // Năm mục chính. Trang đặt lịch nằm trong Lịch; Bảng tổng hợp, Mảng và đầu mối nằm trong Họp.
  const items: NavItem[] = [
    { href: '/', label: 'Hôm nay', icon: 'today' },
    { href: '/viec', label: 'Việc', icon: 'tasks', badge: overdue ?? 0 },
    { href: '/lich', label: 'Lịch', icon: 'calendar', match: ['/dat-lich'] },
    { href: '/hop', label: 'Họp', icon: 'folder', match: ['/quan-tri/mang-cong-tac'] },
    { href: '/nhom', label: 'Nhóm và Dự án', icon: 'explore', match: ['/nguoi'] },
  ];
  const canAdmin = ctx.is_admin || ctx.role === 'principal' || ctx.can_create_group;
  const name = profile.full_name || profile.email;
  const roleText = ctx.is_admin ? `${ROLE_LABEL[profile.system_role]} · Quản trị` : ROLE_LABEL[profile.system_role];
  const me = <Avatar name={name} url={avatars.get(profile.avatar_path ?? '')} size={32} />;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white px-3 py-5 md:flex dark:border-slate-800 dark:bg-slate-900">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2">
          <span className="relative flex h-11 w-10 items-center justify-center rounded-t-md rounded-b-[20px] bg-[#8b1c24] pb-1 font-display text-xs font-semibold tracking-wide text-white ring-2 ring-inset ring-gold-500">
            <span className="absolute inset-x-2.5 top-2 h-0.5 rounded bg-gold-500" />UEB
          </span>
          <span className="leading-tight"><span className="block font-display text-sm font-semibold">Quản trị công việc</span><span className="text-xs muted">Hiệu trưởng và tổ thư ký</span></span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Điều hướng chính"><NavLinks items={items} variant="side" /></nav>
        <div className="mt-auto space-y-2">
          <div className="rounded-xl bg-slate-100 py-2.5 dark:bg-slate-800">
            <OnlineCount url={publicEnv.supabaseUrl()} anonKey={publicEnv.supabaseAnonKey()} userId={profile.id} />
          </div>
          <p className="px-2 text-xs muted">Mỗi tài khoản chỉ thấy chi tiết của nhóm mình tham gia.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-slate-50/85 px-4 py-2.5 backdrop-blur md:px-7 dark:border-slate-800 dark:bg-slate-950/85">
          <Link href="/" className="flex h-9 w-8 items-center justify-center rounded-t-md rounded-b-2xl bg-[#8b1c24] text-[10px] font-semibold text-white ring-2 ring-inset ring-gold-500 md:hidden" aria-label="Hôm nay">UEB</Link>
          {/* Ô tìm kiếm chung: tìm cuộc họp, mã Jira, tài liệu, nhóm, việc, lịch và người. */}
          <form action="/tim" method="get" role="search" className="flex min-w-0 flex-1 items-center">
            <label htmlFor="top-q" className="flex w-full max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-400 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:border-brand-300 dark:focus-within:ring-brand-900">
              <Icon name="search" className="h-4 w-4" />
              <span className="sr-only">Tìm kiếm</span>
              <input id="top-q" name="q" type="search" placeholder="Tìm cuộc họp, mã Jira, tài liệu, người…" className="w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100" />
            </label>
          </form>
          <TopMenu label="Tạo mới" buttonClass="btn" button={<><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">Tạo mới</span></>}>
            <Link role="menuitem" href="/viec#tao-viec" className="menu-item">Việc mới</Link>
            <Link role="menuitem" href="/lich?them=1" className="menu-item">Lịch nhóm</Link>
            <Link role="menuitem" href="/hop" className="menu-item">Tài liệu cho cuộc họp</Link>
            {ctx.can_create_group && <Link role="menuitem" href="/nhom#tao-nhom" className="menu-item">Nhóm, dự án, sự kiện</Link>}
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <Link role="menuitem" href="/moi" className="menu-item">Mời đồng nghiệp</Link>
          </TopMenu>
          <Link href="/thong-bao" className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white hover:border-brand-600 dark:border-slate-700 dark:bg-slate-900" aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`}>
            <Icon name="bell" />
            {Boolean(unread) && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-orange-700 px-1 text-[10px] font-semibold text-white dark:border-slate-950">{unread! > 99 ? '99+' : unread}</span>}
          </Link>
          <TopMenu label="Tài khoản" buttonClass="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-1 sm:pr-3 dark:border-slate-700 dark:bg-slate-900"
            button={<>{me}<span className="hidden text-left leading-tight sm:block"><span className="block max-w-40 truncate text-[13px] font-semibold">{name}</span><span className="block text-[11px] muted">{roleText}</span></span></>}>
            <Link role="menuitem" href="/tai-khoan" className="menu-item">Hồ sơ cá nhân</Link>
            <Link role="menuitem" href="/jira" className="menu-item">Jira của tôi</Link>
            <Link role="menuitem" href="/moi" className="menu-item">Mời đồng nghiệp</Link>
            {canAdmin && <Link role="menuitem" href="/quan-tri" className="menu-item">Quản trị danh mục</Link>}
            <hr className="my-1 border-slate-200 dark:border-slate-700" />
            <ThemeMenuItem />
            <form action={signOut}><button role="menuitem" className="menu-item muted">Đăng xuất</button></form>
          </TopMenu>
        </header>
        <main id="noi-dung" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-7 md:pb-10 md:pt-7">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-slate-800 dark:bg-slate-900" aria-label="Điều hướng nhanh">
        <NavLinks items={items} variant="bottom" />
      </nav>
    </div>
  );
}

function Busy({ online, max }: { online: number; max: number }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="card max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-11 items-center justify-center rounded-t-md rounded-b-[22px] bg-[#8b1c24] text-xs font-semibold text-white ring-2 ring-inset ring-gold-500">UEB</span>
        <h1 className="text-xl font-semibold">Hệ thống đang đông người dùng</h1>
        <p className="mt-2 text-sm muted">Hiện có {online}/{max} người đang dùng cùng lúc. Bạn vui lòng quay lại sau ít phút; chỗ trống sẽ có ngay khi có người rời đi.</p>
        <div className="mt-5 flex justify-center gap-3">
          <a href="/" className="btn">Thử lại</a>
          <form action={signOut}><button className="btn-secondary">Đăng xuất</button></form>
        </div>
      </div>
    </main>
  );
}
