'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

const opt = (f: FormData, k: string) => String(f.get(k) || '').trim() || null;

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const full_name = String(form.get('full_name') || '').trim();
  if (!full_name) return { error: 'Hãy nhập họ tên.' };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name,
      unit: opt(form, 'unit'),
      position: opt(form, 'position'),
      phone: opt(form, 'phone'),
      office: opt(form, 'office'),
      bio: opt(form, 'bio'),
    })
    .eq('id', claims?.claims?.sub ?? '');
  if (error) return { error: errText(error) };
  revalidatePath('/', 'layout');
  return { ok: 'Đã lưu hồ sơ.' };
}

// Ảnh cá nhân: trình duyệt đã thu nhỏ ảnh; máy chủ kiểm tra lại loại và dung lượng.
// Lưu vào bucket riêng tư "avatars" theo phiên người dùng (RLS chỉ cho ghi thư mục của mình).
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadAvatar(_prev: FormState, form: FormData): Promise<FormState> {
  const file = form.get('avatar');
  if (!(file instanceof File) || !file.size) return { error: 'Hãy chọn ảnh.' };
  if (!AVATAR_TYPES.includes(file.type)) return { error: 'Chỉ nhận ảnh JPG, PNG hoặc WebP.' };
  if (file.size > 2 * 1024 * 1024) return { error: 'Ảnh quá lớn (tối đa 2 MB).' };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${Date.now()}.${ext}`;
  const { data: old } = await supabase.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { error: `Không tải được ảnh: ${upErr.message}` };
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    return { error: errText(error) };
  }
  if (old?.avatar_path) await supabase.storage.from('avatars').remove([old.avatar_path]);
  revalidatePath('/', 'layout');
  return { ok: 'Đã cập nhật ảnh.' };
}

export async function removeAvatar() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return;
  const { data: old } = await supabase.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();
  await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (old?.avatar_path) await supabase.storage.from('avatars').remove([old.avatar_path]);
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Liên kết trang cá nhân và file hồ sơ (CV…). Quyền thật sự do RLS kiểm tra:
// mỗi người chỉ thêm/gỡ mục của mình; đồng nghiệp đã đăng nhập xem được.
// ---------------------------------------------------------------------------
const PROFILE_BUCKET = 'profile-files';

function linkError(url: string): string | null {
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 1000) return 'Link phải là địa chỉ web đầy đủ, ví dụ https://www.linkedin.com/in/ten-ban';
  try {
    if (!new URL(url).hostname.includes('.')) return 'Link chưa đúng địa chỉ trang.';
  } catch {
    return 'Link chưa đúng địa chỉ trang.';
  }
  return null;
}

// Người dùng hay dán thiếu "https://" hoặc dùng http; chuẩn hóa về https.
function normalizeUrl(raw: string) {
  const u = raw.trim();
  if (!u) return '';
  if (/^http:\/\//i.test(u)) return `https://${u.slice(7)}`;
  if (!/^https:\/\//i.test(u)) return `https://${u.replace(/^\/+/, '')}`;
  return u;
}

function safeFileName(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return (base || 'tep').slice(-120);
}

async function me() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return { supabase, uid: claims?.claims?.sub as string | undefined };
}

function dbError(e: { message: string; code?: string }) {
  if (/tối đa 30/.test(e.message)) return 'Mỗi người tối đa 30 liên kết và file hồ sơ. Hãy gỡ bớt mục cũ.';
  if (e.code === '42P01' || /profile_links/.test(e.message)) return 'Tính năng này chưa được bật trên cơ sở dữ liệu. Hãy nhờ quản trị chạy tệp SQL "lien_ket_ho_so".';
  return errText(e);
}

async function nextPosition(supabase: Awaited<ReturnType<typeof createClient>>, uid: string) {
  const { data } = await supabase.from('profile_links').select('position').eq('user_id', uid).order('position', { ascending: false }).limit(1).maybeSingle();
  return (data?.position ?? 0) + 1;
}

export async function addProfileLink(_prev: FormState, form: FormData): Promise<FormState> {
  const kind = form.get('kind') === 'doc' ? 'doc' : 'link';
  const url = normalizeUrl(String(form.get('url') || ''));
  const label = opt(form, 'label')?.slice(0, 120) ?? null;
  if (!url) return { error: 'Hãy dán link.' };
  const bad = linkError(url);
  if (bad) return { error: bad };
  const { supabase, uid } = await me();
  if (!uid) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const { error } = await supabase.from('profile_links').insert({ user_id: uid, kind, url, label, position: await nextPosition(supabase, uid) });
  if (error) return { error: dbError(error) };
  revalidatePath('/', 'layout');
  return { ok: kind === 'doc' ? 'Đã gắn file hồ sơ.' : 'Đã thêm liên kết.' };
}

// Bước 1 khi tải file hồ sơ: máy chủ cấp link tải lên ký sẵn vào thư mục của chính mình,
// trình duyệt tải thẳng lên Storage (không qua máy chủ ứng dụng, nên tệp vài MB vẫn nhanh).
export async function prepareProfileUpload(files: { name: string; size: number }[]):
  Promise<{ error: string } | { uploads: { path: string; token: string }[] }> {
  if (!files.length || files.length > 10) return { error: 'Mỗi lần tải tối đa 10 tệp.' };
  const big = files.find((f) => f.size > 10 * 1024 * 1024);
  if (big) return { error: `Tệp "${big.name}" quá lớn (tối đa 10 MB). Tệp lớn hơn hãy để trên Google Drive và dán link.` };
  const { supabase, uid } = await me();
  if (!uid) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const uploads: { path: string; token: string }[] = [];
  for (const f of files) {
    const path = `${uid}/${crypto.randomUUID()}/${safeFileName(f.name)}`;
    const { data, error } = await supabase.storage.from(PROFILE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      return { error: /bucket/i.test(error?.message ?? '') ? 'Kho lưu file hồ sơ chưa được tạo. Hãy nhờ quản trị chạy tệp SQL "lien_ket_ho_so".' : `Không chuẩn bị được chỗ lưu tệp: ${error?.message ?? ''}` };
    }
    uploads.push({ path, token: data.token });
  }
  return { uploads };
}

// Bước 2: ghi các tệp vừa tải lên vào hồ sơ.
export async function attachProfileFiles(input: { files: { path: string; name: string; size: number }[]; label: string }): Promise<FormState> {
  const { supabase, uid } = await me();
  if (!uid) return { error: 'Phiên đăng nhập đã hết hạn.' };
  const files = input.files.filter((f) => f.path.startsWith(`${uid}/`) && !f.path.includes('..') && f.path.length <= 400);
  if (!files.length) return { error: 'Không có tệp nào để gắn.' };
  const label = input.label.trim().slice(0, 120) || null;
  let pos = await nextPosition(supabase, uid);
  const rows = files.map((f) => ({
    user_id: uid, kind: 'doc', label: files.length === 1 ? label : null,
    file_path: f.path, file_name: f.name.slice(0, 255), file_size: Math.max(0, Math.round(f.size)), position: pos++,
  }));
  const { error } = await supabase.from('profile_links').insert(rows);
  if (error) {
    await supabase.storage.from(PROFILE_BUCKET).remove(files.map((f) => f.path));
    return { error: dbError(error) };
  }
  revalidatePath('/', 'layout');
  return { ok: files.length === 1 ? 'Đã tải lên file hồ sơ.' : `Đã tải lên ${files.length} file hồ sơ.` };
}

export async function removeProfileLink(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase, uid } = await me();
  if (!uid) return;
  const { data: row } = await supabase.from('profile_links').select('file_path').eq('id', id).eq('user_id', uid).maybeSingle();
  if (!row) return;
  const { error } = await supabase.from('profile_links').delete().eq('id', id).eq('user_id', uid);
  if (!error && row.file_path) await supabase.storage.from(PROFILE_BUCKET).remove([row.file_path]);
  revalidatePath('/', 'layout');
}

// Đổi thứ tự: đưa một mục lên hoặc xuống một bậc trong cùng loại.
export async function moveProfileLink(id: string, dir: -1 | 1) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase, uid } = await me();
  if (!uid) return;
  const { data: row } = await supabase.from('profile_links').select('id, kind').eq('id', id).eq('user_id', uid).maybeSingle();
  if (!row) return;
  const { data: list } = await supabase.from('profile_links').select('id').eq('user_id', uid).eq('kind', row.kind)
    .order('position').order('created_at');
  const ids = (list ?? []).map((r) => r.id as string);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((rid, k) => supabase.from('profile_links').update({ position: k + 1 }).eq('id', rid).eq('user_id', uid)));
  revalidatePath('/', 'layout');
}
