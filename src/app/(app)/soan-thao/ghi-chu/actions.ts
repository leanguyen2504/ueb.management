'use server';

// Ghi chú nhanh: mỗi người chỉ đọc, sửa ghi chú của mình (RLS kiểm tra lại).
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';

type Result = { ok?: string; error?: string };
const MAX = 20000;
const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function done(error: { message?: string; code?: string } | null, ok: string): Result {
  if (error) return { error: errText(error) };
  revalidatePath('/soan-thao/ghi-chu');
  return { ok };
}

export async function createNote(body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return { error: 'Ghi chú đang trống.' };
  if (text.length > MAX) return { error: 'Ghi chú quá dài (tối đa 20.000 ký tự).' };
  const supabase = await createClient();
  const { error } = await supabase.from('quick_notes').insert({ body: text });
  return done(error, 'Đã lưu ghi chú.');
}

export async function updateNote(id: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!isId(id)) return { error: 'Ghi chú không hợp lệ.' };
  if (!text) return { error: 'Ghi chú đang trống. Muốn bỏ thì bấm Xóa.' };
  if (text.length > MAX) return { error: 'Ghi chú quá dài (tối đa 20.000 ký tự).' };
  const supabase = await createClient();
  const { error } = await supabase.from('quick_notes').update({ body: text }).eq('id', id);
  return done(error, 'Đã lưu.');
}

export async function pinNote(id: string, pinned: boolean): Promise<Result> {
  if (!isId(id)) return { error: 'Ghi chú không hợp lệ.' };
  const supabase = await createClient();
  const { error } = await supabase.from('quick_notes').update({ pinned }).eq('id', id);
  return done(error, pinned ? 'Đã ghim.' : 'Đã bỏ ghim.');
}

export async function deleteNote(id: string): Promise<Result> {
  if (!isId(id)) return { error: 'Ghi chú không hợp lệ.' };
  const supabase = await createClient();
  const { error } = await supabase.from('quick_notes').delete().eq('id', id);
  return done(error, 'Đã xóa ghi chú.');
}
