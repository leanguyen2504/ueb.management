-- Hiệu trưởng chỉ xem tổng quan: danh sách nhóm, dự án đang có và tiến độ chung.
-- Không còn tự động xem, tạo, sửa bên trong mọi nhóm (đầu việc, lịch, tài liệu, thành viên)
-- và không xem nhật ký hoạt động. Ở nhóm mà Hiệu trưởng được thêm làm thành viên thì vẫn
-- có quyền như mọi thành viên khác. Việc được giao cho Hiệu trưởng vẫn hiện với Hiệu trưởng.

-- 1. Quyền trong nhóm: bỏ nhánh Hiệu trưởng, quay về quyền thành viên ---------------------
create or replace function private.has_group_perm(gid uuid, perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then false
    when exists (select 1 from public.groups g where g.id = gid and g.owner_id is not null)
      then exists (select 1 from public.groups g where g.id = gid and g.owner_id = auth.uid())
    when private.is_admin() then true
    when private.is_all_scope_secretary() then true
    else exists (
      select 1 from public.group_members m
      where m.group_id = gid and m.user_id = auth.uid()
        and case perm
          when 'view' then m.can_view
          when 'create' then m.can_create
          when 'edit' then m.can_edit
          when 'upload' then m.can_upload
          when 'manage_members' then m.can_manage_members
          else false
        end
    )
  end;
$$;

-- 2. Hiệu trưởng vẫn thấy thông tin chung của mọi nhóm, dự án (tên, mô tả, loại, nhóm cha),
--    trừ không gian cá nhân. Bên trong nhóm vẫn do has_group_perm giữ kín.
drop policy groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated
  using (
    private.has_group_perm(id, 'view')
    or (owner_id is null and private.is_principal() and private.is_active_user())
  );

-- 3. Nhật ký: chỉ quản trị xem toàn bộ; người khác xem nhật ký nhóm mình xem được.
drop policy log_read on public.activity_log;
create policy log_read on public.activity_log for select to authenticated
  using (
    private.is_admin()
    or (group_id is not null and private.has_group_perm(group_id, 'view'))
  );

-- 4. Tiến độ chung: chỉ số liệu tổng hợp theo nhóm, không có tên việc, người làm hay tài liệu.
--    Hiệu trưởng, quản trị và thư ký toàn trường thấy mọi nhóm; người khác thấy nhóm mình xem được.
create function public.progress_overview()
returns table (
  id uuid, name text, kind text, unit_category text, parent_id uuid, parent_name text,
  member_count integer, task_total integer, task_todo integer, task_doing integer,
  task_done integer, task_overdue integer, avg_progress integer,
  next_due date, last_activity timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with today as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date as d)
  select g.id, g.name, g.kind::text, g.unit_category, g.parent_id, p.name,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    coalesce(s.total, 0), coalesce(s.todo, 0), coalesce(s.doing, 0), coalesce(s.done, 0),
    coalesce(s.overdue, 0), s.avg_progress, s.next_due,
    greatest(g.updated_at, s.last_update)
  from public.groups g
  left join public.groups p on p.id = g.parent_id
  left join lateral (
    select count(*)::int as total,
      count(*) filter (where t.status = 'todo')::int as todo,
      count(*) filter (where t.status in ('doing', 'review'))::int as doing,
      count(*) filter (where t.status = 'done')::int as done,
      count(*) filter (where t.status <> 'done' and t.due_date < (select d from today))::int as overdue,
      round(avg(case when t.status = 'done' then 100 else coalesce(t.progress, 0) end))::int as avg_progress,
      min(t.due_date) filter (where t.status <> 'done' and t.due_date >= (select d from today)) as next_due,
      max(t.updated_at) as last_update
    from public.tasks t where t.group_id = g.id
  ) s on true
  where private.is_active_user()
    and g.archived_at is null
    and g.owner_id is null
    and (
      private.is_admin() or private.is_principal() or private.is_all_scope_secretary()
      or private.has_group_perm(g.id, 'view')
    )
  order by g.name;
$$;
revoke execute on function public.progress_overview() from public, anon;
grant execute on function public.progress_overview() to authenticated;
