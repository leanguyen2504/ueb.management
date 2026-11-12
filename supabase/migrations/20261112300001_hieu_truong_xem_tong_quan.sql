-- Hiệu trưởng chỉ xem danh sách nhóm, dự án, sự kiện và lãnh đạo, đầu mối liên hệ.
-- Không xem tiến độ, đầu việc, lịch, tài liệu, thành viên bên trong; không tạo, sửa;
-- không xem nhật ký hoạt động. Ở nhóm mà Hiệu trưởng được thêm làm thành viên thì vẫn
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

-- 4. Danh bạ nhóm: Hiệu trưởng (ở nhóm không là thành viên) không thấy số việc đang mở
--    và tên các việc. Tên, mô tả, loại, số thành viên, lãnh đạo và đầu mối vẫn thấy.
create function private.principal_outside(gid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_principal() and not private.has_group_perm(gid, 'view');
$$;
grant execute on function private.principal_outside(uuid) to authenticated;

create or replace function public.group_directory()
returns table (
  id uuid, name text, description text, kind text, parent_id uuid, parent_name text,
  member_count integer, open_tasks integer, is_member boolean, can_view boolean,
  my_role text, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select g.id, g.name, g.description, g.kind::text, g.parent_id, p.name,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    case when private.principal_outside(g.id) then null
      else (select count(*)::int from public.tasks t where t.group_id = g.id and t.status <> 'done') end,
    exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
    private.has_group_perm(g.id, 'view'),
    (select case when m.is_manager then 'Trưởng nhóm' when m.is_clerk then 'Văn thư' else 'Thành viên' end
       from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
    g.updated_at
  from public.groups g
  left join public.groups p on p.id = g.parent_id
  where private.is_active_user() and g.archived_at is null and g.owner_id is null
  order by g.name;
$$;

create or replace function public.group_open_task_titles(p_group uuid)
returns table (id uuid, title text, due_date date, has_assignee boolean)
language sql stable security definer
set search_path = ''
as $$
  select t.id, t.title, t.due_date, t.assignee_id is not null
  from public.tasks t
  join public.groups g on g.id = t.group_id and g.archived_at is null and g.owner_id is null
  where private.is_active_user() and t.group_id = p_group and t.status <> 'done'
    and not private.principal_outside(p_group)
  order by t.due_date nulls last, t.title
  limit 100;
$$;
