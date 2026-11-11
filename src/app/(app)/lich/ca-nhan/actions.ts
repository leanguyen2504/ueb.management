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

export async function createPersonalItem(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  if (!me) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const owner = uuidOrNull(text(form, 'owner_id')) ?? me;
  const title = text(form, 'title');
  const kind = text(form, 'kind') || 'cong_viec';
  const role = text(form, 'role') || null;
  const place = text(form, 'place') || null;
  if (!title) return { error: 'Hãy nhập tiêu đề.' };
  if (!KINDS.includes(kind)) return { error: 'Loại lịch không hợp lệ.' };
  if (role && !ROLES.includes(role)) return { error: 'Vai trò không hợp lệ.' };
  if (place && !PLACES.includes(place)) return { error: 'Nơi làm việc không hợp lệ.' };

  // Cả ngày: chọn ngày; có giờ: chọn giờ bắt đầu, kết thúc.
  const allDay = form.get('all_day') === 'on';
  let starts_at: string | null;
  let ends_at: string | null;
  if (allDay) {
    const d1 = text(form, 'day_from');
    const d2 = text(form, 'day_to') || d1;
    if (!DAY.test(d1) || !DAY.test(d2)) return { error: 'Hãy chọn ngày.' };
    if (d2 < d1) return { error: 'Ngày kết thúc phải sau ngày bắt đầu.' };
    starts_at = dayStartIso(d1);
    ends_at = dayStartIso(addDays(d2, 1));
  } else {
    starts_at = fromLocalInput(text(form, 'starts_at'));
    ends_at = fromLocalInput(text(form, 'ends_at')) ?? (starts_at ? new Date(Date.parse(starts_at) + 3600000).toISOString() : null);
    if (!starts_at || !ends_at) return { error: 'Hãy chọn thời gian bắt đầu.' };
    if (ends_at < starts_at) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  }

  // Lặp hằng tuần (lịch dạy theo học kỳ): tối đa 20 tuần.
  const weeks = Math.max(1, Math.min(20, Math.round(Number(text(form, 'repeat_weeks') || '1')) || 1));
  const base = {
    owner_id: owner, kind, role, place, title, all_day: allDay,
    location: text(form, 'location') || null,
    description: text(form, 'description') || null,
  };
  const rows = Array.from({ length: weeks }, (_, w) => ({
    ...base,
    starts_at: new Date(Date.parse(starts_at!) + w * 7 * 86400000).toISOString(),
    ends_at: new Date(Date.parse(ends_at!) + w * 7 * 86400000).toISOString(),
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
