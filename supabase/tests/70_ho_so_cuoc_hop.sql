-- Kiểm thử hồ sơ cuộc họp (tài liệu trước họp, biên bản). Dùng người dùng ở 10_phan_quyen.sql;
-- tv2 là Văn thư của nhóm g1 (30_van_thu_nhom.sql).
\set ON_ERROR_STOP 1
\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''

reset role;
-- tv1 bị khóa ở 10_phan_quyen.sql: mở lại để làm thành viên thường.
update public.profiles set is_active = true where id = :tv1;
insert into public.calendar_sources (id, calendar_id, label, visibility) values
  ('20000000-0000-0000-0000-000000000001', 'hop-bgh@group.calendar.google.com', 'Lịch họp BGH', 'office'),
  ('20000000-0000-0000-0000-000000000002', 'hop-chung@group.calendar.google.com', 'Lịch họp chung', 'all');
insert into public.calendar_events (source_id, google_event_id, title, starts_at, ends_at, attachments) values
  ('20000000-0000-0000-0000-000000000001', 'k1', 'Họp OKR với Phòng Đào tạo', '2026-11-09 08:30+07', '2026-11-09 10:00+07',
   '[{"title": "Dự thảo OKR.docx", "url": "https://docs.google.com/document/d/abc"}]'),
  ('20000000-0000-0000-0000-000000000002', 'k2', 'Giao ban tháng 11', '2026-11-10 08:30+07', '2026-11-10 11:00+07', '[]');
\set bgh '''20000000-0000-0000-0000-000000000001'''
\set chung '''20000000-0000-0000-0000-000000000002'''

set role authenticated;

-- 1. Thư ký tạo dòng "chờ gửi" cho một bên; tên và giờ buổi họp lấy từ lịch, người đôn đốc mặc định là mình.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.meeting_items (source_id, event_key, meeting_title, meeting_starts_at, party_group_id)
values (:bgh, 'k1', 'tên giả', now(), :g1);
select t.ok((select meeting_title from public.meeting_items where event_key = 'k1') = 'Họp OKR với Phòng Đào tạo', 'tên buổi họp lấy từ lịch');
select t.ok((select meeting_starts_at from public.meeting_items where event_key = 'k1') = '2026-11-09 08:30+07', 'giờ buổi họp lấy từ lịch');
select t.ok((select assignee_id from public.meeting_items where event_key = 'k1') = :thuky, 'người tạo là người đôn đốc mặc định');
select t.ok((select party from public.meeting_items where event_key = 'k1') = 'Phòng Hành chính', 'tên bên lấy từ nhóm');
select t.ok((select url from public.meeting_items where event_key = 'k1') is null, 'dòng chưa có link là đang chờ gửi');

-- Dán link khi nhận được; giao Hiệu trưởng đôn đốc thì Hiệu trưởng nhận thông báo.
update public.meeting_items set url = 'https://drive.google.com/file/d/xyz', title = 'Báo cáo OKR', assignee_id = :hieutruong where event_key = 'k1';
select t.denied($$update public.meeting_items set url = 'http://khong-an-toan.vn/a' where event_key = 'k1'$$, 'link không phải https');
select t.denied($$update public.meeting_items set event_key = 'khac' where event_key = 'k1'$$, 'đổi buổi họp của dòng');
insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, title, url)
values (:bgh, 'k1', now(), 'minutes', 'Biên bản họp', 'https://docs.google.com/document/d/bb');
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count($$select * from public.notifications where kind = 'meeting_item_assigned'$$) = 1, 'Hiệu trưởng nhận thông báo đôn đốc');
select t.ok(t.count($$select * from public.meeting_items where source_id = '20000000-0000-0000-0000-000000000001'$$) = 2, 'Hiệu trưởng thấy tài liệu và biên bản');

-- 2. Thành viên và Văn thư không xem được lịch BGH thì không thấy, không gắn được.
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.meeting_items where source_id = '20000000-0000-0000-0000-000000000001'$$) = 0, 'Văn thư không thấy hồ sơ lịch BGH');
select t.denied(format($$insert into public.meeting_items (source_id, event_key, meeting_starts_at, title) values (%L, 'k1', now(), 'x')$$, :bgh), 'Văn thư gắn vào lịch BGH');

-- 3. Lịch để mọi người xem: Văn thư gắn được, thành viên thường chỉ xem.
insert into public.meeting_items (source_id, event_key, meeting_starts_at, party) values (:chung, 'k2', now(), 'Khoa KTPT');
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count($$select * from public.meeting_items where source_id = '20000000-0000-0000-0000-000000000002'$$) = 1, 'thành viên xem hồ sơ lịch chung');
select t.denied(format($$insert into public.meeting_items (source_id, event_key, meeting_starts_at, title) values (%L, 'k2', now(), 'x')$$, :chung), 'thành viên thường gắn tài liệu');
select t.denied($$delete from public.meeting_items where true$$, 'thành viên thường xóa tài liệu');
select t.ok(t.count('select * from public.meeting_items') = 1, 'xóa của thành viên không có tác dụng');

-- 4. Nhật ký ghi lại thao tác.
reset role;
select t.ok((select count(*) from public.activity_log where entity_type = 'meeting_items') = 4, 'gắn và sửa tài liệu được ghi nhật ký');

-- 5. Đồng bộ lại lịch (xóa và nạp lại buổi họp) không làm mất hồ sơ.
delete from public.calendar_events where source_id in (:bgh, :chung);
select t.ok((select count(*) from public.meeting_items) = 3, 'đồng bộ lại lịch vẫn giữ hồ sơ');

-- 6. Xóa nguồn lịch thì xóa hồ sơ của lịch đó.
delete from public.calendar_sources where id = :chung;
select t.ok((select count(*) from public.meeting_items) = 2, 'xóa nguồn lịch xóa hồ sơ');
