-- Kiểm thử việc lặp lại: hoàn thành một kỳ thì việc tự chuyển sang kỳ sau.
\set ON_ERROR_STOP 1

\set tv1 '''00000000-0000-0000-0000-0000000000d1'''

set role authenticated;
select set_config('request.jwt.claim.sub', :tv1, false);
select set_config('t.rp', public.create_personal_project('Dự án lặp lại')::text, false);

-- Hạn là Chủ nhật tuần này (giờ Việt Nam), bắt đầu thứ Hai.
select set_config('t.sun', ((now() at time zone 'Asia/Ho_Chi_Minh')::date
  + ((7 - extract(isodow from (now() at time zone 'Asia/Ho_Chi_Minh')::date)::int) % 7))::text, false);

insert into public.tasks (group_id, title, start_date, due_date, assignee_id, repeat_rule)
values (current_setting('t.rp')::uuid, 'Báo cáo tuần', current_setting('t.sun')::date - 6, current_setting('t.sun')::date, auth.uid(), 'weekly');
select set_config('t.id', (select id from public.tasks where title = 'Báo cáo tuần')::text, false);

update public.tasks set status = 'done' where id = current_setting('t.id')::uuid;
select t.ok((select status = 'todo' and due_date = current_setting('t.sun')::date + 7
  and start_date = current_setting('t.sun')::date + 1 and repeat_done_count = 1
  and completed_at is null and repeat_last_done_at is not null
  from public.tasks where id = current_setting('t.id')::uuid), 'hoàn thành thì sang tuần sau');

-- Hoàn thành trễ nhiều kỳ: nhảy tới kỳ chưa qua, không dồn lại.
reset role;
update public.tasks set due_date = current_setting('t.sun')::date - 21, start_date = current_setting('t.sun')::date - 27
  where id = current_setting('t.id')::uuid;
set role authenticated;
update public.tasks set status = 'done' where id = current_setting('t.id')::uuid;
select t.ok((select status = 'todo' and due_date = current_setting('t.sun')::date and repeat_done_count = 2
  from public.tasks where id = current_setting('t.id')::uuid), 'trễ thì nhảy tới kỳ hiện tại');

-- Hết lịch lặp: kỳ cuối giữ Hoàn thành.
update public.tasks set repeat_until = current_setting('t.sun')::date where id = current_setting('t.id')::uuid;
update public.tasks set status = 'done' where id = current_setting('t.id')::uuid;
select t.ok((select status = 'done' and due_date = current_setting('t.sun')::date and repeat_done_count = 3
  from public.tasks where id = current_setting('t.id')::uuid), 'kỳ cuối giữ Hoàn thành');

-- Hằng tháng.
insert into public.tasks (group_id, title, due_date, repeat_rule)
values (current_setting('t.rp')::uuid, 'Báo cáo tháng', current_setting('t.sun')::date, 'monthly');
update public.tasks set status = 'done' where title = 'Báo cáo tháng';
select t.ok((select status = 'todo' and due_date = (current_setting('t.sun')::date + interval '1 month')::date
  from public.tasks where title = 'Báo cáo tháng'), 'hằng tháng');

-- Việc lặp lại phải có hạn; quy tắc lạ bị từ chối.
select t.denied(format('insert into public.tasks (group_id, title, repeat_rule) values (%L, %L, %L)',
  current_setting('t.rp'), 'Không hạn', 'weekly'), 'lặp lại phải có hạn');
select t.denied(format('insert into public.tasks (group_id, title, due_date, repeat_rule) values (%L, %L, current_date, %L)',
  current_setting('t.rp'), 'Lạ', 'yearly'), 'quy tắc không hợp lệ');

-- Việc không lặp vẫn hoàn thành như cũ.
insert into public.tasks (group_id, title, due_date) values (current_setting('t.rp')::uuid, 'Việc thường', current_date);
update public.tasks set status = 'done' where title = 'Việc thường';
select t.ok((select status = 'done' and completed_at is not null from public.tasks where title = 'Việc thường'), 'việc thường không lặp');
reset role;
