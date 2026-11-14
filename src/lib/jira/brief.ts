// Thông tin ngắn về một mã Jira, lấy từ dữ liệu "Jira của tôi" của chính người xem,
// để hiện cạnh ô mã Jira trên đầu việc: loại (Task/Work/Sub-task), trạng thái, việc cha, việc con.
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type JiraRef = { key: string; summary: string | null; done: boolean };
export type JiraBrief = {
  key: string;
  summary: string;
  issueType: string | null;
  status: string | null;
  done: boolean;
  project: string | null;
  /** Việc lớn chứa mã này: việc cha của sub-task, hoặc liên kết "is child task of" (Gantt). */
  parent: JiraRef | null;
  /** Việc nhỏ bên dưới: liên kết "is parent task of" (Gantt). Sub-task chỉ có số đếm. */
  children: JiraRef[];
  subtaskTotal: number;
  subtaskDone: number;
  myHours: number;
};

type Link = { type?: string; dir?: string; rel?: string; key?: string; summary?: string; statusCategory?: string };

const isChildRel = (l: Link) => /child|con\b/i.test(l.rel ?? '');
const isParentRel = (l: Link) => /parent|cha\b/i.test(l.rel ?? '');

export async function loadJiraBriefs(supabase: Supabase, userId: string, keys: (string | null | undefined)[]): Promise<Map<string, JiraBrief>> {
  const list = [...new Set(keys.filter((k): k is string => !!k))];
  const out = new Map<string, JiraBrief>();
  if (!list.length) return out;
  const { data } = await supabase
    .from('jira_issues')
    .select('issue_key, summary, issue_type, status, status_category, project_name, parent_key, parent_summary, subtask_total, subtask_done, links, my_seconds')
    .eq('user_id', userId)
    .in('issue_key', list.slice(0, 500));
  for (const r of data ?? []) {
    const links = (Array.isArray(r.links) ? r.links : []) as Link[];
    const up = links.find(isChildRel);
    out.set(r.issue_key, {
      key: r.issue_key,
      summary: r.summary ?? '',
      issueType: r.issue_type,
      status: r.status,
      done: r.status_category === 'done',
      project: r.project_name,
      parent: r.parent_key
        ? { key: r.parent_key, summary: r.parent_summary, done: false }
        : up?.key ? { key: up.key, summary: up.summary ?? null, done: up.statusCategory === 'done' } : null,
      children: links.filter((l) => isParentRel(l) && l.key).map((l) => ({ key: l.key!, summary: l.summary ?? null, done: l.statusCategory === 'done' })),
      subtaskTotal: r.subtask_total ?? 0,
      subtaskDone: r.subtask_done ?? 0,
      myHours: Math.round(((r.my_seconds ?? 0) / 3600) * 10) / 10,
    });
  }
  return out;
}
