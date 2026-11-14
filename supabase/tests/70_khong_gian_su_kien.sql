-- Không gian con, đôn đốc việc, đính kèm sản phẩm. Chạy sau các kiểm thử trước (dùng lại người dùng, nhóm 1).
\set ON_ERROR_STOP 1
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set xem '''00000000-0000-0000-0000-0000000000f1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''

set role authenticated;

-- xem: thành viên chỉ xem của nhóm 1 (không thuộc không gian con).
reset role;
insert into public.invitations (email) values ('xem@vnu.edu.vn');
insert into auth.users (id, email) values (:xem, 'xem@vnu.edu.vn');
insert into public.group_members (group_id, user_id, can_view) values (:g1, :xem, true);
set role authenticated;

-- 1. Thành viên chỉ xem của nhóm cha không tạo được không gian con.
select set_config('request.jwt.claim.sub', :xem, false);
select t.denied(format($$select public.create_subgroup(%L, 'Không gian lén', null, '{}')$$, :g1), 'thành viên chỉ xem tạo không gian con');

-- 2. Thư ký (quản lý nhóm 1) tạo không gian sự kiện, chọn tv2 tham gia.
select set_config('request.jwt.claim.sub', :thuky, false);
select public.create_subgroup(:g1, 'Ngày hội tuyển sinh', 'Chuẩn bị gian hàng', array[:tv2]::uuid[]) as sg \gset
select t.ok((select parent_id from public.groups where id = :'sg') = :g1, 'không gian con gắn với nhóm cha');
select t.ok((select is_manager from public.group_members where group_id = :'sg' and user_id = :thuky), 'người tạo là Trưởng nhóm không gian con');
select t.ok((select can_create and can_upload and not can_edit from public.group_members where group_id = :'sg' and user_id = :tv2), 'người tham gia được tạo việc, gắn sản phẩm');
select t.ok(t.count(format('select * from public.group_members where group_id = %L', :'sg')) = 2, 'chỉ người được chọn tham gia');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.notifications where kind = 'subgroup_added'$$) = 1, 'người tham gia nhận thông báo');

-- 3. Đôn đốc.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.tasks (group_id, title, assignee_id, due_date) values (:'sg', 'In tờ rơi', :tv2, current_date - 1) returning id as task \gset
select public.nudge_task(:'task', 'Mai cần rồi');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.notifications where kind = 'task_nudge' and body like '%Mai cần rồi%'$$) = 1, 'người được giao nhận lời nhắc');
select t.denied(format($$select public.nudge_task(%L)$$, :'task'), 'người được giao tự nhắc mình');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.denied(format($$select public.nudge_task(%L)$$, :'task'), 'nhắc lại trong vòng 1 giờ');

-- 4. Sản phẩm: chỉ link Google Drive/Docs.
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.task_links (task_id, url, label) values (:'task', 'https://drive.google.com/file/d/abc/view', 'Bản in thử');
select t.denied(format($$insert into public.task_links (task_id, url) values (%L, 'https://evil.example.com/x')$$, :'task'), 'link ngoài Google Drive');
select t.denied(format($$insert into public.task_links (task_id, url, created_by) values (%L, 'https://docs.google.com/x', %L)$$, :'task', :thuky), 'gắn link mạo danh người khác');

-- 5. Thành viên nhóm cha (không tham gia không gian con) xem được việc và sản phẩm bên trong (migration
--    20261114000003), nhưng chỉ xem: không sửa, không đôn đốc.
select set_config('request.jwt.claim.sub', :xem, false);
select t.ok(t.count(format('select * from public.tasks where group_id = %L', :'sg')) = 1, 'thành viên nhóm cha thấy việc của không gian con');
select t.ok(t.count('select * from public.task_links') = 1, 'thành viên nhóm cha thấy sản phẩm');
select t.denied(format($$update public.tasks set title = 'đổi' where id = %L$$, :'task'), 'thành viên nhóm cha sửa việc không gian con');
select t.denied(format($$select public.nudge_task(%L)$$, :'task'), 'thành viên nhóm cha đôn đốc');

-- 6. Người tạo link xóa được link của mình.
select set_config('request.jwt.claim.sub', :tv2, false);
delete from public.task_links where label = 'Bản in thử';
select t.ok(t.count('select * from public.task_links') = 0, 'xóa link của mình');
reset role;
select 'OK: không gian sự kiện' as ket_qua;
