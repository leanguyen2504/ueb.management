import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { features } from '@/lib/env';
import { syncCalendars } from './sync';

// Điểm vào cho trang Lịch: các buổi họp từ lịch Google dùng chung mà người dùng
// hiện tại được xem (RLS quyết định). Module tắt thì trả mảng rỗng.

export type GoogleCalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  all_day: boolean;
  url: string | null;
  source_label: string;
  source_id: string;
  description: string | null;
  meet_url: string | null;
  html_link: string | null;
};

export const isGoogleCalendarEnabled = () => features.googleCalendar();

export async function getGoogleCalendarEvents(
  supabase: SupabaseClient,
  // Giữ tham số để dùng khi có lịch riêng từng người; hiện quyền xem do RLS quyết định.
  _userId: string,
  fromISO: string,
  toISO: string,
): Promise<GoogleCalendarEvent[]> {
  if (!features.googleCalendar()) return [];
  // Cron trên gói Vercel miễn phí chỉ chạy mỗi ngày một lần, nên tải lại lịch đã cũ
  // khi có người mở trang (tối đa 8 giây, lỗi không làm hỏng trang).
  await Promise.race([syncCalendars().catch(() => []), new Promise((r) => setTimeout(r, 8000))]);

  const { data: sources } = await supabase.from('calendar_sources').select('id, label').eq('is_enabled', true);
  if (!sources?.length) return [];
  const labelOf = new Map(sources.map((s) => [s.id, s.label as string]));
  const { data: events } = await supabase
    .from('calendar_events')
    .select('id, source_id, title, starts_at, ends_at, all_day, location, description, url, html_link')
    .in('source_id', [...labelOf.keys()])
    .lt('starts_at', toISO)
    .gt('ends_at', fromISO)
    .order('starts_at')
    .limit(3000);
  return (events ?? []).map((e) => ({
    id: `gcal:${e.id}`,
    title: e.title,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    location: e.location,
    all_day: e.all_day,
    url: e.url ?? e.html_link,
    source_label: labelOf.get(e.source_id) ?? 'Google Calendar',
    source_id: e.source_id,
    description: e.description,
    meet_url: e.url,
    html_link: e.html_link,
  }));
}
