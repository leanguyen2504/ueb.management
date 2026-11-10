import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { AddMemberForm, EditGroupForm } from '../GroupForms';
import { cancelInvitation, removeMember, setArchived, updateMember } from '../actions';
import { KIND_LABEL, PERMS, ROLE_LABEL, type Group, type GroupMember, type Profile } from '@/lib/types';
import { fmtDateTime, fmtTime } from '@/lib/format';
import { TaskList } from '@/components/TaskList';
import { EventForm, TaskForm } from '@/components/WorkForms';
import { deleteEvent } from '@/lib/work';
import { EVENT_KIND_LABEL, type CalEvent, type Task } from '@/lib/types';

export const metadata: Metadata = { title: 'Nhóm' };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ loi?: string }> }) {
  const { id } = await params;
  const { loi } = await searchParams;
  const { supabase, userId, ctx } = await requireSession();
  const { data: group } = await supabase.from('groups').select('*').eq('id', id).maybeSingle<Group>();
  if (!group) notFound();

  const [{ data: members }, { data: invites }, { data: log }, { data: tasks }, { data: events }] = await Promise.all([
    supabase.from('group_members').select('*').eq('group_id', id).returns<GroupMember[]>(),
    supabase.from('invitations').select('id, email, is_manager, is_clerk, created_at, expires_at').eq('group_id', id).is('accepted_at', null),
    supabase.from('activity_log').select('id, at, actor_id, action, entity_type').eq('group_id', id).order('at', { ascending: false }).limit(15),
    supabase.from('tasks').select('*').eq('group_id', id).order('status').order('due_date', { ascending: true, nullsFirst: false }).limit(200).returns<Task[]>(),
    supabase.from('events').select('*').eq('group_id', id).gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(30).returns<CalEvent[]>(),
  ]);
  const ids = [...new Set([...(members ?? []).map((m) => m.user_id), ...(log ?? []).map((l) => l.actor_id).filter(Boolean) as string[], ...(tasks ?? []).map((t) => t.assignee_id).filter(Boolean) as string[], group.created_by, group.updated_by].filter(Boolean) as string[])];
  const { data: people } = await supabase.from('profiles').select('id, email, full_name, system_role, is_active').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).returns<Profile[]>();
  const person = new Map((people ?? []).map((p) => [p.id, p]));
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
  const openTasks = (tasks ?? []).filter((t) => t.status !== 'done');
  const doneTasks = (tasks ?? []).filter((t) => t.status === 'done');

  return (
    <>
      <PageHead
        title={group.name}
        sub={<>{KIND_LABEL[group.kind]}{group.archived_at ? ' · Đã lưu trữ' : ''} · Tạo bởi {name(group.created_by)} lúc {fmtDateTime(group.created_at)} · Sửa lần cuối bởi {name(group.updated_by)} lúc {fmtDateTime(group.updated_at)}</>}
        actions={<Link href="/nhom" className="btn-secondary">← Khám phá dự án</Link>}
      />
      {loi && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{loi}</p>}
      {group.description && <p className="mb-4 max-w-3xl text-sm">{group.description}</p>}

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="card">
          <h2 className="mb-3 font-semibold">Đầu việc ({openTasks.length} đang mở)</h2>
          <TaskList tasks={openTasks} name={name} canDelete={canEdit} empty="Chưa có việc đang mở." />
          {doneTasks.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm muted">Đã hoàn thành ({doneTasks.length})</summary>
              <TaskList tasks={doneTasks} name={name} canDelete={canEdit} />
            </details>
          )}
        </section>
        <div className="space-y-4">
          {canCreate && !group.archived_at && (
            <details className="card" open={!openTasks.length}>
              <summary className="cursor-pointer font-semibold">Tạo việc mới</summary>
              <div className="mt-3"><TaskForm groupId={group.id} people={memberOptions} /></div>
            </details>
          )}
          <section className="card">
            <h2 className="mb-3 font-semibold">Lịch của nhóm</h2>
            {events?.length ? (
              <ul className="mb-3 space-y-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs muted">{EVENT_KIND_LABEL[e.kind]} · {fmtDateTime(e.starts_at)} đến {fmtTime(e.ends_at)}{e.location ? ` · ${e.location}` : ''}</div>
                    </div>
                    {canEdit && (
                      <form action={deleteEvent}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="text-xs text-red-600 hover:underline dark:text-red-400">Xóa</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="mb-3 text-sm muted">Chưa có lịch sắp tới.</p>}
            {canCreate && !group.archived_at && (
              <details>
                <summary className="cursor-pointer text-sm font-medium text-brand-600 dark:text-brand-100">Thêm lịch</summary>
                <div className="mt-3"><EventForm groupId={group.id} /></div>
              </details>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Thành viên ({members?.length ?? 0})</h2>
            {canManage && <div className="mb-4"><AddMemberForm groupId={group.id} canAssignRole={isLead} /></div>}
            <table className="table">
              <thead>
                <tr><th>Người dùng</th><th>Trưởng nhóm</th><th>Văn thư</th>{EDIT_PERMS.map(([k, l]) => <th key={k}>{l}</th>)}{canManage && <th />}</tr>
              </thead>
              <tbody>
                {(members ?? []).map((m) => {
                  const p = person.get(m.user_id);
                  const formId = `m-${m.user_id}`;
                  const canEditRow = canManage && (isLead || (!m.is_manager && !m.is_clerk));
                  return (
                    <tr key={m.user_id}>
                      <td>
                        <Link href={`/nguoi/${m.user_id}`} className="font-medium hover:underline">{p?.full_name || p?.email}</Link>
                        <div className="text-xs muted">{p?.email}{p ? ` · ${ROLE_LABEL[p.system_role]}` : ''}{p && !p.is_active ? ' · Đã khóa' : ''}</div>
                        {canEditRow && (
                          <form id={formId} action={updateMember}>
                            <input type="hidden" name="group_id" value={group.id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            {isLead && <input type="hidden" name="role_editable" value="1" />}
                          </form>
                        )}
                      </td>
                      <td><input type="checkbox" name="is_manager" form={formId} defaultChecked={m.is_manager} disabled={!isLead} aria-label="Trưởng nhóm" /></td>
                      <td><input type="checkbox" name="is_clerk" form={formId} defaultChecked={m.is_clerk} disabled={!isLead} aria-label="Văn thư" /></td>
                      {EDIT_PERMS.map(([k, l]) => (
                        <td key={k}><input type="checkbox" name={k} form={formId} defaultChecked={m[k]} disabled={!canEditRow} aria-label={l} /></td>
                      ))}
                      {canManage && !canEditRow && <td />}
                      {canEditRow && (
                        <td className="whitespace-nowrap">
                          <button form={formId} className="btn-secondary px-2 py-1 text-xs">Lưu</button>{' '}
                          <form action={removeMember} className="inline">
                            <input type="hidden" name="group_id" value={group.id} />
                            <input type="hidden" name="user_id" value={m.user_id} />
                            <button className="px-2 py-1 text-xs text-red-600 hover:underline dark:text-red-400">Gỡ</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs muted">Trưởng nhóm luôn có đủ quyền. Trưởng nhóm và Văn thư mời, thêm và gỡ thành viên; chỉ Trưởng nhóm bổ nhiệm hoặc gỡ Trưởng nhóm và Văn thư. Quyền tạo, sửa và tải tài liệu áp dụng cho đầu việc, lịch và tài liệu của nhóm.</p>
          </section>

          {canManage && Boolean(invites?.length) && (
            <section className="card">
              <h2 className="mb-2 font-semibold">Lời mời chưa nhận ({invites!.length})</h2>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {invites!.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <span>{i.email}{i.is_manager ? ' · Trưởng nhóm' : i.is_clerk ? ' · Văn thư' : ''} <span className="muted">· hết hạn {fmtDateTime(i.expires_at)}</span></span>
                    <form action={cancelInvitation}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="group_id" value={group.id} />
                      <button className="text-xs text-red-600 hover:underline dark:text-red-400">Hủy lời mời</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {canManage && <EditGroupForm group={group} />}
          {canManage && (
            <form action={setArchived} className="card">
              <input type="hidden" name="id" value={group.id} />
              <input type="hidden" name="archive" value={group.archived_at ? '0' : '1'} />
              <p className="mb-2 text-sm muted">{group.archived_at ? 'Nhóm đang lưu trữ. Khôi phục để dùng lại.' : 'Lưu trữ nhóm khi không còn hoạt động. Dữ liệu không bị xóa.'}</p>
              <button className="btn-secondary">{group.archived_at ? 'Khôi phục nhóm' : 'Lưu trữ nhóm'}</button>
            </form>
          )}
          <section className="card">
            <h2 className="mb-2 font-semibold">Hoạt động gần đây</h2>
            {log?.length ? (
              <ul className="space-y-1.5 text-sm">
                {log.map((l) => (
                  <li key={l.id}><span className="muted">{fmtDateTime(l.at)}</span> · {name(l.actor_id)} {ACTION[l.action] ?? l.action} {ENTITY[l.entity_type] ?? l.entity_type}</li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Chưa có hoạt động.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

const ACTION: Record<string, string> = { insert: 'thêm', update: 'sửa', delete: 'xóa' };
const ENTITY: Record<string, string> = { groups: 'thông tin nhóm', group_members: 'thành viên', invitations: 'lời mời', tasks: 'đầu việc', events: 'lịch' };
