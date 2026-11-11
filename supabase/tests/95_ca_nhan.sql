-- Kiểm thử không gian cá nhân. Chạy sau 10_ và 90_ (dùng lại dữ liệu).
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;

-- 1. Thành viên thường tự có không gian "Cá nhân" và tạo dự án cá nhân.
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(public.my_personal_group() = public.my_personal_group(), 'gọi lại trả cùng một nhóm');
select t.ok((select owner_id from public.groups where id = public.my_personal_group()) = :tv1, 'chủ sở hữu là người gọi');
select set_config('t.p1', public.create_personal_project('Nghiên cứu khoa học cá nhân')::text, false);
select t.ok((select parent_id = public.my_personal_group() and owner_id = :tv1 from public.groups where id = current_setting('t.p1')::uuid), 'dự án là nhóm con, cùng chủ');
insert into public.tasks (group_id, title, assignee_id, start_date, due_date, progress)
  values (current_setting('t.p1')::uuid, 'Viết bài Privacy Symposium', auth.uid(), '2026-11-10', '2026-11-15', 30);
insert into public.events (group_id, title, starts_at, ends_at)
  values (public.my_personal_group(), 'Hạn nộp bài', '2026-11-15 09:00+07', '2026-11-15 10:00+07');
select t.ok(t.count('select * from public.tasks where progress = 30') = 1, 'chủ thấy việc cá nhân');
select t.denied(format($$insert into public.tasks (group_id, title, assignee_id) values (%L, 'x', %L)$$, current_setting('t.p1'), :tv2), 'không giao việc cá nhân cho người khác');
select t.denied(format($$insert into public.tasks (group_id, title, start_date, due_date) values (%L, 'x', '2026-12-02', '2026-12-01')$$, current_setting('t.p1')), 'bắt đầu sau hạn');
select t.denied(format($$insert into public.group_members (group_id, user_id) values (%L, %L)$$, current_setting('t.p1'), :tv2), 'không thêm người khác');
select t.denied($$insert into public.groups (name, owner_id) values ('Giả', auth.uid())$$, 'không tự gắn chủ sở hữu');

-- Không gian con tạo bằng create_subgroup cũng là cá nhân.
select set_config('t.p2', public.create_subgroup(public.my_personal_group(), 'Giảng dạy', null, array[:tv2]::uuid[])::text, false);
select t.ok((select owner_id = :tv1 from public.groups where id = current_setting('t.p2')::uuid), 'nhóm con kế thừa chủ');
select t.ok(t.count(format($$select * from public.group_members where group_id = %L$$, current_setting('t.p2'))) = 1, 'nhóm con chỉ có chủ');

-- 2. Người khác, kể cả quản trị, Hiệu trưởng và thư ký toàn quyền, không thấy.
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count(format($$select * from public.groups where owner_id = %L$$, :tv1)) = 0, 'quản trị không thấy nhóm cá nhân');
select t.ok(t.count('select * from public.tasks where progress = 30') = 0, 'quản trị không thấy việc cá nhân');
select t.ok(t.count($$select * from public.events where title = 'Hạn nộp bài'$$) = 0, 'quản trị không thấy lịch cá nhân');
select t.ok(t.count($$select * from public.activity_log where new_data ->> 'title' = 'Viết bài Privacy Symposium'$$) = 0, 'nhật ký không ghi việc cá nhân');
select t.ok(t.count($$select * from public.group_directory() where name = 'Nghiên cứu khoa học cá nhân'$$) = 0, 'danh bạ bỏ qua');
select t.ok(t.count(format($$select * from public.group_open_task_titles(%L)$$, current_setting('t.p1'))) = 0, 'không lộ tên việc');
select t.ok(t.count(format($$select * from public.group_contacts(%L)$$, current_setting('t.p1'))) = 0, 'không lộ liên hệ');
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count(format($$select * from public.groups where owner_id = %L$$, :tv1)) = 0, 'Hiệu trưởng không thấy');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count(format($$select * from public.groups where owner_id = %L$$, :tv1)) = 0, 'thư ký không thấy');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied(format($$select public.request_join(%L)$$, current_setting('t.p1')), 'không xin tham gia');
select set_config('t.g2', public.my_personal_group()::text, false);
select t.ok((select owner_id from public.groups where id = current_setting('t.g2')::uuid) = :tv2, 'người khác có nhóm riêng');
reset role;
select t.ok((select count(*) from public.groups where owner_id is not null and parent_id is null) = 2, 'mỗi người một nhóm gốc');
