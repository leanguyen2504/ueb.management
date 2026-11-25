-- Kiểm thử đầu việc lặp lại: tính ngày kế tiếp, tự tạo lần sau khi hoàn thành, không tạo trùng, quyền sửa.
\set ON_ERROR_STOP 1

\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''

reset role;
-- 1. Tính ngày kế tiếp.
select t.ok(private.task_next_due('2030-01-01', 'daily', 3, null, '2030-01-05') = '2030-01-07', 'mỗi 3 ngày');
select t.ok(private.task_next_due('2030-01-11', 'weekdays', 1, null, '2030-01-11') = '2030-01-14', 'ngày làm việc: thứ Sáu sang thứ Hai');
select t.ok(private.task_next_due('2030-01-07', 'weekly', 1, null, '2030-01-07') = '2030-01-14', 'hằng tuần cùng thứ');
select t.ok(private.task_next_due('2030-01-07', 'weekly', 2, '{1,4}', '2030-01-07') = '2030-01-10', '2 tuần một lần, T2 và T5: cùng tuần');
select t.ok(private.task_next_due('2030-01-07', 'weekly', 2, '{1,4}', '2030-01-10') = '2030-01-21', '2 tuần một lần, T2 và T5: bỏ tuần lẻ');
select t.ok(private.task_next_due('2030-01-31', 'monthly', 1, null, '2030-01-31') = '2030-02-28', 'ngày 31 sang tháng Hai');
select t.ok(private.task_next_due('2030-01-31', 'monthly', 1, null, '2030-02-28') = '2030-03-31', 'tháng Ba quay lại ngày 31');
select t.ok(private.task_next_due('2030-01-15', 'monthly', 3, null, '2030-06-20') = '2030-07-15', 'mỗi quý');
select t.ok(private.task_next_due('2028-02-29', 'yearly', 1, null, '2028-02-29') = '2029-02-28', 'hằng năm từ 29/2');

-- 2. Thư ký tạo việc hằng tuần giao cho tv2; tv2 hoàn thành thì có lần kế tiếp.
set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.tasks (id, group_id, title, assignee_id, due_date, due_time, start_date, repeat_rule, repeat_until)
values ('2a000000-0000-0000-0000-000000000001', :g1, 'Báo cáo tuần', :tv2, '2030-01-07', '16:00', '2030-01-04', 'weekly', '2030-01-14');
select t.ok((select repeat_anchor = '2030-01-07' from public.tasks where id = '2a000000-0000-0000-0000-000000000001'), 'ngày gốc lấy theo hạn');
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied($$update public.tasks set repeat_rule = 'daily' where id = '2a000000-0000-0000-0000-000000000001'$$, 'người chỉ đổi trạng thái không sửa lặp lại');
update public.tasks set status = 'done' where id = '2a000000-0000-0000-0000-000000000001';
select t.ok(t.count($$select * from public.tasks where title = 'Báo cáo tuần'$$) = 2, 'hoàn thành thì tạo lần kế tiếp');
select t.ok((select due_date = '2030-01-14' and due_time = '16:00' and start_date = '2030-01-11' and assignee_id = :tv2
                and repeat_rule = 'weekly' and status = 'todo'
             from public.tasks where title = 'Báo cáo tuần' and id <> '2a000000-0000-0000-0000-000000000001'),
            'lần sau giữ giờ hạn, người thực hiện, khoảng bắt đầu');
-- Mở lại rồi hoàn thành lại: không tạo trùng.
update public.tasks set status = 'doing' where id = '2a000000-0000-0000-0000-000000000001';
update public.tasks set status = 'done' where id = '2a000000-0000-0000-0000-000000000001';
select t.ok(t.count($$select * from public.tasks where title = 'Báo cáo tuần'$$) = 2, 'hoàn thành lại không tạo trùng');
-- Lần cuối (đến ngày kết thúc): không tạo thêm.
update public.tasks set status = 'done' where title = 'Báo cáo tuần' and due_date = '2030-01-14';
select t.ok(t.count($$select * from public.tasks where title = 'Báo cáo tuần'$$) = 2, 'qua ngày kết thúc thì dừng');

-- 3. Bỏ lặp lại thì xóa các cột đi kèm; việc lặp chưa có hạn thì lấy hôm nay.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.tasks (id, group_id, title, repeat_rule, repeat_days)
values ('2a000000-0000-0000-0000-000000000002', :g1, 'Kiểm tra hộp thư', 'daily', '{1}');
select t.ok((select due_date is not null and repeat_days is null from public.tasks where id = '2a000000-0000-0000-0000-000000000002'), 'chưa có hạn thì lấy hôm nay; kiểu ngày bỏ thứ');
update public.tasks set repeat_rule = null where id = '2a000000-0000-0000-0000-000000000002';
select t.ok((select repeat_anchor is null from public.tasks where id = '2a000000-0000-0000-0000-000000000002'), 'bỏ lặp lại thì xóa ngày gốc');
reset role;
