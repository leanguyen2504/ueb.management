import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { serverEnv } from '@/lib/env';
import { fmtDate, vnDay } from '@/lib/format';
import { LinkTask, UnlinkTask, type PickTask } from './LinkTask';

export const metadata: Metadata = { title: 'Cây công việc Jira' };

type Node = {
  issue_key: string;
  summary: string;
  issue_type: string | null;
  status: string | null;
  status_category: string | null;
  project_key: string | null;
  project_name: string | null;
  assignee_name: string | null;
  due_date: string | null;
  parent_key: string | null;
  updated_at_jira: string | null;
};
type WebTask = { id: string; group_id: string; title: string; jira_key: string };
type Search = { dv?: string; q?: string; xem?: string };

// Cây công việc Jira dùng chung: Task của đơn vị > Work > Sub-task. Dữ liệu do mọi người góp khi bấm "Đồng bộ Jira"
// (bảng jira_tree: chỉ mã, tên, loại, trạng thái, người được giao, hạn). Kèm các đầu việc trên web đang gắn mã đó.
export default async function JiraTreePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireSession();
  const { data, error } = await supabase
    .from('jira_tree')
    .select('issue_key, summary, issue_type, status, status_category, project_key, project_name, assignee_name, due_date, parent_key, updated_at_jira')
    .limit(10000)
    .returns<Node[]>();
  const nodes = data ?? [];
  const byKey = new Map(nodes.map((n) => [n.issue_key, n]));
  const kids = new Map<string, Node[]>();
  for (const n of nodes) {
    if (n.parent_key && byKey.has(n.parent_key) && n.parent_key !== n.issue_key) kids.set(n.parent_key, [...(kids.get(n.parent_key) ?? []), n]);
  }
  // Gốc: mã không có cha trong dữ liệu. Chống vòng lặp bằng cách giới hạn độ sâu khi duyệt.
  const roots = nodes.filter((n) => !n.parent_key || !byKey.has(n.parent_key) || n.parent_key === n.issue_key);
  const walk = (n: Node, depth = 0): Node[] => (depth > 6 ? [n] : [n, ...(kids.get(n.issue_key) ?? []).flatMap((c) => walk(c, depth + 1))]);

  // Đầu việc trên web gắn mã (RLS: chỉ những việc người xem được phép thấy).
  const { data: webTasks } = nodes.length
    ? await supabase.from('tasks').select('id, group_id, title, jira_key').not('jira_key', 'is', null).limit(3000).returns<WebTask[]>()
    : { data: [] as WebTask[] };
  const webOf = new Map<string, WebTask[]>();
  for (const t of webTasks ?? []) webOf.set(t.jira_key, [...(webOf.get(t.jira_key) ?? []), t]);

  // Việc để chọn link: việc đang mở mà tôi thực hiện hoặc đã tạo, không phải việc Cá nhân, chưa gắn mã Jira.
  const { data: myTasks } = nodes.length
    ? await supabase.from('tasks').select('id, group_id, title, jira_key, assignee_id, created_by')
      .or(`assignee_id.eq.${userId},created_by.eq.${userId}`).neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(1000)
      .returns<(WebTask & { jira_key: string | null })[]>()
    : { data: [] as (WebTask & { jira_key: string | null })[] };
  const groupIds = [...new Set([...(webTasks ?? []), ...(myTasks ?? [])].map((t) => t.group_id))];
  const { data: groupRows } = groupIds.length
    ? await supabase.from('groups').select('id, name, owner_id').in('id', groupIds)
    : { data: [] as { id: string; name: string; owner_id: string | null }[] };
  const groupName = new Map((groupRows ?? []).map((g) => [g.id, g.name as string]));
  const personal = new Set((groupRows ?? []).filter((g) => g.owner_id).map((g) => g.id));
  const mine = new Set((myTasks ?? []).map((t) => t.id));
  const pickable: PickTask[] = (myTasks ?? [])
    .filter((t) => !t.jira_key && !personal.has(t.group_id))
    .map((t) => ({ id: t.id, label: t.title, group: groupName.get(t.group_id) ?? '' }));

  const showAll = sp.xem === 'tat-ca';
  const q = (sp.q ?? '').trim().toLowerCase();
  const units = new Map<string, string>();
  for (const n of nodes) if (n.project_key) units.set(n.project_key, n.project_name || n.project_key);
  const unitList = [...units.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const dv = sp.dv && units.has(sp.dv) ? sp.dv : '';

  const shownRoots = roots
    .map((r) => ({ r, all: walk(r) }))
    .filter(({ r, all }) => (!dv || r.project_key === dv))
    .filter(({ all }) => showAll || all.some((x) => x.status_category !== 'done'))
    .filter(({ all }) => !q || all.some((x) => `${x.issue_key} ${x.summary} ${x.assignee_name ?? ''}`.toLowerCase().includes(q)))
    // Cây lớn (có việc con) lên trước, rồi theo hạn gần nhất.
    .sort((a, b) => Number(b.all.length > 1) - Number(a.all.length > 1) || (a.r.due_date ?? '9999').localeCompare(b.r.due_date ?? '9999') || a.r.issue_key.localeCompare(b.r.issue_key));
  const groups = new Map<string, typeof shownRoots>();
  for (const x of shownRoots) {
    const u = x.r.project_name || x.r.project_key || 'Khác';
    groups.set(u, [...(groups.get(u) ?? []), x]);
  }

  const base = serverEnv.jiraBaseUrl();
  const browse = (k: string) => (base ? `${base}/browse/${encodeURIComponent(k)}` : null);
  const today = vnDay();
  const href = (o: Partial<Search>) => {
    const p = new URLSearchParams();
    const v = { dv, q: sp.q ?? '', xem: sp.xem ?? '', ...o };
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, val);
    const s = p.toString();
    return s ? `/jira/cay?${s}` : '/jira/cay';
  };

  // Mỗi mã một dòng, thụt lề theo cấp; cột phải là Việc trên web gắn mã đó (hoặc cảnh báo + ô chọn Việc để link).
  const rows = (n: Node, depth: number): React.ReactNode[] => {
    const children = depth > 6 ? [] : (kids.get(n.issue_key) ?? [])
      .slice()
      .sort((a, b) => Number(a.status_category === 'done') - Number(b.status_category === 'done') || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    const done = n.status_category === 'done';
    const overdue = !done && n.due_date && n.due_date < today;
    const web = webOf.get(n.issue_key) ?? [];
    const all = children.length ? walk(n, depth).slice(1) : [];
    const nDone = all.filter((x) => x.status_category === 'done').length;
    const line = (
      <li key={n.issue_key} className="grid gap-x-4 gap-y-1 py-2 md:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5" style={{ paddingLeft: `${depth * 1.5}rem` }}>
          {depth > 0 && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">└</span>}
          {browse(n.issue_key)
            ? <a href={browse(n.issue_key)!} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-medium text-brand-600 hover:underline dark:text-brand-300">{n.issue_key}</a>
            : <span className="font-mono text-xs font-medium">{n.issue_key}</span>}
          {n.issue_type && <span className="chip px-1.5 py-0 text-[11px]">{n.issue_type}</span>}
          <span className={`text-sm ${done ? 'line-through muted' : depth === 0 && children.length ? 'font-semibold' : ''}`}>{n.summary}</span>
          <span className="text-xs muted">
            {[n.status, n.assignee_name].filter(Boolean).join(' · ')}
            {n.due_date && <span className={overdue ? ' font-semibold text-orange-600 dark:text-orange-400' : ''}> · Hạn {fmtDate(n.due_date)}</span>}
            {children.length > 0 && <span className="tabular-nums"> · {nDone}/{all.length} việc con xong</span>}
          </span>
        </div>
        <div className="min-w-0 text-xs">
          {web.length > 0 ? (
            <ul className="space-y-0.5">
              {web.map((t) => (
                <li key={t.id} className="flex items-start gap-1">
                  <Link href={`/nhom/${t.group_id}`} className="min-w-0 flex-1 text-emerald-700 hover:underline dark:text-emerald-300" title={groupName.get(t.group_id) ?? ''}>✓ {t.title}</Link>
                  {mine.has(t.id) && <UnlinkTask taskId={t.id} />}
                </li>
              ))}
            </ul>
          ) : done ? (
            <span className="muted">Đã xong, chưa link Việc</span>
          ) : (
            <div className="space-y-1">
              <span className="inline-block rounded-md bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">⚠ Chưa link Việc</span>
              {pickable.length > 0 && <LinkTask jiraKey={n.issue_key} tasks={pickable} />}
            </div>
          )}
        </div>
      </li>
    );
    return [line, ...children.flatMap((c) => rows(c, depth + 1))];
  };
  const unlinked = shownRoots.flatMap(({ all }) => all).filter((x) => x.status_category !== 'done' && !webOf.has(x.issue_key)).length;

  const missingTable = error && /jira_tree/.test(error.message ?? '');
  return (
    <>
      <PageHead
        eyebrow={<Link href="/jira" className="hover:underline">← Jira của tôi</Link>}
        title="Cây công việc Jira"
        sub="Task của các đơn vị, Work và Sub-task bên dưới. Dữ liệu được góp mỗi khi ai đó bấm Đồng bộ Jira: gồm việc của người đó, việc cha và các việc con. Chỉ có mã, tên, trạng thái, người được giao và hạn."
        actions={<><Link href="/jira" className="btn-secondary">Jira của tôi</Link><Link href="/jira?muc=ket-noi" className="btn-secondary">Đồng bộ Jira</Link></>}
      />
      {missingTable ? (
        <p role="alert" className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">
          Cần chạy SQL tạo bảng cây công việc (20261114000002_cay_cong_viec_jira.sql).
        </p>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
            <select name="dv" defaultValue={dv} className="input w-auto" aria-label="Đơn vị">
              <option value="">Tất cả đơn vị ({units.size})</option>
              {unitList.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Tìm mã, tên việc, người làm" className="input w-64" />
            {showAll && <input type="hidden" name="xem" value="tat-ca" />}
            <button className="btn-secondary">Lọc</button>
            <Link href={href({ xem: showAll ? '' : 'tat-ca' })} className="text-sm text-brand-600 hover:underline dark:text-brand-300">
              {showAll ? 'Chỉ cây còn việc chưa xong' : 'Hiện cả cây đã xong'}
            </Link>
          </form>
          {unlinked > 0 && (
            <p role="alert" className="mb-4 rounded-xl bg-orange-50 px-4 py-2.5 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">
              <b>{unlinked} mã Jira chưa xong chưa link với Việc nào trên web.</b> Chọn Việc ở cột bên phải để link; Việc đã có mã khác thì sửa ở trang Việc.
            </p>
          )}
          {!nodes.length ? (
            <section className="card"><p className="text-sm muted">Chưa có dữ liệu. Bấm nút Đồng bộ Jira trên trang Jira để góp cây công việc quanh việc của bạn.</p></section>
          ) : !groups.size ? (
            <section className="card"><p className="text-sm muted">Không có việc nào khớp bộ lọc.</p></section>
          ) : (
            <div className="space-y-4">
              {[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([unit, list]) => (
                <section key={unit} className="card">
                  <h2 className="mb-2 text-lg font-semibold">{unit} <span className="text-sm font-normal muted">({list.length})</span></h2>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">{list.flatMap(({ r }) => rows(r, 0))}</ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
