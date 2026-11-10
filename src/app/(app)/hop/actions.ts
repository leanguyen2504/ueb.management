'use server';

// Gắn, sửa, gỡ tài liệu của buổi họp. Quyền thật sự do RLS kiểm tra
// (Hiệu trưởng, thư ký, quản trị, Văn thư nhóm; và phải xem được lịch đó).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

const text = (f: FormData, k: string) => String(f.get(k) || '').trim();
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const KINDS = ['pre', 'minutes'] as const;

function refresh() {
  revalidatePath('/hop');
  revalidatePath('/');
}

function checkUrl(url: string): string | null {
  if (!url) return null;
  if (!/^https:\/\/\S+$/i.test(url) || url.length > 1000) return 'Link phải bắt đầu bằng https:// (ví dụ link Google Drive).';
  return null;
}

// Tên bên trùng tên một nhóm (không phân biệt hoa thường) thì gắn với nhóm đó.
async function groupIdsByName(supabase: Awaited<ReturnType<typeof createClient>>, names: string[]) {
  const map = new Map<string, string>();
  if (!names.length) return map;
  const { data } = await supabase.from('groups').select('id, name').is('archived_at', null);
  for (const g of data ?? []) map.set(String(g.name).trim().toLowerCase(), g.id);
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
  const groupOf = await groupIdsByName(supabase, parties);
  const base = {
    source_id, event_key, meeting_title, meeting_starts_at: new Date(meeting_starts_at).toISOString(), kind,
    url: url || null, title, note, assignee_id: isUuid(assignee) ? assignee : null,
  };
  const rows = (parties.length ? parties : [null]).map((p) => ({ ...base, party: p, party_group_id: p ? groupOf.get(p.toLowerCase()) ?? null : null }));
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
  const bad = checkUrl(url);
  if (bad) return { error: bad };
  const party = text(form, 'party').slice(0, 120) || null;
  const assignee = text(form, 'assignee_id');
  const supabase = await createClient();
  const groupOf = await groupIdsByName(supabase, party ? [party] : []);
  const { error, count } = await supabase.from('meeting_items').update({
    url: url || null,
    title: text(form, 'title').slice(0, 200) || null,
    note: text(form, 'note').slice(0, 500) || null,
    party,
    party_group_id: party ? groupOf.get(party.toLowerCase()) ?? null : null,
    assignee_id: isUuid(assignee) ? assignee : null,
  }, { count: 'exact' }).eq('id', id);
  if (error) return { error: errText(error) };
  if (!count) return { error: 'Bạn không có quyền sửa tài liệu này.' };
  refresh();
  return { ok: 'Đã lưu.' };
}

export async function deleteMeetingItem(form: FormData) {
  const id = text(form, 'id');
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from('meeting_items').delete().eq('id', id);
  refresh();
}
