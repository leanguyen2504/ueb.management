-- Chuyển không gian (nhóm con) sang nhóm cha khác, như kéo thư mục vào thư mục khác.
-- Cần quyền quản lý thành viên ở không gian được chuyển, và quyền tạo hoặc quản lý
-- ở nơi đến. Không chuyển vào chính nó hay không gian con của nó; không chuyển
-- nhóm gốc (Đơn vị) và không chuyển ra/vào không gian cá nhân.
create function public.move_group(p_group uuid, p_new_parent uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  g public.groups;
  dest public.groups;
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select * into g from public.groups where id = p_group;
  select * into dest from public.groups where id = p_new_parent;
  if g.id is null or dest.id is null then
    raise exception 'Không tìm thấy không gian' using errcode = '22023';
  end if;
  if g.parent_id is null then
    raise exception 'Chỉ chuyển được không gian con, không chuyển nhóm gốc' using errcode = '22023';
  end if;
  if g.parent_id = dest.id then
    return;
  end if;
  if not private.has_group_perm(g.id, 'manage_members') then
    raise exception 'Bạn không có quyền chuyển không gian này' using errcode = '42501';
  end if;
  if not (private.has_group_perm(dest.id, 'create') or private.has_group_perm(dest.id, 'manage_members')) then
    raise exception 'Bạn không có quyền tạo không gian ở nơi đến' using errcode = '42501';
  end if;
  if dest.archived_at is not null then
    raise exception 'Nơi đến đã lưu trữ' using errcode = '22023';
  end if;
  if (g.owner_id is null) <> (dest.owner_id is null) then
    raise exception 'Không chuyển giữa không gian cá nhân và không gian chung' using errcode = '22023';
  end if;
  -- Nơi đến không được là chính nó hay một không gian con của nó.
  if exists (
    with recursive up as (
      select dest.id as id, dest.parent_id as parent_id
      union all
      select p.id, p.parent_id from public.groups p join up on p.id = up.parent_id
    )
    select 1 from up where up.id = g.id
  ) then
    raise exception 'Không chuyển một không gian vào chính nó hoặc không gian con của nó' using errcode = '22023';
  end if;
  update public.groups set parent_id = dest.id where id = g.id;
end;
$$;
revoke execute on function public.move_group(uuid, uuid) from public, anon;
grant execute on function public.move_group(uuid, uuid) to authenticated;

-- Cho phép sắp xếp lại trong cùng không gian cá nhân của một người.
create or replace function private.check_personal_group()
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
       and (old.owner_id is not null or parent_owner is not null)
       and (old.parent_id is null or new.parent_id is null or old.owner_id is distinct from parent_owner) then
      raise exception 'Không chuyển không gian cá nhân' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
