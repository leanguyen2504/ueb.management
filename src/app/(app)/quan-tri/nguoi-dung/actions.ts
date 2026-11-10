'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SystemRole } from '@/lib/types';

const ROLES: SystemRole[] = ['principal', 'secretary', 'member'];

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
