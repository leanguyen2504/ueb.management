import type { SupabaseClient } from '@supabase/supabase-js';

// Một dòng tiến độ chung của nhóm/dự án: chỉ số liệu tổng hợp, không có tên việc hay người làm.
export type ProgressRow = {
  id: string;
  name: string;
  kind: string;
  unit_category: string | null;
  parent_id: string | null;
  parent_name: string | null;
  member_count: number;
  task_total: number;
  task_todo: number;
  task_doing: number;
  task_done: number;
  task_overdue: number;
  avg_progress: number | null;
  next_due: string | null;
  last_activity: string | null;
};

// Hiệu trưởng, quản trị, thư ký toàn trường: mọi nhóm; người khác: nhóm mình xem được.
export async function progressOverview(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('progress_overview');
  return { rows: (data ?? []) as ProgressRow[], error };
}

export const donePct = (r: Pick<ProgressRow, 'task_total' | 'task_done'>) =>
  r.task_total ? Math.round((r.task_done / r.task_total) * 100) : 0;

export function sumProgress(rows: ProgressRow[]) {
  const s = rows.reduce(
    (a, r) => ({
      total: a.total + r.task_total,
      todo: a.todo + r.task_todo,
      doing: a.doing + r.task_doing,
      done: a.done + r.task_done,
      overdue: a.overdue + r.task_overdue,
    }),
    { total: 0, todo: 0, doing: 0, done: 0, overdue: 0 },
  );
  return { ...s, pct: s.total ? Math.round((s.done / s.total) * 100) : 0 };
}
