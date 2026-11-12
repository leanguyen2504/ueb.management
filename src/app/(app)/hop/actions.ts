'use server';

// Gắn, sửa, gỡ tài liệu của buổi họp. Quyền thật sự do RLS kiểm tra
// (Hiệu trưởng, thư ký, quản trị, Văn thư nhóm; và phải xem được lịch đó).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';
import { DOC_TYPES, MAX_FILE_BYTES, STATUS_LABEL, isJiraKey } from '@/lib/meeting-rules';

const text = (f: FormData, k: string) => String(f.get(k) || '').trim();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const KINDS = ['pre', 'minutes'] as const;
const BUCKET = 'meeting-files';

function refresh() {
  revalidatePath('/hop');
  revalidatePath('/');
}

function checkUrl(url: string): string | null {
  if (!url) return null;
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 1000) return 'Link phải bắt đầu bằng https:// (ví dụ link Google Drive).';
  return null;
}

const docType = (f: FormData) => {
  const v = text(f, 'doc_type');
  return v in DOC_TYPES ? v : null;
};

// Tên bên trùng tên một nhóm hoặc một mảng công tác (không phân biệt hoa thường) thì gắn
// với nhóm/mảng đó; mảng có nhóm thì gắn luôn nhóm của mảng.
async function resolveParties(supabase: Awaited<ReturnType<typeof createClient>>, names: string[]) {
  const map = new Map<string, { group: string | null; area: string | null }>();
  if (!names.length) return map;
  const [{ data: groups }, { data: areas }] = await Promise.all([
    supabase.from('groups').select('id, name').is('archived_at', null),
    supabase.from('work_areas').select('id, name, group_id'),
  ]);
  const g = new Map((groups ?? []).map((x) => [String(x.name).trim().toLowerCase(), x.id as string]));
  const aByName = new Map((areas ?? []).map((x) => [String(x.name).trim().toLowerCase(), x]));
  for (const n of names) {
    const k = n.trim().toLowerCase();
    const area = aByName.get(k) ?? null;
    const group = g.get(k) ?? area?.group_id ?? null;
    const areaByGroup = !area && group ? (areas ?? []).find((x) => x.group_id === group) ?? null : null;
    map.set(k, { group, area: (area ?? areaByGroup)?.id ?? null });
  }
  return map;
}

// Thêm một tài liệu, hoặc nhiều bên "chờ gửi" cùng lúc (mỗi dòng một bên, khi chưa có link).
export async function addMeetingItems(_prev: FormState, form: FormData): Promise<FormState> {
  const source_id = text(form, 'source_id');
  const event_key = text(form, 'event_key');
  const meeting_title = text(form, 'meeting_title').slice(0, 300);
  const meeting_starts_at = text(form, 'meeting_starts_at');
  const kind = text(form, 'kind') as (typeof KINDS)[number];
  const url = text(form, 'url');
  const title = text(form, 'title').slice(0, 200) || null;
  const note = text(form, 'note').slice(0, 500) || null;
  const assignee = text(form, 'assignee_id');
  if (!isUuid(source_id) || !event_key || Number.isNaN(Date.parse(meeting_starts_at))) return { error: 'Thiếu thông tin buổi họp.' };
  if (!KINDS.includes(kind)) return { error: 'Loại tài liệu không hợp lệ.' };
  const bad = checkUrl(url);
  if (bad) return { error: bad };

  const parties = [...new Set(text(form, 'party').split(/[\n;]+/).map((p) => p.trim().slice(0, 120)).filter(Boolean))];
  if (url && parties.length > 1) return { error: 'Khi đã có link, chỉ ghi một bên gửi.' };
  if (!url && !parties.length && kind === 'pre') return { error: 'Hãy ghi bên cần gửi tài liệu, hoặc dán link tài liệu.' };
  if (parties.length > 30) return { error: 'Tối đa 30 bên mỗi lần.' };

  const supabase = await createClient();
  const resolved = await resolveParties(supabase, parties);
  const base = {
    source_id, event_key, meeting_title, meeting_starts_at: new Date(meeting_starts_at).toISOString(), kind,
    url: url || null, title, note, assignee_id: isUuid(assignee) ? assignee : null, doc_type: docType(form),
  };
  const rows = (parties.length ? parties : [null]).map((p) => {
    const r = p ? resolved.get(p.toLowerCase()) : undefined;
    return { ...base, party: p, party_group_id: r?.group ?? null, area_id: r?.area ?? null };
  });
  const { error } = await supabase.from('meeting_items').insert(rows);
  if (error) return { error: errText(error) };
  refresh();
  if (url) return { ok: 'Đã gắn tài liệu.' };
  return { ok: rows.length > 1 ? `Đã thêm ${rows.length} bên đang chờ gửi.` : 'Đã thêm, đang chờ gửi.' };
}

// Dán link khi bên đó gửi, đổi người đôn đốc, ghi chú.
export async function updateMeetingItem(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, 'id');
  const url = text(form, 'url');
  if (!isUuid(id)) return { error: 'Thiếu tài liệu.' };
  const supabase = await createClient();
  const { data: old } = await supabase.from('meeting_items').select('url, file_path').eq('id', id).maybeSingle();
  // Tệp đã tải lên giữ nguyên link trong ứng dụng; đổi sang link khác thì gỡ tệp cũ.
  const keepFile = !!old?.file_path && url === old.url;
  const bad = keepFile ? null : checkUrl(url);
  if (bad) return { error: bad };
  const party = text(form, 'party').slice(0, 120) || null;
  const assignee = text(form, 'assignee_id');
  const resolved = await resolveParties(supabase, party ? [party] : []);
  const r = party ? resolved.get(party.toLowerCase()) : undefined;
  const { error, count } = await supabase.from('meeting_items').update({
    url: url || null,
    title: text(form, 'title').slice(0, 200) || null,
    note: text(form, 'note').slice(0, 500) || null,
    party,
    party_group_id: r?.group ?? null,
    area_id: r?.area ?? null,
    doc_type: docType(form),
    assignee_id: isUuid(assignee) ? assignee : null,
    ...(old?.file_path && !keepFile ? { file_path: null, file_name: null, file_size: null } : {}),
  }, { count: 'exact' }).eq('id', id);
  if (error) return { error: errText(error) };
  if (!count) return { error: 'Bạn không có quyền sửa tài liệu này.' };
  if (old?.file_path && !keepFile) await supabase.storage.from(BUCKET).remove([old.file_path]);
  refresh();
  return { ok: 'Đã lưu.' };
}

export async function deleteMeetingItem(form: FormData) {
  const id = text(form, 'id');
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data: old } = await supabase.from('meeting_items').select('file_path').eq('id', id).maybeSingle();
  const { count } = await supabase.from('meeting_items').delete({ count: 'exact' }).eq('id', id);
  if (count && old?.file_path) await supabase.storage.from(BUCKET).remove([old.file_path]);
  refresh();
}

// Thông tin chung của buổi họp: mã Jira, thư mục Drive, tình trạng, nội dung theo dõi.
export async function saveMeetingRecord(_prev: FormState, form: FormData): Promise<FormState> {
  const source_id = text(form, 'source_id');
  const event_key = text(form, 'event_key');
  const meeting_starts_at = text(form, 'meeting_starts_at');
  const jira = text(form, 'jira_key').toUpperCase().replace(/^\(|\)$/g, '');
  const folder = text(form, 'drive_folder_url');
  const status = text(form, 'status');
  const follow_up = text(form, 'follow_up').slice(0, 2000) || null;
  if (!isUuid(source_id) || !event_key || Number.isNaN(Date.parse(meeting_starts_at))) return { error: 'Thiếu thông tin buổi họp.' };
  if (jira && !isJiraKey(jira)) return { error: 'Mã Jira có dạng CHỮ-SỐ, ví dụ KHTC-6447.' };
  const bad = checkUrl(folder);
  if (bad) return { error: bad };
  if (status && !(status in STATUS_LABEL)) return { error: 'Tình trạng không hợp lệ.' };
  const supabase = await createClient();
  const fields = { jira_key: jira || null, drive_folder_url: folder || null, status: status || null, follow_up };
  // Cập nhật nếu đã có; chưa có thì tạo (quyền sửa không cho đổi buổi họp của hồ sơ).
  const upd = await supabase.from('meeting_records').update(fields, { count: 'exact' }).eq('source_id', source_id).eq('event_key', event_key);
  let error = upd.error;
  if (!error && !upd.count) {
    ({ error } = await supabase.from('meeting_records').insert({
      source_id, event_key,
      meeting_title: text(form, 'meeting_title').slice(0, 300),
      meeting_starts_at: new Date(meeting_starts_at).toISOString(),
      ...fields,
    }));
  }
  if (error) return { error: errText(error) };
  refresh();
  revalidatePath('/hop/tong-hop');
  return { ok: 'Đã lưu thông tin buổi họp.' };
}

// ---------------------------------------------------------------------------
// Kéo thả tệp: trình duyệt xin link tải lên (RLS của Storage kiểm tra quyền gắn tài liệu
// của lịch), tự tải thẳng lên Supabase Storage, rồi báo máy chủ gắn tệp vào buổi họp.

function safeName(name: string) {
  const base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (base || 'tep').slice(-120);
}

export async function prepareMeetingUpload(input: { source_id: string; files: { name: string; size: number }[] }):
  Promise<{ error: string } | { uploads: { path: string; token: string }[] }> {
  if (!isUuid(input.source_id)) return { error: 'Thiếu thông tin buổi họp.' };
  if (!input.files.length || input.files.length > 20) return { error: 'Mỗi lần tải tối đa 20 tệp.' };
  const big = input.files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return { error: `Tệp "${big.name}" quá lớn (tối đa 25 MB). Tệp lớn hơn hãy để trên Google Drive và dán link.` };
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7);
  const uploads: { path: string; token: string }[] = [];
  for (const f of input.files) {
    const path = `${input.source_id}/${month}/${crypto.randomUUID()}/${safeName(f.name)}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { error: error?.message?.includes('row-level security') ? 'Bạn không có quyền gắn tài liệu cho lịch này.' : `Không chuẩn bị được chỗ lưu tệp: ${error?.message ?? ''}` };
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

export type DropInput = {
  meeting: { source_id: string; event_key: string; title: string; starts_at: string };
  kind: string;
  party: string;
  doc_type: string;
  // Gắn tệp đầu tiên vào một dòng "chờ gửi" có sẵn.
  target_id: string;
  files: { path: string; name: string; size: number }[];
  links: { url: string; title: string }[];
};

export async function attachMeetingDrop(input: DropInput): Promise<FormState> {
  const { meeting } = input;
  const kind = input.kind as (typeof KINDS)[number];
  if (!isUuid(meeting.source_id) || !meeting.event_key || Number.isNaN(Date.parse(meeting.starts_at))) return { error: 'Thiếu thông tin buổi họp.' };
  if (!KINDS.includes(kind)) return { error: 'Loại tài liệu không hợp lệ.' };
  const files = input.files.filter((f) => f.path.startsWith(`${meeting.source_id}/`) && !f.path.includes('..') && f.path.length <= 400);
  const links = input.links.filter((l) => !checkUrl(l.url) && l.url);
  if (!files.length && !links.length) return { error: 'Không có tệp hoặc link nào để gắn.' };
  const doc_type = input.doc_type in DOC_TYPES ? input.doc_type : null;
  const party = input.party.trim().slice(0, 120) || null;
  const supabase = await createClient();
  const resolved = await resolveParties(supabase, party ? [party] : []);
  const r = party ? resolved.get(party.toLowerCase()) : undefined;
  const stem = (n: string) => n.replace(/\.[A-Za-z0-9]{1,6}$/, '').slice(0, 200);
  const entries = [
    ...files.map((f) => ({ url: `/hop/tep?p=${encodeURIComponent(f.path)}`, title: stem(f.name) || null, file_path: f.path, file_name: f.name.slice(0, 255), file_size: Math.max(0, Math.round(f.size)) })),
    ...links.map((l) => ({ url: l.url, title: l.title.slice(0, 200) || null, file_path: null, file_name: null, file_size: null })),
  ];

  let first = 0;
  if (isUuid(input.target_id)) {
    const e = entries[0];
    const { error, count } = await supabase.from('meeting_items').update({ ...e, ...(doc_type ? { doc_type } : {}) }, { count: 'exact' })
      .eq('id', input.target_id).is('url', null);
    if (error) return { error: errText(error) };
    if (count) first = 1;
  }
  const rows = entries.slice(first).map((e) => ({
    source_id: meeting.source_id, event_key: meeting.event_key, meeting_title: meeting.title.slice(0, 300),
    meeting_starts_at: new Date(meeting.starts_at).toISOString(), kind, doc_type,
    party, party_group_id: r?.group ?? null, area_id: r?.area ?? null, ...e,
  }));
  if (rows.length) {
    const { error } = await supabase.from('meeting_items').insert(rows);
    if (error) {
      await supabase.storage.from(BUCKET).remove(rows.map((x) => x.file_path).filter(Boolean) as string[]);
      return { error: errText(error) };
    }
  }
  refresh();
  revalidatePath('/hop/tong-hop');
  return { ok: entries.length > 1 ? `Đã gắn ${entries.length} tài liệu.` : 'Đã gắn tài liệu.' };
}
