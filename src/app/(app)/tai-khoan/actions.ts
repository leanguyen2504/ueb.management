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
