-- Chia sẻ báo cáo Jira cá nhân cho người liên quan (tự nguyện).
-- Mặc định dữ liệu Jira vẫn chỉ chủ tài khoản xem được. Mỗi người tự chọn chia sẻ cho:
--   leads:   Trưởng nhóm và Văn thư của các nhóm/đơn vị/dự án mình đang tham gia;
--   members: mọi thành viên các nhóm/đơn vị/dự án chung.
-- Người được chia sẻ chỉ đọc qua các hàm bên dưới, với các cột đã lược bớt
-- (không có comment, lời nhắc tên, lịch sử chuyển trạng thái). Bảng gốc vẫn giữ RLS "chỉ chủ".
-- Không tính nhóm cá nhân và nhóm đã lưu trữ. Ngắt kết nối Jira thì chia sẻ cũng mất.

alter table public.jira_accounts add column share_scope text not null default 'none'
  check (share_scope in ('none', 'leads', 'members'));

-- Người đang đăng nhập xem được dữ liệu Jira của p_owner không.
create function private.can_view_jira(p_owner uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    p_owner = auth.uid()
    or exists (
      select 1
      from public.jira_accounts a
      join public.profiles p on p.id = a.user_id and p.is_active
      join public.group_members mo on mo.user_id = a.user_id
      join public.groups g on g.id = mo.group_id and g.archived_at is null and g.owner_id is null
      join public.group_members mv on mv.group_id = g.id and mv.user_id = auth.uid()
      where a.user_id = p_owner
        and (a.share_scope = 'members' or (a.share_scope = 'leads' and (mv.is_manager or mv.is_clerk)))
    )
  );
$$;

-- Chủ tài khoản đổi phạm vi chia sẻ của mình.
create function public.jira_set_share(p_scope text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động';
  end if;
  if p_scope is null or p_scope not in ('none', 'leads', 'members') then
    raise exception 'Phạm vi chia sẻ không hợp lệ';
  end if;
  update public.jira_accounts set share_scope = p_scope, updated_at = now() where user_id = auth.uid();
  if not found then
    raise exception 'Bạn chưa kết nối Jira';
  end if;
end;
$$;

-- Những người (kể cả mình) mà mình xem được báo cáo Jira, kèm các nhóm chung cho phép xem.
create function public.jira_related_people()
returns table (
  user_id uuid, full_name text, email text, unit text, "position" text, is_me boolean, share_scope text,
  last_synced_at timestamptz, jira_display_name text, custom_field_names text[], groups jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select a.user_id, p.full_name, p.email, p.unit, p.position, a.user_id = auth.uid(), a.share_scope,
    a.last_synced_at, a.jira_display_name, a.custom_field_names,
    coalesce((
      select jsonb_agg(distinct jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind))
      from public.group_members mo
      join public.groups g on g.id = mo.group_id and g.archived_at is null and g.owner_id is null
      join public.group_members mv on mv.group_id = g.id and mv.user_id = auth.uid()
      where mo.user_id = a.user_id
        and (a.user_id = auth.uid() or a.share_scope = 'members' or (a.share_scope = 'leads' and (mv.is_manager or mv.is_clerk)))
    ), '[]')
  from public.jira_accounts a
  join public.profiles p on p.id = a.user_id and p.is_active
  where a.last_synced_at is not null and private.can_view_jira(a.user_id);
$$;

-- Mã việc của những người được phép xem (đã lược bớt cột).
create function public.jira_related_issues(p_users uuid[])
returns table (
  user_id uuid, issue_key text, summary text, status text, status_category text, issue_type text, project_key text,
  project_name text, priority text, assignee_name text, reporter_name text, is_assignee boolean, is_reporter boolean,
  is_watcher boolean, has_my_worklog boolean, created_at_jira timestamptz, updated_at_jira timestamptz,
  resolved_at timestamptz, due_date date, my_seconds int, start_date date, original_estimate int, remaining_estimate int,
  time_spent int, parent_key text, parent_summary text, epic_key text, subtask_total int, subtask_done int,
  reopen_count int, sprint text, fix_versions text[], labels text[], components text[], custom jsonb
)
language sql stable security definer
set search_path = ''
as $$
  select i.user_id, i.issue_key, i.summary, i.status, i.status_category, i.issue_type, i.project_key, i.project_name,
    i.priority, i.assignee_name, i.reporter_name, i.is_assignee, i.is_reporter, i.is_watcher, i.has_my_worklog,
    i.created_at_jira, i.updated_at_jira, i.resolved_at, i.due_date, i.my_seconds, i.start_date, i.original_estimate,
    i.remaining_estimate, i.time_spent, i.parent_key, i.parent_summary, i.epic_key, i.subtask_total, i.subtask_done,
    i.reopen_count, i.sprint, i.fix_versions, i.labels, i.components, i.custom
  from public.jira_issues i
  where i.user_id in (select u from unnest(p_users) u where private.can_view_jira(u))
  limit 50000;
$$;

-- Worklog trong khoảng [p_from, p_to) của những người được phép xem.
create function public.jira_related_worklogs(p_users uuid[], p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, worklog_id text, issue_key text, started_at timestamptz, seconds int, comment text)
language sql stable security definer
set search_path = ''
as $$
  select w.user_id, w.worklog_id, w.issue_key, w.started_at, w.seconds, w.comment
  from public.jira_worklogs w
  where w.user_id in (select u from unnest(p_users) u where private.can_view_jira(u))
    and w.started_at >= p_from and w.started_at < p_to
  order by w.started_at
  limit 100000;
$$;

revoke all on function private.can_view_jira(uuid) from public, anon;
grant execute on function private.can_view_jira(uuid) to authenticated;
revoke all on function public.jira_set_share(text), public.jira_related_people(), public.jira_related_issues(uuid[]),
  public.jira_related_worklogs(uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.jira_set_share(text), public.jira_related_people(), public.jira_related_issues(uuid[]),
  public.jira_related_worklogs(uuid[], timestamptz, timestamptz) to authenticated;
