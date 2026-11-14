-- Thành viên nhóm cha (có quyền Xem) tự động xem được mọi nhóm con, cháu… bên trong:
-- đầu việc, lịch, tài liệu, thành viên, như thành viên chỉ xem. Không tự có quyền tạo, sửa, tải lên, quản lý.
-- Không gian cá nhân không đổi (chỉ chủ). Quản trị và thư ký toàn trường vẫn thấy mọi nhóm.
-- Hai hàm has_group_perm (từng dòng) và group_ids_with_perm (danh sách, dùng trong RLS) phải cùng quy tắc.

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
    when perm = 'view' then exists (
      -- Chính nhóm này hoặc một nhóm cấp trên mà tôi có quyền Xem.
      with recursive up as (
        select g.id, g.parent_id, 0 as d from public.groups g where g.id = gid
        union all
        select p.id, p.parent_id, up.d + 1 from public.groups p join up on p.id = up.parent_id where up.d < 10
      )
      select 1 from up join public.group_members m on m.group_id = up.id
      where m.user_id = auth.uid() and m.can_view
    )
    else exists (
      select 1 from public.group_members m
      where m.group_id = gid and m.user_id = auth.uid()
        and case perm
          when 'create' then m.can_create
          when 'edit' then m.can_edit
          when 'upload' then m.can_upload
          when 'manage_members' then m.can_manage_members
          else false
        end
    )
  end;
$$;

create or replace function private.group_ids_with_perm(perm text)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then '{}'::uuid[]
    when private.is_admin() or private.is_all_scope_secretary() then array(
      select g.id from public.groups g
      where g.owner_id is null or g.owner_id = auth.uid()
    )
    when perm = 'view' then array(
      with recursive down as (
        select m.group_id as id, 0 as d
        from public.group_members m
        join public.groups g on g.id = m.group_id and g.owner_id is null
        where m.user_id = auth.uid() and m.can_view
        union
        select c.id, down.d + 1 from public.groups c join down on c.parent_id = down.id
        where c.owner_id is null and down.d < 10
      )
      select g.id from public.groups g where g.owner_id = auth.uid()
      union
      select id from down
    )
    else array(
      select g.id from public.groups g where g.owner_id = auth.uid()
      union all
      select m.group_id
      from public.group_members m
      join public.groups g on g.id = m.group_id and g.owner_id is null
      where m.user_id = auth.uid()
        and case perm
          when 'create' then m.can_create
          when 'edit' then m.can_edit
          when 'upload' then m.can_upload
          when 'manage_members' then m.can_manage_members
          else false
        end
    )
  end;
$$;
