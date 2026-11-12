'use server';

// Kéo thả trên lịch: dời một mục sang giờ / ngày khác hoặc kéo mép dưới để đổi giờ kết thúc.
// Quyền thật sự do RLS và trigger kiểm tra (lịch nhóm: quyền sửa nhóm; lịch cá nhân: chủ lịch
// hoặc người giao việc).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_MS = 62 * 86400000;

export async function moveCalendarItem(editId: string, starts_at: string, ends_at: string): Promise<{ error?: string }> {
  const [kind, id] = String(editId).split(':');
  const s = Date.parse(starts_at);
  const e = Date.parse(ends_at);
  if (!UUID.test(id ?? '') || Number.isNaN(s) || Number.isNaN(e)) return { error: 'Dữ liệu không hợp lệ.' };
  if (e <= s) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  if (e - s > MAX_MS) return { error: 'Một mục lịch dài tối đa 62 ngày.' };
  const table = kind === 'event' ? 'events' : kind === 'personal' ? 'personal_items' : null;
  if (!table) return { error: 'Không sửa được loại lịch này.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() })
    .eq('id', id)
    .select('id');
  if (error) {
    if (/42501/.test(`${error.code}`)) return { error: 'Bạn không có quyền sửa lịch này.' };
    return { error: errText(error) };
  }
  if (!data?.length) return { error: 'Bạn không có quyền sửa lịch này.' };
  revalidatePath('/', 'layout');
  return {};
}
