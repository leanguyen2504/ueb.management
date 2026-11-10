import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { TIMEZONE } from '@/lib/env';
import { resolveAuth } from './service-account';
import { listEvents, type GoogleAuth } from './google-api';
import { listPublicIcsEvents } from './ics';

// Cửa sổ lưu lịch: 30 ngày trước đến 180 ngày sau.
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;
// Lịch cũ hơn mức này sẽ được tải lại khi có người mở trang Lịch.
export const STALE_MS = 10 * 60 * 1000;

type Admin = ReturnType<typeof createAdminClient>;
type SourceRow = { id: string; calendar_id: string };
export type SyncResult = { id: string; ok: boolean; count: number; error?: string };

const errMessage = (e: unknown) =>
  e instanceof Error
    ? e.name === 'TimeoutError' || e.name === 'AbortError'
      ? 'Google phản hồi quá chậm. Hệ thống sẽ thử lại sau.'
      : e.message.slice(0, 400)
    : 'Lỗi không xác định khi tải lịch.';

async function syncSource(admin: Admin, auth: GoogleAuth | { publicIcs: true }, src: SourceRow): Promise<SyncResult> {
  const now = Date.now();
  const stamp = new Date().toISOString();
  try {
    const from = new Date(now - PAST_DAYS * 86400000);
    const to = new Date(now + FUTURE_DAYS * 86400000);
    const rows = 'publicIcs' in auth
      ? await listPublicIcsEvents(src.calendar_id, from, to, TIMEZONE)
      : await listEvents(auth, src.calendar_id, from, to, TIMEZONE);
    const del = await admin.from('calendar_events').delete().eq('source_id', src.id);
    if (del.error) throw new Error(del.error.message);
    for (let i = 0; i < rows.length; i += 500) {
      const ins = await admin.from('calendar_events').insert(rows.slice(i, i + 500).map((r) => ({ ...r, source_id: src.id })));
      if (ins.error) throw new Error(ins.error.message);
    }
    await admin.from('calendar_sources').update({ last_synced_at: stamp, last_error: null, event_count: rows.length }).eq('id', src.id);
    return { id: src.id, ok: true, count: rows.length };
  } catch (e) {
    const error = errMessage(e);
    await admin.from('calendar_sources').update({ last_synced_at: stamp, last_error: error }).eq('id', src.id);
    return { id: src.id, ok: false, count: 0, error };
  }
}

// Đồng bộ các lịch đang bật. Mặc định chỉ lịch đã cũ; force để tải lại tất cả.
export async function syncCalendars(opts: { sourceIds?: string[]; force?: boolean } = {}): Promise<SyncResult[]> {
  const admin = createAdminClient();
  let q = admin.from('calendar_sources').select('id, calendar_id, last_synced_at').eq('is_enabled', true);
  if (opts.sourceIds) q = q.in('id', opts.sourceIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const cutoff = Date.now() - STALE_MS;
  const due = (data ?? []).filter((s) => opts.force || !s.last_synced_at || new Date(s.last_synced_at).getTime() < cutoff);
  if (!due.length) return [];
  let auth: GoogleAuth | { publicIcs: true };
  try {
    auth = await resolveAuth();
  } catch (e) {
    const err = errMessage(e);
    await admin.from('calendar_sources').update({ last_synced_at: new Date().toISOString(), last_error: err }).in('id', due.map((s) => s.id));
    return due.map((s) => ({ id: s.id, ok: false, count: 0, error: err }));
  }
  return Promise.all(due.map((s) => syncSource(admin, auth, s)));
}
