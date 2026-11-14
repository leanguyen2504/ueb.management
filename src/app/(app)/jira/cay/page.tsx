import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { serverEnv } from '@/lib/env';
import { fmtDate, vnDay } from '@/lib/format';
import { LinkTask, UnlinkTask, type PickGroup } from './LinkTask';

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
type WebTask = { id: string; group_id: string; title: string; jira_key: string; assignee_id: string | null; created_by: string | null };
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
    ? await supabase.from('tasks').select('id, group_id, title, jira_key, assignee_id, created_by').not('jira_key', 'is', null).limit(3000).returns<WebTask[]>()
    : { data: [] as WebTask[] };
  const webOf = new Map<string, WebTask[]>();
  for (const t of webTasks ?? []) webOf.set(t.jira_key, [...(webOf.get(t.jira_key) ?? []), t]);

  // Việc để chọn link: việc chưa gắn mã Jira (cả việc đã xong), không phải việc Cá nhân (RLS: chỉ việc tôi xem được;
  // cơ sở dữ liệu kiểm tra quyền khi lưu).
  type G = { id: string; name: string; parent_id: string | null; owner_id: string | null };
  type PickTask = { id: string; group_id: string; title: string; status: string };
  const [{ data: openTasks }, { data: groupRows }] = nodes.length
    ? await Promise.all([
      supabase.from('tasks').select('id, group_id, title, status').is('jira_key', null)
        .order('due_date', { ascending: true, nullsFirst: false }).limit(3000).returns<PickTask[]>(),
      supabase.from('groups').select('id, name, parent_id, owner_id').is('archived_at', null).limit(3000).returns<G[]>(),
    ])
    : [{ data: [] as PickTask[] }, { data: [] as G[] }];
  const webGroups = new Map((groupRows ?? []).map((g) => [g.id, g]));
  const groupName = new Map((groupRows ?? []).map((g) => [g.id, g.name]));
  const mine = new Set((webTasks ?? []).filter((t) => t.assignee_id === userId || t.created_by === userId).map((t) => t.id));
  // Đường dẫn nhóm từ gốc: [gốc, con, cháu…].
  const chain = (gid: string) => {
    const out: G[] = [];
    for (let g = webGroups.get(gid), i = 0; g && i < 8; g = g.parent_id ? webGroups.get(g.parent_id) : undefined, i++) out.unshift(g);
    return out;
  };
  // So tên đơn vị Jira với tên nhóm gốc trên web: bỏ dấu, bỏ "UEB", so trùng hoặc chứa nhau.
  const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/\bueb\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const unitRoots = [...webGroups.values()].filter((g) => !g.parent_id && !g.owner_id);
  const unitGroup = (projectName: string | null) => {
    if (!projectName) return null;
    const p = norm(projectName);
    return unitRoots.find((g) => norm(g.name) === p) ?? unitRoots.find((g) => { const n = norm(g.name); return n.length > 3 && (p.includes(n) || n.includes(p)); }) ?? null;
  };
  // Danh sách chọn Việc: mọi Việc chưa gắn mã (cả Việc đã xong), ở mọi đơn vị, vì một mã Jira của đơn vị này
  // có thể ứng với Việc của đơn vị khác (ví dụ mã TCTTD cho Việc ở SITE › Khóa AI).
  // Thứ tự: "Gợi ý" (tên gần với mã Jira), rồi nhóm con của đơn vị khớp tên, rồi các đơn vị khác.
  const STOP = new Set(['va', 've', 'cua', 'cho', 'cac', 'nhung', 'mot', 'the', 'lam', 'tao', 'theo', 'tai', 'trong', 'voi', 'den', 'tu', 'la', 'de', 'khi', 'nay', 'do', 'o', 'viec', 'cong', 'gui', 'hoan', 'thien', 'ngan', 'han', 'dao']);
  const words = (v: string) => norm(v).split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
  const pairs = (ws: string[]) => new Set(ws.slice(1).map((w, k) => `${ws[k]} ${w}`));
  const candidates = (openTasks ?? []).flatMap((t) => {
    const c = chain(t.group_id);
    if (!c.length || c[0].owner_id) return [];
    const ws = words(`${t.title} ${c.slice(1).map((g) => g.name).join(' ')}`);
    return [{ t, c, done: t.status === 'done', label: `${t.status === 'done' ? '✓ ' : ''}${t.title}`, ws: new Set(ws), ps: pairs(words(t.title)), gps: c.slice(1).map((g) => words(g.name).join(' ')) }];
  });
  const byOpen = (a: { done: boolean }, b: { done: boolean }) => Number(a.done) - Number(b.done);
  const baseFor = new Map<string, PickGroup[]>();
  const unitLists = (projectName: string | null): PickGroup[] => {
    const key = projectName ?? '';
    if (baseFor.has(key)) return baseFor.get(key)!;
    const unit = unitGroup(projectName);
    const byPath = new Map<string, PickGroup & { own: boolean }>();
    for (const x of candidates.slice().sort(byOpen)) {
      const own = !!unit && x.c[0].id === unit.id;
      // Đơn vị khớp: chỉ ghi nhóm con; đơn vị khác: ghi đủ đường dẫn.
      const label = own ? (x.c.slice(1).map((g) => g.name).join(' › ') || 'Việc chung của đơn vị') : x.c.map((g) => g.name).join(' › ');
      const grp = byPath.get(label) ?? { label, tasks: [], own };
      grp.tasks.push({ id: x.t.id, label: x.label });
      byPath.set(label, grp);
    }
    const list = [...byPath.values()]
      .sort((a, b) => Number(b.own) - Number(a.own) || a.label.localeCompare(b.label, 'vi'))
      .map(({ label, tasks }) => ({ label, tasks }));
    baseFor.set(key, list);
    return list;
  };
  const pickFor = (n: Node): PickGroup[] => {
    const parent = n.parent_key ? byKey.get(n.parent_key) : undefined;
    const ws = words(n.summary);
    const ps = pairs(ws);
    const own = new Set(ws);
    const up = new Set(parent ? words(parent.summary) : []);
    const scored = candidates.map((x) => {
      let score = 0;
      for (const w of x.ws) score += own.has(w) ? 1 : up.has(w) ? 0.5 : 0;
      for (const pr of x.ps) if (ps.has(pr)) score += 2;
      // Tên nhóm con (ví dụ "Khóa AI", "Đề tài Thái Nguyên") nằm trong tên mã Jira: rất có thể đúng chỗ.
      for (const g of x.gps) if (g && ` ${ws.join(' ')} `.includes(` ${g} `)) score += 3;
      return { x, score };
    }).filter((s) => s.score >= 2)
      .sort((a, b) => b.score - a.score || byOpen(a.x, b.x))
      .slice(0, 8);
    const hint: PickGroup[] = scored.length
      ? [{ label: 'Gợi ý', tasks: scored.map(({ x }) => ({ id: x.t.id, label: `${x.label} (${x.c.slice(1).map((g) => g.name).join(' › ') || x.c[0].name})` })) }]
      : [];
    return [...hint, ...unitLists(n.project_name)];
  };

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
          ) : (
            <div className="space-y-1">
              {done
                ? <span className="muted">Đã xong, chưa link Việc</span>
                : <span className="inline-block rounded-md bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">⚠ Chưa link Việc</span>}
              {candidates.length > 0 && <LinkTask jiraKey={n.issue_key} groups={pickFor(n)} />}
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
