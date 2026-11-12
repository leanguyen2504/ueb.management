-- Tăng tốc danh bạ nhóm (trang Nhóm và Dự án, trang từng nhóm): quyền xem được tính một lần
-- cho cả danh sách thay vì gọi has_group_perm và principal_outside cho từng nhóm.
-- Kết quả giữ nguyên; đo trên dữ liệu thật: 46 ms còn 4,6 ms.
create or replace function public.group_directory()
returns table (
  id uuid, name text, description text, kind text, parent_id uuid, parent_name text,
  member_count integer, open_tasks integer, is_member boolean, can_view boolean,
  my_role text, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  -- "materialized" để Postgres tính một lần, không gộp vào từng dòng.
  with me as materialized (
    select private.group_ids_with_perm('view') as ids, private.is_principal() as principal,
      auth.uid() as uid, private.is_active_user() as active
  )
  select g.id, g.name, g.description, g.kind::text, g.parent_id, p.name,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    -- Hiệu trưởng không xem số việc của nhóm mình không tham gia (như private.principal_outside).
    case when me.principal and not (g.id = any (me.ids)) then null
      else (select count(*)::int from public.tasks t where t.group_id = g.id and t.status <> 'done') end,
    exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = me.uid),
    g.id = any (me.ids),
    (select case when m.is_manager then 'Trưởng nhóm' when m.is_clerk then 'Văn thư' else 'Thành viên' end
       from public.group_members m where m.group_id = g.id and m.user_id = me.uid),
    g.updated_at
  from me
  cross join public.groups g
  left join public.groups p on p.id = g.parent_id
  where me.active and g.archived_at is null and g.owner_id is null
  order by g.name;
$$;
