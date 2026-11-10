-- Mọi email thuộc tên miền cho phép đều tự đăng ký được, không cần lời mời.
-- Người không có lời mời trở thành thành viên thường, chưa thuộc nhóm nào
-- (không thấy dữ liệu nhóm nào cho tới khi được thêm vào nhóm).
-- Lời mời vẫn dùng được để gán sẵn vai trò và nhóm.

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

  insert into public.profiles (id, email, full_name, system_role)
  values (new.id, addr, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(inv.system_role, 'member'));

  if inv.id is not null and inv.make_admin and settings.current_admin_id is null then
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
