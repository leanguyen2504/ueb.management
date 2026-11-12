import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';

export const metadata: Metadata = { title: 'Quản trị danh mục' };

export default async function AdminHub() {
  const { supabase, ctx } = await requireSession();
  const isPrincipal = ctx.role === 'principal';
  const isOffice = ctx.is_admin || isPrincipal || ctx.role === 'secretary';
  if (!isOffice && !ctx.can_create_group) redirect('/');

  const [users, groups, invites] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('groups').select('id', { count: 'exact', head: true }).is('archived_at', null),
    ctx.is_admin ? supabase.from('invitations').select('id', { count: 'exact', head: true }).is('accepted_at', null) : Promise.resolve({ count: null }),
  ]);

  const cards = [
    ctx.is_admin && { href: '/quan-tri/nguoi-dung', title: 'Người dùng', desc: 'Mời người dùng, đổi vai trò, khóa tài khoản, cấp phạm vi thư ký.', stat: `${users.count ?? 0} người dùng${invites.count ? ` · ${invites.count} lời mời chờ` : ''}` },
    isPrincipal && !ctx.is_admin
      ? { href: '/nhom', title: 'Đơn vị, dự án và sự kiện', desc: 'Danh sách đơn vị, dự án, sự kiện kèm lãnh đạo và đầu mối liên hệ.', stat: `${groups.count ?? 0} nhóm đang hoạt động` }
      : { href: '/nhom', title: 'Đơn vị, dự án và sự kiện', desc: 'Tạo, sửa, lưu trữ nhóm; cấu hình quyền mặc định và thành viên.', stat: `${groups.count ?? 0} nhóm đang hoạt động` },
    ctx.is_admin && { href: '/quan-tri/nhat-ky', title: 'Nhật ký hoạt động', desc: 'Ai đã thêm, sửa, xóa gì và lúc nào. Không ai sửa được nhật ký.', stat: 'Chỉ xem' },
    ctx.is_admin && { href: '/quan-tri/lich-google', title: 'Lịch Google dùng chung', desc: 'Kết nối lịch Google (ví dụ lịch tuần BGH) để hiện trên trang Lịch. Chỉ đọc.', stat: '' },
    isOffice && { href: '/quan-tri/mang-cong-tac', title: 'Mảng công tác và đầu mối', desc: 'Phân công đầu mối theo dõi hồ sơ họp cho từng khoa, viện, phòng.', stat: '' },
    { href: '/moi', title: 'Lời mời đồng nghiệp', desc: 'Mời người có email @vnu.edu.vn kèm nhóm đề xuất.', stat: '' },
  ].filter(Boolean) as { href: string; title: string; desc: string; stat: string }[];

  return (
    <>
      <PageHead title="Quản trị danh mục" sub="Các danh mục dùng chung của hệ thống. Bạn chỉ thấy mục mình có quyền." />
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card hover:border-brand-600">
            <div className="font-semibold">{c.title}</div>
            <p className="mt-1 text-sm muted">{c.desc}</p>
            {c.stat && <div className="mt-2 text-xs font-medium">{c.stat}</div>}
          </Link>
        ))}
      </div>
    </>
  );
}
