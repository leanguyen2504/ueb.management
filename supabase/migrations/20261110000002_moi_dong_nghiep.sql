-- Chỉ người được mời mới đăng ký được (bỏ cơ chế tự đăng ký của 20261110000001).
-- Mọi người dùng đang hoạt động đều mời được đồng nghiệp cùng tên miền làm
-- thành viên thường, kèm một nhóm đề xuất trong số các nhóm mình xem được.
-- Người được mời vào nhóm với quyền mặc định của nhóm. Chỉ người có quyền
-- quản lý thành viên của nhóm mới mời được người khác làm quản lý nhóm.
-- Quản trị hệ thống mời được mọi vai trò.

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

create or replace function private.email_domain_allowed(addr text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select split_part(lower(addr), '@', 2) = any (s.allowed_email_domains) from public.system_settings s;
$$;
grant execute on function private.email_domain_allowed(text) to authenticated;

drop policy invitations_read on public.invitations;
drop policy invitations_insert on public.invitations;
drop policy invitations_delete on public.invitations;

create policy invitations_read on public.invitations for select to authenticated
  using (
    private.is_admin()
    or (private.is_active_user() and created_by = auth.uid())
    or (group_id is not null and private.has_group_perm(group_id, 'manage_members'))
  );

create policy invitations_insert on public.invitations for insert to authenticated
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
        and (not is_manager or (group_id is not null and private.has_group_perm(group_id, 'manage_members')))
      )
    )
  );

create policy invitations_delete on public.invitations for delete to authenticated
  using (
    accepted_at is null
    and (
      private.is_admin()
      or (private.is_active_user() and created_by = auth.uid())
      or (group_id is not null and private.has_group_perm(group_id, 'manage_members'))
    )
  );
