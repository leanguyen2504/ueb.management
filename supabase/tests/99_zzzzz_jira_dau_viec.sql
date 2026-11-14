-- Kiểm thử ô mã Jira trên đầu việc. Chạy sau 20_ (dùng lại việc 2000…01 của nhóm 1, giao cho tv2).
\set ON_ERROR_STOP 1

\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;

-- 1. Người được giao (chỉ có quyền xem nhóm) gắn được mã và link Jira.
select set_config('request.jwt.claim.sub', :tv2, false);
update public.tasks set jira_key = 'KKTPT-7377', jira_url = 'https://jira.example/browse/KKTPT-7377'
  where id = '20000000-0000-0000-0000-000000000001';
select t.ok((select jira_key = 'KKTPT-7377' from public.tasks where id = '20000000-0000-0000-0000-000000000001'), 'người được giao gắn mã Jira');
select t.denied($$update public.tasks set jira_key = 'abc' where id = '20000000-0000-0000-0000-000000000001'$$, 'mã sai dạng');

-- 2. Xóa mã thì link cũng bị xóa.
update public.tasks set jira_key = null where id = '20000000-0000-0000-0000-000000000001';
select t.ok((select jira_url is null from public.tasks where id = '20000000-0000-0000-0000-000000000001'), 'bỏ mã thì bỏ luôn link');

-- 3. Việc Cá nhân cũng gắn được Jira; chỉ chủ thấy.
insert into public.tasks (id, group_id, title, assignee_id)
  values ('20000000-0000-0000-0000-0000000000f1', public.my_personal_group(), 'Việc riêng', auth.uid());
update public.tasks set jira_key = 'KHTC-1' where id = '20000000-0000-0000-0000-0000000000f1';
select t.ok((select jira_key = 'KHTC-1' from public.tasks where id = '20000000-0000-0000-0000-0000000000f1'), 'việc Cá nhân gắn được Jira');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select t.ok(t.count($$select * from public.tasks where jira_key = 'KHTC-1'$$) = 0, 'người khác (kể cả thư ký) không thấy việc Cá nhân gắn mã');
select set_config('request.jwt.claim.sub', :tv2, false);
delete from public.tasks where id = '20000000-0000-0000-0000-0000000000f1';

reset role;
