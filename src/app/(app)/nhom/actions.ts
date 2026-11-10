'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import { PERMS, type GroupKind } from '@/lib/types';

const KINDS: GroupKind[] = ['unit', 'project', 'event', 'other'];
const bool = (f: FormData, k: string) => f.get(k) === 'on';

export async function createGroup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind') || 'unit') as GroupKind;
  if (!name) return { error: 'Hãy nhập tên nhóm.' };
  if (!KINDS.includes(kind)) return { error: 'Loại nhóm không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, kind, description: String(form.get('description') || '').trim() || null })
    .select('id')
    .single();
  if (error) return { error: errText(error) };
  revalidatePath('/nhom');
  redirect(`/nhom/${data.id}`);
}

export async function updateGroup(_prev: FormState, form: FormData): Promise<FormState> {
  const id = String(form.get('id'));
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind') || 'unit') as GroupKind;
  if (!name) return { error: 'Hãy nhập tên nhóm.' };
  if (!KINDS.includes(kind)) return { error: 'Loại nhóm không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('groups')
    .update({
      name,
      kind,
      description: String(form.get('description') || '').trim() || null,
      default_can_view: bool(form, 'default_can_view'),
      default_can_create: bool(form, 'default_can_create'),
      default_can_edit: bool(form, 'default_can_edit'),
      default_can_upload: bool(form, 'default_can_upload'),
    })
    .eq('id', id)
    .select('id');
  if (error) return { error: errText(error) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa nhóm này.' };
  revalidatePath(`/nhom/${id}`);
  return { ok: 'Đã lưu thông tin nhóm.' };
}

export async function setArchived(form: FormData) {
  const id = String(form.get('id'));
  const archive = form.get('archive') === '1';
  const supabase = await createClient();
  await supabase.from('groups').update({ archived_at: archive ? new Date().toISOString() : null }).eq('id', id);
  revalidatePath(`/nhom/${id}`);
  revalidatePath('/nhom');
}

export async function addMember(_prev: FormState, form: FormData): Promise<FormState> {
  const groupId = String(form.get('group_id'));
  const email = String(form.get('email') || '').trim().toLowerCase();
  const role = String(form.get('role') || 'member');
  const isManager = role === 'manager';
  const isClerk = role === 'clerk';
  if (!email) return { error: 'Hãy nhập email.' };
  const supabase = await createClient();

  const { data: person } = await supabase.from('profiles').select('id, is_active').eq('email', email).maybeSingle();
  if (person) {
    if (!person.is_active) return { error: 'Tài khoản này đang bị khóa.' };
    const { data: g } = await supabase.from('groups').select('default_can_view, default_can_create, default_can_edit, default_can_upload').eq('id', groupId).single();
    const { error } = await supabase.from('group_members').insert({
      group_id: groupId,
      user_id: person.id,
      is_manager: isManager,
      is_clerk: isClerk,
      can_view: g?.default_can_view ?? true,
      can_create: g?.default_can_create ?? false,
      can_edit: g?.default_can_edit ?? false,
      can_upload: g?.default_can_upload ?? false,
    });
    if (error) return { error: error.code === '23505' ? 'Người này đã ở trong nhóm.' : errText(error) };
    revalidatePath(`/nhom/${groupId}`);
    return { ok: 'Đã thêm vào nhóm.' };
  }

  // Chưa có tài khoản: tạo lời mời; khi người đó đăng nhập lần đầu sẽ tự vào nhóm.
  const { error } = await supabase.from('invitations').insert({ email, group_id: groupId, is_manager: isManager, is_clerk: isClerk });
  if (error) return { error: errText(error) };
  revalidatePath(`/nhom/${groupId}`);
  return { ok: `${email} chưa có tài khoản. Đã tạo lời mời; người này đăng nhập bằng email trường là vào nhóm.` };
}

export async function updateMember(form: FormData) {
  const groupId = String(form.get('group_id'));
  const userId = String(form.get('user_id'));
  // Ô vai trò bị khóa (Văn thư) không gửi lên: không đổi vai trò.
  const row: Record<string, boolean> = {};
  if (form.has('is_manager') || form.has('is_clerk') || form.get('role_editable') === '1') {
    row.is_manager = bool(form, 'is_manager');
    row.is_clerk = bool(form, 'is_clerk');
  }
  for (const [k] of PERMS) if (k !== 'can_manage_members') row[k] = bool(form, k);
  const supabase = await createClient();
  const { error } = await supabase.from('group_members').update(row).eq('group_id', groupId).eq('user_id', userId);
  revalidatePath(`/nhom/${groupId}`);
  if (error) redirect(`/nhom/${groupId}?loi=${encodeURIComponent(errText(error))}`);
}

export async function removeMember(form: FormData) {
  const groupId = String(form.get('group_id'));
  const userId = String(form.get('user_id'));
  const supabase = await createClient();
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  revalidatePath(`/nhom/${groupId}`);
  if (error) redirect(`/nhom/${groupId}?loi=${encodeURIComponent(errText(error))}`);
}

export async function cancelInvitation(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const supabase = await createClient();
  await supabase.from('invitations').delete().eq('id', id);
  revalidatePath(`/nhom/${groupId}`);
}
