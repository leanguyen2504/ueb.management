'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { errText } from '@/lib/format';
import type { FormState } from '@/components/FormMessage';

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const full_name = String(form.get('full_name') || '').trim();
  if (!full_name) return { error: 'Hãy nhập họ tên.' };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name, unit: String(form.get('unit') || '').trim() || null, position: String(form.get('position') || '').trim() || null })
    .eq('id', claims?.claims?.sub ?? '');
  if (error) return { error: errText(error) };
  revalidatePath('/', 'layout');
  return { ok: 'Đã lưu thông tin.' };
}
