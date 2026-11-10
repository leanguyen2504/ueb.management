-- Trang đặt lịch: tính thêm giờ bận từ lịch Google (calendar_events) của các nguồn
-- đang bật mà quản trị đã chọn chủ trang trong busy_user_ids.
-- Sự kiện cả ngày không chặn giờ (thường là ghi chú cả tuần/ngày lễ).
-- Khách chỉ thấy khoảng giờ bận; tên buổi họp chỉ trả về cho chính chủ trang.
create or replace function public.booking_page_busy(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, label text)
language sql stable security definer
set search_path = ''
as $$
  with page as (
    select b.user_id from public.booking_pages b
    join public.profiles p on p.id = b.user_id and p.is_active
    where b.slug = p_slug and (b.is_open or b.user_id = auth.uid())
  )
  select e.starts_at, e.ends_at, case when page.user_id = auth.uid() then e.title end
  from page
  join public.group_members m on m.user_id = page.user_id and m.can_view
  join public.events e on e.group_id = m.group_id
  where e.starts_at < p_to and e.ends_at > p_from
  union all
  select k.starts_at, k.ends_at,
    case when page.user_id = auth.uid() then 'Lịch gặp: ' || k.topic end
  from page
  join public.bookings k on k.host_id = page.user_id and k.status in ('pending', 'accepted')
  where k.starts_at < p_to and k.ends_at > p_from
  union all
  select c.starts_at, c.ends_at,
    case when page.user_id = auth.uid() then s.label || ': ' || c.title end
  from page
  join public.calendar_sources s on s.is_enabled and page.user_id = any (s.busy_user_ids)
  join public.calendar_events c on c.source_id = s.id
  where not c.all_day and c.starts_at < p_to and c.ends_at > p_from
  order by 1;
$$;
