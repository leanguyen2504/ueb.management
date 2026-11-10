-- Giai đoạn 1: nền tảng.
-- Người dùng, lời mời, nhóm, quyền theo nhóm, phạm vi thư ký, nhật ký hoạt động.
-- Mọi bảng bật RLS; quyền thật sự được kiểm tra tại đây, không chỉ trên giao diện.

create schema if not exists private;
revoke all on schema private from public;
-- Chính sách RLS cần gọi các hàm trong private. PostgREST chỉ mở schema public,
-- nên trình duyệt không gọi trực tiếp được các hàm này.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Kiểu dữ liệu
-- ---------------------------------------------------------------------------

create type public.system_role as enum ('principal', 'secretary', 'member');
create type public.group_kind as enum ('unit', 'project', 'event', 'other');

-- ---------------------------------------------------------------------------
-- Hàm dùng chung cho cột lịch sử
-- ---------------------------------------------------------------------------

create function private.set_audit_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

-- Cấu hình chung, luôn đúng một dòng.
create table public.system_settings (
  id boolean primary key default true check (id),
  current_admin_id uuid references auth.users (id),
  allowed_email_domains text[] not null default array['vnu.edu.vn'],
  timezone text not null default 'Asia/Ho_Chi_Minh',
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.system_settings default values;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  email text not null unique check (email = lower(email)),
  full_name text not null default '',
  unit text,
  position text,
  system_role public.system_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  kind public.group_kind not null default 'unit',
  parent_id uuid references public.groups (id),
  description text,
  -- Quyền mặc định cho thành viên mới của nhóm.
  default_can_view boolean not null default true,
  default_can_create boolean not null default false,
  default_can_edit boolean not null default false,
  default_can_upload boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_manager boolean not null default false,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_upload boolean not null default false,
  can_manage_members boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- Thư ký được cấp phạm vi "tất cả nhóm".
create table public.secretary_scopes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  all_groups boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%_@_%'),
  system_role public.system_role not null default 'member',
  -- Chỉ dùng khi khởi tạo quản trị hệ thống lần đầu.
  make_admin boolean not null default false,
  group_id uuid references public.groups (id) on delete cascade,
  is_manager boolean not null default false,
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index invitations_email_idx on public.invitations (email) where accepted_at is null;

-- Nhật ký chỉ được thêm bởi trigger; không ai sửa hay xóa.
create table public.activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  group_id uuid,
  old_data jsonb,
  new_data jsonb
);
create index activity_log_at_idx on public.activity_log (at desc);
create index activity_log_group_idx on public.activity_log (group_id, at desc);

-- ---------------------------------------------------------------------------
-- Hàm kiểm tra quyền (dùng trong chính sách RLS)
-- ---------------------------------------------------------------------------

create function private.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.system_settings s where s.current_admin_id = auth.uid())
     and private.is_active_user();
$$;

create function private.my_role()
returns public.system_role
language sql stable security definer
set search_path = ''
as $$
  select p.system_role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create function private.is_principal()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'principal', false);
$$;

create function private.is_all_scope_secretary()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'secretary', false)
     and exists (select 1 from public.secretary_scopes s where s.user_id = auth.uid() and s.all_groups);
$$;

-- perm: view | create | edit | upload | manage_members
create function private.has_group_perm(gid uuid, perm text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then false
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

create function private.can_create_group()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce(private.my_role() = 'secretary', false);
$$;

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------

create trigger profiles_audit before insert or update on public.profiles
  for each row execute function private.set_audit_columns();
create trigger groups_audit before insert or update on public.groups
  for each row execute function private.set_audit_columns();
create trigger group_members_audit before insert or update on public.group_members
  for each row execute function private.set_audit_columns();
create trigger secretary_scopes_audit before insert or update on public.secretary_scopes
  for each row execute function private.set_audit_columns();
create trigger invitations_audit before insert or update on public.invitations
  for each row execute function private.set_audit_columns();

-- Người quản lý nhóm luôn có đủ quyền trong nhóm.
create function private.normalize_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_manager then
    new.can_view := true;
    new.can_create := true;
    new.can_edit := true;
    new.can_upload := true;
    new.can_manage_members := true;
  end if;
  return new;
end;
$$;
create trigger group_members_normalize before insert or update on public.group_members
  for each row execute function private.normalize_member();

-- Người tạo nhóm trở thành người quản lý nhóm.
create function private.add_group_creator()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.group_members (group_id, user_id, is_manager)
    values (new.id, auth.uid(), true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger groups_add_creator after insert on public.groups
  for each row execute function private.add_group_creator();

-- Ghi nhật ký mọi thay đổi.
create function private.log_change()
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

create trigger profiles_log after insert or update or delete on public.profiles
  for each row execute function private.log_change();
create trigger groups_log after insert or update or delete on public.groups
  for each row execute function private.log_change();
create trigger group_members_log after insert or update or delete on public.group_members
  for each row execute function private.log_change();
create trigger secretary_scopes_log after insert or update or delete on public.secretary_scopes
  for each row execute function private.log_change();
create trigger invitations_log after insert or update or delete on public.invitations
  for each row execute function private.log_change();
create trigger system_settings_log after update on public.system_settings
  for each row execute function private.log_change();

-- Tạo hồ sơ khi có tài khoản mới. Chặn email ngoài tên miền cho phép
-- hoặc chưa được mời.
create function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  settings public.system_settings;
  addr text := lower(new.email);
  inv public.invitations;
begin
  select * into settings from public.system_settings;
  if addr is null or not (split_part(addr, '@', 2) = any (settings.allowed_email_domains)) then
    raise exception 'Email % không thuộc tên miền được phép', addr;
  end if;

  select * into inv from public.invitations i
  where i.email = addr and i.accepted_at is null and i.expires_at > now()
  order by i.make_admin desc, i.created_at
  limit 1;
  if inv.id is null then
    raise exception 'Email % chưa được mời vào hệ thống', addr;
  end if;

  insert into public.profiles (id, email, full_name, system_role)
  values (new.id, addr, coalesce(new.raw_user_meta_data ->> 'full_name', ''), inv.system_role);

  if inv.make_admin and settings.current_admin_id is null then
    update public.system_settings set current_admin_id = new.id, updated_at = now();
  end if;

  insert into public.group_members (group_id, user_id, is_manager, can_view, can_create, can_edit, can_upload)
  select i.group_id, new.id, i.is_manager, g.default_can_view, g.default_can_create, g.default_can_edit, g.default_can_upload
  from public.invitations i
  join public.groups g on g.id = i.group_id
  where i.email = addr and i.accepted_at is null and i.expires_at > now()
  on conflict do nothing;

  update public.invitations set accepted_at = now()
  where email = addr and accepted_at is null;

  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.system_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.secretary_scopes enable row level security;
alter table public.invitations enable row level security;
alter table public.activity_log enable row level security;

-- Khách chưa đăng nhập không đọc được gì.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- system_settings: đọc được; chỉ đổi qua hàm (bàn giao ở giai đoạn 4).
revoke insert, update, delete on public.system_settings from authenticated;
create policy settings_read on public.system_settings for select to authenticated
  using (private.is_active_user());

-- profiles: người dùng đang hoạt động xem được danh bạ; tự sửa tên, đơn vị, chức vụ.
-- Đổi vai trò hoặc khóa tài khoản chỉ qua hàm admin_set_user.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, unit, position) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (private.is_active_user() or id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.is_active_user())
  with check (id = auth.uid());

-- groups
revoke delete on public.groups from authenticated;
create policy groups_read on public.groups for select to authenticated
  using (private.has_group_perm(id, 'view'));
create policy groups_insert on public.groups for insert to authenticated
  with check (private.can_create_group());
create policy groups_update on public.groups for update to authenticated
  using (private.has_group_perm(id, 'manage_members'))
  with check (private.has_group_perm(id, 'manage_members'));

-- group_members
create policy members_read on public.group_members for select to authenticated
  using (user_id = auth.uid() or private.has_group_perm(group_id, 'view'));
create policy members_insert on public.group_members for insert to authenticated
  with check (private.has_group_perm(group_id, 'manage_members'));
create policy members_update on public.group_members for update to authenticated
  using (private.has_group_perm(group_id, 'manage_members'))
  with check (private.has_group_perm(group_id, 'manage_members'));
create policy members_delete on public.group_members for delete to authenticated
  using (private.has_group_perm(group_id, 'manage_members'));

-- secretary_scopes: chỉ đổi qua admin_set_secretary_scope.
revoke insert, update, delete on public.secretary_scopes from authenticated;
create policy scopes_read on public.secretary_scopes for select to authenticated
  using (private.is_active_user());

-- invitations: quản trị mời mọi vai trò; người quản lý thành viên của nhóm
-- mời thành viên thường vào nhóm của mình.
revoke update on public.invitations from authenticated;
create policy invitations_read on public.invitations for select to authenticated
  using (private.is_admin() or (group_id is not null and private.has_group_perm(group_id, 'manage_members')));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    not make_admin
    and accepted_at is null
    and (
      private.is_admin()
      or (system_role = 'member' and group_id is not null and private.has_group_perm(group_id, 'manage_members'))
    )
  );
create policy invitations_delete on public.invitations for delete to authenticated
  using (accepted_at is null and (private.is_admin() or (group_id is not null and private.has_group_perm(group_id, 'manage_members'))));

-- activity_log: quản trị và Hiệu trưởng xem toàn bộ; người khác xem nhật ký nhóm mình xem được.
revoke insert, update, delete on public.activity_log from authenticated;
create policy log_read on public.activity_log for select to authenticated
  using (
    private.is_admin() or private.is_principal()
    or (group_id is not null and private.has_group_perm(group_id, 'view'))
  );

-- ---------------------------------------------------------------------------
-- Hàm dành cho quản trị hệ thống
-- ---------------------------------------------------------------------------

create function public.admin_set_user(p_user uuid, p_role public.system_role, p_active boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Chỉ quản trị hệ thống được đổi vai trò người dùng' using errcode = '42501';
  end if;
  if p_user = auth.uid() and not p_active then
    raise exception 'Quản trị hệ thống không tự khóa tài khoản của mình' using errcode = '42501';
  end if;
  update public.profiles set system_role = p_role, is_active = p_active where id = p_user;
  if p_role <> 'secretary' then
    delete from public.secretary_scopes where user_id = p_user;
  end if;
end;
$$;

create function public.admin_set_secretary_scope(p_user uuid, p_all_groups boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Chỉ quản trị hệ thống được cấp phạm vi thư ký' using errcode = '42501';
  end if;
  if p_all_groups then
    if not exists (select 1 from public.profiles where id = p_user and system_role = 'secretary') then
      raise exception 'Người dùng này không phải thư ký';
    end if;
    insert into public.secretary_scopes (user_id, all_groups) values (p_user, true)
    on conflict (user_id) do update set all_groups = true;
  else
    delete from public.secretary_scopes where user_id = p_user;
  end if;
end;
$$;

-- Thông tin quyền của người đang đăng nhập, dùng để ẩn/hiện nút trên giao diện.
create function public.my_context()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_active', private.is_active_user(),
    'is_admin', private.is_admin(),
    'role', private.my_role(),
    'all_groups_secretary', private.is_all_scope_secretary(),
    'can_create_group', private.can_create_group()
  );
$$;

revoke execute on function public.admin_set_user(uuid, public.system_role, boolean) from public, anon;
revoke execute on function public.admin_set_secretary_scope(uuid, boolean) from public, anon;
revoke execute on function public.my_context() from public, anon;
grant execute on function public.admin_set_user(uuid, public.system_role, boolean) to authenticated;
grant execute on function public.admin_set_secretary_scope(uuid, boolean) to authenticated;
grant execute on function public.my_context() to authenticated;
