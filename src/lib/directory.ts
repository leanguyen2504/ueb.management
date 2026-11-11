import type { SupabaseClient } from '@supabase/supabase-js';

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
