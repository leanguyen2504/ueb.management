'use server';

// Thao tác với đầu việc, lịch, đặt lịch và thông báo. Quyền thật sự do RLS và trigger
// trong cơ sở dữ liệu kiểm tra; ở đây chỉ kiểm tra dữ liệu nhập.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { errText, fromLocalInput } from '@/lib/format';
import { parseJiraInput } from '@/lib/meeting-rules';
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
  const start = text(form, 'start_date');
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: 'Ngày bắt đầu không hợp lệ.' };
  if (start && due && start > due) return { error: 'Ngày bắt đầu phải trước hạn.' };
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').insert({
    group_id,
    title,
    description: text(form, 'description') || null,
    priority,
    due_date: due || null,
    start_date: start || null,
    assignee_id: uuidOrNull(text(form, 'assignee_id')),
  });
  if (error) return { error: errText(error) };
  refresh(group_id);
  return { ok: 'Đã tạo việc.' };
}

// Sửa thông tin đầu việc (tên, mô tả, người thực hiện, ngày, ưu tiên). Trigger tasks_check chỉ cho
// người có quyền Sửa trong nhóm đổi các trường này; người được giao chỉ đổi được trạng thái.
export async function updateTask(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuidOrNull(text(form, 'id'));
  const title = text(form, 'title');
  const priority = (text(form, 'priority') || 'normal') as TaskPriority;
  const due = text(form, 'due_date');
  const start = text(form, 'start_date');
  if (!id) return { error: 'Thiếu việc.' };
  if (!title) return { error: 'Hãy nhập tên việc.' };
  if (title.length > 300) return { error: 'Tên việc quá dài.' };
  if (!PRIORITIES.includes(priority)) return { error: 'Mức ưu tiên không hợp lệ.' };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Hạn hoàn thành không hợp lệ.' };
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { error: 'Ngày bắt đầu không hợp lệ.' };
  if (start && due && start > due) return { error: 'Ngày bắt đầu phải trước hạn.' };
  const patch: Record<string, string | null> = {
    title,
    description: text(form, 'description') || null,
    priority,
    due_date: due || null,
    start_date: start || null,
  };
  // Ô Người thực hiện chỉ có khi biết danh sách thành viên; không có thì giữ nguyên.
  if (form.has('assignee_id')) patch.assignee_id = uuidOrNull(text(form, 'assignee_id'));
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select('group_id').maybeSingle();
  if (error) return { error: errText(error) };
  if (!data) return { error: 'Không sửa được: bạn không có quyền sửa việc này.' };
  refresh(data.group_id);
  return { ok: 'Đã lưu thay đổi.' };
}

export async function setTaskStatus(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const status = text(form, 'status') as TaskStatus;
  if (!id || !STATUSES.includes(status)) return;
  const patch: { status: TaskStatus; progress?: number | null } = { status };
  // Ô % tiến độ chỉ có trên trang Việc; để trống là bỏ theo dõi %.
  if (form.has('progress')) {
    const raw = text(form, 'progress');
    const n = raw === '' ? null : Math.round(Number(raw));
    if (n !== null && !(n >= 0 && n <= 100)) return;
    patch.progress = status === 'done' ? 100 : n;
  }
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').update(patch).eq('id', id).select('group_id').maybeSingle();
  refresh(data?.group_id);
}

// Ô mã Jira trên đầu việc: dán link Jira hoặc gõ mã; để trống là bỏ mã.
// Việc Cá nhân không gắn Jira (trigger tasks_jira chặn). Người được giao cũng gắn được.
export async function saveTaskJira(input: { id: string; value: string }): Promise<FormState> {
  const id = uuidOrNull(String(input.id ?? ''));
  if (!id) return { error: 'Thiếu việc.' };
  const parsed = parseJiraInput(String(input.value ?? '').slice(0, 1200));
  if ('error' in parsed) return { error: parsed.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ jira_key: parsed.key, jira_url: parsed.url }).eq('id', id).select('group_id').maybeSingle();
  if (error && /jira_(key|url)/.test(error.message ?? '')) return { error: 'Cần chạy SQL thêm cột mã Jira cho đầu việc (20261114000001_jira_dau_viec.sql).' };
  if (error) return { error: errText(error) };
  if (!data) return { error: 'Bạn không có quyền sửa việc này.' };
  refresh(data.group_id);
  return { ok: parsed.key ? `Đã gắn mã ${parsed.key}.` : 'Đã bỏ mã Jira.' };
}

export async function deleteTask(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from('tasks').delete().eq('id', id).select('group_id').maybeSingle();
  refresh(data?.group_id);
}

// Xóa việc từ trang Việc: Trưởng nhóm (hoặc chủ mục Cá nhân) xóa ngay; người khác gửi
// đề nghị để Trưởng nhóm duyệt. Hàm request_delete trong cơ sở dữ liệu quyết định.
export async function deleteOrRequestTask(form: FormData) {
  const id = uuidOrNull(text(form, 'id'));
  const back = text(form, 'back');
  const to = back.startsWith('/') && !back.startsWith('//') ? back : '/viec';
  const sep = to.includes('?') ? '&' : '?';
  if (!id) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_delete', { p_type: 'task', p_id: id, p_reason: text(form, 'reason') || null });
  refresh(uuidOrNull(text(form, 'group_id')) ?? undefined);
  if (error) redirect(`${to}${sep}loi=${encodeURIComponent(errText(error))}`);
  redirect(`${to}${sep}tb=${encodeURIComponent(data === 'deleted' ? 'Đã xóa việc.' : 'Đã gửi đề nghị xóa. Trưởng nhóm sẽ duyệt và trả lời qua thông báo.')}`);
}

// ---- Lịch nhóm ----

// Đọc các ô của biểu mẫu lịch nhóm (dùng chung cho thêm và sửa).
function eventFields(form: FormData) {
  const title = text(form, 'title');
  const kind = (text(form, 'kind') || 'meeting') as EventKind;
  const starts_at = fromLocalInput(text(form, 'starts_at'));
  const ends_at = fromLocalInput(text(form, 'ends_at')) ?? starts_at;
  if (!title) return { error: 'Hãy nhập tiêu đề.' } as const;
  if (!EVENT_KINDS.includes(kind)) return { error: 'Loại lịch không hợp lệ.' } as const;
  if (!starts_at || !ends_at) return { error: 'Hãy chọn thời gian bắt đầu.' } as const;
  if (ends_at < starts_at) return { error: 'Giờ kết thúc phải sau giờ bắt đầu.' } as const;
  return {
    row: {
      title, kind, starts_at, ends_at,
      location: text(form, 'location') || null,
      description: text(form, 'description') || null,
    },
  } as const;
}

export async function createEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const group_id = uuidOrNull(text(form, 'group_id'));
  if (!group_id) return { error: 'Thiếu nhóm.' };
  const f = eventFields(form);
  if ('error' in f) return { error: f.error };
  const supabase = await createClient();
  const { error } = await supabase.from('events').insert({ group_id, ...f.row });
  if (error) return { error: errText(error) };
  refresh(group_id);
  return { ok: 'Đã thêm lịch.' };
}

export async function updateEvent(_prev: FormState, form: FormData): Promise<FormState> {
  const id = uuidOrNull(text(form, 'id'));
  if (!id) return { error: 'Thiếu lịch cần sửa.' };
  const f = eventFields(form);
  if ('error' in f) return { error: f.error };
  const supabase = await createClient();
  const { data, error } = await supabase.from('events').update(f.row).eq('id', id).select('group_id');
  if (error) return { error: errText(error) };
  if (!data?.length) return { error: 'Bạn không có quyền sửa lịch này.' };
  refresh(data[0].group_id);
  return { ok: 'Đã lưu thay đổi.' };
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
  // Việc chung nhiều đơn vị: gắn đơn vị cha và các đơn vị cùng làm để không gian hiện ở mỗi đơn vị.
  const units = form.getAll('unit_ids').map(String).filter((v) => uuidOrNull(v) && v !== parent);
  if (units.length) {
    const { data: p } = await supabase.from('groups').select('kind').eq('id', parent).single();
    await supabase.from('group_units').insert([...(p?.kind === 'unit' ? [parent] : []), ...units].map((u) => ({ group_id: data, unit_id: u })));
    units.forEach((u) => refresh(u));
  }
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
  const { data: old } = await supabase.from('task_links').select('file_path').eq('id', id).maybeSingle();
  const { count } = await supabase.from('task_links').delete({ count: 'exact' }).eq('id', id);
  if (count && old?.file_path) await supabase.storage.from(TASK_BUCKET).remove([old.file_path]);
  refresh(groupId ?? undefined);
}

// Ô kéo thả sản phẩm: trình duyệt xin link tải lên (RLS của Storage kiểm tra quyền gắn
// sản phẩm của việc), tự tải thẳng lên Supabase Storage, rồi báo máy chủ gắn vào việc.
const TASK_BUCKET = 'task-files';
const TASK_MAX_FILE_BYTES = 25 * 1024 * 1024;

function safeFileName(name: string) {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (base || 'tep').slice(-120);
}

export async function prepareTaskUpload(input: { task_id: string; files: { name: string; size: number }[] }):
  Promise<{ error: string } | { uploads: { path: string; token: string }[] }> {
  if (!uuidOrNull(input.task_id)) return { error: 'Thiếu thông tin đầu việc.' };
  if (!input.files.length || input.files.length > 20) return { error: 'Mỗi lần tải tối đa 20 tệp.' };
  const big = input.files.find((f) => f.size > TASK_MAX_FILE_BYTES);
  if (big) return { error: `Tệp "${big.name}" quá lớn (tối đa 25 MB). Tệp lớn hơn hãy để trên Google Drive và dán link.` };
  const supabase = await createClient();
  const uploads: { path: string; token: string }[] = [];
  for (const f of input.files) {
    const path = `${input.task_id}/${crypto.randomUUID()}/${safeFileName(f.name)}`;
    const { data, error } = await supabase.storage.from(TASK_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      if (/bucket not found/i.test(error?.message ?? '')) return { error: 'Chưa bật chỗ lưu tệp sản phẩm: quản trị cần chạy SQL 20261112600002_san_pham_keo_tha.sql.' };
      return { error: error?.message?.includes('row-level security') ? 'Bạn không có quyền gắn sản phẩm cho việc này.' : `Không chuẩn bị được chỗ lưu tệp: ${error?.message ?? ''}` };
    }
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

export type TaskDropInput = {
  task_id: string;
  group_id: string;
  files: { path: string; name: string; size: number }[];
  links: string[];
  // Nội dung gõ thẳng (không phải link).
  body: string;
};

export async function attachTaskDrop(input: TaskDropInput): Promise<FormState> {
  const task_id = uuidOrNull(input.task_id);
  if (!task_id) return { error: 'Thiếu thông tin đầu việc.' };
  const files = input.files.filter((f) => f.path.startsWith(`${task_id}/`) && !f.path.includes('..') && f.path.length <= 400);
  const links = [...new Set(input.links.map((l) => l.trim()).filter((l) => /^https:\/\/(drive|docs)\.google\.com\/\S*$/.test(l) && l.length <= 1000))].slice(0, 20);
  const body = input.body.trim().slice(0, 5000);
  if (!files.length && !links.length && !body) return { error: 'Không có tệp, link hay nội dung nào để gắn.' };
  const stem = (n: string) => n.replace(/\.[A-Za-z0-9]{1,6}$/, '').slice(0, 200);
  const rows = [
    ...files.map((f) => ({ task_id, label: stem(f.name) || null, file_path: f.path, file_name: f.name.slice(0, 255), file_size: Math.max(0, Math.round(f.size)) })),
    ...links.map((url) => ({ task_id, url })),
    ...(body ? [{ task_id, body }] : []),
  ];
  const supabase = await createClient();
  const { error } = await supabase.from('task_links').insert(rows);
  if (error) {
    if (files.length) await supabase.storage.from(TASK_BUCKET).remove(files.map((f) => f.path));
    if (/body|file_path|null value in column "url"|task_links_url_check/.test(error.message ?? '') && (files.length || body))
      return { error: 'Chưa bật gắn tệp/nội dung: quản trị cần chạy SQL 20261112600002_san_pham_keo_tha.sql. Tạm thời dán link Google Drive.' };
    return { error: errText(error) };
  }
  refresh(uuidOrNull(input.group_id) ?? undefined);
  return { ok: `Đã gắn ${rows.length} sản phẩm.` };
}

// ---- Không gian cá nhân ----

export async function createPersonalProject(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, 'name');
  if (!name) return { error: 'Hãy đặt tên dự án.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_personal_project', { p_name: name, p_description: text(form, 'description') || null });
  if (error) return { error: errText(error) };
  refresh();
  return { ok: `Đã tạo dự án cá nhân "${name}".` };
}
