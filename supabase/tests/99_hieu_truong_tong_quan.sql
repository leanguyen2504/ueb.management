-- Hiệu trưởng chỉ thấy nhóm, dự án, sự kiện, lãnh đạo và đầu mối; không thấy tiến độ, việc,
-- lịch, tài liệu, thành viên, nhật ký bên trong; không tạo, sửa được. Chạy sau các tệp khác.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''

set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.groups (name, kind) values ('Dự án tổng quan', 'project');
select set_config('t.g', (select id from public.groups where name = 'Dự án tổng quan')::text, false);
insert into public.tasks (group_id, title, status, due_date) values
  (current_setting('t.g')::uuid, 'Việc xong', 'done', null),
  (current_setting('t.g')::uuid, 'Việc quá hạn', 'doing', current_date - 5),
  (current_setting('t.g')::uuid, 'Việc giao Hiệu trưởng', 'todo', current_date + 5);
update public.tasks set assignee_id = :hieutruong where title = 'Việc giao Hiệu trưởng';
insert into public.events (group_id, title, starts_at, ends_at)
  values (current_setting('t.g')::uuid, 'Họp dự án', now() + interval '1 day', now() + interval '1 day 1 hour');

-- Hiệu trưởng: thấy nhóm, không thấy tiến độ hay chi tiết.
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count(format('select * from public.groups where id = %L', current_setting('t.g'))) = 1, 'thấy dự án trong danh sách');
select t.ok((select open_tasks is null from public.group_directory() where id = current_setting('t.g')::uuid), 'danh bạ không hiện số việc');
select t.ok(t.count(format('select * from public.group_open_task_titles(%L)', current_setting('t.g'))) = 0, 'không thấy tên việc qua danh bạ');
select t.ok(t.count(format('select * from public.group_contacts(%L)', current_setting('t.g'))) >= 0, 'xem được lãnh đạo, đầu mối');
select t.ok(t.count(format('select * from public.tasks where group_id = %L', current_setting('t.g'))) = 1, 'chỉ thấy việc được giao cho mình');
select t.ok(t.count(format('select * from public.events where group_id = %L', current_setting('t.g'))) = 0, 'không thấy lịch nhóm');
select t.ok(t.count(format('select * from public.activity_log where group_id = %L', current_setting('t.g'))) = 0, 'không thấy nhật ký');
select t.ok(t.count(format('select * from public.group_members where group_id = %L', current_setting('t.g'))) = 0, 'không thấy thành viên');
select t.denied(format($$insert into public.tasks (group_id, title) values (%L, 'Việc mới')$$, current_setting('t.g')), 'không tạo việc');
select t.denied(format($$update public.groups set name = 'Đổi tên' where id = %L$$, current_setting('t.g')), 'không sửa nhóm');
select t.ok(t.count('select * from public.groups where owner_id is not null') = 0, 'không thấy không gian cá nhân');

-- Thêm Hiệu trưởng vào nhóm thì xem được như thành viên.
reset role;
insert into public.group_members (group_id, user_id, can_view) values (current_setting('t.g')::uuid, :hieutruong, true);
set role authenticated;
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count(format('select * from public.events where group_id = %L', current_setting('t.g'))) = 1, 'là thành viên thì thấy lịch nhóm');

select t.ok((select open_tasks = 2 from public.group_directory() where id = current_setting('t.g')::uuid), 'là thành viên thì thấy số việc');

-- Thành viên thường vẫn thấy tên việc qua danh bạ để xin tham gia như trước.
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count(format('select * from public.group_open_task_titles(%L)', current_setting('t.g'))) = 2, 'thành viên thường vẫn thấy tên việc đang mở');
reset role;
