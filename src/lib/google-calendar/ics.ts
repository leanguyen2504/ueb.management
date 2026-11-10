import ICAL from 'ical.js';
import { collectAttachments, htmlToText, zonedMidnight, type EventRow } from './google-api';

// Đọc lịch Google để ở chế độ công khai qua địa chỉ iCal công khai, không cần
// API key hay tài khoản dịch vụ. Buổi họp lặp lại được trải thành từng lần.

const MAX_ITERATIONS_PER_EVENT = 20000;
const MAX_EVENTS = 5000;
const MAX_BYTES = 10 * 1024 * 1024;

type Ev = InstanceType<typeof ICAL.Event>;
type Time = InstanceType<typeof ICAL.Time>;

export const publicIcsUrl = (calendarId: string) =>
  `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;

const clean = (s: unknown, max: number) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t ? t.slice(0, max) : null;
};

function meetingUrl(ev: Ev): string | null {
  const conf = ev.component.getFirstPropertyValue('x-google-conference');
  if (typeof conf === 'string' && conf.startsWith('https://')) return conf.slice(0, 500);
  const m = `${ev.location ?? ''}\n${ev.description ?? ''}`.match(
    /https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"')]+/i,
  );
  return m ? m[0].slice(0, 500) : null;
}

// ATTACH;FILENAME=Tờ trình.pdf;FMTTYPE=...:https://drive.google.com/...
function attachmentsOf(ev: Ev): { title: string | null; url: string | null }[] {
  return ev.component.getAllProperties('attach').map((p) => {
    const v = p.getFirstValue();
    const name = p.getParameter('filename');
    return { title: typeof name === 'string' ? name : null, url: typeof v === 'string' ? v : null };
  });
}

function toIso(t: Time, tz: string): string {
  if (t.isDate) {
    return zonedMidnight(`${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`, tz);
  }
  return t.toJSDate().toISOString();
}

export function parseIcs(text: string, from: Date, to: Date, tz: string): EventRow[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) {
    const zone = new ICAL.Timezone(vtz);
    if (!ICAL.TimezoneService.has(zone.tzid)) ICAL.TimezoneService.register(zone);
  }
  // Gom các lần bị sửa riêng (RECURRENCE-ID) vào sự kiện gốc.
  const masters = new Map<string, Ev>();
  const exceptions: Ev[] = [];
  for (const c of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(c);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const m = masters.get(ex.uid);
    if (m) m.relateException(ex);
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }

  const out: EventRow[] = [];
  const seen = new Set<string>();
  const fromT = ICAL.Time.fromJSDate(from, true);
  // key giữ nguyên khi buổi họp bị dời giờ, để hồ sơ cuộc họp (gắn theo key) không bị mất:
  // buổi họp đơn lẻ dùng UID; mỗi lần của buổi họp lặp lại dùng UID + giờ gốc của lần đó.
  const push = (ev: Ev, start: Time, end: Time, key: string) => {
    if (ev.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    const s = toIso(start, tz);
    const e = toIso(end, tz);
    if (new Date(e) <= from || new Date(s) >= to) return;
    const id = key;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      google_event_id: id.slice(0, 500),
      title: clean(ev.summary, 300) ?? '(Không có tiêu đề)',
      starts_at: s,
      ends_at: e > s ? e : s,
      all_day: start.isDate,
      location: clean(ev.location, 300),
      description: htmlToText(ev.description ?? undefined),
      url: meetingUrl(ev),
      html_link: null,
      attachments: collectAttachments(attachmentsOf(ev), ev.description),
    });
  };

  for (const ev of masters.values()) {
    if (out.length >= MAX_EVENTS) break;
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) {
      const rid = ev.isRecurrenceException() ? `_${toIso(ev.recurrenceId, tz)}` : '';
      push(ev, ev.startDate, ev.endDate ?? ev.startDate, `${ev.uid}${rid}`);
      continue;
    }
    const it = ev.iterator();
    let n = 0;
    for (let next = it.next(); next && n < MAX_ITERATIONS_PER_EVENT; next = it.next(), n++) {
      if (next.toJSDate() >= to) break;
      const det = ev.getOccurrenceDetails(next);
      if (det.endDate.compare(fromT) <= 0) continue;
      push(det.item, det.startDate, det.endDate, `${ev.uid}_${toIso(next, tz)}`);
    }
  }
  return out;
}

export async function listPublicIcsEvents(calendarId: string, from: Date, to: Date, tz: string, fetchImpl: typeof fetch = fetch): Promise<EventRow[]> {
  const res = await fetchImpl(publicIcsUrl(calendarId), { cache: 'no-store', signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (res.status === 404 || res.status === 403 || res.status === 401) {
    throw new Error('Lịch này không để công khai nên chưa đọc được. Cần khai báo GOOGLE_CALENDAR_API_KEY hoặc tài khoản dịch vụ (xem docs/google-calendar.md).');
  }
  if (!res.ok) throw new Error(`Google trả lỗi ${res.status} khi tải lịch công khai.`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('Lịch quá lớn (trên 10 MB).');
  const text = new TextDecoder('utf-8').decode(buf);
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('Lịch này không để công khai nên chưa đọc được. Cần khai báo GOOGLE_CALENDAR_API_KEY hoặc tài khoản dịch vụ (xem docs/google-calendar.md).');
  }
  return parseIcs(text, from, to, tz);
}
