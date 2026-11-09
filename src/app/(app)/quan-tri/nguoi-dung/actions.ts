'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import type { SystemRole } from '@/lib/types';

const ROLES: SystemRole[] = ['principal', 'secretary', 'member'];

export async function inviteUser(_prev: FormState, form: FormData): Promise<FormState> {
  const emails = String(form.get('emails') || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const role = String(form.get('system_role')) as SystemRole;
  if (!emails.length) return { error: 'Hãy nhập ít nhất một email.' };
  if (!ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' };
  const supabase = await createClient();
  const { error } = await supabase.from('invitations').insert(emails.map((email) => ({ email, system_role: role })));
  if (error) return { error: errText(error) };
  revalidatePath('/quan-tri/nguoi-dung');
  return { ok: `Đã mời ${emails.length} người. Họ đăng nhập bằng email trường để kích hoạt tài khoản.` };
}

export async function setUser(form: FormData) {
  const supabase = await createClient();
  const userId = String(form.get('user_id'));
  const role = String(form.get('system_role')) as SystemRole;
  const active = form.get('is_active') === 'on';
  if (!ROLES.includes(role)) return;
  await supabase.rpc('admin_set_user', { p_user: userId, p_role: role, p_active: active });
  if (role === 'secretary') {
    await supabase.rpc('admin_set_secretary_scope', { p_user: userId, p_all_groups: form.get('all_groups') === 'on' });
  }
  revalidatePath('/quan-tri/nguoi-dung');
}

export async function cancelInvite(form: FormData) {
  const supabase = await createClient();
  await supabase.from('invitations').delete().eq('id', String(form.get('id')));
  revalidatePath('/quan-tri/nguoi-dung');
}
