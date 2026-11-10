-- Kiểm thử mảng công tác, thông tin buổi họp, loại tài liệu. Dùng dữ liệu của 70_ho_so_cuoc_hop.sql.
\set ON_ERROR_STOP 1
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''
\set bgh '''20000000-0000-0000-0000-000000000001'''

reset role;
-- Sự kiện k1 bị xóa ở 70_ho_so_cuoc_hop.sql (giả lập đồng bộ lại): nạp lại.
insert into public.calendar_events (source_id, google_event_id, title, starts_at, ends_at)
values (:bgh, 'k1', 'Họp OKR với Phòng Đào tạo', '2026-11-09 08:30+07', '2026-11-09 10:00+07');
set role authenticated;

-- 1. Thư ký tạo mảng; email được chuẩn hóa; thành viên thường chỉ xem.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.work_areas (name, group_id, primary_email, coordinator_emails)
values ('Phòng Hành chính', :g1, ' NguoiA@VNU.edu.vn ', array['nguoib@vnu.edu.vn', 'NguoiA@vnu.edu.vn', '', 'nguoib@vnu.edu.vn']);
select t.ok((select primary_email from public.work_areas where name = 'Phòng Hành chính') = 'nguoia@vnu.edu.vn', 'email đầu mối viết thường');
select t.ok((select coordinator_emails from public.work_areas where name = 'Phòng Hành chính') = array['nguoib@vnu.edu.vn'], 'người phối hợp bỏ trùng, bỏ đầu mối chính');
select t.denied($$update public.work_areas set primary_email = 'khong-hop-le' where true$$, 'email không hợp lệ');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied($$insert into public.work_areas (name) values ('Mảng của Văn thư')$$, 'Văn thư tạo mảng');
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.work_areas') = 1, 'thành viên xem danh mục mảng');
select t.denied($$delete from public.work_areas where true$$, 'thành viên xóa mảng');
select t.ok(t.count('select * from public.work_areas') = 1, 'xóa của thành viên không có tác dụng');

-- 2. Thông tin buổi họp: mã Jira, thư mục Drive, tình trạng.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.meeting_records (source_id, event_key, meeting_starts_at, jira_key, drive_folder_url, status)
values (:bgh, 'k1', now(), 'KHTC-6447', 'https://drive.google.com/drive/folders/abc', 'dang_thu_thap');
select t.ok((select meeting_title from public.meeting_records where event_key = 'k1') = 'Họp OKR với Phòng Đào tạo', 'tên buổi họp lấy từ lịch');
select t.denied($$update public.meeting_records set jira_key = 'khtc 6447' where event_key = 'k1'$$, 'mã Jira sai dạng');
select t.denied($$update public.meeting_records set drive_folder_url = 'drive.google.com/x' where event_key = 'k1'$$, 'link thư mục không phải https');
select t.denied($$update public.meeting_records set event_key = 'khac' where event_key = 'k1'$$, 'đổi buổi họp của hồ sơ');
update public.meeting_records set status = 'cho_bien_ban', follow_up = 'Phòng ĐT gửi kế hoạch trước 20/11' where event_key = 'k1';

-- Hiệu trưởng xem được; Văn thư không xem được lịch BGH thì không thấy.
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok((select status from public.meeting_records where event_key = 'k1') = 'cho_bien_ban', 'Hiệu trưởng xem tình trạng');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.meeting_records') = 0, 'Văn thư không xem được lịch BGH');
select t.denied(format($$insert into public.meeting_records (source_id, event_key, meeting_starts_at) values (%L, 'k9', now())$$, :bgh), 'Văn thư ghi hồ sơ lịch BGH');

-- 3. Loại tài liệu và mảng của dòng tài liệu.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.meeting_items (source_id, event_key, meeting_starts_at, kind, doc_type, area_id, url)
select :bgh, 'k1', now(), 'pre', 'du_thao_ket_luan', id, 'https://docs.google.com/document/d/kl' from public.work_areas where name = 'Phòng Hành chính';
select t.ok(t.count($$select * from public.meeting_items where doc_type = 'du_thao_ket_luan' and area_id is not null$$) = 1, 'gắn loại tài liệu và mảng');
select t.denied($$update public.meeting_items set doc_type = 'loai_la' where doc_type = 'du_thao_ket_luan'$$, 'loại tài liệu không có trong danh mục');

-- 4. Nhật ký và xóa mảng giữ lại tài liệu.
reset role;
select t.ok((select count(*) from public.activity_log where entity_type = 'meeting_records') = 2, 'thông tin buổi họp được ghi nhật ký');
select t.ok((select count(*) from public.activity_log where entity_type = 'work_areas') = 1, 'danh mục mảng được ghi nhật ký');
delete from public.work_areas where name = 'Phòng Hành chính';
select t.ok((select count(*) from public.meeting_items where doc_type = 'du_thao_ket_luan' and area_id is null) = 1, 'xóa mảng giữ tài liệu');
