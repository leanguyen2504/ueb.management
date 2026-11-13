-- Kiểm thử chia sẻ báo cáo Jira cho người liên quan: mặc định không ai thấy; chủ tự bật cho
-- Trưởng nhóm/Văn thư hoặc mọi thành viên nhóm chung; chỉ đọc qua hàm, đã lược bớt cột.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv4 '''00000000-0000-0000-0000-0000000000d4'''
\set tv5 '''00000000-0000-0000-0000-0000000000d5'''
\set tv6 '''00000000-0000-0000-0000-0000000000d6'''
\set nhom '''10000000-0000-0000-0000-000000000099'''

reset role;
insert into auth.users (id, email) values (:tv4, 'tv4@vnu.edu.vn'), (:tv5, 'tv5@vnu.edu.vn'), (:tv6, 'tv6@vnu.edu.vn');

-- Thư ký tạo dự án (thành Trưởng nhóm), thêm tv4, tv5. tv6 không ở nhóm chung nào.
set role authenticated;
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.groups (id, name, kind) values (:nhom, 'Dự án Jira chung', 'project');
insert into public.group_members (group_id, user_id) values (:nhom, :tv4), (:nhom, :tv5);
reset role;

set role service_role;
select public.jira_save_snapshot(:tv4, 'bookmarklet', $${
  "me": {"name": "tv4", "displayName": "Thành viên 4"},
  "issues": [{"key": "DA-1", "summary": "Báo cáo dự án", "statusCategory": "done", "isAssignee": true, "resolved": "2026-11-05T10:00:00.000+0700",
    "custom": {"Sản phẩm": "5-Biên bản loại 1-1h"}, "hasMyWorklog": true, "myLastCommentAt": "2026-11-05T09:00:00.000+0700", "lastComment": {"author": "A", "isMe": false, "created": "2026-11-06T09:00:00.000+0700", "body": "bí mật"}}],
  "worklogs": [{"id": "1", "issueKey": "DA-1", "started": "2026-11-04T08:00:00.000+0700", "seconds": 3600, "comment": "viết"}],
  "mentions": [{"id": "9", "issueKey": "DA-1", "author": "A", "body": "[~tv4] xem", "created": "2026-11-06T09:00:00.000+0700"}],
  "customFieldNames": ["Sản phẩm"]
}$$);
select public.jira_save_snapshot(:tv5, 'bookmarklet', '{"me":{"name":"tv5"},"issues":[{"key":"DA-2","summary":"Việc tv5"}],"worklogs":[],"mentions":[]}');
reset role;

set role authenticated;
-- 1. Mặc định không chia sẻ: chỉ thấy chính mình.
select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count('select * from public.jira_related_people()') = 1, 'mặc định chỉ thấy mình');
select t.ok((select is_me and share_scope = 'none' from public.jira_related_people()), 'dòng của mình, chưa chia sẻ');
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L, %L]::uuid[])', :tv4, :tv5)) = 1, 'chỉ thấy mã việc của mình');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'Trưởng nhóm chưa được chia sẻ thì không thấy');

-- 2. tv4 chia sẻ cho Trưởng nhóm, Văn thư.
select set_config('request.jwt.claim.sub', :tv4, false);
select public.jira_set_share('leads');
select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok(t.count('select * from public.jira_related_people()') = 1, 'Trưởng nhóm thấy tv4');
select t.ok((select groups -> 0 ->> 'name' = 'Dự án Jira chung' from public.jira_related_people() where user_id = :tv4), 'kèm nhóm chung');
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 1, 'Trưởng nhóm thấy mã việc tv4');
select t.ok((select custom ->> 'Sản phẩm' = '5-Biên bản loại 1-1h' from public.jira_related_issues(array[:tv4]::uuid[])), 'có trường Sản phẩm để tính giờ quy đổi');
select t.ok((select my_last_comment_at is not null from public.jira_related_issues(array[:tv4]::uuid[])), 'có thời điểm comment để tính sản phẩm');
select t.ok(t.count(format($$select * from public.jira_related_worklogs(array[%L]::uuid[], '2026-11-01', '2026-12-01')$$, :tv4)) = 1, 'Trưởng nhóm thấy worklog tv4');
select t.ok(t.count(format($$select * from public.jira_related_worklogs(array[%L]::uuid[], '2026-12-01', '2027-01-01')$$, :tv4)) = 0, 'worklog lọc theo kỳ');
-- Bảng gốc vẫn chỉ chủ đọc được (comment, lời nhắc tên không lộ).
select t.ok(t.count(format('select * from public.jira_issues where user_id = %L', :tv4)) = 0, 'không đọc thẳng bảng mã việc');
select t.ok(t.count('select * from public.jira_mentions') = 0, 'không thấy lời nhắc tên');
select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'thành viên thường chưa thấy khi chỉ chia sẻ cho lãnh đạo nhóm');

-- 3. tv4 chia sẻ cho mọi thành viên nhóm chung.
select set_config('request.jwt.claim.sub', :tv4, false);
select public.jira_set_share('members');
select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 1, 'thành viên cùng nhóm thấy');
select set_config('request.jwt.claim.sub', :tv6, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'người ngoài nhóm không thấy');
select t.ok(t.count('select * from public.jira_related_people()') = 0, 'người ngoài nhóm không thấy ai');
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'quản trị ngoài nhóm không thấy');

-- 4. Không tự sửa chia sẻ của người khác; phạm vi sai bị chặn; chưa kết nối thì không bật được.
select set_config('request.jwt.claim.sub', :tv5, false);
select t.denied(format($$update public.jira_accounts set share_scope = 'members' where user_id = %L$$, :tv4), 'sửa thẳng bảng');
select t.denied($$select public.jira_set_share('tat-ca')$$, 'phạm vi sai');
select set_config('request.jwt.claim.sub', :tv6, false);
select t.denied($$select public.jira_set_share('members')$$, 'chưa kết nối Jira');

-- 5. Nhóm lưu trữ thì thôi chia sẻ; tắt chia sẻ thì thôi thấy.
reset role;
update public.groups set archived_at = now() where id = :nhom;
set role authenticated;
select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'nhóm lưu trữ không còn chia sẻ');
reset role;
update public.groups set archived_at = null where id = :nhom;
set role authenticated;
select set_config('request.jwt.claim.sub', :tv4, false);
select public.jira_set_share('none');
select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count(format('select * from public.jira_related_issues(array[%L]::uuid[])', :tv4)) = 0, 'tắt chia sẻ thì không thấy');
reset role;
