import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { TaskList } from '@/components/TaskList';
import { EventForm, PersonalProjectForm, TaskForm } from '@/components/WorkForms';
import { TaskGroupFilter, type FilterOption } from '@/components/TaskGroupFilter';
import { loadPeople } from '@/lib/people';
import { addDays, fmtDate, vnDay } from '@/lib/format';
import { KIND_LABEL, TASK_STATUS_LABEL, type Group, type GroupKind, type Task, type TaskStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Việc của tôi' };

const TABS = [
  ['tien-do', 'Tiến độ'],
  ['', 'Tôi thực hiện'],
  ['da-giao', 'Tôi đã giao'],
  ['xong', 'Đã hoàn thành'],
] as const;

type G = Pick<Group, 'id' | 'name' | 'parent_id' | 'owner_id' | 'kind'>;

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ xem?: string; nhom?: string; tb?: string; loi?: string }> }) {
  const { xem = '', nhom = '', tb, loi } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();

  // Việc cần hiện (trừ "Tiến độ", cần biết mục cá nhân) được đọc song song với các bước dưới.
  const base = () => supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).order('updated_at', { ascending: false });
  const early =
    xem === 'tien-do' ? null
    : xem === 'da-giao' ? base().eq('created_by', userId).or(`assignee_id.is.null,assignee_id.neq.${userId}`).neq('status', 'done').limit(300).returns<Task[]>()
    : xem === 'xong' ? base().or(`assignee_id.eq.${userId},created_by.eq.${userId}`).eq('status', 'done').limit(300).returns<Task[]>()
    : base().eq('assignee_id', userId).neq('status', 'done').limit(300).returns<Task[]>();
  const earlyTasks = early ? early.then((r) => r) : null; // .then để truy vấn chạy ngay

  // Mỗi người có sẵn mục "Cá nhân" (tạo ở lần đầu mở trang).
  const { data: personalRoot } = await supabase.rpc('my_personal_group');

  const [{ data: groups }, { data: mine }] = await Promise.all([
    supabase.from('groups').select('id, name, parent_id, owner_id, kind').is('archived_at', null).order('name').returns<G[]>(),
    supabase.from('group_members').select('group_id, can_create, is_manager').eq('user_id', userId),
  ]);
  const allGroups = groups ?? [];
  const personal = allGroups.filter((g) => g.owner_id === userId);
  const personalIds = personal.map((g) => g.id);
  const groupMap = new Map(allGroups.map((g) => [g.id, g]));
  const label = (id: string) => {
    const g = groupMap.get(id);
    if (!g) return 'Nhóm';
    if (g.owner_id) return g.parent_id ? `Cá nhân › ${g.name}` : 'Cá nhân';
    return g.name;
  };

  let tasks: Task[] | null;
  if (earlyTasks) ({ data: tasks } = await earlyTasks);
  else {
    const scope = [`assignee_id.eq.${userId}`, `created_by.eq.${userId}`];
    if (personalIds.length) scope.push(`group_id.in.(${personalIds.join(',')})`);
    ({ data: tasks } = await base().or(scope.join(',')).limit(2000).returns<Task[]>());
  }
  const allTasks = tasks ?? [];

  // Lọc theo nhóm / dự án / tổ: chọn một nhóm thì gồm cả các nhóm con (tổ, dự án con) của nó.
  const children = new Map<string, string[]>();
  for (const g of allGroups) if (g.parent_id) children.set(g.parent_id, [...(children.get(g.parent_id) ?? []), g.id]);
  const subtree = (id: string) => {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      if (out.has(x)) continue;
      out.add(x);
      stack.push(...(children.get(x) ?? []));
    }
    return out;
  };
  const filterIds = nhom === 'ca-nhan' ? new Set(personalIds) : nhom && groupMap.has(nhom) ? subtree(nhom) : null;
  const nhomValue = filterIds ? nhom : '';
  const list = filterIds ? allTasks.filter((t) => filterIds.has(t.group_id)) : allTasks;

  const [{ name }, { data: myDelReqs }] = await Promise.all([
    loadPeople(supabase, list.map((t) => t.assignee_id)),
    supabase.from('delete_requests').select('item_id').eq('requester_id', userId).eq('item_type', 'task').eq('status', 'pending'),
  ]);
  // Xóa: Trưởng nhóm, quản trị, thư ký toàn trường và chủ mục Cá nhân xóa ngay; người khác gửi đề nghị.
  const leadOf = new Set((mine ?? []).filter((m) => m.is_manager).map((m) => m.group_id));
  const pendingDel = new Set((myDelReqs ?? []).map((r) => r.item_id as string));
  const deleteState = (t: Task) =>
    pendingDel.has(t.id) ? 'pending' as const
    : personalIds.includes(t.group_id) || leadOf.has(t.group_id) || ((ctx.is_admin || ctx.all_groups_secretary) && !groupMap.get(t.group_id)?.owner_id) ? 'delete' as const
    : 'request' as const;
  const href = (x: string, n: string) => {
    const q = new URLSearchParams();
    if (x) q.set('xem', x);
    if (n) q.set('nhom', n);
    const qs = q.toString();
    return qs ? `/viec?${qs}` : '/viec';
  };
  const back = href(xem, nhomValue);

  // Lựa chọn của ô lọc: chỉ những nhóm có việc trong tab này (kèm nhóm cha để lọc cả cụm), số việc ở cuối.
  const shown = new Set<string>();
  for (const t of allTasks) {
    let g = groupMap.get(t.group_id);
    const seen = new Set<string>();
    while (g && !g.owner_id && !seen.has(g.id)) {
      seen.add(g.id);
      shown.add(g.id);
      g = g.parent_id ? groupMap.get(g.parent_id) : undefined;
    }
  }
  const countIn = (ids: Set<string>) => allTasks.filter((t) => ids.has(t.group_id)).length;
  const pathName = (g: G) => {
    const parts = [g.name];
    let p = g.parent_id ? groupMap.get(g.parent_id) : undefined;
    for (let i = 0; p && i < 5; i++, p = p.parent_id ? groupMap.get(p.parent_id) : undefined) parts.unshift(p.name);
    return parts.join(' › ');
  };
  const opt = (value: string, text: string, n: number): FilterOption => ({ value, label: `${text} (${n})`, href: href(xem, value) });
  const personalCount = allTasks.filter((t) => personalIds.includes(t.group_id)).length;
  const sectionOrder: GroupKind[] = ['unit', 'project', 'event', 'other'];
  const filterSections = [
    ...(personalCount ? [{ label: 'Cá nhân', options: [opt('ca-nhan', 'Cá nhân', personalCount)] }] : []),
    ...sectionOrder.map((k) => ({
      label: k === 'unit' ? 'Đơn vị, tổ' : KIND_LABEL[k],
      options: allGroups
        .filter((g) => g.kind === k && shown.has(g.id))
        .map((g) => ({ g, path: pathName(g) }))
        .sort((a, b) => a.path.localeCompare(b.path, 'vi'))
        .map(({ g, path }) => opt(g.id, path, countIn(subtree(g.id)))),
    })).filter((s) => s.options.length),
  ];
  // Mục đang chọn mà tab này không có việc vẫn giữ trong ô chọn, để người dùng thấy và bỏ lọc.
  if (filterIds && !filterSections.some((s) => s.options.some((o) => o.value === nhomValue))) {
    filterSections.push({ label: 'Đang chọn', options: [opt(nhomValue, nhomValue === 'ca-nhan' ? 'Cá nhân' : label(nhomValue), 0)] });
  }

  // Nhóm tôi được tạo việc (chỉ để gợi ý; RLS kiểm tra lại). Mục cá nhân lên đầu.
  const creatable = new Set((mine ?? []).filter((m) => m.can_create).map((m) => m.group_id));
  const personalOptions = [...personal]
    .sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0) || a.name.localeCompare(b.name, 'vi'))
    .map((g) => ({ id: g.id, label: label(g.id) }));
  const groupOptions = [
    ...personalOptions,
    ...allGroups.filter((g) => !g.owner_id && creatable.has(g.id)).map((g) => ({ id: g.id, label: g.name })),
  ];

  const byStatus = (s: TaskStatus) => list.filter((t) => t.status === s);
  const counts = (['todo', 'doing', 'review'] as TaskStatus[]).map((s) => [s, byStatus(s).length] as const);

  return (
    <>
      <PageHead title="Việc" sub="Việc của bạn trong các nhóm và trong mục Cá nhân (chỉ bạn thấy). Tự đặt hạn, lịch và theo dõi tiến độ." />
      {tb && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{tb}</p>}
      {loi && <p role="alert" className="mb-4 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">{loi}</p>}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav className="seg" aria-label="Lọc việc">
          {TABS.map(([k, l]) => (
            <a key={k} href={href(k, nhomValue)} aria-current={xem === k ? 'page' : undefined}>{l}</a>
          ))}
        </nav>
        {(filterSections.length > 0 || filterIds) && (
          <TaskGroupFilter value={nhomValue} all={{ value: '', label: `Tất cả nhóm, dự án (${allTasks.length})`, href: href(xem, '') }} sections={filterSections} />
        )}
      </div>
      {(xem === '' || xem === 'da-giao') && (
        <div className="mb-4 flex flex-wrap gap-2">
          {counts.map(([s, n]) => (
            <span key={s} className="chip px-3 py-1 text-sm">{TASK_STATUS_LABEL[s]}: <b className="tabular-nums">{n}</b></span>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {xem === 'tien-do' ? (
            <Progress tasks={list} label={label} me={userId} deleteState={deleteState} back={back} />
          ) : (
            <section className="card">
              <TaskList
                tasks={list}
                name={name}
                groupName={label}
                showProgress={xem === ''}
                me={userId}
                deleteState={deleteState}
                back={back}
                empty={filterIds ? 'Không có việc nào trong nhóm, dự án đã chọn.' : xem === 'da-giao' ? 'Bạn chưa giao việc nào đang mở.' : xem === 'xong' ? 'Chưa có việc hoàn thành.' : 'Bạn không có việc nào đang mở. Tạo việc cá nhân ở khung bên cạnh.'}
              />
            </section>
          )}
        </div>
        <aside className="space-y-4">
          <section id="tao-viec" className="card scroll-mt-20">
            <h2 className="mb-3 text-lg font-semibold">Tạo việc nhanh</h2>
            <TaskForm groups={groupOptions} self={userId} />
            <p className="mt-2 text-xs muted">Việc tạo ở đây giao cho chính bạn. Chọn &quot;Cá nhân&quot; cho việc riêng; để giao cho người khác, tạo việc trong trang của nhóm.</p>
          </section>
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Thêm lịch</h2>
            <EventForm groups={groupOptions} personal />
          </section>
          <section className="card">
            <h2 className="mb-1 text-lg font-semibold">Dự án cá nhân</h2>
            <p className="mb-3 text-xs muted">Gom việc riêng theo dự án, ví dụ nghiên cứu khoa học, luận án. Chỉ bạn thấy.</p>
            {personal.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-1.5 text-sm">
                {personalOptions.map((o) => (
                  <li key={o.id}><Link href={`/nhom/${o.id}`} className="chip hover:underline">{o.label}</Link></li>
                ))}
              </ul>
            )}
            <PersonalProjectForm />
            {!personalRoot && <p className="mt-2 text-xs text-orange-600">Chưa tạo được mục Cá nhân, hãy tải lại trang.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

// Bảng tiến độ theo nhóm/dự án: tỷ lệ xong, quá hạn, gấp, hạn gần nhất; rồi danh sách việc cần xử lý.
function Progress({ tasks, label, me, deleteState, back }: { tasks: Task[]; label: (id: string) => string; me: string; deleteState: (t: Task) => 'delete' | 'request' | 'pending'; back: string }) {
  const today = vnDay();
  const soon = addDays(today, 3);
  const week = addDays(today, 7);
  const rows = new Map<string, { total: number; done: number; overdue: number; urgent: number; next: string | null; pct: number[] }>();
  for (const t of tasks) {
    const r = rows.get(t.group_id) ?? { total: 0, done: 0, overdue: 0, urgent: 0, next: null, pct: [] };
    r.total++;
    if (t.status === 'done') r.done++;
    else {
      if (t.due_date && t.due_date < today) r.overdue++;
      else if (t.due_date && t.due_date <= soon) r.urgent++;
      if (t.due_date && t.due_date >= today && (!r.next || t.due_date < r.next)) r.next = t.due_date;
      if (t.progress != null) r.pct.push(t.progress);
    }
    rows.set(t.group_id, r);
  }
  const sorted = [...rows.entries()].sort((a, b) => b[1].overdue - a[1].overdue || b[1].urgent - a[1].urgent || label(a[0]).localeCompare(label(b[0]), 'vi'));
  const open = tasks.filter((t) => t.status !== 'done');
  const total = tasks.length;
  const done = total - open.length;
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const upcoming = open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= week);
  const attention = [...overdue, ...upcoming].filter((t) => t.assignee_id === me || !t.assignee_id);

  if (!total) return <section className="card"><p className="text-sm muted">Chưa có việc nào để theo dõi.</p></section>;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ['Tổng số việc', total, ''],
          ['Đã xong', `${done} (${Math.round((done / total) * 100)}%)`, ''],
          ['Quá hạn', overdue.length, overdue.length ? 'text-orange-600 dark:text-orange-400' : ''],
          ['Hạn trong 7 ngày', upcoming.length, ''],
        ] as const).map(([k, v, c]) => (
          <div key={k} className="card py-3">
            <div className="text-xs muted">{k}</div>
            <div className={`text-2xl font-semibold tabular-nums ${c}`}>{v}</div>
          </div>
        ))}
      </section>
      <section className="card overflow-x-auto">
        <h2 className="mb-3 text-lg font-semibold">Tiến độ theo nhóm, dự án</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs muted">
            <tr><th className="py-1 pr-3 font-medium">Nhóm / dự án</th><th className="pr-3 font-medium">Hoàn thành</th><th className="pr-3 font-medium">Còn lại</th><th className="pr-3 font-medium">Quá hạn</th><th className="pr-3 font-medium">Gấp (≤3 ngày)</th><th className="font-medium">Hạn gần nhất</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map(([gid, r]) => {
              const pct = Math.round((r.done / r.total) * 100);
              return (
                <tr key={gid}>
                  <td className="py-2 pr-3"><Link href={`/nhom/${gid}`} className="font-medium hover:underline">{label(gid)}</Link></td>
                  <td className="pr-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {/* % chỉ hiện khi rê chuột (hoặc chạm) vào thanh tiến độ. */}
                      <div className="group relative py-1.5" tabIndex={0} aria-label={`Hoàn thành ${pct}%`} title={`${pct}%`}>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                        <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus:opacity-100 dark:bg-slate-100 dark:text-slate-900">{pct}%</span>
                      </div>
                      <span className="tabular-nums">{r.done}/{r.total}</span>
                    </div>
                  </td>
                  <td className="pr-3 tabular-nums">{r.total - r.done}</td>
                  <td className={`pr-3 tabular-nums ${r.overdue ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}`}>{r.overdue}</td>
                  <td className="pr-3 tabular-nums">{r.urgent}</td>
                  <td className="tabular-nums">{r.next ? fmtDate(r.next) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2 className="mb-3 text-lg font-semibold">Cần xử lý: quá hạn và hạn trong 7 ngày</h2>
        <TaskList tasks={attention} name={() => 'Bạn'} groupName={label} showProgress me={me} deleteState={deleteState} back={back} empty="Không có việc quá hạn hay sắp đến hạn." />
      </section>
    </>
  );
}
