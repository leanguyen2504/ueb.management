-- Kiểm thử danh bạ nhóm, yêu cầu tham gia và giới hạn truy cập cùng lúc. Chạy sau 10_ (dùng lại dữ liệu).
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set khach '''00000000-0000-0000-0000-0000000000f9'''
\set g9 '''10000000-0000-0000-0000-000000000009'''
\set t9 '''20000000-0000-0000-0000-000000000009'''

-- Người mới có email @vnu.edu.vn tự vào được, chưa thuộc nhóm nào.
insert into auth.users (id, email) values (:khach, 'nguoimoi@vnu.edu.vn');

set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.groups (id, name, kind, description) values (:g9, 'Dự án Chuyển đổi số', 'project', 'Số hóa hồ sơ');
insert into public.tasks (id, group_id, title, description) values (:t9, :g9, 'Khảo sát quy trình', 'Chi tiết nội bộ');

-- 1. Người mới thấy nhóm trong danh bạ, lãnh đạo và tên việc, nhưng không thấy dữ liệu bên trong.
select set_config('request.jwt.claim.sub', :khach, false);
select t.ok(t.count(format($$select * from public.groups where id = %L$$, :g9)) = 0, 'người ngoài không đọc trực tiếp nhóm');
select t.ok((select not can_view and not is_member and open_tasks = 1 from public.group_directory() where id = :g9), 'danh bạ có nhóm và số việc mở');
select t.ok((select role from public.group_contacts(:g9) where user_id = :thuky) = 'Trưởng nhóm', 'thấy Trưởng nhóm');
select t.ok((select title from public.group_open_task_titles(:g9)) = 'Khảo sát quy trình', 'thấy tên việc');
select t.ok(t.count(format($$select * from public.tasks where group_id = %L$$, :g9)) = 0, 'không đọc được chi tiết việc');
select t.ok(t.count(format($$select * from public.group_members where group_id = %L$$, :g9)) = 0, 'không đọc được danh sách thành viên');

-- 2. Xin tham gia nhóm; không gửi trùng; Trưởng nhóm nhận thông báo.
select public.request_join(:g9, null, 'Em muốn hỗ trợ');
select t.denied(format($$select public.request_join(%L)$$, :g9), 'gửi trùng yêu cầu');
select t.denied($$insert into public.join_requests (group_id, requester_id) values ('10000000-0000-0000-0000-000000000009', auth.uid())$$, 'ghi thẳng vào bảng yêu cầu');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count($$select * from public.notifications where kind = 'join_request'$$) = 1, 'Trưởng nhóm nhận thông báo');
select t.ok(t.count(format($$select * from public.join_requests where group_id = %L and status = 'pending'$$, :g9)) = 1, 'Trưởng nhóm thấy yêu cầu');

-- 3. Người khác không duyệt được; người xin tự hủy được.
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.join_requests') = 0, 'người khác không thấy yêu cầu');
select t.denied(format($$select public.decide_join_request(id, true) from public.join_requests where group_id = %L$$, :g9), 'người ngoài duyệt');
select set_config('request.jwt.claim.sub', :khach, false);
select t.denied(format($$select public.decide_join_request(id, true) from public.join_requests where group_id = %L$$, :g9), 'tự duyệt yêu cầu của mình');
select public.cancel_join_request(id) from public.join_requests where group_id = :g9 and status = 'pending';

-- 4. Xin tham gia một việc; Trưởng nhóm duyệt: được vào nhóm và được giao việc chưa có người làm.
select public.request_join(:g9, :t9, null);
select set_config('request.jwt.claim.sub', :thuky, false);
select public.decide_join_request(id, true) from public.join_requests where task_id = :t9 and status = 'pending';
select set_config('request.jwt.claim.sub', :khach, false);
select t.ok((select can_view from public.group_directory() where id = :g9), 'được vào nhóm sau khi duyệt');
select t.ok((select assignee_id from public.tasks where id = :t9) = :khach, 'được giao việc');
select t.ok(t.count($$select * from public.notifications where kind = 'join_decided'$$) = 1, 'người xin nhận kết quả');
select t.denied(format($$select public.request_join(%L)$$, :g9), 'đã là thành viên thì không xin vào nhóm nữa');

-- 5. Giới hạn truy cập cùng lúc.
reset role;
update public.system_settings set max_online = 1;
delete from public.presence;
insert into public.presence (user_id) values (:tv2);
set role authenticated;
select set_config('request.jwt.claim.sub', :khach, false);
select t.ok(not (public.enter_app() ->> 'allowed')::boolean, 'đủ người thì người mới phải chờ');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok((public.enter_app() ->> 'allowed')::boolean, 'người đang dùng vẫn tiếp tục');
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok((public.enter_app() ->> 'allowed')::boolean, 'quản trị luôn vào được');
select t.denied('select * from public.presence', 'đọc trực tiếp bảng presence');
reset role;
update public.presence set seen_at = now() - interval '11 minutes';
set role authenticated;
select set_config('request.jwt.claim.sub', :khach, false);
select t.ok((public.enter_app() ->> 'allowed')::boolean, 'người cũ rời đi thì người mới vào được');
reset role;
update public.system_settings set max_online = 200;

select 'OK: kiểm thử danh bạ nhóm và xin tham gia' as ket_qua;
