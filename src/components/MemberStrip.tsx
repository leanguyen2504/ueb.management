import Link from 'next/link';
import type { Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';

export type StripMember = {
  user_id: string;
  is_manager: boolean;
  is_clerk: boolean;
  avatarUrl?: string | null;
  profile?: Pick<Profile, 'full_name' | 'email' | 'position' | 'phone' | 'office' | 'is_active'>;
};

// Thứ tự ưu tiên: Trưởng nhóm → lãnh đạo (theo chức vụ trong hồ sơ) → Văn thư → chuyên viên/đầu mối → còn lại.
const LEADER = /(^|\s)(phó\s+)?(trưởng|giám đốc|viện trưởng|hiệu trưởng|chủ nhiệm|chủ tịch|bí thư)(\s|$)/i;
const STAFF = /(chuyên viên|đầu mối|thư ký|văn thư)/i;

export function rankMember(m: StripMember): number {
  const pos = m.profile?.position ?? '';
  if (m.is_manager) return 0;
  if (LEADER.test(pos)) return 1;
  if (m.is_clerk) return 2;
  if (STAFF.test(pos)) return 3;
  return 4;
}

const COLORS = ['bg-brand-600', 'bg-teal-600', 'bg-gold-500', 'bg-sky-700', 'bg-orange-700', 'bg-violet-700'];

function badge(m: StripMember) {
  if (m.is_manager) return { text: 'Trưởng nhóm', cls: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-100' };
  if (m.is_clerk) return { text: 'Văn thư', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' };
  if (LEADER.test(m.profile?.position ?? '')) return { text: 'Lãnh đạo', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' };
  return null;
}

// Dải thành viên ở đầu trang nhóm, lấy thông tin từ hồ sơ cá nhân của từng người.
export function MemberStrip({ members, max = 8, allHref }: { members: StripMember[]; max?: number; allHref: string }) {
  const active = members.filter((m) => m.profile?.is_active !== false);
  if (!active.length) return null;
  const sorted = [...active].sort(
    (a, b) => rankMember(a) - rankMember(b) || (a.profile?.full_name || a.profile?.email || '').localeCompare(b.profile?.full_name || b.profile?.email || '', 'vi'),
  );
  const shown = sorted.slice(0, max);
  return (
    <section className="card mb-4" aria-labelledby="strip-h">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="strip-h" className="font-semibold">Thành viên ({active.length})</h2>
        <a href={allHref} className="text-sm text-brand-600 hover:underline dark:text-brand-100">
          {active.length > shown.length ? `Xem tất cả ${active.length} người` : 'Quản lý thành viên'}
        </a>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((m, i) => {
          const p = m.profile;
          const name = p?.full_name || p?.email || 'Người dùng';
          const b = badge(m);
          return (
            <li key={m.user_id}>
              <Link href={`/nguoi/${m.user_id}`} className="flex h-full items-start gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                <Avatar name={name} url={m.avatarUrl} size={44} className={COLORS[i % COLORS.length]} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="block truncate text-xs muted">{p?.position || 'Chưa cập nhật chức vụ'}</span>
                  {b && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.text}</span>}
                  {(p?.phone || p?.office) && <span className="mt-1 block truncate text-xs muted">{[p?.phone, p?.office].filter(Boolean).join(' · ')}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Dải ảnh gọn ở đầu trang nhóm: ảnh chồng nhau theo thứ tự ưu tiên, bấm để mở thẻ Thành viên.
export function MemberAvatars({ members, max = 6, href }: { members: StripMember[]; max?: number; href: string }) {
  const active = members.filter((m) => m.profile?.is_active !== false).sort((a, b) => rankMember(a) - rankMember(b));
  if (!active.length) return null;
  const shown = active.slice(0, max);
  return (
    <Link href={href} className="group flex items-center gap-3" aria-label={`Xem ${active.length} thành viên`}>
      <span className="flex">
        {shown.map((m, i) => {
          const name = m.profile?.full_name || m.profile?.email || 'Người dùng';
          return (
            <span key={m.user_id} title={name} className={`rounded-full ring-2 ring-white dark:ring-slate-950 ${i ? '-ml-2.5' : ''}`}>
              <Avatar name={name} url={m.avatarUrl} size={36} className={COLORS[i % COLORS.length]} />
            </span>
          );
        })}
        {active.length > max && <span className="-ml-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold ring-2 ring-white dark:bg-slate-800 dark:ring-slate-950">+{active.length - max}</span>}
      </span>
      <span className="text-sm muted group-hover:text-brand-600 dark:group-hover:text-brand-300">{active.length} thành viên</span>
    </Link>
  );
}
