'use server';

// Lịch cá nhân, phân công và điểm danh. Quyền thật sự do RLS và trigger kiểm tra.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText, fromLocalInput, dayStartIso, addDays, vnDay } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

const KINDS = ['giang_day', 'su_kien', 'cong_viec', 'khac'];
const ROLES = ['giang_vien_chinh', 'tro_giang', 'bao_cao_vien', 'to_chuc', 'tham_du', 'thuc_hien'];
const PLACES = ['truong', 'khoa', 'ngoai_truong', 'truc_tuyen'];
const CHECKIN = ['truong', 'khoa', 'giang', 'cong_tac', 'tu_xa'];
const text = (f: FormData, k: string) => String(f.get(k) || '').trim();
const uuidOrNull = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  revalidatePath('/lich', 'layout');
}

// Đọc các ô của biểu mẫu lịch cá nhân (dùng chung cho thêm và sửa).
function itemFields(form: FormData) {
  const title = text(form, 'title');
  const kind = text(form, 'kind') || 'cong_viec';
  const role = text(form, 'role') || null;
  const place = text(form, 'place') || null;
  if (!title) return { error: 'Hãy nhập tiêu đề.' } as const;
  if (!KINDS.includes(kind)) return { error: 'Loại lịch không hợp lệ.' } as const;
  if (role && !ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' } as const;
  if (place && !PLACES.includes(place)) return { error: 'Nơi làm việc không hợp lệ.' } as const;

  // Cả ngày: chọn ngày; có giờ: chọn giờ bắt đầu, kết thúc.
  const allDay = form.get('all_day') === 'on';
  let starts_at: string | null;
  let ends_at: string | null;
  if (allDay) {
    const d1 = text(form, 'day_from');
    const d2 = text(form, 'day_to') || d1;
    if (!DAY.test(d1) || !DAY.test(d2)) return { error: 'Hãy chọn ngày.' } as const;
    if (d2 < d1) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' } as const;
    starts_at = dayStartIso(d1);
    ends_at = dayStartIso(addDays(d2, 1));
  } else {
    starts_at = fromLocalInput(text(form, 'starts_at'));
    ends_at = fromLocalInput(text(form, 'ends_at')) ?? (starts_at ? new Date(Date.parse(starts_at) + 3600000).toISOString() : null);
    if (!starts_at || !ends_at) return { error: 'Hãy chọn thời gian bắt đầu.' } as const;
    if (ends_at < starts_at) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' } as const;
  }
  return {
    row: {
      kind, role, place, title, all_day: allDay, starts_at, ends_at,
      location: text(form, 'location') || null,
      description: text(form, 'description') || null,
    },
  } as const;
}

export async function createPersonalItem(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const owner = uuidOrNull(text(form, 'owner_id')) ?? me;
  const f = itemFields(form);
  if ('error' in f) return { error: f.error };
  const { starts_at, ends_at, ...base } = f.row;

  // Lặp hằng tuần (lịch dạy theo học kỳ): tối đa 20 tuần.
  const weeks = Math.max(1, Math.min(20, Math.round(Number(text(form, 'repeat_weeks') || '1')) || 1));
  const rows = Array.from({ length: weeks }, (_, w) => ({
    ...base,
    owner_id: owner,
    starts_at: new Date(Date.parse(starts_at) + w * 7 * 86400000).toISOString(),
    ends_at: new Date(Date.parse(ends_at) + w * 7 * 86400000).toISOString(),
  }));
  const { error } = await supabase.from('personal_items').insert(rows);
  if (error) {
    if (owner !== me && /row-level security|42501/i.test(`${error.message} ${error.code}`)) {
      return { error: 'Chỉ giao được cho người cùng nhóm hoặc đơn vị với bạn.' };
    }
    return { error: errText(error) };
  }
  refresh();
  const what = weeks > 1 ? `${weeks} buổi` : 'lịch';
  return { ok: owner === me ? `Đã thêm ${what} vào lịch của bạn.` : `Đã giao ${what}; người được giao sẽ nhận thông báo.` };
}

// Sửa một mục lịch cá nhân (tiêu đề, giờ, loại, vai trò, địa điểm…). Việc người khác giao
// cho mình thì trigger chặn, chỉ nhận / từ chối / báo xong được.
export async function updatePersonalItem(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return { error: 'Thiếu lịch cần sửa.' };
  const f = itemFields(form);
  if ('error' in f) return { error: f.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from('personal_items').update(f.row).eq('id', id).select('id');
  if (error) {
    if (/42501/.test(`${error.code}`)) return { error: error.message || 'Bạn không có quyền sửa lịch này.' };
    return { error: errText(error) };
  }
  if (!data?.length) return { error: 'Bạn không có quyền sửa lịch này.' };
  refresh();
  return { ok: 'Đã lưu thay đổi.' };
}

// Người được giao: nhận, từ chối, báo xong. Người tự tạo: đánh dấu xong / chưa xong.
export async function respondPersonalItem(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const status = text(form, 'status');
  if (!id || !['accepted', 'declined', 'done'].includes(status)) return;
  const supabase = await createClient();
  const note = text(form, 'note');
  await supabase.from('personal_items').update({ status, ...(note ? { response_note: note.slice(0, 1000) } : {}) }).eq('id', id);
  refresh();
}

export async function deletePersonalItem(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('personal_items').delete().eq('id', id);
  refresh();
}

export async function checkIn(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const day = text(form, 'day') || vnDay();
  const place = text(form, 'place');
  if (!DAY.test(day)) return { error: 'Ngày không hợp lệ.' };
  if (!CHECKIN.includes(place)) return { error: 'Hãy chọn nơi làm việc.' };
  const { error } = await supabase.from('attendance_checkins').upsert(
    { user_id: me, day, place, note: text(form, 'note').slice(0, 500) || null, checked_at: new Date().toISOString() },
    { onConflict: 'user_id,day' },
  );
  if (error) return { error: /row-level security|42501/i.test(`${error.message} ${error.code}`) ? 'Chỉ điểm danh được trong 31 ngày gần đây.' : errText(error) };
  refresh();
  return { ok: 'Đã điểm danh.' };
}

export async function clearCheckIn(form: FormData) {
  const day = text(form, 'day');
  if (!DAY.test(day)) return;
  const supabase = await createClient();
  await supabase.from('attendance_checkins').delete().eq('day', day);
  refresh();
}
