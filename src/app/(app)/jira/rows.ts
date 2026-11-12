// Chuyển dữ liệu Jira thành dòng cho bảng dùng chung (DataTable): mỗi cột lọc, sắp xếp, ẩn/hiện được.
import { vnDay } from '@/lib/format';
import type { Column, Row, Tone } from '@/components/table/types';
import { blockedBy, blocking, daysBetween, dueState, hours, numberOf, productLabel, roleChips, type Worklog } from '@/lib/jira/report';
import type { JiraIssueRow } from '@/lib/jira/types';
import { WEEKDAY } from '@/components/calendar/time';

export type RowCtx = { browse: (k: string) => string | null; today: string; byKey: Map<string, JiraIssueRow>; field: string | null };

const CAT_LABEL: Record<string, string> = { new: 'Chưa làm', indeterminate: 'Đang làm', done: 'Xong' };
const CAT_TONE: Record<string, Tone> = { new: 'muted', indeterminate: 'info', done: 'ok' };
const DUE_LABEL = { overdue: 'Quá hạn', soon: 'Trong 7 ngày', later: 'Còn hạn', none: 'Không có hạn' } as const;
const DUE_TONE: Record<keyof typeof DUE_LABEL, Tone> = { overdue: 'warn', soon: 'gold', later: 'muted', none: 'plain' };

export const ISSUE_COLUMNS: Column[] = [
  { key: 'key', label: 'Mã', type: 'text', nowrap: true },
  { key: 'summary', label: 'Tóm tắt', type: 'text', wide: true },
  { key: 'status', label: 'Trạng thái', type: 'enum', nowrap: true },
  { key: 'cat', label: 'Nhóm trạng thái', type: 'enum', hidden: true },
  { key: 'due', label: 'Hạn', type: 'date', nowrap: true },
  { key: 'dueState', label: 'Tình trạng hạn', type: 'enum', nowrap: true, hidden: true },
  { key: 'priority', label: 'Ưu tiên', type: 'enum', nowrap: true },
  { key: 'project', label: 'Dự án', type: 'enum', hidden: true },
  { key: 'type', label: 'Loại việc', type: 'enum', hidden: true },
  { key: 'roles', label: 'Liên quan', type: 'tags', help: 'Vai trò của bạn trên mã việc' },
  { key: 'assignee', label: 'Người được giao', type: 'enum', hidden: true },
  { key: 'reporter', label: 'Người tạo', type: 'enum', hidden: true },
  { key: 'myHours', label: 'Giờ của tôi', type: 'number', align: 'right', total: true },
  { key: 'spent', label: 'Tổng giờ log', type: 'number', align: 'right', hidden: true, total: true, help: 'Giờ log của mọi người' },
  { key: 'estimate', label: 'Ước tính (giờ)', type: 'number', align: 'right', hidden: true },
  { key: 'remaining', label: 'Còn lại (giờ)', type: 'number', align: 'right', hidden: true },
  { key: 'start', label: 'Bắt đầu', type: 'date', hidden: true, nowrap: true },
  { key: 'inStatus', label: 'Số ngày ở trạng thái', type: 'number', align: 'right', hidden: true },
  { key: 'subtasks', label: 'Việc con', type: 'text', hidden: true, nowrap: true },
  { key: 'blocks', label: 'Chặn / bị chặn', type: 'tags', hidden: true },
  { key: 'parent', label: 'Việc cha', type: 'text', hidden: true },
  { key: 'epic', label: 'Epic', type: 'enum', hidden: true },
  { key: 'sprint', label: 'Sprint', type: 'enum', hidden: true },
  { key: 'versions', label: 'Phiên bản', type: 'tags', hidden: true },
  { key: 'labels', label: 'Nhãn', type: 'tags', hidden: true },
  { key: 'components', label: 'Thành phần', type: 'tags', hidden: true },
  { key: 'product', label: 'Loại sản phẩm', type: 'enum', hidden: true },
  { key: 'converted', label: 'Giờ quy đổi', type: 'number', align: 'right', hidden: true, total: true },
  { key: 'reopen', label: 'Bị trả lại', type: 'number', align: 'right', hidden: true },
  { key: 'lastComment', label: 'Comment mới nhất', type: 'text', hidden: true, wide: true },
  { key: 'created', label: 'Tạo lúc', type: 'date', hidden: true, nowrap: true },
  { key: 'updated', label: 'Cập nhật', type: 'date', nowrap: true },
  { key: 'resolved', label: 'Hoàn thành', type: 'date', hidden: true, nowrap: true },
];

const jiraText = (body: string, max: number) => {
  const t = body.replace(/\[~(?:accountid:)?([^\]]+)\]/g, '@$1');
  return t.length > max ? t.slice(0, max) + '…' : t;
};

export function issueRow(i: JiraIssueRow, ctx: RowCtx): Row {
  const href = ctx.browse(i.issue_key) ?? undefined;
  const ds = i.status_category === 'done' ? 'none' : dueState(i, ctx.today);
  const dueDays = i.due_date ? daysBetween(ctx.today, i.due_date) : null;
  const since = i.status_since ? daysBetween(vnDay(i.status_since), ctx.today) : null;
  const conv = ctx.field ? numberOf(i.custom?.[ctx.field]) : null;
  const bBy = blockedBy(i);
  const bOut = blocking(i);
  const link = (k: string | null) => (k ? { t: k, href: ctx.browse(k) ?? undefined, ext: true } : null);
  const lc = i.last_comment;
  return {
    id: i.issue_key,
    tone: ds === 'overdue' ? 'warn' : undefined,
    cells: {
      key: { v: i.issue_key, href, ext: true },
      summary: { v: i.summary, sub: [i.project_name, i.issue_type].filter(Boolean).join(' · ') || undefined },
      status: { v: i.status ?? '', tone: CAT_TONE[i.status_category ?? ''] ?? 'muted' },
      cat: CAT_LABEL[i.status_category ?? ''] ?? '',
      due: { v: i.due_date, sub: dueDays === null || i.status_category === 'done' ? undefined : dueDays < 0 ? `quá ${-dueDays} ngày` : dueDays === 0 ? 'hôm nay' : `còn ${dueDays} ngày` },
      dueState: { v: DUE_LABEL[ds], tone: DUE_TONE[ds] },
      priority: i.priority,
      project: i.project_name,
      type: i.issue_type,
      roles: { items: roleChips(i).map((t) => ({ t, tone: 'muted' as Tone })) },
      assignee: i.assignee_name,
      reporter: i.reporter_name,
      myHours: i.my_seconds ? hours(i.my_seconds) : null,
      spent: i.time_spent ? hours(i.time_spent) : null,
      estimate: i.original_estimate ? hours(i.original_estimate) : null,
      remaining: i.remaining_estimate != null ? hours(i.remaining_estimate) : null,
      start: i.start_date,
      inStatus: since,
      subtasks: i.subtask_total ? { v: `${i.subtask_done}/${i.subtask_total}` } : null,
      blocks: { items: [...bBy.map((l) => ({ t: `Chờ ${l.key ?? ''}`, tone: 'warn' as Tone })), ...bOut.map((l) => ({ t: `Chặn ${l.key ?? ''}`, tone: 'gold' as Tone }))] },
      parent: i.parent_key ? { v: i.parent_key, href: ctx.browse(i.parent_key) ?? undefined, ext: true, sub: i.parent_summary ?? undefined } : null,
      epic: i.epic_key ? { v: i.epic_key, title: ctx.byKey.get(i.epic_key)?.summary } : null,
      sprint: i.sprint,
      versions: { items: (i.fix_versions ?? []).map((t) => ({ t })) },
      labels: { items: (i.labels ?? []).map((t) => ({ t, tone: 'muted' as Tone })) },
      components: { items: (i.components ?? []).map((t) => ({ t })) },
      product: ctx.field ? productLabel(i.custom?.[ctx.field]) : null,
      converted: conv,
      reopen: i.reopen_count || null,
      lastComment: lc ? { v: jiraText(lc.body, 200), sub: `${lc.isMe ? 'Bạn' : lc.author ?? ''}, ${vnDay(lc.created).split('-').reverse().join('/')}` } : null,
      created: i.created_at_jira ? vnDay(i.created_at_jira) : null,
      updated: i.updated_at_jira ? vnDay(i.updated_at_jira) : null,
      resolved: i.resolved_at ? vnDay(i.resolved_at) : null,
    },
    detail: [
      { label: 'Trạng thái', value: `${i.status ?? ''}${since ? ` · ${since} ngày` : ''}` },
      ...(i.original_estimate || i.remaining_estimate ? [{ label: 'Ước tính / còn lại', value: `${hours(i.original_estimate ?? 0)} / ${hours(i.remaining_estimate ?? 0)} giờ` }] : []),
      ...(i.subtask_total ? [{ label: 'Việc con xong', value: `${i.subtask_done}/${i.subtask_total}` }] : []),
      ...(i.parent_key ? [{ label: 'Thuộc', value: { items: [{ ...link(i.parent_key)!, sub: i.parent_summary ?? undefined }] } }] : []),
      ...(i.epic_key ? [{ label: 'Epic', value: { items: [{ ...link(i.epic_key)!, sub: ctx.byKey.get(i.epic_key)?.summary }] } }] : []),
      ...(bBy.length ? [{ label: 'Đang chờ', value: { items: bBy.map((l) => ({ ...(link(l.key) ?? { t: '' }), sub: l.summary ?? undefined })) } }] : []),
      ...(bOut.length ? [{ label: 'Đang chặn', value: { items: bOut.map((l) => ({ ...(link(l.key) ?? { t: '' }), sub: l.summary ?? undefined })) } }] : []),
      ...([i.sprint, ...(i.fix_versions ?? []), ...(i.components ?? []), ...(i.labels ?? [])].filter(Boolean).length
        ? [{ label: 'Sprint, phiên bản, nhãn', value: [i.sprint, ...(i.fix_versions ?? []), ...(i.components ?? []), ...(i.labels ?? [])].filter(Boolean).join(' · ') }] : []),
      ...(lc ? [{ label: `Comment mới nhất (${lc.isMe ? 'bạn' : lc.author ?? ''})`, value: jiraText(lc.body, 400) }] : []),
    ],
  };
}

export const WORKLOG_COLUMNS: Column[] = [
  { key: 'day', label: 'Ngày', type: 'date', nowrap: true },
  { key: 'weekday', label: 'Thứ', type: 'enum', nowrap: true },
  { key: 'week', label: 'Tuần', type: 'enum', hidden: true, nowrap: true },
  { key: 'month', label: 'Tháng', type: 'enum', hidden: true, nowrap: true },
  { key: 'key', label: 'Mã', type: 'text', nowrap: true },
  { key: 'summary', label: 'Tóm tắt', type: 'text', wide: true },
  { key: 'project', label: 'Dự án', type: 'enum' },
  { key: 'hours', label: 'Giờ', type: 'number', align: 'right', total: true },
  { key: 'comment', label: 'Ghi chú', type: 'text' },
];

export function worklogRow(w: Worklog, ctx: RowCtx, weekLabel: (day: string) => string): Row {
  const day = vnDay(w.started_at);
  const i = ctx.byKey.get(w.issue_key);
  return {
    id: w.worklog_id,
    cells: {
      day,
      weekday: WEEKDAY[new Date(`${day}T00:00:00Z`).getUTCDay()],
      week: weekLabel(day),
      month: `${day.slice(5, 7)}/${day.slice(0, 4)}`,
      key: { v: w.issue_key, href: ctx.browse(w.issue_key) ?? undefined, ext: true },
      summary: i?.summary ?? '',
      project: i?.project_name ?? '',
      hours: hours(w.seconds),
      comment: w.comment,
    },
  };
}

export const PRODUCT_COLUMNS: Column[] = [
  { key: 'month', label: 'Tháng nộp', type: 'enum', nowrap: true },
  { key: 'resolved', label: 'Ngày nộp', type: 'date', nowrap: true },
  { key: 'key', label: 'Mã', type: 'text', nowrap: true },
  { key: 'summary', label: 'Tóm tắt', type: 'text', wide: true },
  { key: 'product', label: 'Loại sản phẩm', type: 'enum' },
  { key: 'project', label: 'Dự án', type: 'enum', hidden: true },
  { key: 'myHours', label: 'Giờ log', type: 'number', align: 'right', total: true },
  { key: 'converted', label: 'Giờ quy đổi', type: 'number', align: 'right', total: true },
  { key: 'reopen', label: 'Bị trả lại', type: 'number', align: 'right' },
];

export function productRow(i: JiraIssueRow, ctx: RowCtx): Row {
  const d = i.resolved_at ? vnDay(i.resolved_at) : '';
  return {
    id: i.issue_key,
    cells: {
      month: d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : '',
      resolved: d,
      key: { v: i.issue_key, href: ctx.browse(i.issue_key) ?? undefined, ext: true },
      summary: i.summary,
      product: (ctx.field && productLabel(i.custom?.[ctx.field])) || i.issue_type || 'Khác',
      project: i.project_name,
      myHours: i.my_seconds ? hours(i.my_seconds) : null,
      converted: ctx.field ? numberOf(i.custom?.[ctx.field]) : null,
      reopen: i.reopen_count ? { v: i.reopen_count, tone: 'warn' } : null,
    },
  };
}
