-- Kiểm thử lịch cá nhân, phân công và điểm danh.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set tv3 '''00000000-0000-0000-0000-0000000000d3'''

-- tv3: người dùng chưa ở nhóm nào chung với tv1, tv2.
reset role;
insert into auth.users (id, email) values (:tv3, 'tv3@vnu.edu.vn');
delete from public.group_members where user_id = :tv3;
select t.ok((select is_active from public.profiles where id = :tv3), 'tv3 đang hoạt động');

set role authenticated;

-- 1. Tự tạo lịch dạy trên lịch của mình.
select set_config('request.jwt.claim.sub', :tv1, false);
insert into public.personal_items (owner_id, kind, role, place, title, starts_at, ends_at, status)
values (auth.uid(), 'giang_day', 'tro_giang', 'truong', 'Trợ giảng Kinh tế vi mô', '2026-11-12 01:00+00', '2026-11-12 03:00+00', 'pending');
select t.ok((select status = 'accepted' and assigned_by is null from public.personal_items where title = 'Trợ giảng Kinh tế vi mô'), 'mục tự tạo đã nhận, không có người giao');
update public.personal_items set title = 'Trợ giảng Vi mô' where title = 'Trợ giảng Kinh tế vi mô';
select t.ok(t.count($$select * from public.personal_items where title = 'Trợ giảng Vi mô'$$) = 1, 'tự sửa mục của mình');

-- 2. Đồng nghiệp cùng nhóm phân công việc cho tv1; trạng thái chờ nhận, có thông báo.
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.personal_items (owner_id, kind, place, title, starts_at, ends_at, status, assigned_by)
values (:tv1, 'cong_viec', 'khoa', 'Việc A: soạn biên bản', '2026-11-13 02:00+00', '2026-11-13 04:00+00', 'accepted', :admin);
select t.ok((select status = 'pending' and assigned_by = :tv2 from public.personal_items where title = 'Việc A: soạn biên bản'), 'việc được giao ở trạng thái chờ, người giao đúng');
select t.ok(t.count('select * from public.personal_items') = 1, 'người giao chỉ thấy việc mình giao');
select t.denied($$update public.personal_items set status = 'done'$$, 'người giao tự báo xong');
-- Người không cùng nhóm không giao được.
select t.denied(format($$insert into public.personal_items (owner_id, title, starts_at, ends_at) values (%L, 'Lạ', now(), now())$$, :tv3), 'giao cho người không cùng nhóm');

select set_config('request.jwt.claim.sub', :tv3, false);
select t.denied(format($$insert into public.personal_items (owner_id, title, starts_at, ends_at) values (%L, 'Lạ', now(), now())$$, :tv1), 'người ngoài nhóm giao việc');
select t.ok(t.count('select * from public.personal_items') = 0, 'người ngoài không thấy lịch cá nhân của người khác');
select t.denied('delete from public.personal_items', 'người ngoài xóa lịch người khác');

-- 3. Người được giao thấy việc trên lịch, có thông báo, nhận việc; không sửa được nội dung.
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.personal_items') = 2, 'tv1 thấy lịch của mình và việc được giao');
select t.ok(t.count($$select * from public.notifications where kind = 'personal_assigned'$$) >= 1, 'tv1 nhận thông báo phân công');
select t.denied($$update public.personal_items set title = 'Đổi tên' where title = 'Việc A: soạn biên bản'$$, 'người được giao sửa nội dung');
update public.personal_items set status = 'accepted', response_note = 'Em nhận' where title = 'Việc A: soạn biên bản';
select t.ok((select status = 'accepted' from public.personal_items where title = 'Việc A: soạn biên bản'), 'người được giao nhận việc');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.notifications where kind = 'personal_response'$$) >= 1, 'người giao nhận thông báo khi được nhận');
-- Người giao đổi giờ: việc quay lại chờ xác nhận.
update public.personal_items set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where title = 'Việc A: soạn biên bản';
select t.ok((select status = 'pending' from public.personal_items where title = 'Việc A: soạn biên bản'), 'sửa giờ thì chờ xác nhận lại');
select t.denied(format($$update public.personal_items set owner_id = %L$$, :tv3), 'đổi người nhận');

-- 4. Quản trị cũng không xem lịch cá nhân của người khác.
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count('select * from public.personal_items') = 0, 'quản trị không thấy lịch cá nhân');

-- 5. Điểm danh: chỉ của mình, trong khoảng cho phép.
select set_config('request.jwt.claim.sub', :tv1, false);
insert into public.attendance_checkins (user_id, day, place) values (auth.uid(), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'khoa');
select t.ok(t.count('select * from public.attendance_checkins') = 1, 'điểm danh hôm nay');
update public.attendance_checkins set place = 'truong';
select t.denied($$insert into public.attendance_checkins (user_id, day, place) values (auth.uid(), current_date - 90, 'truong')$$, 'điểm danh lùi quá xa');
select t.denied(format($$insert into public.attendance_checkins (user_id, day, place) values (%L, current_date, 'truong')$$, :tv2), 'điểm danh hộ người khác');
select t.denied($$insert into public.attendance_checkins (user_id, day, place) values (auth.uid(), current_date - 1, 'nha')$$, 'nơi làm việc không hợp lệ');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.attendance_checkins') = 0, 'đồng nghiệp không thấy điểm danh');

-- 6. Người giao xóa việc đã giao.
delete from public.personal_items where title = 'Việc A: soạn biên bản';
select t.ok(t.count('select * from public.personal_items') = 0, 'người giao xóa việc đã giao');
reset role;
