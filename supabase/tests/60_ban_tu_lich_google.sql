-- Giờ bận từ lịch Google trên trang đặt lịch. Chạy sau 20_ (trang 'hieu-truong')
-- và 40_ (nguồn lịch BGH đang bật, busy_user_ids = Hiệu trưởng, một buổi họp lúc now()).
\set ON_ERROR_STOP 1
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''

reset role;
insert into public.calendar_events (source_id, google_event_id, title, starts_at, ends_at, all_day)
select id, 'ca-ngay', 'Tuần lễ', date_trunc('day', now()), date_trunc('day', now()) + interval '1 day', true
from public.calendar_sources where calendar_id = 'bgh@group.calendar.google.com';
select starts_at::text as hop from public.calendar_events where google_event_id = 'e-Lịch tuần BGH' \gset

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select t.ok(t.count(format($$select * from public.booking_page_busy('hieu-truong', now() - interval '1 hour', now() + interval '2 hour') b
  where b.starts_at = %L::timestamptz$$, :'hop')) = 1,
  'khách thấy giờ bận từ lịch BGH');
select t.ok(t.count($$select * from public.booking_page_busy('hieu-truong', now() - interval '1 hour', now() + interval '2 hour') where label is not null$$) = 0,
  'khách không thấy tên buổi họp');
select t.ok(t.count($$select * from public.booking_page_busy('hieu-truong', now() - interval '2 day', now() + interval '2 day') b
  where b.ends_at - b.starts_at = interval '1 day'$$) = 0, 'sự kiện cả ngày không chặn giờ');

set role authenticated;
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count($$select * from public.booking_page_busy('hieu-truong', now() - interval '1 hour', now() + interval '2 hour') where label = 'Lịch tuần BGH: Họp Lịch tuần BGH'$$) = 1,
  'chủ trang thấy tên buổi họp');

-- Người không nằm trong busy_user_ids thì lịch BGH không tính là bận.
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count($$select * from public.booking_page_busy('thu-ky', now() - interval '1 hour', now() + interval '2 hour') where label like 'Lịch tuần BGH%'$$) = 0,
  'lịch BGH không chặn giờ của người không được chọn');

-- Tắt nguồn lịch thì không còn tính bận.
reset role;
update public.calendar_sources set is_enabled = false where calendar_id = 'bgh@group.calendar.google.com';
set role anon;
select t.ok(t.count(format($$select * from public.booking_page_busy('hieu-truong', now() - interval '1 hour', now() + interval '2 hour') b
  where b.starts_at = %L::timestamptz$$, :'hop')) = 0,
  'nguồn lịch tắt thì không tính bận');
reset role;
