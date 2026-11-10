import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProfileGroup } from '@/components/ProfileCard';

// Nhóm của một người mà người đang xem cũng xem được (RLS tự lọc), kèm trang đặt lịch nếu đang mở.
export async function loadProfileExtras(supabase: SupabaseClient, userId: string) {
  const [{ data: rows }, { data: page }, { data: settings }] = await Promise.all([
    supabase.from('group_members').select('group_id, is_manager, is_clerk, groups(name, archived_at)').eq('user_id', userId),
    supabase.from('booking_pages').select('slug, is_open').eq('user_id', userId).maybeSingle(),
    supabase.from('system_settings').select('current_admin_id').maybeSingle(),
  ]);
  type Row = { group_id: string; is_manager: boolean; is_clerk: boolean; groups: { name: string; archived_at: string | null } | null };
  const groups: ProfileGroup[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.groups && !r.groups.archived_at)
    .map((r) => ({ id: r.group_id, name: r.groups!.name, role: r.is_manager ? 'Trưởng nhóm' : r.is_clerk ? 'Văn thư' : '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return {
    groups,
    bookingSlug: page?.is_open ? page.slug : null,
    isAdmin: settings?.current_admin_id === userId,
  };
}
