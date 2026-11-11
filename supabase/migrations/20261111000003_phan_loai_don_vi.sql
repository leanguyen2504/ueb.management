-- Phân loại đơn vị: Đơn vị chức năng, Đơn vị đào tạo (Khoa, Viện), Đơn vị nghiên cứu và dịch vụ.
-- Trước đây là 3 nhóm cha trống chỉ để gom đơn vị; nay thành cột "Loại" của từng đơn vị,
-- và bỏ 3 nhóm cha (không có thành viên, việc hay lịch).

alter table public.groups add column unit_category text
  check (unit_category in ('chuc_nang', 'dao_tao', 'nghien_cuu'));

update public.groups c set unit_category = case p.name
    when 'Đơn vị chức năng' then 'chuc_nang'
    when 'Đơn vị đào tạo (Khoa, Viện)' then 'dao_tao'
    when 'Đơn vị nghiên cứu và dịch vụ' then 'nghien_cuu'
  end,
  parent_id = null
from public.groups p
where c.parent_id = p.id and p.parent_id is null
  and p.name in ('Đơn vị chức năng', 'Đơn vị đào tạo (Khoa, Viện)', 'Đơn vị nghiên cứu và dịch vụ');

delete from public.groups g
where g.name in ('Đơn vị chức năng', 'Đơn vị đào tạo (Khoa, Viện)', 'Đơn vị nghiên cứu và dịch vụ')
  and g.parent_id is null
  and not exists (select 1 from public.groups c where c.parent_id = g.id)
  and not exists (select 1 from public.group_members m where m.group_id = g.id)
  and not exists (select 1 from public.tasks t where t.group_id = g.id)
  and not exists (select 1 from public.events e where e.group_id = g.id);

-- Danh bạ trả thêm phân loại đơn vị.
drop function public.group_directory();
create function public.group_directory()
returns table (
  id uuid, name text, description text, kind text, parent_id uuid, parent_name text,
  member_count integer, open_tasks integer, is_member boolean, can_view boolean,
  my_role text, updated_at timestamptz, unit_category text
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
    g.updated_at, g.unit_category
  from public.groups g
  left join public.groups p on p.id = g.parent_id
  where private.is_active_user() and g.archived_at is null
  order by g.name;
$$;
revoke execute on function public.group_directory() from public, anon;
grant execute on function public.group_directory() to authenticated;
