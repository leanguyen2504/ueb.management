'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import type { SystemRole } from '@/lib/types';

const ROLES: SystemRole[] = ['principal', 'secretary', 'member'];

// Gửi lời mời. Ai được mời vai trò nào, vào nhóm nào do RLS ở cơ sở dữ liệu quyết định:
// người dùng thường chỉ mời được thành viên, vào nhóm mình xem được; quản trị mời mọi vai trò.
export async function inviteUser(_prev: FormState, form: FormData): Promise<FormState> {
  const emails = [...new Set(String(form.get('emails') || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean))];
  const role = String(form.get('system_role') || 'member') as SystemRole;
  const groupId = String(form.get('group_id') || '') || null;
  if (!emails.length) return { error: 'Hãy nhập ít nhất một email.' };
  if (!ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' };
  const domains = serverEnv.allowedDomains();
  const wrong = emails.filter((e) => !/^[^\s@]+@[^\s@]+$/.test(e) || !domains.includes(e.split('@')[1]));
  if (wrong.length) return { error: `Chỉ mời được email @${domains.join(', @')}. Kiểm tra lại: ${wrong.join(', ')}` };

  const supabase = await createClient();
  const { data: existing } = await supabase.from('profiles').select('email').in('email', emails);
  const already = new Set((existing ?? []).map((p) => p.email));
  const fresh = emails.filter((e) => !already.has(e));
  if (!fresh.length) return { error: 'Những người này đã có tài khoản. Người quản lý nhóm có thể thêm họ vào nhóm trong trang nhóm.' };

  const { error } = await supabase.from('invitations').insert(fresh.map((email) => ({ email, system_role: role, group_id: groupId })));
  if (error) return { error: errText(error) };
  revalidatePath('/moi');
  revalidatePath('/quan-tri/nguoi-dung');
  const skipped = already.size ? ` Bỏ qua ${already.size} người đã có tài khoản.` : '';
  return { ok: `Đã mời ${fresh.length} người.${skipped} Hãy báo họ vào trang web, nhập email trường để nhận thư đăng nhập.` };
}

export async function cancelInvite(form: FormData) {
  const supabase = await createClient();
  await supabase.from('invitations').delete().eq('id', String(form.get('id')));
  revalidatePath('/moi');
  revalidatePath('/quan-tri/nguoi-dung');
}
