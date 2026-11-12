import Link from 'next/link';
import { ROLE_LABEL, type Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { fileHref, fileSize, hostOf, linkTitle, type ProfileLink } from '@/lib/profile-links';

export type ProfileGroup = { id: string; name: string; role: string };


// Thẻ hồ sơ dùng chung cho trang Hồ sơ của tôi và trang xem hồ sơ người khác.
export function ProfileCard({ profile, isAdmin, groups, bookingSlug, isMe, avatarUrl, links = [] }: {
  profile: Profile;
  isAdmin?: boolean;
  groups: ProfileGroup[];
  bookingSlug?: string | null;
  isMe?: boolean;
  avatarUrl?: string | null;
  links?: ProfileLink[];
}) {
  const pages = links.filter((l) => l.kind === 'link' && l.url);
  const docs = links.filter((l) => l.kind === 'doc');
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
      {pages.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Trang cá nhân</h3>
          <ul className="flex flex-wrap gap-2">
            {pages.map((l) => (
              <li key={l.id}>
                <a href={l.url!} target="_blank" rel="noopener noreferrer" title={l.url!} className="chip inline-flex items-center gap-1.5 hover:border-brand-600">
                  <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></svg>
                  {linkTitle(l)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {docs.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold">Hồ sơ đính kèm</h3>
          <ul className="space-y-1.5 text-sm">
            {docs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>
                {l.file_path ? (
                  <>
                    <a href={fileHref(l.file_path)} target="_blank" rel="noopener" className="min-w-0 break-words text-brand-700 hover:underline dark:text-brand-300">{linkTitle(l)}</a>
                    <span className="text-xs muted">{fileSize(l.file_size)}</span>
                    <a href={fileHref(l.file_path, true)} className="text-xs muted hover:underline">Tải về</a>
                  </>
                ) : (
                  <>
                    <a href={l.url!} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words text-brand-700 hover:underline dark:text-brand-300">{linkTitle(l)}</a>
                    <span className="text-xs muted">{hostOf(l.url!)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
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
