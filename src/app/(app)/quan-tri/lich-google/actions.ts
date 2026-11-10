'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/session';
import { errText } from '@/lib/format';
import { features } from '@/lib/env';
import { extractCalendarId } from '@/lib/google-calendar/calendar-id';
import { syncCalendars } from '@/lib/google-calendar/sync';
import type { FormState } from '@/components/FormMessage';

const PATH = '/quan-tri/lich-google';
const vis = (v: FormDataEntryValue | null) => (v === 'all' ? 'all' : 'office');

export async function addSource(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const calendar_id = extractCalendarId(String(form.get('calendar') || ''));
  if (!calendar_id) return { error: 'Không đọc được mã lịch. Hãy dán mã lịch (dạng ...@group.calendar.google.com) hoặc link lịch dùng chung của Google.' };
  const label = String(form.get('label') || '').trim().slice(0, 80) || 'Lịch Google';
  const { data, error } = await supabase
    .from('calendar_sources')
    .insert({ calendar_id, label, visibility: vis(form.get('visibility')) })
    .select('id')
    .single();
  if (error) return { error: error.code === '23505' ? 'Lịch này đã được thêm.' : errText(error) };
  revalidatePath(PATH);
  if (!features.googleCalendar()) return { ok: `Đã thêm lịch ${calendar_id}. Module đang tắt nên chưa tải lịch.` };
  const [r] = await syncCalendars({ sourceIds: [data.id], force: true }).catch((e: Error) => [{ ok: false, count: 0, error: e.message }]);
  if (r && !r.ok) return { error: `Đã thêm lịch nhưng chưa tải được: ${r.error}` };
  return { ok: `Đã thêm lịch và tải ${r?.count ?? 0} buổi họp.` };
}

export async function updateSource(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(form.get('id'));
  const patch: Record<string, unknown> = {};
  if (form.has('label')) patch.label = String(form.get('label')).trim().slice(0, 80) || 'Lịch Google';
  if (form.has('visibility')) patch.visibility = vis(form.get('visibility'));
  if (form.has('is_enabled')) patch.is_enabled = form.get('is_enabled') === 'true';
  await supabase.from('calendar_sources').update(patch).eq('id', id);
  revalidatePath(PATH);
}

export async function deleteSource(form: FormData) {
  const { supabase } = await requireAdmin();
  await supabase.from('calendar_sources').delete().eq('id', String(form.get('id')));
  revalidatePath(PATH);
}

export async function syncNow() {
  await requireAdmin();
  if (features.googleCalendar()) await syncCalendars({ force: true }).catch(() => []);
  revalidatePath(PATH);
}
