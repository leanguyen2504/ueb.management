import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGoogleCalendarEvents, type GoogleCalendarEvent } from '@/lib/google-calendar';
import { autoStatus, jiraKeyIn, jiraUrl, type DocType, type MeetingStatus } from '@/lib/meeting-rules';

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
  doc_type: DocType | null;
  area_id: string | null;
  // Tệp tải lên (Supabase Storage, bucket meeting-files); url khi đó là /hop/tep?p=...
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  created_by: string | null;
  updated_by: string | null;
  updated_at: string;
};

// Thông tin chung của buổi họp do đầu mối ghi (bảng meeting_records).
export type MeetingRecord = {
  source_id: string;
  event_key: string;
  jira_key: string | null;
  // Link Jira dán vào ô trên dòng buổi họp (cột thêm sau, có thể chưa có).
  jira_url?: string | null;
  drive_folder_url: string | null;
  status: MeetingStatus | null;
  follow_up: string | null;
  updated_by: string | null;
  updated_at: string;
};

// Mảng công tác và đầu mối (bảng work_areas).
export type WorkArea = {
  id: string;
  name: string;
  group_id: string | null;
  primary_email: string | null;
  coordinator_emails: string[];
  sort_order: number;
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
  record: MeetingRecord | null;
  // Mã Jira: đầu mối ghi, hoặc tự đọc trong tên/mô tả sự kiện.
  jira_key: string | null;
  status: MeetingStatus;
  // Hồ sơ còn đó nhưng buổi họp đã bị xóa hoặc dời khỏi khoảng ngày đang xem.
  gone?: boolean;
};

const ITEM_COLS = 'id, source_id, event_key, meeting_title, meeting_starts_at, kind, party, party_group_id, assignee_id, title, url, note, doc_type, area_id, file_path, file_name, file_size, created_by, updated_by, updated_at';
// Lấy mọi cột để trang vẫn chạy khi chưa chạy SQL thêm cột jira_url.
const RECORD_COLS = '*';

export async function loadAreas(supabase: SupabaseClient): Promise<WorkArea[]> {
  const { data } = await supabase.from('work_areas').select('id, name, group_id, primary_email, coordinator_emails, sort_order').order('sort_order').order('name').returns<WorkArea[]>();
  return data ?? [];
}
// Link mở mã Jira của buổi họp: link đã dán (nếu đúng mã đang hiện), không thì tạo từ JIRA_BASE_URL.
export function meetingJiraHref(m: Pick<Meeting, 'jira_key' | 'record'>, base: string | null): string | null {
  if (!m.jira_key) return null;
  return (m.record?.jira_key === m.jira_key && m.record?.jira_url) || jiraUrl(base, m.jira_key);
}

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
      record: null,
      jira_key: null,
      status: 'chuan_bi',
    });
  }

  // Hồ sơ của các buổi họp đang hiện, cộng hồ sơ có giờ họp (lúc gắn) trong khoảng đang xem
  // nhưng buổi họp không còn trên lịch.
  const keys = [...new Set(events.map((e) => e.event_key))];
  const chunks: string[][] = [];
  for (let i = 0; i < keys.length; i += 150) chunks.push(keys.slice(i, i + 150));
  // Hồ sơ (meeting_items) và thông tin chung (meeting_records) được đọc cùng lúc.
  const recPromise = Promise.all([
    ...chunks.map((c) => supabase.from('meeting_records').select(RECORD_COLS).in('event_key', c).returns<(MeetingRecord & { meeting_title: string; meeting_starts_at: string })[]>()),
    supabase.from('meeting_records').select(RECORD_COLS).gte('meeting_starts_at', fromIso).lt('meeting_starts_at', toIso).returns<(MeetingRecord & { meeting_title: string; meeting_starts_at: string })[]>(),
  ]);
  const results = await Promise.all([
    ...chunks.map((c) => supabase.from('meeting_items').select(ITEM_COLS).in('event_key', c).order('created_at').returns<MeetingItem[]>()),
    supabase.from('meeting_items').select(ITEM_COLS).gte('meeting_starts_at', fromIso).lt('meeting_starts_at', toIso).order('created_at').returns<MeetingItem[]>(),
  ]);
  // Dự phòng khi mã sự kiện đổi (ví dụ đổi cách đọc lịch): gắn hồ sơ vào buổi họp cùng lịch,
  // cùng giờ và cùng tên, để không hiện hai dòng cho một buổi họp.
  const byTitleTime = new Map<string, Meeting>();
  for (const m of byKey.values()) byTitleTime.set(`${m.source_id}|${new Date(m.starts_at).getTime()}|${m.title.trim().toLowerCase()}`, m);
  const seen = new Set<string>();
  for (const r of results) {
    for (const it of r.data ?? []) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const k = keyOf(it.source_id, it.event_key);
      let m = byKey.get(k) ?? byTitleTime.get(`${it.source_id}|${new Date(it.meeting_starts_at).getTime()}|${it.meeting_title.trim().toLowerCase()}`);
      if (!m) {
        if (it.meeting_starts_at < fromIso || it.meeting_starts_at >= toIso) continue;
        m = {
          source_id: it.source_id, source_label: '', event_key: it.event_key, title: it.meeting_title || '(Buổi họp)',
          starts_at: it.meeting_starts_at, ends_at: it.meeting_starts_at, all_day: false, location: null, description: null,
          html_link: null, meet_url: null, attachments: [], items: [], record: null, jira_key: null, status: 'chuan_bi', gone: true,
        };
        byKey.set(k, m);
      }
      m.items.push(it);
    }
  }
  // Thông tin chung của buổi họp.
  const recResults = await recPromise;
  for (const r of recResults) {
    for (const rec of r.data ?? []) {
      const m = byKey.get(keyOf(rec.source_id, rec.event_key))
        ?? byTitleTime.get(`${rec.source_id}|${new Date(rec.meeting_starts_at).getTime()}|${rec.meeting_title.trim().toLowerCase()}`);
      if (m && !m.record) m.record = rec;
    }
  }
  for (const m of byKey.values()) {
    m.jira_key = m.record?.jira_key ?? jiraKeyIn(m.title, m.description);
    m.status = m.record?.status ?? autoStatus(m.items, m.ends_at);
  }

  return [...byKey.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
}

// Buổi họp "của tôi": tôi đôn đốc một bên, nhóm tôi tham gia là một bên, hoặc tên nhóm
// tôi tham gia xuất hiện trong tên/thành phần buổi họp.
export function isMyMeeting(m: Meeting, userId: string, myGroups: { id: string; name: string }[], myAreas: WorkArea[] = []): boolean {
  const ids = new Set(myGroups.map((g) => g.id));
  const areaIds = new Set(myAreas.map((a) => a.id));
  const areaGroups = new Set(myAreas.map((a) => a.group_id).filter(Boolean));
  if (m.items.some((i) => i.assignee_id === userId || (i.party_group_id && (ids.has(i.party_group_id) || areaGroups.has(i.party_group_id))) || (i.area_id && areaIds.has(i.area_id)))) return true;
  const text0 = `${m.title}\n${m.description ?? ''}`.toLowerCase();
  if (myAreas.some((a) => a.name.trim().length >= 4 && text0.includes(a.name.trim().toLowerCase()))) return true;
  const text = `${m.title}\n${m.description ?? ''}`.toLowerCase();
  return myGroups.some((g) => g.name.trim().length >= 4 && text.includes(g.name.trim().toLowerCase()));
}

// Mảng mà một email là đầu mối chính hoặc phối hợp.
export function areasOf(areas: WorkArea[], email: string | null | undefined): WorkArea[] {
  const e = (email ?? '').toLowerCase();
  return e ? areas.filter((a) => a.primary_email === e || a.coordinator_emails.includes(e)) : [];
}

// Mảng của một dòng tài liệu: mảng đã gắn, hoặc mảng ứng với nhóm của bên gửi.
export function areaOfItem(areas: WorkArea[], it: Pick<MeetingItem, 'area_id' | 'party_group_id' | 'party'>): WorkArea | null {
  if (it.area_id) return areas.find((a) => a.id === it.area_id) ?? null;
  if (it.party_group_id) { const a = areas.find((x) => x.group_id === it.party_group_id); if (a) return a; }
  const p = (it.party ?? '').trim().toLowerCase();
  return p ? areas.find((a) => a.name.trim().toLowerCase() === p) ?? null : null;
}

// Buổi họp có nhắc tới tôi: họ tên đầy đủ của tôi xuất hiện trong tên/thành phần; Hiệu trưởng
// thì thêm "HT" hoặc "Hiệu trưởng" (không tính "Phó Hiệu trưởng").
export function mentionsMe(m: Pick<Meeting, 'title' | 'description'>, fullName: string | null | undefined, isPrincipal: boolean): boolean {
  const text = `${m.title}\n${m.description ?? ''}`.normalize('NFC');
  const name = (fullName ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (name.split(' ').length >= 2 && text.toLowerCase().replace(/\s+/g, ' ').includes(name.toLowerCase())) return true;
  if (isPrincipal && (/(^|[^\p{L}])HT([^\p{L}]|$)/u.test(text) || /(^|[^\p{L}])(?<!Phó\s)Hiệu trưởng/iu.test(text))) return true;
  return false;
}

// Lịch Google "của tôi": buổi họp liên quan tới tôi, nhóm tôi hoặc mảng tôi phụ trách.
export function isMyCalendarMeeting(m: Meeting, me: { userId: string; fullName: string | null; isPrincipal: boolean; groups: { id: string; name: string }[]; areas: WorkArea[] }): boolean {
  return isMyMeeting(m, me.userId, me.groups, me.areas) || mentionsMe(m, me.fullName, me.isPrincipal);
}
