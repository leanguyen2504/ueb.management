-- Yêu cầu xóa không gian, lịch, việc: thành viên gửi, Trưởng nhóm duyệt.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set truong '''00000000-0000-0000-0000-0000000000a1'''
\set sua '''00000000-0000-0000-0000-0000000000a2'''
\set ngoai '''00000000-0000-0000-0000-0000000000a3'''

insert into auth.users (id, email) values (:truong, 'xoa.truong@vnu.edu.vn'), (:sua, 'xoa.sua@vnu.edu.vn'), (:ngoai, 'xoa.ngoai@vnu.edu.vn');

set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.groups (name, kind) values ('Tổ thử xóa', 'other');
select set_config('t.root', (select id from public.groups where name = 'Tổ thử xóa')::text, false);
insert into public.group_members (group_id, user_id, is_manager) values (current_setting('t.root')::uuid, :truong, true);
insert into public.group_members (group_id, user_id, can_view, can_create, can_edit) values (current_setting('t.root')::uuid, :sua, true, true, true);
select set_config('t.a', public.create_subgroup(current_setting('t.root')::uuid, 'Đề tài thừa', null, null)::text, false);
select set_config('t.b', public.create_subgroup(current_setting('t.root')::uuid, 'Đề tài có con', null, null)::text, false);
select set_config('t.c', public.create_subgroup(current_setting('t.b')::uuid, 'Con', null, null)::text, false);
insert into public.tasks (group_id, title) values (current_setting('t.root')::uuid, 'Việc thừa');
select set_config('t.task', (select id from public.tasks where title = 'Việc thừa')::text, false);
insert into public.events (group_id, title, starts_at, ends_at) values (current_setting('t.root')::uuid, 'Lịch thừa', now() + interval '1 day', now() + interval '1 day 1 hour');
select set_config('t.ev', (select id from public.events where title = 'Lịch thừa')::text, false);

-- Thành viên có quyền sửa không còn xóa thẳng được; phải gửi yêu cầu.
select set_config('request.jwt.claim.sub', :sua, false);
select t.denied(format('delete from public.tasks where id = %L', current_setting('t.task')), 'quyền sửa không xóa thẳng việc');
select t.denied(format('delete from public.events where id = %L', current_setting('t.ev')), 'quyền sửa không xóa thẳng lịch');
select t.ok(public.request_delete('task', current_setting('t.task')::uuid, 'Trùng việc khác') = 'requested', 'gửi yêu cầu xóa việc');
select t.ok(t.count(format('select * from public.tasks where id = %L', current_setting('t.task'))) = 1, 'việc còn nguyên khi chưa duyệt');
select t.denied(format('select public.request_delete(%L, %L)', 'task', current_setting('t.task')), 'không gửi trùng yêu cầu');
select t.ok(t.count('select * from public.delete_requests') = 1, 'người gửi thấy yêu cầu của mình');
select t.denied(format('select public.decide_delete_request(%L, true)', (select id from public.delete_requests limit 1)), 'người gửi không tự duyệt');
select t.denied(format('select public.request_delete(%L, %L)', 'group', current_setting('t.b')), 'không gian còn con thì chưa xóa được');
select t.denied(format('select public.request_delete(%L, %L)', 'group', current_setting('t.root')), 'nhóm gốc không xóa, chỉ lưu trữ');
select t.ok(public.request_delete('group', current_setting('t.a')::uuid) = 'requested', 'gửi yêu cầu xóa không gian');
select t.ok(public.request_delete('event', current_setting('t.ev')::uuid) = 'requested', 'gửi yêu cầu xóa lịch');

-- Người ngoài nhóm không gửi được.
select set_config('request.jwt.claim.sub', :ngoai, false);
select t.denied(format('select public.request_delete(%L, %L)', 'task', current_setting('t.task')), 'người ngoài không gửi yêu cầu');
select t.ok(t.count('select * from public.delete_requests') = 0, 'người ngoài không thấy yêu cầu');

-- Trưởng nhóm thấy, nhận thông báo, duyệt.
select set_config('request.jwt.claim.sub', :truong, false);
select t.ok(t.count('select * from public.delete_requests where status = ''pending''') = 3, 'Trưởng nhóm thấy các yêu cầu');
select t.ok(t.count('select * from public.notifications where kind = ''delete_request''') = 3, 'Trưởng nhóm nhận thông báo');
select public.decide_delete_request((select id from public.delete_requests where item_type = 'task'), true);
select t.ok(t.count(format('select * from public.tasks where id = %L', current_setting('t.task'))) = 0, 'duyệt thì việc bị xóa');
select public.decide_delete_request((select id from public.delete_requests where item_type = 'group'), false);
reset role;
select t.ok(t.count(format('select * from public.groups where id = %L', current_setting('t.a'))) = 1, 'từ chối thì không gian còn');
set role authenticated;
-- Trưởng nhóm xóa thẳng lịch: yêu cầu đang chờ tự đóng.
delete from public.events where id = current_setting('t.ev')::uuid;
select t.ok((select status from public.delete_requests where item_type = 'event') = 'approved', 'xóa thẳng thì yêu cầu tự đóng');
-- Trưởng nhóm xóa không gian ngay, không cần yêu cầu.
select t.ok(public.request_delete('group', current_setting('t.a')::uuid) = 'deleted', 'Trưởng nhóm xóa không gian ngay');
reset role;
select t.ok(t.count(format('select * from public.groups where id = %L', current_setting('t.a'))) = 0, 'không gian đã xóa');
set role authenticated;

select set_config('request.jwt.claim.sub', :sua, false);
select t.ok(t.count('select * from public.notifications where kind = ''delete_decided''') = 2, 'người gửi nhận kết quả');
-- Rút yêu cầu.
-- (Thành viên nhóm cha nay xem được không gian con, nên thử bằng người ngoài.)
select set_config('request.jwt.claim.sub', :ngoai, false);
select t.denied(format('select public.request_delete(%L, %L)', 'group', current_setting('t.c')), 'không thấy không gian thì không gửi được');
select set_config('request.jwt.claim.sub', :sua, false);
insert into public.tasks (group_id, title) values (current_setting('t.root')::uuid, 'Việc giữ lại');
select set_config('t.task2', (select id from public.tasks where title = 'Việc giữ lại')::text, false);
select public.request_delete('task', current_setting('t.task2')::uuid);
select public.cancel_delete_request((select id from public.delete_requests where item_id = current_setting('t.task2')::uuid));
select t.ok((select status from public.delete_requests where item_id = current_setting('t.task2')::uuid) = 'cancelled', 'người gửi rút được yêu cầu');
reset role;
select 'OK: yêu cầu xóa' as ket_qua;
