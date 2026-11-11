// Tổng hợp dữ liệu Jira cá nhân cho trang "Jira của tôi" (hàm thuần, không gọi mạng).
import { vnDay, addDays } from '@/lib/format';
import type { JiraIssueRow, JiraLink, JiraMentionRow } from './types';

export type Worklog = { worklog_id: string; issue_key: string; started_at: string; seconds: number; comment: string | null };
export type Period = { key: string; label: string; seconds: number; issues: number; items: Worklog[] };

// Thứ Hai đầu tuần (theo giờ Việt Nam) của một ngày "YYYY-MM-DD".
export function weekStart(day: string) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = CN
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export function periodKey(iso: string, by: 'tuan' | 'thang') {
  const day = vnDay(iso);
  return by === 'tuan' ? weekStart(day) : day.slice(0, 7);
}

export function periodLabel(key: string, by: 'tuan' | 'thang') {
  if (by === 'thang') return `Tháng ${Number(key.slice(5, 7))}/${key.slice(0, 4)}`;
  return `Tuần ${dm(key)} – ${dm(addDays(key, 6))}/${addDays(key, 6).slice(0, 4)}`;
}

// Worklog gom theo tuần hoặc tháng, mới nhất trước, gồm cả kỳ không có worklog để thấy khoảng trống.
export function groupWorklogs(rows: Worklog[], by: 'tuan' | 'thang', count: number, now = new Date()): Period[] {
  const keys: string[] = [];
  let k = periodKey(now.toISOString(), by);
  for (let i = 0; i < count; i++) {
    keys.push(k);
    if (by === 'tuan') k = addDays(k, -7);
    else {
      const [y, m] = k.split('-').map(Number);
      k = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    }
  }
  const map = new Map<string, Worklog[]>(keys.map((x) => [x, []]));
  for (const w of rows) map.get(periodKey(w.started_at, by))?.push(w);
  return keys.map((key) => {
    const items = (map.get(key) ?? []).sort((a, b) => b.started_at.localeCompare(a.started_at));
    return {
      key,
      label: periodLabel(key, by),
      seconds: items.reduce((s, w) => s + w.seconds, 0),
      issues: new Set(items.map((w) => w.issue_key)).size,
      items,
    };
  });
}

export const hours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;
export const fmtHours = (h: number) => h.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

// Trường "giờ quy đổi": theo biến JIRA_CONVERTED_HOURS_FIELD nếu có, không thì tìm tên trường có chữ "quy đổi".
export function pickConvertedField(names: string[], configured?: string | null) {
  if (configured) {
    const hit = names.find((n) => n.toLowerCase() === configured.toLowerCase());
    return hit ?? configured;
  }
  const norm = (s: string) => s.normalize('NFC').toLowerCase();
  return names.find((n) => /quy\s*đổi|quy\s*doi/.test(norm(n))) ?? null;
}

export function numberOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && v.trim() !== '' ? n : null;
  }
  return null;
}

// Sản phẩm đã nộp: mã việc mình được giao và đã sang nhóm trạng thái "Xong", theo tháng hoàn thành.
export function submittedByMonth(issues: JiraIssueRow[], field: string | null, months: number, now = new Date()) {
  const out: { key: string; label: string; count: number; converted: number; items: JiraIssueRow[] }[] = [];
  let k = vnDay(now).slice(0, 7);
  for (let i = 0; i < months; i++) {
    out.push({ key: k, label: periodLabel(k, 'thang'), count: 0, converted: 0, items: [] });
    const [y, m] = k.split('-').map(Number);
    k = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  }
  const byKey = new Map(out.map((r) => [r.key, r]));
  for (const it of issues) {
    if (!it.is_assignee || it.status_category !== 'done' || !it.resolved_at) continue;
    const row = byKey.get(vnDay(it.resolved_at).slice(0, 7));
    if (!row) continue;
    row.count += 1;
    row.converted += field ? numberOf(it.custom?.[field]) ?? 0 : 0;
    row.items.push(it);
  }
  return out;
}

export const ROLE_FILTERS = {
  'tat-ca': { label: 'Tất cả', test: () => true },
  giao: { label: 'Được giao', test: (i: JiraIssueRow) => i.is_assignee },
  tao: { label: 'Tôi tạo', test: (i: JiraIssueRow) => i.is_reporter },
  'theo-doi': { label: 'Đang theo dõi', test: (i: JiraIssueRow) => i.is_watcher },
  worklog: { label: 'Có worklog của tôi', test: (i: JiraIssueRow) => i.has_my_worklog },
  nhac: { label: 'Nhắc tên tôi', test: (i: JiraIssueRow) => i.mentions_me },
} as const;
export type RoleFilter = keyof typeof ROLE_FILTERS;

export function roleChips(i: JiraIssueRow) {
  return [
    i.is_assignee && 'Được giao',
    i.is_reporter && 'Tôi tạo',
    i.is_watcher && 'Theo dõi',
    i.has_my_worklog && 'Có worklog',
    i.mentions_me && 'Nhắc tên',
  ].filter(Boolean) as string[];
}

// ---- Quản lý đầu việc: Cần làm / Đang chờ tôi / Đang chờ người khác ----

const notDone = (i: JiraIssueRow) => i.status_category !== 'done';
const isBlockLink = (l: JiraLink) => /block|chặn/i.test(`${l.type ?? ''} ${l.rel ?? ''}`);
// Mã việc khác đang chặn mã này (chưa xong).
export const blockedBy = (i: JiraIssueRow) => (i.links ?? []).filter((l) => isBlockLink(l) && l.dir === 'inward' && l.statusCategory !== 'done');
// Mã việc khác đang chờ mã này.
export const blocking = (i: JiraIssueRow) => (i.links ?? []).filter((l) => isBlockLink(l) && l.dir === 'outward' && l.statusCategory !== 'done');

export function daysBetween(fromDay: string, toDay: string) {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86400000);
}

export type DueState = 'overdue' | 'soon' | 'later' | 'none';
export function dueState(i: JiraIssueRow, today: string): DueState {
  if (!i.due_date) return 'none';
  const d = daysBetween(today, i.due_date);
  return d < 0 ? 'overdue' : d <= 7 ? 'soon' : 'later';
}

// Cần làm: việc được giao chưa xong, theo hạn (quá hạn trước), rồi độ ưu tiên.
export function todoList(issues: JiraIssueRow[]) {
  return issues
    .filter((i) => i.is_assignee && notDone(i))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || (a.priority_rank ?? 99) - (b.priority_rank ?? 99));
}

// Đang làm nhưng tuần này chưa log work.
export function inProgressNoLog(issues: JiraIssueRow[], worklogs: Worklog[], now = new Date()) {
  const wk = weekStart(vnDay(now));
  const logged = new Set(worklogs.filter((w) => vnDay(w.started_at) >= wk).map((w) => w.issue_key));
  return issues.filter((i) => i.is_assignee && i.status_category === 'indeterminate' && !logged.has(i.issue_key));
}

// Đang chờ tôi: comment nhắc tên chưa trả lời; việc của tôi đang chặn việc khác.
export function waitingOnMe(issues: JiraIssueRow[], mentions: JiraMentionRow[]) {
  return {
    mentions: mentions.filter((m) => !m.answered),
    blockingOthers: issues.filter((i) => i.is_assignee && notDone(i) && blocking(i).length > 0),
  };
}

// Đang chờ người khác: việc tôi tạo/theo dõi mà người khác làm; việc của tôi bị việc khác chặn.
export function waitingOnOthers(issues: JiraIssueRow[]) {
  return {
    delegated: issues.filter((i) => !i.is_assignee && (i.is_reporter || i.is_watcher) && notDone(i)),
    blocked: issues.filter((i) => i.is_assignee && notDone(i) && blockedBy(i).length > 0),
  };
}

export const fmtDuration = (sec: number | null | undefined) => (sec == null ? '' : `${fmtHours(hours(sec))} giờ`);
