'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import { PERMS, type GroupKind } from '@/lib/types';

const KINDS: GroupKind[] = ['unit', 'project', 'event', 'other'];
const bool = (f: FormData, k: string) => f.get(k) === 'on';
const CATEGORIES = ['chuc_nang', 'dao_tao', 'nghien_cuu'];
// Phân loại chỉ áp cho Đơn vị; để trống hoặc loại khác thì bỏ phân loại.
const category = (f: FormData, kind: string) => {
  const c = String(f.get('unit_category') || '');
  return kind === 'unit' && CATEGORIES.includes(c) ? c : null;
};

export async function createGroup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get('name') || '').trim();
  const kind = String(form.get('kind') || 'unit') as GroupKind;
  if (!name) return { error: 'Hãy nhập tên nhóm.' };
  const supabase = await createClient();
  // Cá nhân: dự án con trong mục Cá nhân, chỉ chủ sở hữu thấy.
  if (String(form.get('kind')) === 'ca_nhan') {
    const { data: pid, error: perr } = await supabase.rpc('create_personal_project', { p_name: name, p_description: String(form.get('description') || '').trim() || null });
    if (perr) return { error: errText(perr) };
    revalidatePath('/nhom');
    redirect(`/nhom/${pid}`);
  }
  if (!KINDS.includes(kind)) return { error: 'Loại nhóm không hợp lệ.' };
  // Tự tạo mã nhóm, không đọc lại dòng vừa thêm: quyền xem (RLS) tính danh sách nhóm một lần
  // trước khi thêm nên chưa có nhóm mới, đọc lại sẽ bị báo "không có quyền".
  const data = { id: crypto.randomUUID() };
  const { error } = await supabase
    .from('groups')
    .insert({ id: data.id, name, kind, unit_category: category(form, kind), description: String(form.get('description') || '').trim() || null });
  if (error) return { error: errText(error) };
  // Dự án liên đơn vị: gắn các đơn vị/tổ cùng làm ngay khi tạo.
  const units = form.getAll('unit_ids').map(String).filter(Boolean);
  if (units.length && kind !== 'unit') await supabase.from('group_units').insert(units.map((u) => ({ group_id: data.id, unit_id: u })));
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
      unit_category: category(form, kind),
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
  if (error) redirect(`/nhom/${groupId}?tab=thanh-vien&loi=${encodeURIComponent(errText(error))}`);
}

export async function removeMember(form: FormData) {
  const groupId = String(form.get('group_id'));
  const userId = String(form.get('user_id'));
  const supabase = await createClient();
  const { error } = await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId);
  revalidatePath(`/nhom/${groupId}`);
  if (error) redirect(`/nhom/${groupId}?tab=thanh-vien&loi=${encodeURIComponent(errText(error))}`);
}

export async function cancelInvitation(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const supabase = await createClient();
  await supabase.from('invitations').delete().eq('id', id);
  revalidatePath(`/nhom/${groupId}`);
}

// Xin tham gia nhóm hoặc một việc trong nhóm (task_id). back: trang quay về sau khi gửi.
export async function requestJoin(form: FormData) {
  const groupId = String(form.get('group_id'));
  const taskId = String(form.get('task_id') || '') || null;
  const message = String(form.get('message') || '').trim().slice(0, 500) || null;
  const back = String(form.get('back') || `/nhom/${groupId}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_join', { p_group: groupId, p_task: taskId, p_message: message });
  revalidatePath('/nhom');
  revalidatePath(`/nhom/${groupId}`);
  const sep = back.includes('?') ? '&' : '?';
  if (error) redirect(`${back}${sep}loi=${encodeURIComponent(errText(error))}`);
  redirect(`${back}${sep}tb=${encodeURIComponent('Đã gửi yêu cầu. Trưởng nhóm hoặc Văn thư sẽ xem và trả lời qua thông báo.')}`);
}

export async function cancelJoin(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const supabase = await createClient();
  await supabase.rpc('cancel_join_request', { p_id: id });
  revalidatePath('/nhom');
  revalidatePath(`/nhom/${groupId}`);
}

export async function decideJoin(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const accept = form.get('accept') === '1';
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_join_request', { p_id: id, p_accept: accept });
  revalidatePath(`/nhom/${groupId}`);
  if (error) redirect(`/nhom/${groupId}?tab=thanh-vien&loi=${encodeURIComponent(errText(error))}`);
}

// Gắn/gỡ các đơn vị cùng làm một dự án. Dự án tự hiện trong từng đơn vị được gắn.
export async function setGroupUnits(_prev: FormState, form: FormData): Promise<FormState> {
  const groupId = String(form.get('group_id'));
  const want = new Set(form.getAll('unit_ids').map(String).filter(Boolean));
  const supabase = await createClient();
  const { data: cur } = await supabase.from('group_units').select('unit_id').eq('group_id', groupId);
  const have = new Set((cur ?? []).map((r) => r.unit_id as string));
  const add = [...want].filter((u) => !have.has(u));
  const del = [...have].filter((u) => !want.has(u));
  if (add.length) {
    const { error } = await supabase.from('group_units').insert(add.map((u) => ({ group_id: groupId, unit_id: u })));
    if (error) return { error: errText(error) };
  }
  if (del.length) {
    const { error } = await supabase.from('group_units').delete().eq('group_id', groupId).in('unit_id', del);
    if (error) return { error: errText(error) };
  }
  revalidatePath(`/nhom/${groupId}`);
  [...add, ...del].forEach((u) => revalidatePath(`/nhom/${u}`));
  return { ok: 'Đã lưu các đơn vị cùng làm.' };
}

// Kéo thả không gian vào không gian khác (như thư mục vào thư mục). Cơ sở dữ liệu kiểm tra quyền và vòng lặp.
export async function moveGroup(groupId: string, newParentId: string, fromId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('move_group', { p_group: groupId, p_new_parent: newParentId });
  if (error) return { error: errText(error) };
  for (const p of [fromId, newParentId, groupId]) revalidatePath(`/nhom/${p}`);
  revalidatePath('/nhom');
  return {};
}

// ---- Xóa không gian, lịch, việc thừa ----
// Trưởng nhóm xóa ngay; người khác gửi yêu cầu để Trưởng nhóm duyệt. Cơ sở dữ liệu quyết định.
const DELETE_TYPES = ['group', 'task', 'event'] as const;
type DeleteType = (typeof DELETE_TYPES)[number];
const DELETE_DONE: Record<DeleteType, string> = { group: 'Đã xóa không gian.', task: 'Đã xóa việc.', event: 'Đã xóa lịch.' };
const REQUEST_SENT = 'Đã gửi yêu cầu xóa. Trưởng nhóm sẽ duyệt và trả lời qua thông báo.';

export async function requestDelete(type: DeleteType, itemId: string, fromId: string, reason?: string | null): Promise<{ error?: string; ok?: string }> {
  if (!DELETE_TYPES.includes(type)) return { error: 'Loại mục không hợp lệ.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_delete', { p_type: type, p_id: itemId, p_reason: reason?.trim().slice(0, 500) || null });
  if (error) return { error: errText(error) };
  revalidatePath(`/nhom/${fromId}`);
  revalidatePath('/nhom');
  return { ok: data === 'deleted' ? DELETE_DONE[type] : REQUEST_SENT };
}

export async function requestDeleteForm(form: FormData) {
  const groupId = String(form.get('group_id'));
  const type = String(form.get('type')) as DeleteType;
  const itemId = String(form.get('item_id') || '');
  const tab = String(form.get('tab') || '');
  const back = `/nhom/${groupId}${tab ? `?tab=${tab}&` : '?'}`;
  if (!itemId) redirect(`${back}loi=${encodeURIComponent('Hãy chọn mục cần xóa.')}`);
  const r = await requestDelete(type, itemId, groupId, String(form.get('reason') || ''));
  if (r.error) redirect(`${back}loi=${encodeURIComponent(r.error)}`);
  redirect(`${back}tb=${encodeURIComponent(r.ok!)}`);
}

export async function decideDelete(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const approve = form.get('approve') === '1';
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_delete_request', { p_id: id, p_approve: approve });
  revalidatePath(`/nhom/${groupId}`);
  revalidatePath('/nhom');
  if (error) redirect(`/nhom/${groupId}?loi=${encodeURIComponent(errText(error))}`);
  redirect(`/nhom/${groupId}?tb=${encodeURIComponent(approve ? 'Đã duyệt và xóa.' : 'Đã từ chối yêu cầu xóa.')}`);
}

export async function cancelDelete(form: FormData) {
  const id = String(form.get('id'));
  const groupId = String(form.get('group_id'));
  const supabase = await createClient();
  await supabase.rpc('cancel_delete_request', { p_id: id });
  revalidatePath(`/nhom/${groupId}`);
}
