-- Kiểm thử nhắc việc ở quả chuông: việc gấp hiện; xong thì chuyển xuống thông báo thường (đã đọc);
-- gỡ tay thì ghi "Đã gỡ nhắc"; đổi hạn không tính là xong; thông báo cũ quá 45 ngày bị xóa.
\set ON_ERROR_STOP 1

\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set g1 '''10000000-0000-0000-0000-000000000001'''

set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.tasks (id, group_id, title, assignee_id, due_date, priority) values
  ('2b000000-0000-0000-0000-000000000001', :g1, 'Nộp báo cáo gấp', :tv2, current_date + 10, 'urgent'),
  ('2b000000-0000-0000-0000-000000000002', :g1, 'Duyệt hồ sơ', :tv2, current_date, 'normal'),
  ('2b000000-0000-0000-0000-000000000003', :g1, 'Việc chưa gấp', :tv2, current_date + 30, 'normal');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'task:2b%'$$) = 2, 'việc gấp và việc hạn hôm nay hiện, việc xa chưa hiện');

-- Đổi hạn: vẫn là cùng một mục, không ghi "Đã xong".
select set_config('request.jwt.claim.sub', :thuky, false);
update public.tasks set due_date = current_date + 1 where id = '2b000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'task:2b%'$$) = 2, 'đổi hạn vẫn nhắc');
select t.ok(t.count($$select * from public.notifications where kind = 'da_xu_ly' and (title like '%Nộp báo cáo gấp' or title like '%Duyệt hồ sơ')$$) = 0, 'đổi hạn không tính là xong');

-- Hoàn thành việc gấp: chuyển xuống thông báo thường, đã đọc.
update public.tasks set status = 'done' where id = '2b000000-0000-0000-0000-000000000001';
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'task:2b%'$$) = 1, 'việc xong thì hết nhắc');
select t.ok(t.count($$select * from public.notifications where kind = 'da_xu_ly' and title = 'Đã xong: Nộp báo cáo gấp' and read_at is not null$$) = 1,
            'việc xong chuyển thành thông báo thường đã đọc');
select t.ok(t.count($$select * from public.sync_alerts()$$) >= 0, 'gọi lại');
select t.ok(t.count($$select * from public.notifications where kind = 'da_xu_ly' and (title like '%Nộp báo cáo gấp' or title like '%Duyệt hồ sơ')$$) = 1, 'gọi lại không ghi trùng');

-- Gỡ tay: ghi "Đã gỡ nhắc".
insert into public.alert_dismissals (ref_key)
select ref_key from public.my_alerts() where title = 'Duyệt hồ sơ';
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'task:2b%'$$) = 0, 'gỡ tay thì hết nhắc');
select t.ok(t.count($$select * from public.notifications where title = 'Đã gỡ nhắc: Duyệt hồ sơ'$$) = 1, 'gỡ tay chuyển thành "Đã gỡ nhắc"');

-- Không gọi được hàm dọn dẹp từ phía người dùng.
select t.denied($$select private.xoa_thong_bao_cu()$$, 'người dùng không gọi được hàm xóa thông báo');

-- Dọn thông báo cũ: chỉ xóa khi cả lúc tạo và lúc đọc đều quá 45 ngày.
reset role;
insert into public.notifications (user_id, kind, title, created_at, read_at) values
  (:tv2, 'test', 'cũ, chưa đọc', now() - interval '50 days', null),
  (:tv2, 'test', 'cũ, đọc gần đây', now() - interval '50 days', now() - interval '3 days'),
  (:tv2, 'test', 'mới', now() - interval '10 days', null);
select private.xoa_thong_bao_cu();
select t.ok(t.count($$select * from public.notifications where kind = 'test'$$) = 2, 'chỉ xóa thông báo không đụng đến quá 45 ngày');
select t.ok(not exists (select 1 from public.notifications where title = 'cũ, chưa đọc'), 'thông báo cũ chưa đọc bị xóa');
