'use server';

// Thao tác với đầu việc, lịch, đặt lịch và thông báo. Quyền thật sự do RLS và trigger
// trong cơ sở dữ liệu kiểm tra; ở đây chỉ kiểm tra dữ liệu nhập.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { errText, fromLocalInput } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import type { BookingStatus, EventKind, TaskPriority, TaskStatus } from '@/lib/types';

const STATUSES: TaskStatus[] = ['todo', 'doing', 'review', 'done'];
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];
const EVENT_KINDS: EventKind[] = ['meeting', 'event', 'deadline', 'other'];
const text = (f: FormData, k: string) => String(f.get(k) || '').trim();
const uuidOrNull = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);

function refresh(groupId?: string) {
  revalidatePath('/', 'layout');
  if (groupId) revalidatePath(`/nhom/${groupId}`);
}

// ---- Đầu việc ----

export async function createTask(_prev: FormState, form: FormData): Promise<FormState> {
  const group_id = uuidOrNull(text(form, 'group_id'));
  const title = text(form, 'title');
  const priority = (text(form, 'priority') || 'normal') as TaskPriority;
  const due = text(form, 'due_date');
  if (!group_id) return { error: 'Thiếu nhóm.' };
  if (!title) return { error: 'Hãy nhập tên việc.' };
  if (!PRIORITIES.includes(priority)) return { error: 'Mức ưu tiên không hợp lệ.' };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Hạn hoàn thành không hợp lệ.' };
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    group_id,
    title,
    description: text(form, 'description') || null,
    priority,
    due_date: due || null,
    assignee_id: uuidOrNull(text(form, 'assignee_id')),
  });
  if (error) return { error: errText(error) };
  refresh(group_id);
  return { ok: 'Đã tạo việc.' };
}

export async function setTaskStatus(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const status = text(form, 'status') as TaskStatus;
  if (!id || !STATUSES.includes(status)) return;
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').update({ status }).eq('id', id).select('group_id').maybeSingle();
  refresh(data?.group_id);
}

export async function deleteTask(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').delete().eq('id', id).select('group_id').maybeSingle();
  refresh(data?.group_id);
}

// ---- Lịch nhóm ----

export async function createEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const group_id = uuidOrNull(text(form, 'group_id'));
  const title = text(form, 'title');
  const kind = (text(form, 'kind') || 'meeting') as EventKind;
  const starts_at = fromLocalInput(text(form, 'starts_at'));
  const ends_at = fromLocalInput(text(form, 'ends_at')) ?? starts_at;
  if (!group_id) return { error: 'Thiếu nhóm.' };
  if (!title) return { error: 'Hãy nhập tiêu đề.' };
  if (!EVENT_KINDS.includes(kind)) return { error: 'Loại lịch không hợp lệ.' };
  if (!starts_at || !ends_at) return { error: 'Hãy chọn thời gian bắt đầu.' };
  if (ends_at < starts_at) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' };
  const supabase = await createClient();
  const { error } = await supabase.from('events').insert({
    group_id,
    title,
    kind,
    starts_at,
    ends_at,
    location: text(form, 'location') || null,
    description: text(form, 'description') || null,
  });
  if (error) return { error: errText(error) };
  refresh(group_id);
  return { ok: 'Đã thêm lịch.' };
}

export async function deleteEvent(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from('events').delete().eq('id', id).select('group_id').maybeSingle();
  refresh(data?.group_id);
}

// ---- Trang đặt lịch ----

export async function saveBookingPage(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const user_id = claims?.claims?.sub;
  if (!user_id) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const slot = Number(text(form, 'slot_minutes') || 30);
  if (!Number.isInteger(slot) || slot < 10 || slot > 240) return { error: 'Thời lượng mỗi lượt từ 10 đến 240 phút.' };
  const { error } = await supabase.from('booking_pages').upsert({
    user_id,
    is_open: form.get('is_open') === 'on',
    intro: text(form, 'intro') || null,
    hours_note: text(form, 'hours_note') || null,
    slot_minutes: slot,
  });
  if (error) return { error: errText(error) };
  refresh();
  return { ok: 'Đã lưu trang đặt lịch.' };
}

export async function requestBooking(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const requester_id = claims?.claims?.sub;
  const host_id = uuidOrNull(text(form, 'host_id'));
  const topic = text(form, 'topic');
  const starts_at = fromLocalInput(text(form, 'starts_at'));
  const minutes = Number(text(form, 'minutes') || 30);
  if (!requester_id) return { error: 'Phiên đăng nhập đã hết hạn.' };
  if (!host_id) return { error: 'Hãy chọn người muốn gặp.' };
  if (!topic) return { error: 'Hãy nhập nội dung cần gặp.' };
  if (!starts_at) return { error: 'Hãy chọn thời gian.' };
  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 240) return { error: 'Thời lượng không hợp lệ.' };
  const ends_at = new Date(new Date(starts_at).getTime() + minutes * 60000).toISOString();
  const { error } = await supabase.from('bookings').insert({
    host_id,
    requester_id,
    starts_at,
    ends_at,
    topic,
    note: text(form, 'note') || null,
  });
  if (error) return { error: errText(error) };
  refresh();
  return { ok: 'Đã gửi yêu cầu. Bạn sẽ nhận thông báo khi người nhận phản hồi.' };
}

export async function respondBooking(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const status = text(form, 'status') as BookingStatus;
  if (!id || !['accepted', 'declined', 'cancelled'].includes(status)) return;
  const supabase = await createClient();
  const patch: { status: BookingStatus; response_note?: string | null } = { status };
  if (form.has('response_note')) patch.response_note = text(form, 'response_note') || null;
  const { error } = await supabase.from('bookings').update(patch).eq('id', id);
  refresh();
  if (error) redirect(`/dat-lich?loi=${encodeURIComponent(errText(error))}`);
}

// ---- Thông báo ----

export async function markAllRead() {
  const supabase = await createClient();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  refresh();
}

export async function openNotification(form: FormData) {
  const id = Number(text(form, 'id'));
  const supabase = await createClient();
  const { data } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .select('link')
    .maybeSingle();
  refresh();
  const link = data?.link && data.link.startsWith('/') && !data.link.startsWith('//') ? data.link : '/thong-bao';
  redirect(link);
}

export async function clearReadNotifications() {
  const supabase = await createClient();
  await supabase.from('notifications').delete().not('read_at', 'is', null);
  refresh();
}
