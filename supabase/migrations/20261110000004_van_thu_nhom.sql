-- Vai trò trong nhóm: Trưởng nhóm (is_manager) và Văn thư (is_clerk).
-- Chỉ hai vai trò này có quyền mời, thêm và gỡ thành viên (can_manage_members
-- được tính tự động, không tích tay được nữa).
-- Văn thư chỉ thêm, sửa, gỡ thành viên thường; chỉ Trưởng nhóm, quản trị hệ thống
-- và thư ký toàn trường mới bổ nhiệm hoặc gỡ Trưởng nhóm và Văn thư.

alter table public.group_members add column is_clerk boolean not null default false;
alter table public.invitations add column is_clerk boolean not null default false;

-- Giữ quyền cho người đang có quyền quản lý thành viên mà không phải trưởng nhóm.
update public.group_members set is_clerk = true where can_manage_members and not is_manager;

create or replace function private.normalize_member()
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
  end if;
  if new.is_clerk then
    new.can_view := true;
  end if;
  new.can_manage_members := new.is_manager or new.is_clerk;
  return new;
end;
$$;

-- Người dẫn dắt nhóm: quản trị, thư ký toàn trường, hoặc Trưởng nhóm.
create function private.is_group_lead(gid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_admin()
    or private.is_all_scope_secretary()
    or exists (select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid() and m.is_manager)
  );
$$;
grant execute on function private.is_group_lead(uuid) to authenticated;

-- Chặn Văn thư (và người khác không phải trưởng nhóm) đụng tới Trưởng nhóm/Văn thư.
-- Thao tác do hàm hệ thống (đăng ký, tạo nhóm) thực hiện thì không bị kiểm tra.
create function private.guard_member_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  gid uuid := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
begin
  if current_user <> 'authenticated' or private.is_group_lead(gid) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and (old.is_manager or old.is_clerk) then
    raise exception 'Chỉ Trưởng nhóm mới sửa hoặc gỡ Trưởng nhóm và Văn thư' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (new.is_manager or new.is_clerk) then
    raise exception 'Chỉ Trưởng nhóm mới bổ nhiệm Trưởng nhóm hoặc Văn thư' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger group_members_guard before insert or update or delete on public.group_members
  for each row execute function private.guard_member_roles();

-- Lời mời: chỉ Trưởng nhóm (hoặc quản trị, thư ký toàn trường) mời người làm Trưởng nhóm hay Văn thư.
alter policy invitations_insert on public.invitations
  with check (
    not make_admin
    and accepted_at is null
    and private.is_active_user()
    and private.email_domain_allowed(email)
    and (
      private.is_admin()
      or (
        system_role = 'member'
        and (group_id is null or private.has_group_perm(group_id, 'view'))
        and (not (is_manager or is_clerk) or (group_id is not null and private.is_group_lead(group_id)))
      )
    )
  );

-- Đăng ký: mang theo vai trò Văn thư từ lời mời.
create or replace function private.handle_new_user()
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

  insert into public.group_members (group_id, user_id, is_manager, is_clerk, can_view, can_create, can_edit, can_upload)
  select i.group_id, new.id, i.is_manager, i.is_clerk, g.default_can_view, g.default_can_create, g.default_can_edit, g.default_can_upload
  from public.invitations i
  join public.groups g on g.id = i.group_id
  where i.email = addr and i.accepted_at is null and i.expires_at > now()
  on conflict do nothing;

  update public.invitations set accepted_at = now()
  where email = addr and accepted_at is null;

  return new;
end;
$$;
