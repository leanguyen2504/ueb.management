'use server';

// Mảng công tác và đầu mối theo văn bản phân công. RLS chỉ cho Hiệu trưởng, thư ký, quản trị sửa.
import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

const PATH = '/quan-tri/mang-cong-tac';
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(form: FormData): { error: string } | { row: Record<string, unknown> } {
  const name = String(form.get('name') || '').trim().slice(0, 120);
  if (!name) return { error: 'Hãy ghi tên mảng / đơn vị.' };
  const primary = String(form.get('primary_email') || '').trim().toLowerCase();
  if (primary && !EMAIL.test(primary)) return { error: `Email đầu mối không hợp lệ: ${primary}` };
  const coords = String(form.get('coordinator_emails') || '').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const bad = coords.find((e) => !EMAIL.test(e));
  if (bad) return { error: `Email phối hợp không hợp lệ: ${bad}` };
  const group = String(form.get('group_id') || '');
  const order = Number.parseInt(String(form.get('sort_order') || '0'), 10);
  return { row: {
    name, primary_email: primary || null, coordinator_emails: coords,
    group_id: uuid.test(group) ? group : null, sort_order: Number.isFinite(order) ? order : 0,
  } };
}

export async function saveArea(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireSession();
  const f = fields(form);
  if ('error' in f) return f;
  const id = String(form.get('id') || '');
  const { error, count } = uuid.test(id)
    ? await supabase.from('work_areas').update(f.row, { count: 'exact' }).eq('id', id)
    : await supabase.from('work_areas').insert(f.row, { count: 'exact' });
  if (error) return { error: error.code === '23505' ? 'Đã có mảng trùng tên.' : errText(error) };
  if (!count) return { error: 'Bạn không có quyền sửa danh sách mảng.' };
  revalidatePath(PATH);
  revalidatePath('/hop');
  return { ok: uuid.test(id) ? 'Đã lưu.' : 'Đã thêm mảng.' };
}

export async function deleteArea(form: FormData) {
  const { supabase } = await requireSession();
  const id = String(form.get('id') || '');
  if (!uuid.test(id)) return;
  await supabase.from('work_areas').delete().eq('id', id);
  revalidatePath(PATH);
  revalidatePath('/hop');
}
