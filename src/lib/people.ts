import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Person = { id: string; email: string; full_name: string };

// Tên hiển thị của một nhóm người dùng (RLS: chỉ người đang hoạt động đọc được hồ sơ).
export async function loadPeople(supabase: SupabaseClient, ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  const map = new Map<string, Person>();
  if (!uniq.length) return { map, name: (_: string | null | undefined) => '' };
  const { data } = await supabase.from('profiles').select('id, email, full_name').in('id', uniq).returns<Person[]>();
  (data ?? []).forEach((p) => map.set(p.id, p));
  const name = (id: string | null | undefined) => (id ? map.get(id)?.full_name || map.get(id)?.email || 'Người dùng' : '');
  return { map, name };
}
