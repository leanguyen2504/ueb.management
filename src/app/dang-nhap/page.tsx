import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';
import { ThemeToggle } from '@/components/ThemeToggle';

export const metadata: Metadata = { title: 'Đăng nhập' };

const NOTICE: Record<string, string> = {
  khoa: 'Tài khoản chưa được kích hoạt hoặc đã bị khóa. Hãy liên hệ quản trị hệ thống.',
  lien_ket: 'Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const { loi } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-800 text-sm font-bold text-white">UEB</span>
          <div>
            <h1 className="text-lg font-semibold">Quản trị công việc</h1>
            <p className="text-xs muted">Hiệu trưởng và tổ thư ký</p>
          </div>
        </div>
        {loi && NOTICE[loi] && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{NOTICE[loi]}</p>}
        <LoginForm />
        <p className="text-xs muted">Chỉ tài khoản đã được mời mới đăng nhập được. Mỗi người chỉ thấy dữ liệu của nhóm mình được cấp quyền.</p>
      </section>
    </main>
  );
}
