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

-- 5. Trang đặt lịch: Hiệu trưởng mở trang; tv2 gửi yêu cầu; chỉ hai bên thấy.
select set_config('request.jwt.claim.sub', :hieutruong, false);
insert into public.booking_pages (user_id, hours_note) values (:hieutruong, 'Sáng thứ Ba');
select t.denied(format($$insert into public.booking_pages (user_id) values (%L)$$, :thuky), 'mở trang đặt lịch thay người khác');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied(format($$insert into public.bookings (host_id, requester_id, starts_at, ends_at, topic) values (%L, %L, now() + interval '2 day', now() + interval '2 day 30 min', 'x')$$, :thuky, :tv2), 'đặt lịch với người chưa mở trang');
select t.denied(format($$insert into public.bookings (host_id, requester_id, starts_at, ends_at, topic) values (%L, %L, now() + interval '2 day', now() + interval '2 day 30 min', 'x')$$, :hieutruong, :thuky), 'đặt lịch thay người khác');
select t.denied(format($$insert into public.bookings (host_id, requester_id, starts_at, ends_at, topic, status) values (%L, %L, now() + interval '2 day', now() + interval '2 day 30 min', 'x', 'accepted')$$, :hieutruong, :tv2), 'tự đặt trạng thái đồng ý');
insert into public.bookings (id, host_id, requester_id, starts_at, ends_at, topic)
values ('30000000-0000-0000-0000-000000000001', :hieutruong, :tv2, now() + interval '2 day', now() + interval '2 day 30 min', 'Xin ý kiến đề án');
select t.denied($$update public.bookings set status = 'accepted' where id = '30000000-0000-0000-0000-000000000001'$$, 'người đặt tự đồng ý');
select t.denied($$update public.bookings set topic = 'khác' where id = '30000000-0000-0000-0000-000000000001'$$, 'sửa nội dung yêu cầu đã gửi');

select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count('select * from public.bookings') = 0, 'người thứ ba không thấy yêu cầu đặt lịch');
select t.ok(t.count(format($$select * from public.booking_busy(%L, now(), now() + interval '7 day')$$, :hieutruong)) = 1, 'người khác chỉ thấy giờ bận');

select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count('select * from public.notifications where kind = ''booking_new''') = 1, 'người nhận được thông báo yêu cầu gặp');
update public.bookings set status = 'accepted', response_note = 'Gặp tại phòng Hiệu trưởng' where id = '30000000-0000-0000-0000-000000000001';

-- 6. Trùng giờ với lịch đã đồng ý bị chặn.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.bookings (id, host_id, requester_id, starts_at, ends_at, topic)
values ('30000000-0000-0000-0000-000000000002', :hieutruong, :thuky, now() + interval '2 day 10 min', now() + interval '2 day 40 min', 'Trùng giờ');
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.denied($$update public.bookings set status = 'accepted' where id = '30000000-0000-0000-0000-000000000002'$$, 'đồng ý hai lịch trùng giờ');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.notifications where kind = ''booking_accepted''') = 1, 'người đặt nhận thông báo được đồng ý');
update public.bookings set status = 'cancelled' where id = '30000000-0000-0000-0000-000000000001';

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
select t.denied($$select * from public.bookings$$, 'khách đọc bookings');
reset role;

select 'OK: kiểm thử việc, lịch, đặt lịch, thông báo' as ket_qua;
