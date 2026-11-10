-- Kiểm thử RLS module Google Calendar. Dùng người dùng tạo ở 10_phan_quyen.sql.
\set ON_ERROR_STOP 1
\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;

-- 1. Chỉ quản trị thêm nguồn lịch.
select set_config('request.jwt.claim.sub', :thuky, false);
select t.denied($$insert into public.calendar_sources (calendar_id, label) values ('x@group.calendar.google.com', 'X')$$, 'thư ký thêm nguồn lịch');
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.calendar_sources (calendar_id, label, visibility) values
  ('bgh@group.calendar.google.com', 'Lịch tuần BGH', 'office'),
  ('chung@group.calendar.google.com', 'Lịch chung', 'all');
select t.ok(t.count($$select * from public.activity_log where entity_type = 'calendar_sources' and action = 'insert'$$) = 2, 'thêm nguồn lịch được ghi nhật ký');
-- Người dùng không tự ghi trạng thái đồng bộ.
select t.denied($$update public.calendar_sources set event_count = 99 where true$$, 'sửa cột trạng thái đồng bộ');

-- Quản trị chọn người coi lịch này là giờ bận; thư ký không đổi được.
update public.calendar_sources set busy_user_ids = array[:hieutruong]::uuid[] where calendar_id = 'bgh@group.calendar.google.com';
select t.ok((select busy_user_ids from public.calendar_sources where calendar_id = 'bgh@group.calendar.google.com') = array[:hieutruong]::uuid[], 'quản trị đặt người dùng lịch');
select t.ok(t.count($$select * from public.activity_log where entity_type = 'calendar_sources' and action = 'update'$$) = 1, 'đổi người dùng lịch được ghi nhật ký');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.denied($$update public.calendar_sources set busy_user_ids = '{}' where true$$, 'thư ký đổi người dùng lịch');
select set_config('request.jwt.claim.sub', :admin, false);

-- 2. Buổi họp chỉ máy chủ ghi (giả lập bằng vai trò hệ thống).
reset role;
insert into public.calendar_events (source_id, google_event_id, title, starts_at, ends_at)
select id, 'e-' || label, 'Họp ' || label, now(), now() + interval '1 hour' from public.calendar_sources;
set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
select t.denied($$insert into public.calendar_events (source_id, google_event_id, title, starts_at, ends_at) select id, 'x', 'x', now(), now() from public.calendar_sources$$, 'người dùng ghi buổi họp');
select t.denied($$delete from public.calendar_events where true$$, 'người dùng xóa buổi họp');

-- 3. Quyền xem.
select t.ok(t.count('select * from public.calendar_events') = 2, 'thư ký thấy cả lịch BGH và lịch chung');
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count('select * from public.calendar_events') = 2, 'Hiệu trưởng thấy cả hai lịch');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.calendar_events') = 1, 'thành viên chỉ thấy lịch để mọi người xem');
select t.ok(t.count($$select * from public.calendar_sources where visibility = 'office'$$) = 0, 'thành viên không thấy nguồn lịch BGH');

-- 4. Tắt nguồn lịch thì không ai (trừ quản trị thấy cấu hình) xem được buổi họp.
select set_config('request.jwt.claim.sub', :admin, false);
update public.calendar_sources set is_enabled = false where calendar_id = 'chung@group.calendar.google.com';
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.calendar_events') = 0, 'nguồn lịch tắt thì ẩn buổi họp');
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count('select * from public.calendar_sources') = 2, 'quản trị vẫn thấy nguồn lịch đang tắt');
select t.ok(t.count('select * from public.calendar_events') = 1, 'quản trị không thấy buổi họp của nguồn tắt');

-- 5. Xóa nguồn lịch xóa luôn buổi họp.
delete from public.calendar_sources where calendar_id = 'chung@group.calendar.google.com';
reset role;
select t.ok((select count(*) from public.calendar_events) = 1, 'xóa nguồn lịch xóa buổi họp');

set role anon;
select t.denied($$select * from public.calendar_events$$, 'khách đọc buổi họp');
reset role;

select 'OK: kiểm thử lịch Google' as ket_qua;
