import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AddMemberForm, EditGroupForm, GroupUnitsForm } from '../GroupForms';
import { cancelInvitation, decideJoin, removeMember, setArchived, updateMember } from '../actions';
import { PublicGroup, type DirGroup } from './PublicGroup';
import { OpenFromHash } from '@/components/OpenFromHash';
import { KIND_LABEL, PERMS, ROLE_LABEL, type Group, type GroupMember, type Profile } from '@/lib/types';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { TaskList } from '@/components/TaskList';
import { MemberAvatars, rankMember } from '@/components/MemberStrip';
import { Avatar } from '@/components/Avatar';
import { avatarUrls } from '@/lib/avatars';
import { ProgressBar, TaskProgress, progressOf } from '@/components/TaskProgress';
import { SubgroupForm } from '../SubgroupForm';
import type { TaskLink } from '@/lib/types';
import { EventForm, TaskForm } from '@/components/WorkForms';
import { deleteEvent } from '@/lib/work';
import { EVENT_KIND_LABEL, type CalEvent, type Task } from '@/lib/types';

export const metadata: Metadata = { title: 'Nhóm' };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ loi?: string; tb?: string; tab?: string }> }) {
  const { id } = await params;
  const { loi, tb, tab: tabParam } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  const { data: group } = await supabase.from('groups').select('*').eq('id', id).maybeSingle<Group>();
  if (!group) {
    // Chưa tham gia: hiện trang công khai (lãnh đạo, đầu mối, tên việc) để xin tham gia.
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const [{ data: dir }, { data: contacts }, { data: open }, { data: reqs }, { data: tagRows }] = await Promise.all([
      supabase.rpc('group_directory'),
      supabase.rpc('group_contacts', { p_group: id }),
      supabase.rpc('group_open_task_titles', { p_group: id }),
      supabase.from('join_requests').select('id, task_id, created_at').eq('group_id', id).eq('requester_id', userId).eq('status', 'pending'),
      supabase.from('group_units').select('group_id, unit_id').or(`group_id.eq.${id},unit_id.eq.${id}`),
    ]);
    const all = (dir ?? []) as (DirGroup & { can_view: boolean })[];
    const pub = all.find((g) => g.id === id);
    if (!pub) notFound();
    const byId = new Map(all.map((g) => [g.id, g]));
    const units = (tagRows ?? []).filter((r) => r.group_id === id).map((r) => byId.get(r.unit_id)).filter(Boolean) as DirGroup[];
    const projects = (tagRows ?? []).filter((r) => r.unit_id === id).map((r) => byId.get(r.group_id)).filter(Boolean) as (DirGroup & { can_view: boolean })[];
    return <PublicGroup group={pub} contacts={contacts ?? []} tasks={open ?? []} requests={reqs ?? []} units={units} projects={projects} tb={tb} loi={loi} />;
  }

  const [{ data: members }, { data: invites }, { data: log }, { data: tasks }, { data: events }, { data: joinReqs }] = await Promise.all([
    supabase.from('group_members').select('*').eq('group_id', id).returns<GroupMember[]>(),
    supabase.from('invitations').select('id, email, is_manager, is_clerk, created_at, expires_at').eq('group_id', id).is('accepted_at', null),
    supabase.from('activity_log').select('id, at, actor_id, action, entity_type').eq('group_id', id).order('at', { ascending: false }).limit(15),
    supabase.from('tasks').select('*').eq('group_id', id).order('status').order('due_date', { ascending: true, nullsFirst: false }).limit(200).returns<Task[]>(),
    supabase.from('events').select('*').eq('group_id', id).gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(30).returns<CalEvent[]>(),
    // RLS: chỉ người quản lý thành viên thấy yêu cầu của người khác.
    supabase.from('join_requests').select('id, task_id, requester_id, message, created_at').eq('group_id', id).eq('status', 'pending').neq('requester_id', userId).order('created_at'),
  ]);
  const taskIds = (tasks ?? []).map((t) => t.id);
  const [{ data: linkRows }, { data: children }, { data: parent }] = await Promise.all([
    taskIds.length ? supabase.from('task_links').select('*').in('task_id', taskIds).order('created_at').returns<TaskLink[]>() : Promise.resolve({ data: [] as TaskLink[] }),
    supabase.from('groups').select('id, name, description, archived_at').eq('parent_id', id).order('created_at', { ascending: false }),
    group.parent_id ? supabase.from('groups').select('id, name').eq('id', group.parent_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // Danh bạ để hiện tên đơn vị quản lý, đơn vị cùng làm và dự án liên đơn vị, kể cả nhóm mình chưa tham gia.
  const [{ data: dirData }, { data: tagRows }] = await Promise.all([
    supabase.rpc('group_directory'),
    supabase.from('group_units').select('group_id, unit_id').or(`group_id.eq.${id},unit_id.eq.${id}`),
  ]);
  const dirAll = (dirData ?? []) as (DirGroup & { can_view: boolean })[];
  const dirById = new Map(dirAll.map((g) => [g.id, g]));
  const parentLink = parent ?? (group.parent_id ? dirById.get(group.parent_id) ?? null : null);
  const myUnits = (tagRows ?? []).filter((r) => r.group_id === id).map((r) => dirById.get(r.unit_id)).filter(Boolean) as DirGroup[];
  // Không gian con của chính đơn vị này đã nằm trong mục Không gian, không lặp lại.
  const sharedProjects = ((tagRows ?? []).filter((r) => r.unit_id === id).map((r) => dirById.get(r.group_id)).filter(Boolean) as (DirGroup & { can_view: boolean })[]).filter((p) => p.parent_id !== id);
  const unitOptions = dirAll.filter((g) => g.kind === 'unit' && g.id !== id).map((g) => ({ id: g.id, name: g.name }));
  const links = new Map<string, TaskLink[]>();
  (linkRows ?? []).forEach((l) => links.set(l.task_id, [...(links.get(l.task_id) ?? []), l]));
  const childIds = (children ?? []).map((c) => c.id);
  const { data: childTasks } = childIds.length
    ? await supabase.from('tasks').select('group_id, status, due_date').in('group_id', childIds)
    : { data: [] as { group_id: string; status: Task['status']; due_date: string | null }[] };
  const ids = [...new Set([...(members ?? []).map((m) => m.user_id), ...(log ?? []).map((l) => l.actor_id).filter(Boolean) as string[], ...(tasks ?? []).map((t) => t.assignee_id).filter(Boolean) as string[], ...(joinReqs ?? []).map((r) => r.requester_id), group.created_by, group.updated_by].filter(Boolean) as string[])];
  const { data: people } = await supabase.from('profiles').select('id, email, full_name, system_role, is_active, position, phone, office, avatar_path').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).returns<Profile[]>();
  const person = new Map((people ?? []).map((p) => [p.id, p]));
  const avatars = await avatarUrls(supabase, (members ?? []).map((m) => person.get(m.user_id)?.avatar_path));
  const name = (uid: string | null) => (uid ? person.get(uid)?.full_name || person.get(uid)?.email || 'Người dùng' : 'Hệ thống');

  // Chỉ để ẩn/hiện nút; cơ sở dữ liệu kiểm tra lại quyền khi lưu.
  const me = (members ?? []).find((m) => m.user_id === userId);
  const canManage = ctx.is_admin || ctx.all_groups_secretary || Boolean(me?.can_manage_members);
  // Trưởng nhóm (và quản trị, thư ký toàn trường) bổ nhiệm vai trò; Văn thư chỉ quản lý thành viên thường.
  const isLead = ctx.is_admin || ctx.all_groups_secretary || Boolean(me?.is_manager);
  const EDIT_PERMS = PERMS.filter(([k]) => k !== 'can_manage_members');
  const seesAll = ctx.is_admin || ctx.all_groups_secretary || ctx.role === 'principal';
  const canCreate = seesAll || Boolean(me?.can_create);
  const canEdit = seesAll || Boolean(me?.can_edit);
  const memberOptions = (members ?? []).map((m) => ({ id: m.user_id, label: person.get(m.user_id)?.full_name || person.get(m.user_id)?.email || 'Người dùng' }));
  const canNudge = canEdit || canManage;
  const canAttach = seesAll || Boolean(me?.can_upload);
  const canSub = !group.archived_at && (canCreate || canManage);
  const sortedMembers = [...(members ?? [])].sort((a, b) => rankMember({ ...a, profile: person.get(a.user_id) }) - rankMember({ ...b, profile: person.get(b.user_id) }));
  const openTasks = (tasks ?? []).filter((t) => t.status !== 'done');
  const doneTasks = (tasks ?? []).filter((t) => t.status === 'done');

  const stripMembers = (members ?? []).map((m) => ({ user_id: m.user_id, is_manager: m.is_manager, is_clerk: m.is_clerk, profile: person.get(m.user_id), avatarUrl: avatars.get(person.get(m.user_id)?.avatar_path ?? '') }));
  // Thẻ của trang nhóm. Thông tin ít dùng (người tạo/sửa, nhật ký, sửa, lưu trữ) nằm ở thẻ Thông tin.
  const TABS = [
    { key: 'tong-quan', label: 'Tổng quan' },
    { key: 'viec', label: 'Việc', count: openTasks.length },
    { key: 'lich', label: 'Lịch', count: events?.length ?? 0 },
    ...(childIds.length > 0 || canSub || sharedProjects.length > 0 ? [{ key: 'khong-gian', label: 'Không gian', count: childIds.length + sharedProjects.length }] : []),
    { key: 'thanh-vien', label: (joinReqs?.length ? `Thành viên · ${joinReqs.length} yêu cầu` : 'Thành viên'), count: members?.length ?? 0 },
    { key: 'thong-tin', label: 'Thông tin' },
  ];
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam! : 'tong-quan';
  const tabHref = (k: string) => (k === 'tong-quan' ? `/nhom/${group.id}` : `/nhom/${group.id}?tab=${k}`);
  const canAddTask = canCreate && !group.archived_at;

  const spaces = (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(children ?? []).map((c) => {
        const p = progressOf((childTasks ?? []).filter((t) => t.group_id === c.id));
        return (
          <li key={c.id}>
            <Link href={`/nhom/${c.id}`} className="block h-full rounded-xl border border-slate-200 bg-white p-3.5 hover:border-brand-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-300">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                {c.archived_at && <span className="chip">Đã lưu trữ</span>}
              </div>
              {c.description && <p className="truncate text-xs muted">{c.description}</p>}
              <ProgressBar pct={p.pct} className="mt-2.5 h-1.5" />
              <p className="mt-1.5 text-xs muted">{p.done}/{p.total} việc xong{p.overdue ? <span className="font-semibold text-orange-700 dark:text-orange-400"> · {p.overdue} quá hạn</span> : ''}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
  const shared = sharedProjects.length > 0 && (
    <section className="card" aria-labelledby="lien-dv-h">
      <h2 id="lien-dv-h" className="mb-1 text-lg font-semibold">Dự án liên đơn vị ({sharedProjects.length})</h2>
      <p className="mb-3 text-sm muted">Dự án, sự kiện có {group.name} cùng làm với đơn vị khác.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sharedProjects.map((p) => (
          <li key={p.id}>
            <Link href={`/nhom/${p.id}`} className="block h-full rounded-xl border border-slate-200 bg-white p-3.5 hover:border-brand-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-300">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{p.name}</span>
                {!p.can_view && <span className="chip">Chưa tham gia</span>}
              </div>
              {p.description && <p className="truncate text-xs muted">{p.description}</p>}
              <p className="mt-1.5 text-xs muted">{KIND_LABEL[p.kind as keyof typeof KIND_LABEL] ?? p.kind} · {p.member_count} thành viên · {p.open_tasks} việc đang mở</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
  const eventList = events?.length ? (
    <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 py-2.5">
          <div className="w-24 shrink-0 font-display text-xs font-semibold tabular-nums">{fmtDateTime(e.starts_at)}</div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{e.title}</div>
            <div className="text-xs muted">{EVENT_KIND_LABEL[e.kind]} · đến {fmtTime(e.ends_at)}{e.location ? ` · ${e.location}` : ''}</div>
          </div>
          {canEdit && tab === 'lich' && (
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={e.id} />
              <button className="text-xs text-orange-700 hover:underline dark:text-orange-400">Xóa</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  ) : <p className="text-sm muted">Chưa có lịch sắp tới.</p>;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <nav className="mb-1.5 flex flex-wrap items-center gap-1.5 text-sm muted" aria-label="Vị trí">
            <Link href="/nhom" className="link">Dự án</Link>
            {parentLink && <><span>›</span><Link href={`/nhom/${parentLink.id}`} className="link">{parentLink.name}</Link></>}
          </nav>
          <h1 className="text-2xl font-semibold md:text-[28px] md:leading-tight">{group.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="chip bg-gold-50 text-gold-600 dark:bg-gold-600/15 dark:text-gold-500">{KIND_LABEL[group.kind]}</span>
            {group.archived_at && <span className="chip">Đã lưu trữ</span>}
            {myUnits.length > 0 && <span className="muted">Cùng làm:</span>}
            {myUnits.map((u) => <Link key={u.id} href={`/nhom/${u.id}`} className="chip hover:text-brand-600 dark:hover:text-brand-300">{u.name}</Link>)}
          </div>
          {group.description && <p className="mt-2 max-w-3xl text-sm muted">{group.description}</p>}
        </div>
        <div className="flex flex-col items-end gap-3">
          <MemberAvatars members={stripMembers} href={tabHref('thanh-vien')} />
          {canAddTask && <Link href={`${tabHref('viec')}#tao-viec`} className="btn">+ Tạo việc</Link>}
        </div>
      </div>
      <OpenFromHash />
      {tb && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{tb}</p>}
      {loi && <p role="alert" className="mb-4 rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-300">{loi}</p>}

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" aria-label="Các phần của nhóm">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} aria-current={tab === t.key ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm ${tab === t.key ? 'border-gold-500 font-semibold text-slate-900 dark:text-white' : 'border-transparent font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}>
            {t.label}{t.count ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{t.count}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === 'tong-quan' && (
        <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="min-w-0">
            {tasks?.length ? <TaskProgress tasks={tasks} name={name} groupId={group.id} canNudge={canNudge} /> : (
              <section className="card mb-4"><p className="text-sm muted">Nhóm chưa có đầu việc.{canAddTask ? ' Bấm "+ Tạo việc" để bắt đầu.' : ''}</p></section>
            )}
            {childIds.length > 0 && (
              <section className="card">
                <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Không gian sự kiện / việc chung</h2><Link href={tabHref('khong-gian')} className="link text-sm">Tất cả</Link></div>
                {spaces}
              </section>
            )}
            {shared && <div className="mt-5">{shared}</div>}
          </div>
          <div className="space-y-5">
            <section className="card">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Việc sắp đến hạn</h2><Link href={tabHref('viec')} className="link text-sm">{openTasks.length} việc mở</Link></div>
              <TaskList tasks={openTasks.slice(0, 5)} name={name} empty="Chưa có việc đang mở." links={links} canNudge={canNudge} canAttach={canAttach} me={userId} />
            </section>
            <section className="card">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-semibold">Lịch sắp tới</h2><Link href={tabHref('lich')} className="link text-sm">Mở</Link></div>
              {eventList}
            </section>
          </div>
        </div>
      )}

      {tab === 'viec' && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <section className="card">
            <h2 className="mb-3 text-lg font-semibold">Đầu việc ({openTasks.length} đang mở)</h2>
            <TaskList tasks={openTasks} name={name} canDelete={canEdit} empty="Chưa có việc đang mở." links={links} canNudge={canNudge} canAttach={canAttach} me={userId} />
            {doneTasks.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm muted">Đã hoàn thành ({doneTasks.length})</summary>
                <TaskList tasks={doneTasks} name={name} canDelete={canEdit} links={links} canAttach={canAttach} me={userId} />
              </details>
            )}
          </section>
          {canAddTask && (
            <div className="space-y-5">
              <section id="tao-viec" data-hash-focus className="card scroll-mt-20 target:ring-2 target:ring-gold-500">
                <h2 className="mb-3 text-lg font-semibold">Tạo việc mới</h2>
                <TaskForm groupId={group.id} people={memberOptions} />
              </section>
              {canSub && (
                <section className="card">
                  <h2 className="mb-1 text-lg font-semibold">Việc chung nhiều đơn vị</h2>
                  <p className="mb-3 text-sm muted">Việc cần nhiều phòng ban cùng làm: tạo một không gian chung, chọn các đơn vị cùng làm. Không gian tự hiện ở trang của từng đơn vị đó.</p>
                  <Link href={`${tabHref('khong-gian')}#tao-khong-gian`} className="btn-secondary">+ Tạo việc chung</Link>
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'lich' && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <section className="card"><h2 className="mb-2 text-lg font-semibold">Lịch của nhóm</h2>{eventList}</section>
          {canAddTask && <section className="card"><h2 className="mb-3 text-lg font-semibold">Thêm lịch</h2><EventForm groupId={group.id} /></section>}
        </div>
      )}

      {tab === 'khong-gian' && shared && <div className="mb-5">{shared}</div>}
      {tab === 'khong-gian' && (childIds.length > 0 || canSub) && (
        <section className="card" aria-labelledby="kgc-h">
          <h2 id="kgc-h" className="mb-1 text-lg font-semibold">Không gian sự kiện / việc chung ({childIds.length})</h2>
          <p className="mb-4 text-sm muted">Mỗi không gian chỉ gồm người tham gia, để giao việc, đôn đốc và gắn sản phẩm riêng.</p>
          {childIds.length > 0 && <div className="mb-4">{spaces}</div>}
          {canSub && (
            <details id="tao-khong-gian" data-hash-open className="scroll-mt-20">
              <summary className="btn-secondary cursor-pointer list-none">+ Tạo không gian / việc chung</summary>
              <SubgroupForm parentId={group.id} people={memberOptions} me={userId} units={group.kind === 'unit' ? unitOptions : []} />
            </details>
          )}
        </section>
      )}

      {tab === 'thanh-vien' && (
        <div className="space-y-5">
          {canManage && Boolean(joinReqs?.length) && (
            <section className="card border-gold-500/40" aria-labelledby="yeu-cau-h">
              <h2 id="yeu-cau-h" className="mb-1 text-lg font-semibold">Yêu cầu tham gia ({joinReqs!.length})</h2>
              <p className="mb-3 text-sm muted">Nhận: người xin được thêm vào nhóm với quyền mặc định; nếu xin một việc chưa có người phụ trách thì được giao luôn việc đó.</p>
              <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {joinReqs!.map((r) => {
                  const p = person.get(r.requester_id);
                  const task = r.task_id ? (tasks ?? []).find((t) => t.id === r.task_id) : null;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/nguoi/${r.requester_id}`} className="font-semibold hover:underline">{p?.full_name || p?.email || 'Người dùng'}</Link>
                        <span className="muted"> {task ? <>xin tham gia việc <span className="font-medium text-slate-900 dark:text-white">{task.title}</span></> : 'xin vào nhóm'} · {fmtDateTime(r.created_at)}</span>
                        <div className="text-xs muted">{[p?.position, p?.email].filter(Boolean).join(' · ')}</div>
                        {r.message && <p className="mt-1 rounded-lg bg-slate-100 px-2.5 py-1.5 dark:bg-slate-800">“{r.message}”</p>}
                      </div>
                      <form action={decideJoin} className="flex gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="group_id" value={group.id} />
                        <button name="accept" value="1" className="btn px-3 py-1 text-xs">Nhận</button>
                        <button name="accept" value="0" className="btn-secondary px-3 py-1 text-xs">Từ chối</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section id="thanh-vien" className="card">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Thành viên ({members?.length ?? 0})</h2>
            </div>
            {canManage && (
              <details className="mb-4">
                <summary className="btn cursor-pointer list-none">+ Mời hoặc thêm thành viên</summary>
                <div className="mt-3"><AddMemberForm groupId={group.id} canAssignRole={isLead} /></div>
              </details>
            )}
            <ul className="divide-y divide-slate-200 dark:divide-slate-800">
              {sortedMembers.map((m, i) => {
                const p = person.get(m.user_id);
                const formId = `m-${m.user_id}`;
                const canEditRow = canManage && (isLead || (!m.is_manager && !m.is_clerk));
                const display = p?.full_name || p?.email || 'Người dùng';
                const granted = EDIT_PERMS.filter(([k]) => m[k]).map(([, l]) => l);
                return (
                  <li key={`${m.user_id}-${m.is_manager}-${m.is_clerk}-${EDIT_PERMS.map(([k]) => (m[k] ? 1 : 0)).join("")}`} className="relative py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <Avatar name={display} url={avatars.get(p?.avatar_path ?? '')} size={36} className={['bg-brand-600', 'bg-teal-600', 'bg-gold-500', 'bg-sky-700'][i % 4]} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/nguoi/${m.user_id}`} className="font-semibold hover:underline">{display}</Link>
                        <div className="text-xs muted">{p?.email}{p ? ` · ${ROLE_LABEL[p.system_role]}` : ''}{p && !p.is_active ? ' · Đã khóa' : ''}</div>
                      </div>
                      {m.is_manager && <span className="chip bg-gold-50 text-gold-600 dark:bg-gold-600/15 dark:text-gold-500">Trưởng nhóm</span>}
                      {m.is_clerk && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900 dark:text-brand-100">Văn thư</span>}
                      <details className="group/perm w-full sm:w-auto">
                        <summary className="btn-secondary cursor-pointer list-none px-3 py-1 text-xs">{canEditRow ? 'Quyền' : `Quyền: ${m.is_manager ? 'đủ quyền' : granted.join(', ') || 'chỉ xem'}`}</summary>
                        <div className="mt-2 rounded-xl bg-slate-100 p-3 text-sm sm:absolute sm:right-8 sm:z-10 sm:w-[min(36rem,80vw)] sm:shadow-lg dark:bg-slate-800">
                          {canEditRow && (
                            <form id={formId} action={updateMember}>
                              <input type="hidden" name="group_id" value={group.id} />
                              <input type="hidden" name="user_id" value={m.user_id} />
                              {isLead && <input type="hidden" name="role_editable" value="1" />}
                            </form>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <label className="flex items-center gap-1.5"><input type="checkbox" name="is_manager" form={formId} defaultChecked={m.is_manager} disabled={!isLead || !canEditRow} />Trưởng nhóm</label>
                            <label className="flex items-center gap-1.5"><input type="checkbox" name="is_clerk" form={formId} defaultChecked={m.is_clerk} disabled={!isLead || !canEditRow} />Văn thư</label>
                            {EDIT_PERMS.map(([k, l]) => (
                              <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name={k} form={formId} defaultChecked={m[k]} disabled={!canEditRow} />{l}</label>
                            ))}
                          </div>
                          {canEditRow && (
                            <div className="mt-3 flex items-center gap-3">
                              <button form={formId} className="btn px-3 py-1 text-xs">Lưu</button>
                              <form action={removeMember}>
                                <input type="hidden" name="group_id" value={group.id} />
                                <input type="hidden" name="user_id" value={m.user_id} />
                                <button className="text-xs text-orange-700 hover:underline dark:text-orange-400">Gỡ khỏi nhóm</button>
                              </form>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs muted">Trưởng nhóm luôn có đủ quyền. Trưởng nhóm và Văn thư mời, thêm và gỡ thành viên; chỉ Trưởng nhóm bổ nhiệm hoặc gỡ Trưởng nhóm và Văn thư.</p>
          </section>

          {canManage && Boolean(invites?.length) && (
            <section className="card">
              <h2 className="mb-2 text-lg font-semibold">Lời mời chưa nhận ({invites!.length})</h2>
              <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
                {invites!.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <span>{i.email}{i.is_manager ? ' · Trưởng nhóm' : i.is_clerk ? ' · Văn thư' : ''} <span className="muted">· hết hạn {fmtDateTime(i.expires_at)}</span></span>
                    <form action={cancelInvitation}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="group_id" value={group.id} />
                      <button className="text-xs text-orange-700 hover:underline dark:text-orange-400">Hủy lời mời</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {tab === 'thong-tin' && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
          <section className="card">
            <h2 className="mb-1 text-lg font-semibold">Hoạt động gần đây</h2>
            <p className="mb-3 text-xs muted">Tạo bởi {name(group.created_by)} lúc {fmtDateTime(group.created_at)} · Sửa lần cuối bởi {name(group.updated_by)} lúc {fmtDateTime(group.updated_at)}</p>
            {log?.length ? (
              <ul className="space-y-1.5 text-sm">
                {log.map((l) => (
                  <li key={l.id}><span className="muted">{fmtDateTime(l.at)}</span> · {name(l.actor_id)} {ACTION[l.action] ?? l.action} {ENTITY[l.entity_type] ?? l.entity_type}</li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Chưa có hoạt động.</p>}
          </section>
          {(canManage || (canEdit && group.kind !== 'unit')) && (
            <div className="space-y-5">
              {group.kind !== 'unit' && canEdit && !group.archived_at && <GroupUnitsForm groupId={group.id} units={unitOptions} selected={myUnits.map((u) => u.id)} />}
              {canManage && <EditGroupForm group={group} />}
              {canManage && (
              <form action={setArchived} className="card">
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="archive" value={group.archived_at ? '0' : '1'} />
                <p className="mb-2 text-sm muted">{group.archived_at ? 'Nhóm đang lưu trữ. Khôi phục để dùng lại.' : 'Lưu trữ nhóm khi không còn hoạt động. Dữ liệu không bị xóa.'}</p>
                <button className="btn-secondary">{group.archived_at ? 'Khôi phục nhóm' : 'Lưu trữ nhóm'}</button>
              </form>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

const ACTION: Record<string, string> = { insert: 'thêm', update: 'sửa', delete: 'xóa' };
const ENTITY: Record<string, string> = { groups: 'thông tin nhóm', group_members: 'thành viên', invitations: 'lời mời', tasks: 'đầu việc', events: 'lịch' };
