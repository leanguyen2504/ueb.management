-- Kiểm thử RLS: đầu việc, lịch, đặt lịch, thông báo. Chạy sau 10_phan_quyen.sql (dùng lại dữ liệu và schema t).
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''
\set g2 '''10000000-0000-0000-0000-000000000002'''

-- Trạng thái từ 10_phan_quyen: tv1 bị khóa; tv2 là thành viên chỉ xem của nhóm 1; thư ký quản lý nhóm 1.
set role authenticated;

-- 1. Thư ký tạo việc giao cho tv2; tv2 nhận thông báo.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.tasks (id, group_id, title, assignee_id, due_date)
values ('20000000-0000-0000-0000-000000000001', :g1, 'Chuẩn bị báo cáo', :tv2, current_date + 3);
select t.ok((select created_by from public.tasks where id = '20000000-0000-0000-0000-000000000001') = :thuky, 'created_by của việc do trigger điền');
select t.denied(format($$insert into public.tasks (group_id, title) values (%L, 'Việc nhóm kín')$$, :g2), 'tạo việc ở nhóm mình không có quyền');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.notifications where kind = ''task_assigned''') = 1, 'người được giao nhận thông báo');
select t.ok(t.count('select * from public.tasks') = 1, 'tv2 thấy việc của nhóm');
-- 2. tv2 (chỉ xem) đổi được trạng thái việc được giao, không sửa được tiêu đề, không tạo việc mới.
update public.tasks set status = 'doing' where id = '20000000-0000-0000-0000-000000000001';
select t.ok((select status from public.tasks where id = '20000000-0000-0000-0000-000000000001') = 'doing', 'người được giao đổi trạng thái');
select t.denied($$update public.tasks set title = 'đổi tên' where id = '20000000-0000-0000-0000-000000000001'$$, 'người được giao sửa tiêu đề');
select t.denied(format($$insert into public.tasks (group_id, title) values (%L, 'x')$$, :g1), 'thành viên chỉ xem tạo việc');
select t.denied($$delete from public.tasks where true$$, 'thành viên chỉ xem xóa việc');
update public.tasks set status = 'done' where id = '20000000-0000-0000-0000-000000000001';
select t.ok((select completed_at is not null from public.tasks where id = '20000000-0000-0000-0000-000000000001'), 'hoàn thành thì ghi completed_at');

-- 3. Người tạo việc nhận thông báo khi trạng thái đổi.
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count('select * from public.notifications where kind = ''task_status''') = 2, 'người giao việc nhận thông báo đổi trạng thái');
-- Không giao được cho người ngoài nhóm.
reset role;
insert into public.invitations (email) values ('ngoai@vnu.edu.vn');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'ngoai@vnu.edu.vn');
set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
select t.denied($$update public.tasks set assignee_id = '00000000-0000-0000-0000-0000000000e1' where id = '20000000-0000-0000-0000-000000000001'$$, 'giao việc cho người ngoài nhóm');

-- 4. Lịch nhóm: tạo cuộc họp, thành viên được thông báo; người ngoài không thấy.
insert into public.events (group_id, title, starts_at, ends_at, location)
values (:g1, 'Họp giao ban', now() + interval '1 day', now() + interval '1 day 1 hour', 'Phòng 301');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.events') = 1, 'thành viên thấy lịch nhóm');
select t.ok(t.count('select * from public.notifications where kind = ''event_created''') = 1, 'thành viên nhận thông báo lịch mới');
select t.denied($$update public.events set title = 'x' where true$$, 'thành viên chỉ xem sửa lịch');
select t.denied(format($$insert into public.events (group_id, title, starts_at, ends_at) values (%L, 'x', now(), now())$$, :g1), 'thành viên chỉ xem tạo lịch');
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.events') = 0, 'tài khoản bị khóa không thấy lịch');
select t.ok(t.count('select * from public.tasks') = 0, 'tài khoản bị khóa không thấy việc');

-- 5. Trang đặt lịch: Hiệu trưởng mở trang có đuôi link; mọi yêu cầu đi qua book_public.
select set_config('request.jwt.claim.sub', :hieutruong, false);
insert into public.booking_pages (user_id, slug, weekly_hours, location)
values (:hieutruong, 'hieu-truong', '{"1":["00:00","23:59"],"2":["00:00","23:59"],"3":["00:00","23:59"],"4":["00:00","23:59"],"5":["00:00","23:59"],"6":["00:00","23:59"],"7":["00:00","23:59"]}', 'Phòng Hiệu trưởng');
select t.denied(format($$insert into public.booking_pages (user_id) values (%L)$$, :thuky), 'mở trang đặt lịch thay người khác');
select t.denied($$update public.booking_pages set weekly_hours = '{"1":["17:00","08:00"]}' where true$$, 'giờ nhận lịch sai');

-- Giờ hẹn: 9:00 sáng (giờ Việt Nam) hai ngày tới.
select ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + interval '2 day 9 hour') at time zone 'Asia/Ho_Chi_Minh')::text as t9 \gset
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied($$insert into public.bookings (host_id, requester_id, starts_at, ends_at, topic) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2', now() + interval '2 day', now() + interval '2 day 30 min', 'x')$$, 'chèn thẳng vào bookings');
select t.denied(format($$select public.book_public('khong-co', %L, 30, 'a', 'a@b.vn', 'x', null)$$, :'t9'), 'đặt lịch với trang không tồn tại');
select t.denied(format($$select public.book_public('hieu-truong', %L, 25, 'a', 'a@b.vn', 'x', null)$$, :'t9'), 'thời lượng không được nhận');
select t.denied(format($$select public.book_public('hieu-truong', %L::timestamptz + interval '7 min', 30, 'a', 'a@b.vn', 'x', null)$$, :'t9'), 'giờ lệch bước 15 phút');
select t.denied($$select public.book_public('hieu-truong', now() + interval '200 day', 30, 'a', 'a@b.vn', 'x', null)$$, 'ngoài số ngày nhận lịch');
select public.book_public('hieu-truong', :'t9', 30, 'Thành viên 2', 'tv2@vnu.edu.vn', 'Xin ý kiến đề án', null);
select t.ok((select requester_id from public.bookings where topic = 'Xin ý kiến đề án') = :tv2, 'người đã đăng nhập đặt lịch được ghi là người đặt');
select t.denied($$update public.bookings set status = 'accepted' where topic = 'Xin ý kiến đề án'$$, 'người đặt tự đồng ý');
select t.denied($$update public.bookings set topic = 'khác' where topic = 'Xin ý kiến đề án'$$, 'sửa nội dung yêu cầu đã gửi');
-- Giờ đã có yêu cầu thì không đặt chồng được.
select t.denied(format($$select public.book_public('hieu-truong', %L::timestamptz + interval '15 min', 30, 'b', 'b@b.vn', 'y', null)$$, :'t9'), 'đặt chồng giờ đã có yêu cầu');

-- 6. Khách ngoài (chưa đăng nhập) đặt lịch, xem trạng thái bằng mã bí mật, không thấy bảng.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select t.ok((select count(*) from public.booking_page_public('hieu-truong')) = 1, 'khách xem được trang đặt lịch');
select t.ok((select bool_and(label is null) from public.booking_page_busy('hieu-truong', now(), now() + interval '7 day')), 'khách chỉ thấy giờ bận, không thấy nội dung');
select public.book_public('hieu-truong', :'t9'::timestamptz + interval '1 hour', 45, 'Khách Ngoài', 'khach@gmail.com', 'Hợp tác', 'Ghi chú') as tok \gset
select t.ok((select status from public.booking_by_token(:'tok')) = 'pending', 'khách xem trạng thái bằng mã');
select t.ok((select location from public.booking_by_token(:'tok')) is null, 'địa điểm ẩn khi chưa xác nhận');
select t.denied($$select * from public.bookings$$, 'khách đọc bookings');
reset role;
set role authenticated;

select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count('select * from public.bookings') = 0, 'người thứ ba không thấy yêu cầu đặt lịch');

select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count('select * from public.notifications where kind = ''booking_new''') = 2, 'người nhận được thông báo yêu cầu gặp');
select t.ok((select bool_and(label is not null) from public.booking_page_busy('hieu-truong', now(), now() + interval '7 day')), 'chủ trang thấy nội dung giờ bận');
update public.bookings set status = 'accepted', response_note = 'Gặp tại phòng Hiệu trưởng' where topic = 'Xin ý kiến đề án';
update public.bookings set status = 'accepted' where topic = 'Hợp tác';
reset role;
set role anon;
select t.ok((select location from public.booking_by_token(:'tok')) = 'Phòng Hiệu trưởng', 'địa điểm hiện sau khi xác nhận');
select public.cancel_by_token(:'tok');
select t.ok((select status from public.booking_by_token(:'tok')) = 'cancelled', 'khách hủy bằng mã');
reset role;
set role authenticated;

-- Lịch nhóm chặn giờ trên trang của Thư ký (Họp giao ban ngày mai).
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.booking_pages (user_id, slug, weekly_hours) values (:thuky, 'thu-ky', '{"1":["00:00","23:59"],"2":["00:00","23:59"],"3":["00:00","23:59"],"4":["00:00","23:59"],"5":["00:00","23:59"],"6":["00:00","23:59"],"7":["00:00","23:59"]}');
select (select starts_at from public.events where title = 'Họp giao ban')::text as hop \gset
select t.ok((select count(*) from public.booking_page_busy('thu-ky', now(), now() + interval '3 day')) >= 1, 'lịch nhóm tính là giờ bận');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied(format($$select public.book_public('thu-ky', date_trunc('hour', %L::timestamptz), 60, 'a', 'a@b.vn', 'x', null)$$, :'hop'), 'đặt trùng giờ họp nhóm');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.notifications where kind = ''booking_accepted''') = 1, 'người đặt nhận thông báo được đồng ý');
update public.bookings set status = 'cancelled' where topic = 'Xin ý kiến đề án';


-- 7. Thông báo: chỉ của mình; chỉ đổi read_at; không tự tạo được.
update public.notifications set read_at = now() where user_id = auth.uid();
select t.denied($$update public.notifications set title = 'x' where true$$, 'sửa nội dung thông báo');
select t.denied(format($$insert into public.notifications (user_id, kind, title) values (%L, 'x', 'giả')$$, :thuky), 'tự tạo thông báo cho người khác');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count(format($$select * from public.notifications where user_id = %L$$, :tv2)) = 0, 'không đọc thông báo của người khác');
select t.denied(format($$delete from public.notifications where user_id = %L$$, :tv2), 'xóa thông báo của người khác');

-- 8. Khách chưa đăng nhập không đọc được.
reset role;
set role anon;
select t.denied($$select * from public.tasks$$, 'khách đọc tasks');
reset role;

select 'OK: kiểm thử việc, lịch, đặt lịch, thông báo' as ket_qua;
