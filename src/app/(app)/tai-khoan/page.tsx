import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { ProfileForm } from './ProfileForm';
import { signOut } from '@/app/dang-nhap/actions';
import { ROLE_LABEL } from '@/lib/types';

export const metadata: Metadata = { title: 'Tài khoản' };

export default async function AccountPage() {
  const { profile, ctx } = await requireSession();
  return (
    <>
      <PageHead title="Tài khoản" sub={`${profile.email} · ${ctx.is_admin ? 'Quản trị hệ thống · ' : ''}${ROLE_LABEL[profile.system_role]}`} />
      <ProfileForm profile={profile} />
      <p className="mt-3 max-w-xl text-xs muted">Vai trò và quyền do quản trị hệ thống và người quản lý nhóm cấp; bạn không tự đổi được.</p>
      <form action={signOut} className="mt-6"><button className="btn-danger">Đăng xuất</button></form>
    </>
  );
}
