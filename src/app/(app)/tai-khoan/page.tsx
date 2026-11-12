import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { ProfileCard } from '@/components/ProfileCard';
import { ProfileForm } from './ProfileForm';
import { AvatarForm } from './AvatarForm';
import { ProfileLinksForm } from './ProfileLinksForm';
import { signOut } from '@/app/dang-nhap/actions';
import { loadProfileExtras } from '@/lib/profile-data';

export const metadata: Metadata = { title: 'Hồ sơ cá nhân' };

export default async function AccountPage() {
  const { supabase, userId, profile, ctx } = await requireSession();
  const extras = await loadProfileExtras(supabase, userId);
  return (
    <>
      <PageHead
        title="Hồ sơ cá nhân"
        sub="Đồng nghiệp đã đăng nhập xem được hồ sơ này. Vai trò và quyền do quản trị hệ thống, Trưởng nhóm và Văn thư cấp."
        actions={<Link href={`/nguoi/${userId}`} className="btn-secondary">Xem như người khác thấy</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <ProfileCard profile={profile} isMe {...extras} />
        <div className="space-y-4">
          <AvatarForm hasAvatar={Boolean(extras.avatarUrl)} />
          <ProfileForm profile={profile} />
          <ProfileLinksForm links={extras.links} />
          {ctx.is_admin && (
            <p className="text-sm"><Link href="/quan-tri/lich-google" className="text-brand-700 underline dark:text-brand-300">Cấu hình lịch Google dùng chung</Link></p>
          )}
          <form action={signOut}><button className="btn-danger">Đăng xuất</button></form>
        </div>
      </div>
    </>
  );
}
