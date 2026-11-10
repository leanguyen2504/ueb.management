// Gọi Google Calendar API và chuyển dữ liệu sang dạng lưu trong cơ sở dữ liệu.
// Tách khỏi Next.js để kiểm thử bằng node.

export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  description?: string;
};

export type EventRow = {
  google_event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  url: string | null;
  html_link: string | null;
};

const API = 'https://www.googleapis.com/calendar/v3';

// Hai cách xác thực: tài khoản dịch vụ (lịch được chia sẻ riêng) hoặc API key (lịch công khai).
export type GoogleAuth = { token: string } | { apiKey: string };

const clean = (s: unknown, max: number) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t ? t.slice(0, max) : null;
};

// 00:00 tại múi giờ tz của ngày d (YYYY-MM-DD), dạng ISO UTC.
export function zonedMidnight(d: string, tz: string): string {
  const probe = new Date(`${d}T12:00:00Z`);
  const off = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')
    ?.value.replace('GMT', '');
  return new Date(`${d}T00:00:00${off || '+00:00'}`).toISOString();
}

function meetingUrl(e: GoogleEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video' && p.uri?.startsWith('https://'));
  if (video?.uri) return video.uri;
  const m = `${e.location ?? ''}\n${e.description ?? ''}`.match(
    /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"')]+/i,
  );
  return m ? m[0] : null;
}

export function toRow(e: GoogleEvent, tz: string): EventRow | null {
  if (e.status === 'cancelled' || !e.start || !e.end) return null;
  const allDay = !!e.start.date && !e.start.dateTime;
  const starts = allDay ? zonedMidnight(e.start.date!, tz) : e.start.dateTime && new Date(e.start.dateTime).toISOString();
  const ends = allDay ? zonedMidnight(e.end.date ?? e.start.date!, tz) : e.end.dateTime && new Date(e.end.dateTime).toISOString();
  if (!starts || !ends) return null;
  return {
    google_event_id: e.id,
    title: clean(e.summary, 300) ?? '(Không có tiêu đề)',
    starts_at: starts,
    ends_at: ends > starts ? ends : starts,
    all_day: allDay,
    location: clean(e.location, 300),
    url: clean(meetingUrl(e), 500),
    html_link: clean(e.htmlLink, 500),
  };
}

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function explain(status: number, calendarId: string, detail?: string): string {
  if (status === 404) {
    return `Không thấy lịch "${calendarId}". Kiểm tra mã lịch, và chắc chắn lịch đã được chia sẻ cho email của tài khoản dịch vụ (hoặc để công khai).`;
  }
  if (status === 403) {
    return detail?.includes('has not been used') || detail?.includes('disabled')
      ? 'Google Calendar API chưa được bật trong project Google Cloud.'
      : 'Chưa có quyền xem lịch này: hãy chia sẻ lịch cho email tài khoản dịch vụ, hoặc để lịch ở chế độ công khai.';
  }
  if (status === 401) return 'Google từ chối khóa tài khoản dịch vụ.';
  return `Google trả lỗi ${status}${detail ? `: ${detail}` : ''}.`;
}

async function get<T>(auth: GoogleAuth, path: string, params: Record<string, string>, calendarId: string, fetchImpl: typeof fetch): Promise<T> {
  const q = new URLSearchParams(params);
  if ('apiKey' in auth) q.set('key', auth.apiKey);
  const res = await fetchImpl(`${API}${path}?${q}`, {
    headers: 'token' in auth ? { authorization: `Bearer ${auth.token}` } : {},
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new GoogleApiError(explain(res.status, calendarId, body.error?.message), res.status);
  }
  return (await res.json()) as T;
}

export async function getCalendarName(auth: GoogleAuth, calendarId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const c = await get<{ summary?: string }>(auth, `/calendars/${encodeURIComponent(calendarId)}`, {}, calendarId, fetchImpl);
  return c.summary ?? calendarId;
}

// Lấy mọi buổi họp trong khoảng [from, to). Google tự trải buổi họp lặp lại (singleEvents).
export async function listEvents(
  auth: GoogleAuth,
  calendarId: string,
  from: Date,
  to: Date,
  tz: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EventRow[]> {
  const rows: EventRow[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string> = {
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: '2500',
      timeZone: tz,
    };
    if (pageToken) params.pageToken = pageToken;
    const r = await get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      auth,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      params,
      calendarId,
      fetchImpl,
    );
    for (const e of r.items ?? []) {
      const row = toRow(e, tz);
      if (row) rows.push(row);
    }
    pageToken = r.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}
