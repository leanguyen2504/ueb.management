'use server';

// Mục Tài liệu của không gian: link Drive chung, tệp kéo thả và link tài liệu.
// Quyền thật sự do RLS của bảng group_files, của Storage (bucket group-files) và hàm
// set_group_drive kiểm tra (SQL 20261112800001_tai_lieu_khong_gian.sql).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

const BUCKET = 'group-files';
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SQL_HINT = 'Chưa bật mục Tài liệu: quản trị cần chạy SQL 20261112800001_tai_lieu_khong_gian.sql.';
const uuidOrNull = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const URL_RE = /^https:\/\/\S+$/i;
const missingSql = (m?: string) => /group_files|set_group_drive|drive_url|bucket not found|schema cache/i.test(m ?? '');

function refresh(groupId: string) {
  revalidatePath(`/nhom/${groupId}`);
}

function safeFileName(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (base || 'tep').slice(-120);
}

export async function setGroupDrive(_prev: FormState, form: FormData): Promise<FormState> {
  const group_id = uuidOrNull(form.get('group_id'));
  const url = String(form.get('drive_url') || '').trim();
  if (!group_id) return { error: 'Thiếu thông tin không gian.' };
  if (url && (!URL_RE.test(url) || url.length > 1000)) return { error: 'Link phải bắt đầu bằng https://, ví dụ https://drive.google.com/drive/folders/…' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_group_drive', { p_group: group_id, p_url: url || null });
  if (error) return { error: missingSql(error.message) ? SQL_HINT : errText(error) };
  refresh(group_id);
  return { ok: url ? 'Đã lưu link Drive chung.' : 'Đã gỡ link Drive chung.' };
}

// Trình duyệt xin link tải lên (RLS của Storage kiểm tra quyền tải tài liệu của không gian),
// tự tải thẳng lên Supabase Storage, rồi báo máy chủ ghi vào group_files.
export async function prepareGroupUpload(input: { group_id: string; files: { name: string; size: number }[] }):
  Promise<{ error: string } | { uploads: { path: string; token: string }[] }> {
  const group_id = uuidOrNull(input.group_id);
  if (!group_id) return { error: 'Thiếu thông tin không gian.' };
  if (!input.files.length || input.files.length > 20) return { error: 'Mỗi lần tải tối đa 20 tệp.' };
  const big = input.files.find((f) => f.size > MAX_FILE_BYTES);
  if (big) return { error: `Tệp "${big.name}" quá lớn (tối đa 50 MB). Tệp lớn hơn hãy để trong Drive chung.` };
  const supabase = await createClient();
  const uploads: { path: string; token: string }[] = [];
  for (const f of input.files) {
    const path = `${group_id}/${crypto.randomUUID()}/${safeFileName(f.name)}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      if (/bucket not found/i.test(error?.message ?? '')) return { error: SQL_HINT };
      return { error: error?.message?.includes('row-level security') ? 'Bạn chưa có quyền "Tải/gắn tài liệu" ở không gian này.' : `Không chuẩn bị được chỗ lưu tệp: ${error?.message ?? ''}` };
    }
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

export async function attachGroupDocs(input: { group_id: string; files: { path: string; name: string; size: number }[]; links: string[] }): Promise<FormState> {
  const group_id = uuidOrNull(input.group_id);
  if (!group_id) return { error: 'Thiếu thông tin không gian.' };
  const files = input.files.filter((f) => f.path.startsWith(`${group_id}/`) && !f.path.includes('..') && f.path.length <= 400);
  const links = [...new Set(input.links.map((l) => l.trim()).filter((l) => URL_RE.test(l) && l.length <= 1000))].slice(0, 20);
  if (!files.length && !links.length) return { error: 'Không có tệp hay link nào để thêm.' };
  const stem = (n: string) => n.replace(/\.[A-Za-z0-9]{1,6}$/, '').slice(0, 200);
  const rows = [
    ...files.map((f) => ({ group_id, label: stem(f.name) || null, file_path: f.path, file_name: f.name.slice(0, 255), file_size: Math.max(0, Math.round(f.size)) })),
    ...links.map((url) => ({ group_id, url })),
  ];
  const supabase = await createClient();
  const { error } = await supabase.from('group_files').insert(rows);
  if (error) {
    if (files.length) await supabase.storage.from(BUCKET).remove(files.map((f) => f.path));
    return { error: missingSql(error.message) ? SQL_HINT : errText(error) };
  }
  refresh(group_id);
  return { ok: `Đã thêm ${rows.length} tài liệu.` };
}

export async function deleteGroupDoc(form: FormData) {
  const id = uuidOrNull(form.get('id'));
  const group_id = uuidOrNull(form.get('group_id'));
  if (!id || !group_id) return;
  const supabase = await createClient();
  const { data: old } = await supabase.from('group_files').select('file_path').eq('id', id).maybeSingle();
  const { count } = await supabase.from('group_files').delete({ count: 'exact' }).eq('id', id);
  if (count && old?.file_path) await supabase.storage.from(BUCKET).remove([old.file_path]);
  refresh(group_id);
}
