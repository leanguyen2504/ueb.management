// Báo cáo Jira cho một hay nhiều người: tổng hợp số liệu (hàm thuần) và dựng file Excel.
// Dữ liệu người khác chỉ có khi người đó tự bật chia sẻ (xem migration chia_se_jira).
import { addDays, dayStartIso, vnDay } from '@/lib/format';
import type { XCell, XSheet } from '@/lib/xlsx';
import { blockedBy, dueState, hours, isMine, isProduct, numberOf, productLabel, roleChips } from './report';
import type { JiraIssueRow } from './types';

export type SharePerson = {
  user_id: string;
  full_name: string;
  email: string;
  unit: string | null;
  position: string | null;
  is_me: boolean;
  share_scope: 'none' | 'leads' | 'members';
  last_synced_at: string | null;
  jira_display_name: string | null;
  custom_field_names: string[];
  groups: { id: string; name: string; kind: string }[];
};

export type TeamIssue = JiraIssueRow & { user_id: string; created_at_jira?: string | null };
export type TeamWorklog = { user_id: string; worklog_id: string; issue_key: string; started_at: string; seconds: number; comment: string | null };

export const SHARE_LABEL: Record<SharePerson['share_scope'], string> = {
  none: 'Không chia sẻ',
  leads: 'Trưởng nhóm, Văn thư',
  members: 'Mọi thành viên nhóm chung',
};

export const KIND_LABEL: Record<string, string> = { unit: 'Đơn vị', project: 'Dự án', event: 'Sự kiện', other: 'Nhóm' };

// Bổ sung các trường mà hàm chia sẻ không trả về (comment, liên kết...) để dùng chung hàm tính.
export function normalizeIssue(r: Partial<TeamIssue> & { user_id: string; issue_key: string }): TeamIssue {
  return {
    summary: '', status: null, status_category: null, issue_type: null, project_key: null, project_name: null, assignee_name: null,
    reporter_name: null, is_assignee: false, is_reporter: false, is_watcher: false, has_my_worklog: false, mentions_me: false,
    updated_at_jira: null, resolved_at: null, due_date: null, my_seconds: 0, custom: {}, priority: null, priority_rank: null,
    start_date: null, original_estimate: null, remaining_estimate: null, time_spent: null, parent_key: null, parent_summary: null,
    epic_key: null, subtask_total: 0, subtask_done: 0, links: [], transitions: [], status_since: null, reopen_count: 0, sprint: null,
    fix_versions: [], labels: [], components: [], last_comment: null, my_last_comment_at: undefined,
    ...r,
  } as TeamIssue;
}

export type Period = { from: string; to: string }; // ngày "YYYY-MM-DD", to là ngày cuối (tính cả)

export function parsePeriod(tu?: string | null, den?: string | null, today = vnDay()): Period {
  const ok = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = ok(tu) ?? `${today.slice(0, 7)}-01`;
  let to = ok(den) ?? addDays(`${monthAfter(today.slice(0, 7))}-01`, -1);
  if (to < from) to = from;
  // Tối đa 3 năm cho một lần xuất.
  if (to > addDays(from, 1100)) to = addDays(from, 1100);
  return { from, to };
}

export const monthAfter = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export const periodIso = (p: Period) => ({ fromIso: dayStartIso(p.from), toIso: dayStartIso(addDays(p.to, 1)) });

const inPeriod = (iso: string | null | undefined, p: Period) => {
  if (!iso) return false;
  const d = vnDay(iso);
  return d >= p.from && d <= p.to;
};

export type PersonStats = {
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  inProgress: number;
  logHours: number;
  logIssues: number;
  logDays: number;
  products: number;
  converted: number;
  reopened: number;
  totalIssues: number;
};

export function personStats(issues: TeamIssue[], worklogs: TeamWorklog[], field: string | null, p: Period, today = vnDay()): PersonStats {
  const mine = issues.filter(isMine);
  const open = mine.filter((i) => i.status_category !== 'done');
  const products = issues.filter((i) => isProduct(i) && inPeriod(i.resolved_at, p));
  const wl = worklogs.filter((w) => inPeriod(w.started_at, p));
  return {
    open: open.length,
    overdue: open.filter((i) => dueState(i, today) === 'overdue').length,
    dueSoon: open.filter((i) => dueState(i, today) === 'soon').length,
    blocked: open.filter((i) => blockedBy(i).length > 0).length,
    inProgress: open.filter((i) => i.status_category === 'indeterminate').length,
    logHours: hours(wl.reduce((s, w) => s + w.seconds, 0)),
    logIssues: new Set(wl.map((w) => w.issue_key)).size,
    logDays: new Set(wl.map((w) => vnDay(w.started_at))).size,
    products: products.length,
    converted: Math.round(products.reduce((s, i) => s + (field ? numberOf(i.custom?.[field]) ?? 0 : 0), 0) * 100) / 100,
    reopened: products.reduce((s, i) => s + (i.reopen_count || 0), 0),
    totalIssues: issues.length,
  };
}

// Các tháng nằm trong kỳ.
function monthsOf(p: Period) {
  const out: string[] = [];
  for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7) && out.length < 40; m = monthAfter(m)) out.push(m);
  return out;
}

const DUE_TEXT = { overdue: 'Quá hạn', soon: 'Đến hạn trong 7 ngày', later: 'Còn hạn', none: '' } as const;
const STATUS_CAT = (c: string | null) => (c === 'done' ? 'Xong' : c === 'indeterminate' ? 'Đang làm' : c === 'new' ? 'Chưa làm' : c ?? '');
const d10 = (iso: string | null | undefined) => (iso ? { date: vnDay(iso) } : null);

export type ReportInput = {
  title: string;
  scopeLabel: string;
  exportedBy: string;
  people: { id: string; name: string; email: string; unit: string | null; groups: string; field: string | null; lastSynced: string | null; jiraName: string | null }[];
  issues: TeamIssue[];
  worklogs: TeamWorklog[];
  period: Period;
  jiraUrl: string | null;
  today?: string;
};

export function buildReportSheets(r: ReportInput): XSheet[] {
  const today = r.today ?? vnDay();
  const multi = r.people.length > 1;
  const P = (cols: { header: string; width?: number }[]) => (multi ? [{ header: 'Người', width: 24 }, ...cols] : cols);
  const who = (id: string) => r.people.find((p) => p.id === id)?.name ?? '';
  const link = (key: string): XCell => (r.jiraUrl ? { link: `${r.jiraUrl}/browse/${encodeURIComponent(key)}`, text: key } : key);
  const row = (uid: string, cells: XCell[]) => (multi ? [who(uid), ...cells] : cells);
  const fmtP = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const intro = [
    r.title,
    `Kỳ: ${fmtP(r.period.from)} – ${fmtP(r.period.to)} · Phạm vi: ${r.scopeLabel}`,
    `Người xuất: ${r.exportedBy} · Xuất lúc ${new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date())}`,
  ];
  const byUser = <T extends { user_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) m.set(x.user_id, [...(m.get(x.user_id) ?? []), x]);
    return m;
  };
  const iss = byUser(r.issues);
  const wls = byUser(r.worklogs);
  const summaryOf = new Map<string, string>(r.issues.map((i) => [`${i.user_id}|${i.issue_key}`, i.summary]));
  const projectOf = new Map<string, string>(r.issues.map((i) => [`${i.user_id}|${i.issue_key}`, i.project_name ?? '']));

  // 1. Tổng hợp theo người.
  const summary: XSheet = {
    name: 'Tổng hợp',
    intro,
    columns: [
      { header: 'Họ tên', width: 26 }, { header: 'Email', width: 28 }, { header: 'Đơn vị', width: 22 }, { header: 'Nhóm, dự án chung', width: 36 },
      { header: 'Việc đang mở', width: 11 }, { header: 'Đang làm', width: 10 }, { header: 'Quá hạn', width: 10 }, { header: 'Đến hạn 7 ngày', width: 12 },
      { header: 'Bị chặn', width: 10 }, { header: 'Giờ log trong kỳ', width: 13 }, { header: 'Số ngày có log', width: 12 }, { header: 'Số mã có log', width: 12 },
      { header: 'Sản phẩm nộp trong kỳ', width: 14 }, { header: 'Giờ quy đổi trong kỳ', width: 14 }, { header: 'Lần bị trả lại (sản phẩm kỳ)', width: 16 },
      { header: 'Tổng mã liên quan', width: 12 }, { header: 'Tài khoản Jira', width: 20 }, { header: 'Cập nhật Jira lần cuối', width: 18 },
    ],
    rows: r.people.map((p) => {
      const s = personStats(iss.get(p.id) ?? [], wls.get(p.id) ?? [], p.field, r.period, today);
      return [p.name, p.email, p.unit, p.groups, s.open, s.inProgress, s.overdue, s.dueSoon, s.blocked, s.logHours, s.logDays, s.logIssues,
        s.products, p.field ? s.converted : null, s.reopened, s.totalIssues, p.jiraName, p.lastSynced ? { datetime: p.lastSynced } : null];
    }),
  };

  // 2. Theo tháng.
  const months = monthsOf(r.period);
  const monthly: XSheet = {
    name: 'Theo tháng',
    columns: P([{ header: 'Tháng', width: 10 }, { header: 'Giờ log', width: 10 }, { header: 'Số mã có log', width: 12 }, { header: 'Sản phẩm nộp', width: 12 }, { header: 'Giờ quy đổi', width: 12 }]),
    rows: r.people.flatMap((p) => months.map((m) => {
      const first = `${m}-01`;
      const last = addDays(`${monthAfter(m)}-01`, -1);
      const mp: Period = { from: first > r.period.from ? first : r.period.from, to: last < r.period.to ? last : r.period.to };
      const s = personStats(iss.get(p.id) ?? [], wls.get(p.id) ?? [], p.field, mp, today);
      return row(p.id, [`${m.slice(5)}/${m.slice(0, 4)}`, s.logHours, s.logIssues, s.products, p.field ? s.converted : null]);
    })),
  };

  // 3. Sản phẩm đã nộp trong kỳ.
  const productRows: XCell[][] = [];
  const typeMap = new Map<string, { uid: string; label: string; count: number; converted: number }>();
  for (const p of r.people) {
    for (const i of (iss.get(p.id) ?? []).filter((x) => isProduct(x) && inPeriod(x.resolved_at, r.period))
      .sort((a, b) => (a.resolved_at ?? '').localeCompare(b.resolved_at ?? ''))) {
      const conv = p.field ? numberOf(i.custom?.[p.field]) : null;
      const label = (p.field && productLabel(i.custom?.[p.field])) || i.issue_type || 'Khác';
      productRows.push(row(p.id, [link(i.issue_key), i.summary, i.project_name, label, d10(i.resolved_at), i.my_seconds ? hours(i.my_seconds) : null, conv, i.reopen_count || null]));
      const k = `${p.id}|${label}`;
      const t = typeMap.get(k) ?? { uid: p.id, label, count: 0, converted: 0 };
      t.count += 1;
      t.converted += conv ?? 0;
      typeMap.set(k, t);
    }
  }
  const products: XSheet = {
    name: 'Sản phẩm đã nộp',
    columns: P([{ header: 'Mã', width: 12 }, { header: 'Tóm tắt', width: 50 }, { header: 'Dự án', width: 22 }, { header: 'Loại sản phẩm', width: 24 },
      { header: 'Ngày nộp', width: 12 }, { header: 'Giờ log', width: 10 }, { header: 'Giờ quy đổi', width: 12 }, { header: 'Số lần bị trả lại', width: 14 }]),
    rows: productRows,
  };
  const byType: XSheet = {
    name: 'Theo loại sản phẩm',
    columns: P([{ header: 'Loại sản phẩm', width: 32 }, { header: 'Số lượng', width: 10 }, { header: 'Giờ quy đổi', width: 12 }]),
    rows: [...typeMap.values()].sort((a, b) => who(a.uid).localeCompare(who(b.uid), 'vi') || b.converted - a.converted || b.count - a.count)
      .map((t) => row(t.uid, [t.label, t.count, Math.round(t.converted * 100) / 100])),
  };

  // 4. Worklog trong kỳ.
  const worklog: XSheet = {
    name: 'Worklog',
    columns: P([{ header: 'Thời điểm', width: 17 }, { header: 'Mã', width: 12 }, { header: 'Tóm tắt', width: 46 }, { header: 'Dự án', width: 22 }, { header: 'Giờ', width: 8 }, { header: 'Ghi chú', width: 40 }]),
    rows: [...r.worklogs].filter((w) => inPeriod(w.started_at, r.period)).sort((a, b) => who(a.user_id).localeCompare(who(b.user_id), 'vi') || a.started_at.localeCompare(b.started_at))
      .map((w) => row(w.user_id, [{ datetime: w.started_at }, link(w.issue_key), summaryOf.get(`${w.user_id}|${w.issue_key}`) ?? '', projectOf.get(`${w.user_id}|${w.issue_key}`) ?? '', hours(w.seconds), w.comment])),
  };

  // 5. Toàn bộ mã việc liên quan.
  const all: XSheet = {
    name: 'Mã việc',
    columns: P([
      { header: 'Mã', width: 12 }, { header: 'Tóm tắt', width: 46 }, { header: 'Dự án', width: 22 }, { header: 'Loại', width: 12 }, { header: 'Trạng thái', width: 14 },
      { header: 'Nhóm trạng thái', width: 12 }, { header: 'Ưu tiên', width: 10 }, { header: 'Người được giao', width: 20 }, { header: 'Người tạo', width: 20 },
      { header: 'Vai trò', width: 26 }, { header: 'Bắt đầu', width: 12 }, { header: 'Hạn', width: 12 }, { header: 'Tình trạng hạn', width: 16 },
      { header: 'Ước tính (giờ)', width: 11 }, { header: 'Còn lại (giờ)', width: 11 }, { header: 'Giờ log của người này', width: 13 }, { header: 'Tổng giờ log (mọi người)', width: 13 },
      { header: 'Việc con xong', width: 10 }, { header: 'Việc con', width: 9 }, { header: 'Epic', width: 12 }, { header: 'Việc cha', width: 12 }, { header: 'Sprint', width: 16 },
      { header: 'Phiên bản', width: 16 }, { header: 'Nhãn', width: 18 }, { header: 'Thành phần', width: 18 }, { header: 'Loại sản phẩm', width: 22 }, { header: 'Giờ quy đổi', width: 11 },
      { header: 'Số lần bị trả lại', width: 12 }, { header: 'Cập nhật', width: 12 }, { header: 'Hoàn thành', width: 12 },
    ]),
    rows: r.people.flatMap((p) => (iss.get(p.id) ?? []).map((i) => {
      const st = i.status_category !== 'done' ? dueState(i, today) : 'none';
      return row(p.id, [
        link(i.issue_key), i.summary, i.project_name, i.issue_type, i.status, STATUS_CAT(i.status_category), i.priority, i.assignee_name, i.reporter_name,
        roleChips(i).join(', '), i.start_date ? { date: i.start_date } : null, i.due_date ? { date: i.due_date } : null, DUE_TEXT[st],
        i.original_estimate ? hours(i.original_estimate) : null, i.remaining_estimate != null ? hours(i.remaining_estimate) : null,
        i.my_seconds ? hours(i.my_seconds) : null, i.time_spent ? hours(i.time_spent) : null, i.subtask_total ? i.subtask_done : null, i.subtask_total || null,
        i.epic_key, i.parent_key, i.sprint, (i.fix_versions ?? []).join(', '), (i.labels ?? []).join(', '), (i.components ?? []).join(', '),
        p.field ? productLabel(i.custom?.[p.field]) : null, p.field ? numberOf(i.custom?.[p.field]) : null, i.reopen_count || null,
        d10(i.updated_at_jira), d10(i.resolved_at),
      ]);
    })),
  };

  return [summary, monthly, products, byType, worklog, all];
}

export const fileSlug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'bao-cao';
