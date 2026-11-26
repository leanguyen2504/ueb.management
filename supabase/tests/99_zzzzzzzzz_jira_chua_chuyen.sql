-- Kiểm thử cảnh báo mã Jira chưa chuyển người nhận: mã chưa đóng mà mình vẫn là người được giao.
\set ON_ERROR_STOP 1

\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

reset role;
delete from public.jira_issues where user_id = :tv2 and issue_key like 'CHUYEN-%';
insert into public.jira_issues (user_id, issue_key, summary, status, status_category, is_assignee, resolved_at) values
  (:tv2, 'CHUYEN-1', 'Còn ở mình, đang làm', 'In Progress', 'indeterminate', true, null),
  (:tv2, 'CHUYEN-2', 'Đã chuyển cho lãnh đạo', 'In Progress', 'indeterminate', false, null),
  (:tv2, 'CHUYEN-3', 'Đã đóng', 'Done', 'done', true, now()),
  (:tv2, 'CHUYEN-4', 'Còn ở mình, chưa làm', 'To Do', 'new', true, null);

set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'jira-chuyen:%'$$) = 2, 'chỉ nhắc mã chưa đóng còn giao cho mình');
select t.ok(t.count($$select * from public.my_alerts() where ref_key = 'jira-chuyen:CHUYEN-1' and level = 'can_xu_ly' and source = 'jira'$$) = 1, 'nhắc mức cần xử lý, nguồn Jira');

-- Chuyển cho người khác (sau khi cập nhật dữ liệu Jira): hết nhắc, chuyển xuống thông báo thường.
reset role;
update public.jira_issues set is_assignee = false where user_id = :tv2 and issue_key = 'CHUYEN-1';
set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count($$select * from public.sync_alerts() where ref_key like 'jira-chuyen:%'$$) = 1, 'đã chuyển thì hết nhắc');
select t.ok(t.count($$select * from public.notifications where title like 'Đã xong: Chưa chuyển người nhận: CHUYEN-1%'$$) = 1, 'đã chuyển ghi thành thông báo thường');

-- Gỡ một mã, rồi tắt hẳn cảnh báo.
insert into public.alert_dismissals (ref_key) values ('jira-chuyen:*');
select t.ok(t.count($$select * from public.my_alerts() where ref_key like 'jira-chuyen:%'$$) = 0, 'tắt hẳn thì không nhắc mã nào');
delete from public.alert_dismissals where ref_key = 'jira-chuyen:*';
select t.ok(t.count($$select * from public.my_alerts() where ref_key like 'jira-chuyen:%'$$) = 1, 'bật lại thì nhắc lại');

reset role;
delete from public.jira_issues where user_id = :tv2 and issue_key like 'CHUYEN-%';
