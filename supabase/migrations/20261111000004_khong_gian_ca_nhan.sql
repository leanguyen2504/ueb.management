-- Không gian cá nhân: mỗi người có nhóm "Cá nhân" riêng và các dự án cá nhân con
-- (ví dụ "Nghiên cứu khoa học cá nhân"). Chỉ chủ sở hữu xem và sửa được; quản trị,
-- Hiệu trưởng và thư ký toàn quyền cũng không thấy. Không hiện trong danh bạ nhóm.
-- Thêm ngày bắt đầu và % tiến độ cho đầu việc để theo dõi tiến độ.

-- 1. Cột --------------------------------------------------------------------------------
alter table public.groups add column owner_id uuid references public.profiles (id) on delete cascade;
create index groups_owner_idx on public.groups (owner_id) where owner_id is not null;
-- Mỗi người một nhóm gốc "Cá nhân".
create unique index groups_personal_root_idx on public.groups (owner_id) where owner_id is not null and parent_id is null;

alter table public.tasks add column start_date date;
alter table public.tasks add column progress smallint check (progress between 0 and 100);
alter table public.tasks add constraint tasks_dates_check check (start_date is null or due_date is null or start_date <= due_date);

-- 2. Quyền: nhóm cá nhân chỉ chủ sở hữu ------------------------------------------------
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
    -- Hiệu trưởng xem, tạo, sửa ở mọi nhóm nhưng không quản lý thành viên.
    when private.is_principal() then perm <> 'manage_members'
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

create function private.is_personal(gid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.groups g where g.id = gid and g.owner_id is not null);
$$;
grant execute on function private.is_personal(uuid) to authenticated;

-- 3. Ràng buộc ---------------------------------------------------------------------------
-- Nhóm con của nhóm cá nhân cũng là cá nhân, cùng chủ. Không tự gắn owner_id ở nơi khác.
create function private.check_personal_group()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is not null then
    select g.owner_id into parent_owner from public.groups g where g.id = new.parent_id;
  end if;
  if tg_op = 'INSERT' then
    if parent_owner is not null then
      new.owner_id := parent_owner;
      new.kind := 'other';
    elsif new.owner_id is not null and coalesce(current_setting('ueb.personal', true), '') <> 'on' then
      raise exception 'Không gian cá nhân chỉ tạo qua hàm riêng' using errcode = '42501';
    end if;
  else
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Không đổi chủ của không gian cá nhân' using errcode = '42501';
    end if;
    if new.parent_id is distinct from old.parent_id
       and (old.owner_id is not null or parent_owner is not null) then
      raise exception 'Không chuyển không gian cá nhân' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger groups_personal before insert or update on public.groups
  for each row execute function private.check_personal_group();

-- Chỉ chủ sở hữu là thành viên của nhóm cá nhân.
create function private.check_personal_member()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.groups g where g.id = new.group_id and g.owner_id is not null and g.owner_id <> new.user_id) then
    raise exception 'Không gian cá nhân không thêm người khác' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_personal before insert or update on public.group_members
  for each row execute function private.check_personal_member();

-- Việc cá nhân chỉ giao cho chính chủ.
create function private.check_personal_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o uuid;
begin
  select g.owner_id into o from public.groups g where g.id = new.group_id;
  if o is not null and new.assignee_id is not null and new.assignee_id <> o then
    raise exception 'Việc cá nhân chỉ giao cho chính bạn' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tasks_personal before insert or update on public.tasks
  for each row execute function private.check_personal_task();

-- Không xin tham gia, không gắn đơn vị cho không gian cá nhân.
create function private.reject_personal_group()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if private.is_personal(new.group_id) then
    raise exception 'Không áp dụng cho không gian cá nhân' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger join_requests_personal before insert on public.join_requests
  for each row execute function private.reject_personal_group();
create trigger group_units_personal before insert on public.group_units
  for each row execute function private.reject_personal_group();

-- Nhật ký: không ghi thay đổi trong không gian cá nhân (quản trị xem được toàn bộ nhật ký).
create or replace function private.log_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  gid uuid;
  eid text;
begin
  gid := case when tg_table_name = 'groups' then (rec ->> 'id')::uuid else (rec ->> 'group_id')::uuid end;
  if tg_table_name = 'groups' and rec ->> 'owner_id' is not null then
    return null;
  end if;
  if gid is not null and tg_table_name <> 'groups' and private.is_personal(gid) then
    return null;
  end if;
  eid := coalesce(rec ->> 'id', rec ->> 'user_id');
  if tg_table_name = 'group_members' then
    eid := (rec ->> 'group_id') || ':' || (rec ->> 'user_id');
  end if;
  insert into public.activity_log (actor_id, action, entity_type, entity_id, group_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    eid,
    gid,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

-- 4. Danh bạ bỏ qua không gian cá nhân ---------------------------------------------------
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
    (select count(*)::int from public.tasks t where t.group_id = g.id and t.status <> 'done'),
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

create or replace function public.group_contacts(p_group uuid)
returns table (user_id uuid, full_name text, email text, "position" text, phone text, office text, role text)
language sql stable security definer
set search_path = ''
as $$
  select pr.id, pr.full_name, pr.email, pr.position, pr.phone, pr.office,
    case when m.is_manager then 'Trưởng nhóm' else 'Đầu mối liên hệ' end
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id and pr.is_active
  where private.is_active_user() and m.group_id = p_group and (m.is_manager or m.is_clerk)
    and not private.is_personal(p_group)
  order by m.is_manager desc, pr.full_name;
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
  order by t.due_date nulls last, t.title
  limit 100;
$$;

-- 5. Tạo không gian cá nhân ------------------------------------------------------------
-- Trả về nhóm gốc "Cá nhân" của người đang đăng nhập, tạo nếu chưa có.
create function public.my_personal_group()
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select g.id into gid from public.groups g where g.owner_id = uid and g.parent_id is null;
  if gid is null then
    perform set_config('ueb.personal', 'on', true);
    insert into public.groups (name, kind, owner_id, description, default_can_view, default_can_create, default_can_edit, default_can_upload)
    values ('Cá nhân', 'other', uid, 'Việc và lịch riêng của bạn. Chỉ bạn xem được.', true, true, true, true)
    on conflict do nothing
    returning id into gid;
    perform set_config('ueb.personal', '', true);
    if gid is null then
      select g.id into gid from public.groups g where g.owner_id = uid and g.parent_id is null;
    end if;
  end if;
  -- add_group_creator đã thêm người tạo làm Trưởng nhóm; bảo đảm có dòng thành viên.
  insert into public.group_members (group_id, user_id, is_manager) values (gid, uid, true) on conflict do nothing;
  return gid;
end;
$$;
revoke execute on function public.my_personal_group() from public, anon;
grant execute on function public.my_personal_group() to authenticated;

-- Tạo một dự án cá nhân (nhóm con của "Cá nhân").
create function public.create_personal_project(p_name text, p_description text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  root uuid := public.my_personal_group();
  gid uuid;
begin
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'Tên dự án từ 1 đến 200 ký tự' using errcode = '22023';
  end if;
  insert into public.groups (name, kind, parent_id, description, default_can_view, default_can_create, default_can_edit, default_can_upload)
  values (trim(p_name), 'other', root, nullif(trim(coalesce(p_description, '')), ''), true, true, true, true)
  returning id into gid;
  insert into public.group_members (group_id, user_id, is_manager) values (gid, auth.uid(), true) on conflict do nothing;
  return gid;
end;
$$;
revoke execute on function public.create_personal_project(text, text) from public, anon;
grant execute on function public.create_personal_project(text, text) to authenticated;
