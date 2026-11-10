import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Link ký tạm thời (2 giờ) cho ảnh cá nhân trong bucket riêng tư "avatars".
export async function avatarUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!list.length) return map;
  const { data } = await supabase.storage.from('avatars').createSignedUrls(list, 7200);
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  });
  return map;
}
