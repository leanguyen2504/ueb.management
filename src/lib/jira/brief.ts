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
  // Cây công việc dùng chung (jira_tree): mã chưa có trong dữ liệu của mình, và việc con do người khác đồng bộ.
  const [{ data: treeRows }, { data: childRows }] = await Promise.all([
    supabase.from('jira_tree').select('issue_key, summary, issue_type, status, status_category, project_name, parent_key').in('issue_key', list.slice(0, 500)),
    supabase.from('jira_tree').select('issue_key, summary, issue_type, status_category, parent_key').in('parent_key', list.slice(0, 500)).limit(3000),
  ]);
  const parents = new Set((treeRows ?? []).map((r) => r.parent_key).filter((k): k is string => !!k));
  const { data: parentRows } = parents.size
    ? await supabase.from('jira_tree').select('issue_key, summary, status_category').in('issue_key', [...parents])
    : { data: [] as { issue_key: string; summary: string; status_category: string | null }[] };
  const parentOf = new Map((parentRows ?? []).map((r) => [r.issue_key, r]));
  for (const r of treeRows ?? []) {
    if (out.has(r.issue_key)) continue;
    const p = r.parent_key ? parentOf.get(r.parent_key) : undefined;
    out.set(r.issue_key, {
      key: r.issue_key, summary: r.summary ?? '', issueType: r.issue_type, status: r.status, done: r.status_category === 'done',
      project: r.project_name,
      parent: r.parent_key ? { key: r.parent_key, summary: p?.summary ?? null, done: p?.status_category === 'done' } : null,
      children: [], subtaskTotal: 0, subtaskDone: 0, myHours: 0,
    });
  }
  // Việc con: gộp liên kết trong dữ liệu của mình với cây dùng chung (không đếm trùng).
  for (const c of childRows ?? []) {
    const b = out.get(c.parent_key as string);
    if (!b || b.children.some((x) => x.key === c.issue_key)) continue;
    // Sub-task đã đếm riêng (subtaskTotal) khi mã có trong dữ liệu của mình.
    if (/sub/i.test(c.issue_type ?? '') && b.subtaskTotal > 0) continue;
    b.children.push({ key: c.issue_key, summary: c.summary, done: c.status_category === 'done' });
  }
  return out;
}
