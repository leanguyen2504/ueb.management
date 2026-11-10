import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleCalendarEvents, type GoogleCalendarEvent } from '@/lib/google-calendar';

// Hồ sơ cuộc họp: buổi họp từ lịch Google dùng chung kèm tài liệu trước họp và biên bản
// (bảng meeting_items). RLS quyết định ai xem, ai gắn được.

export type MeetingItemKind = 'pre' | 'minutes';

export type MeetingItem = {
  id: string;
  source_id: string;
  event_key: string;
  meeting_title: string;
  meeting_starts_at: string;
  kind: MeetingItemKind;
  party: string | null;
  party_group_id: string | null;
  assignee_id: string | null;
  title: string | null;
  url: string | null;
  note: string | null;
  created_by: string | null;
  updated_at: string;
};

export type Meeting = {
  source_id: string;
  source_label: string;
  event_key: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  html_link: string | null;
  meet_url: string | null;
  attachments: { title: string; url: string }[];
  items: MeetingItem[];
  // Hồ sơ còn đó nhưng buổi họp đã bị xóa hoặc dời khỏi khoảng ngày đang xem.
  gone?: boolean;
};

const ITEM_COLS = 'id, source_id, event_key, meeting_title, meeting_starts_at, kind, party, party_group_id, assignee_id, title, url, note, created_by, updated_at';
const keyOf = (sourceId: string, eventKey: string) => `${sourceId}|${eventKey}`;

// Số bên đã gửi / tổng số bên được đề nghị gửi tài liệu trước họp, và biên bản đã có chưa.
export function meetingProgress(m: Pick<Meeting, 'items'>) {
  const pre = m.items.filter((i) => i.kind === 'pre');
  const minutes = m.items.filter((i) => i.kind === 'minutes');
  return {
    preTotal: pre.length,
    preDone: pre.filter((i) => i.url).length,
    minutesDone: minutes.some((i) => i.url),
    minutesPending: minutes.some((i) => !i.url),
    missing: m.items.filter((i) => !i.url).length,
  };
}

export async function loadMeetings(supabase: SupabaseClient, userId: string, fromIso: string, toIso: string): Promise<Meeting[]> {
  const events: GoogleCalendarEvent[] = await getGoogleCalendarEvents(supabase, userId, fromIso, toIso);
  const byKey = new Map<string, Meeting>();
  for (const e of events) {
    byKey.set(keyOf(e.source_id, e.event_key), {
      source_id: e.source_id,
      source_label: e.source_label,
      event_key: e.event_key,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      all_day: e.all_day,
      location: e.location,
      description: e.description,
      html_link: e.html_link,
      meet_url: e.meet_url,
      attachments: e.attachments,
      items: [],
    });
  }

  // Hồ sơ của các buổi họp đang hiện, cộng hồ sơ có giờ họp (lúc gắn) trong khoảng đang xem
  // nhưng buổi họp không còn trên lịch.
  const keys = [...new Set(events.map((e) => e.event_key))];
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 150) chunks.push(keys.slice(i, i + 150));
  const results = await Promise.all([
    ...chunks.map((c) => supabase.from('meeting_items').select(ITEM_COLS).in('event_key', c).order('created_at').returns<MeetingItem[]>()),
    supabase.from('meeting_items').select(ITEM_COLS).gte('meeting_starts_at', fromIso).lt('meeting_starts_at', toIso).order('created_at').returns<MeetingItem[]>(),
  ]);
  const seen = new Set<string>();
  for (const r of results) {
    for (const it of r.data ?? []) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const k = keyOf(it.source_id, it.event_key);
      let m = byKey.get(k);
      if (!m) {
        if (it.meeting_starts_at < fromIso || it.meeting_starts_at >= toIso) continue;
        m = {
          source_id: it.source_id, source_label: '', event_key: it.event_key, title: it.meeting_title || '(Buổi họp)',
          starts_at: it.meeting_starts_at, ends_at: it.meeting_starts_at, all_day: false, location: null, description: null,
          html_link: null, meet_url: null, attachments: [], items: [], gone: true,
        };
        byKey.set(k, m);
      }
      m.items.push(it);
    }
  }
  return [...byKey.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
}

// Buổi họp "của tôi": tôi đôn đốc một bên, nhóm tôi tham gia là một bên, hoặc tên nhóm
// tôi tham gia xuất hiện trong tên/thành phần buổi họp.
export function isMyMeeting(m: Meeting, userId: string, myGroups: { id: string; name: string }[]): boolean {
  const ids = new Set(myGroups.map((g) => g.id));
  if (m.items.some((i) => i.assignee_id === userId || (i.party_group_id && ids.has(i.party_group_id)))) return true;
  const text = `${m.title}\n${m.description ?? ''}`.toLowerCase();
  return myGroups.some((g) => g.name.trim().length >= 4 && text.includes(g.name.trim().toLowerCase()));
}
