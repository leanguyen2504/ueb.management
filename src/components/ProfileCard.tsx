import Link from 'next/link';
import { ROLE_LABEL, type Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';

export type ProfileGroup = { id: string; name: string; role: string };


// Thẻ hồ sơ dùng chung cho trang Hồ sơ của tôi và trang xem hồ sơ người khác.
export function ProfileCard({ profile, isAdmin, groups, bookingSlug, isMe, avatarUrl }: {
  profile: Profile;
  isAdmin?: boolean;
  groups: ProfileGroup[];
  bookingSlug?: string | null;
  isMe?: boolean;
  avatarUrl?: string | null;
}) {
  const rows: [string, React.ReactNode][] = [
    ['Email', <a key="e" href={`mailto:${profile.email}`} className="text-brand-600 hover:underline dark:text-brand-100">{profile.email}</a>],
    ...(profile.phone ? [['Điện thoại', <a key="p" href={`tel:${profile.phone.replace(/\s/g, '')}`} className="hover:underline">{profile.phone}</a>] as [string, React.ReactNode]] : []),
    ...(profile.office ? [['Phòng làm việc', profile.office] as [string, React.ReactNode]] : []),
    ...(profile.unit ? [['Đơn vị', profile.unit] as [string, React.ReactNode]] : []),
  ];
  return (
    <section className="card">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={profile.full_name || profile.email} url={avatarUrl} size={96} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{profile.full_name || profile.email}</h2>
          <p className="text-sm muted">{[profile.position, profile.unit].filter(Boolean).join(' · ') || 'Chưa cập nhật chức vụ'}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="chip">{ROLE_LABEL[profile.system_role]}</span>
            {isAdmin && <span className="chip">Quản trị hệ thống</span>}
            {!profile.is_active && <span className="chip border-orange-300 text-orange-700">Đã khóa</span>}
          </div>
        </div>
        {bookingSlug && !isMe && <a href={`/hen/${bookingSlug}`} className="btn">Đặt lịch hẹn</a>}
      </div>
      {profile.bio && <p className="mt-4 whitespace-pre-line text-sm">{profile.bio}</p>}
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="muted">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-semibold">Nhóm và dự án{groups.length ? ` (${groups.length})` : ''}</h3>
        {groups.length ? (
          <ul className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <li key={g.id}><Link href={`/nhom/${g.id}`} className="chip hover:border-brand-600">{g.name}{g.role ? ` · ${g.role}` : ''}</Link></li>
            ))}
          </ul>
        ) : <p className="text-sm muted">{isMe ? 'Bạn chưa tham gia nhóm nào.' : 'Không có nhóm nào bạn cùng xem được.'}</p>}
      </div>
    </section>
  );
}
