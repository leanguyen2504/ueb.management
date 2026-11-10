// Tính giờ trống cho trang đặt lịch. Dùng chung cho trang của chủ (xem trước) và trang khách.
// Quy tắc phải khớp với hàm public.book_public trong cơ sở dữ liệu (cơ sở dữ liệu kiểm tra lại khi đặt).

export type WeeklyHours = Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', [string, string]>>;
export type SlotSettings = {
  durations: number[];
  weekly_hours: WeeklyHours;
  min_notice_minutes: number;
  horizon_days: number;
  buffer_minutes: number;
};
export type Busy = { starts_at: string; ends_at: string; label?: string | null };
export type Slot = { start: string; end: string; day: string };

export const ALL_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
export const DAY_NAMES: Record<string, string> = { '1': 'Thứ 2', '2': 'Thứ 3', '3': 'Thứ 4', '4': 'Thứ 5', '5': 'Thứ 6', '6': 'Thứ 7', '7': 'Chủ nhật' };
export const durationLabel = (m: number) => (m < 60 ? `${m} phút` : m % 60 ? `${Math.floor(m / 60)} giờ ${m % 60} phút` : `${m / 60} giờ`);

const VN = '+07:00';
const MIN = 60000;
const vnToday = (now: Date) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoDow = (day: string) => String(new Date(`${day}T00:00:00Z`).getUTCDay() || 7) as keyof WeeklyHours;
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00${VN}`).getTime();

export function computeSlots(s: SlotSettings, busyIn: Busy[], now = new Date()) {
  const busy = busyIn.map((b) => ({ s: new Date(b.starts_at).getTime(), e: new Date(b.ends_at).getTime(), label: b.label ?? null }));
  const buffer = s.buffer_minutes * MIN;
  const earliest = now.getTime() + s.min_notice_minutes * MIN;
  const latest = now.getTime() + s.horizon_days * 1440 * MIN;
  const byDuration = new Map<number, Slot[]>();
  // Lý do ẩn (tính trên bước 15 phút): nhãn lịch chặn -> số khung giờ bị chặn.
  const blockedBy = new Map<string, number>();
  let blocked15 = 0;
  let tooSoon15 = 0;

  const today = vnToday(now);
  for (const dur of [...s.durations].sort((a, b) => a - b)) {
    const list: Slot[] = [];
    for (let i = 0; i <= s.horizon_days; i++) {
      const day = addDays(today, i);
      const hours = s.weekly_hours[isoDow(day)];
      if (!hours) continue;
      const open = at(day, hours[0]);
      const close = at(day, hours[1]);
      for (let t = open; t + dur * MIN <= close; t += 15 * MIN) {
        const end = t + dur * MIN;
        if (t > latest) break;
        if (t < earliest) {
          if (dur === 15 && t >= now.getTime()) tooSoon15++;
          continue;
        }
        const hit = busy.find((b) => b.s < end + buffer && b.e > t - buffer);
        if (hit) {
          if (dur === 15) {
            blocked15++;
            const k = hit.label ?? 'Lịch khác';
            blockedBy.set(k, (blockedBy.get(k) ?? 0) + 1);
          }
          continue;
        }
        list.push({ start: new Date(t).toISOString(), end: new Date(end).toISOString(), day });
      }
    }
    byDuration.set(dur, list);
  }
  return { byDuration, blockedBy, blocked15, tooSoon15 };
}

export function toSlug(v: string) {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
