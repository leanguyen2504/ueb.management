import type { SupabaseClient } from '@supabase/supabase-js';
import { groupTypeLabel } from '@/lib/types';

// Danh bạ nhóm (mọi nhóm đang hoạt động, kể cả nhóm chưa tham gia) kèm phân loại đơn vị.
export async function groupDirectory(supabase: SupabaseClient) {
  const [{ data, error }, { data: cats }] = await Promise.all([
    supabase.rpc('group_directory'),
    supabase.rpc('group_categories'),
  ]);
  const cat = new Map(((cats ?? []) as { id: string; unit_category: string }[]).map((c) => [c.id, c.unit_category]));
  const rows = ((data ?? []) as Record<string, unknown>[]).map((g) => ({ ...g, unit_category: cat.get(g.id as string) ?? null }));
  return { data: rows as unknown[], error };
}

type DirLike = { id: string; name: string; kind: string; unit_category?: string | null; parent_id: string | null; parent_name: string | null };

// Lựa chọn "cùng làm": mọi đơn vị, nhóm, dự án, không gian đang hoạt động (danh bạ đã bỏ nhóm
// lưu trữ và không gian cá nhân). Đơn vị đứng trước, sau đó các nhóm khác; bỏ chính nhóm đang
// sửa và không gian con trực tiếp của nó (đã hiện trong mục Không gian).
export function coWorkOptions(dir: DirLike[], selfId?: string) {
  return dir
    .filter((g) => g.id !== selfId && (!selfId || g.parent_id !== selfId))
    .map((g) => ({
      id: g.id,
      name: g.name,
      unit: g.kind === 'unit',
      hint: [groupTypeLabel(g), g.parent_name ? `thuộc ${g.parent_name}` : ''].filter(Boolean).join(', '),
    }))
    .sort((a, b) => Number(b.unit) - Number(a.unit) || a.name.localeCompare(b.name, 'vi'))
    .map(({ id, name, hint }) => ({ id, name, hint }));
}
