import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { MyContext, Profile } from '@/lib/types';

// Người dùng hiện tại, hồ sơ và quyền. Quyền ở đây chỉ để ẩn/hiện giao diện;
// cơ sở dữ liệu vẫn kiểm tra lại bằng RLS.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const [{ data: profile }, { data: ctx }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle<Profile>(),
    supabase.rpc('my_context'),
  ]);
  return { supabase, userId, profile: profile ?? null, ctx: (ctx ?? null) as MyContext | null };
});

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect('/dang-nhap');
  if (!s.profile || !s.ctx?.is_active) redirect('/dang-nhap?loi=khoa');
  return s as typeof s & { profile: Profile; ctx: MyContext };
}

export async function requireAdmin() {
  const s = await requireSession();
  if (!s.ctx.is_admin) redirect('/');
  return s;
}
