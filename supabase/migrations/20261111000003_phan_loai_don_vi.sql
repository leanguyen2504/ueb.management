-- Phân loại đơn vị: Đơn vị chức năng, Đơn vị đào tạo (Khoa, Viện), Đơn vị nghiên cứu và dịch vụ.
-- Trước đây là 3 nhóm cha trống chỉ để gom đơn vị; nay thành cột "Loại" của từng đơn vị.
-- 3 nhóm cha được lưu trữ (ẩn khỏi danh sách, không xóa dữ liệu).

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

update public.groups g set archived_at = now()
where g.name in ('Đơn vị chức năng', 'Đơn vị đào tạo (Khoa, Viện)', 'Đơn vị nghiên cứu và dịch vụ')
  and g.parent_id is null and g.archived_at is null
  and not exists (select 1 from public.groups c where c.parent_id = g.id);

-- Phân loại của mọi đơn vị đang hoạt động (danh bạ dùng cho cả nhóm mình chưa tham gia).
create function public.group_categories()
returns table (id uuid, unit_category text)
language sql stable security definer
set search_path = ''
as $$
  select g.id, g.unit_category from public.groups g
  where private.is_active_user() and g.archived_at is null and g.unit_category is not null;
$$;
revoke execute on function public.group_categories() from public, anon;
grant execute on function public.group_categories() to authenticated;
