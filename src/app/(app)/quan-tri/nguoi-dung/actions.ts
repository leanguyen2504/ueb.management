'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { errText } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { SystemRole } from '@/lib/types';

const ROLES: SystemRole[] = ['principal', 'secretary', 'member'];

export async function setUser(form: FormData) {
  const supabase = await createClient();
  const userId = String(form.get('user_id'));
  const role = String(form.get('system_role')) as SystemRole;
  const active = form.get('is_active') === 'on';
  const email = String(form.get('email') || '');
  if (!ROLES.includes(role)) redirect(`/quan-tri/nguoi-dung?loi=${encodeURIComponent('Vai trò không hợp lệ.')}`);
  const { error } = await supabase.rpc('admin_set_user', { p_user: userId, p_role: role, p_active: active });
  const { error: scopeError } = !error && role === 'secretary'
    ? await supabase.rpc('admin_set_secretary_scope', { p_user: userId, p_all_groups: form.get('all_groups') === 'on' })
    : { error: null };
  revalidatePath('/quan-tri/nguoi-dung');
  const err = error ?? scopeError;
  redirect(`/quan-tri/nguoi-dung?${err ? `loi=${encodeURIComponent(errText(err))}` : `tb=${encodeURIComponent(`Đã lưu ${email || 'người dùng'}.`)}`}`);
}
