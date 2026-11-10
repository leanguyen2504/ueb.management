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

const DURATIONS = [15, 30, 45, 60, 90, 120];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveBookingPage(_prev: FormState, form: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const user_id = claims?.claims?.sub;
  if (!user_id) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const slug = text(form, 'slug').toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) return { error: 'Đuôi link gồm 3 đến 60 chữ thường không dấu, số, dấu gạch ngang.' };
  const durations = DURATIONS.filter((d) => form.get(`d_${d}`) === 'on');
  if (!durations.length) return { error: 'Hãy chọn ít nhất một thời lượng.' };
  const weekly: Record<string, [string, string]> = {};
  for (let i = 1; i <= 7; i++) {
    if (form.get(`day_${i}`) !== 'on') continue;
    const from = text(form, `from_${i}`);
    const to = text(form, `to_${i}`);
    if (!HHMM.test(from) || !HHMM.test(to) || from >= to) return { error: 'Giờ nhận lịch chưa đúng: giờ bắt đầu phải trước giờ kết thúc.' };
    weekly[String(i)] = [from, to];
  }
  const num = (k: string, min: number, max: number, dflt: number) => {
    const n = Number(text(form, k) || dflt);
    return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
  };
  const { error } = await supabase.from('booking_pages').upsert({
    user_id,
    slug,
    title: text(form, 'title') || null,
    intro: text(form, 'intro') || null,
    location: text(form, 'location') || null,
    durations,
    weekly_hours: weekly,
    min_notice_minutes: num('min_notice_minutes', 0, 20160, 0),
    horizon_days: num('horizon_days', 1, 180, 30),
    buffer_minutes: num('buffer_minutes', 0, 120, 0),
  });
  if (error) return { error: error.code === '23505' ? 'Đuôi link này đã có người dùng. Hãy chọn đuôi khác.' : errText(error) };
  refresh();
  return { ok: 'Đã lưu cài đặt.' };
}

export async function setBookingOpen(form: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const user_id = claims?.claims?.sub;
  if (!user_id) return;
  await supabase.from('booking_pages').update({ is_open: form.get('open') === '1' }).eq('user_id', user_id);
  refresh();
}

// Khách (có hoặc không đăng nhập) gửi yêu cầu qua liên kết đặt lịch.
export async function bookPublic(_prev: FormState, form: FormData): Promise<FormState> {
  const slug = text(form, 'slug');
  const starts = text(form, 'starts_at');
  const minutes = Number(text(form, 'minutes'));
  if (!slug || !starts || !Number.isInteger(minutes)) return { error: 'Hãy chọn giờ.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('book_public', {
    p_slug: slug,
    p_starts_at: starts,
    p_minutes: minutes,
    p_name: text(form, 'name'),
    p_email: text(form, 'email'),
    p_topic: text(form, 'topic'),
    p_note: text(form, 'note') || null,
  });
  if (error) return { error: errText(error) };
  redirect(`/hen/trang-thai/${data}`);
}

export async function cancelByToken(form: FormData) {
  const token = uuidOrNull(text(form, 'token'));
  if (!token) return;
  const supabase = await createClient();
  await supabase.rpc('cancel_by_token', { p_token: token });
  revalidatePath(`/hen/trang-thai/${token}`);
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

// ---- Không gian con, đôn đốc, sản phẩm ----

const back = (groupId: string | null | undefined, key: 'loi' | 'tb', msg: string) =>
  redirect(`/nhom/${groupId ?? ''}?${key}=${encodeURIComponent(msg)}`);

export async function createSubgroup(_prev: FormState, form: FormData): Promise<FormState> {
  const parent = uuidOrNull(text(form, 'parent_id'));
  const name = text(form, 'name');
  if (!parent) return { error: 'Thiếu nhóm cha.' };
  if (!name) return { error: 'Hãy đặt tên cho không gian.' };
  const members = form.getAll('member_ids').map(String).filter((v) => uuidOrNull(v));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_subgroup', {
    p_parent: parent,
    p_name: name,
    p_description: text(form, 'description') || null,
    p_member_ids: members,
  });
  if (error) return { error: errText(error) };
  refresh(parent);
  redirect(`/nhom/${data}`);
}

export async function nudgeTask(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const groupId = uuidOrNull(text(form, 'group_id'));
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('nudge_task', { p_task: id, p_message: text(form, 'message') || null });
  refresh(groupId ?? undefined);
  back(groupId, error ? 'loi' : 'tb', error ? errText(error) : 'Đã gửi lời nhắc.');
}

export async function nudgeOverdue(form: FormData) {
  const groupId = uuidOrNull(text(form, 'group_id'));
  if (!groupId) return;
  const supabase = await createClient();
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const { data: tasks } = await supabase
    .from('tasks').select('id').eq('group_id', groupId).neq('status', 'done').not('assignee_id', 'is', null).lt('due_date', today);
  let ok = 0;
  for (const t of tasks ?? []) {
    const { error } = await supabase.rpc('nudge_task', { p_task: t.id, p_message: null });
    if (!error) ok++;
  }
  refresh(groupId);
  back(groupId, 'tb', ok ? `Đã nhắc ${ok} việc quá hạn.` : 'Không có việc quá hạn nào cần nhắc (hoặc vừa nhắc trong 1 giờ qua).');
}

export async function addTaskLink(form: FormData) {
  const task_id = uuidOrNull(text(form, 'task_id'));
  const groupId = uuidOrNull(text(form, 'group_id'));
  const url = text(form, 'url');
  if (!task_id) return;
  if (!/^https:\/\/(drive|docs)\.google\.com\//.test(url)) back(groupId, 'loi', 'Chỉ nhận link Google Drive hoặc Google Docs (bắt đầu bằng https://drive.google.com/ hoặc https://docs.google.com/).');
  const supabase = await createClient();
  const { error } = await supabase.from('task_links').insert({ task_id, url, label: text(form, 'label') || null });
  refresh(groupId ?? undefined);
  if (error) back(groupId, 'loi', errText(error));
}

export async function deleteTaskLink(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const groupId = uuidOrNull(text(form, 'group_id'));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('task_links').delete().eq('id', id);
  refresh(groupId ?? undefined);
}
