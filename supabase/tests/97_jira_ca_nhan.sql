-- Kiểm thử Jira cá nhân: chỉ chủ tài khoản thấy dữ liệu Jira của mình; chỉ máy chủ ghi.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

-- Máy chủ (khóa service) lưu ảnh chụp cho tv1, hai lần: lần sau ghi đè lần trước.
reset role;
set role service_role;
select public.jira_save_snapshot(:tv1, 'bookmarklet', '{"me":{"name":"cu","displayName":"Cũ"},"issues":[{"key":"OLD-1","summary":"cũ"}],"worklogs":[],"mentions":[]}');
select public.jira_save_snapshot(:tv1, 'bookmarklet', $${
  "me": {"name": "tv1", "key": "tv1", "displayName": "Thành viên 1"},
  "issues": [
    {"key": "KTPT-1", "summary": "Bài báo", "status": "Done", "statusCategory": "done", "isAssignee": true,
     "resolved": "2026-11-05T10:00:00.000+0700", "mySeconds": 7200, "myAttachmentCount": 2, "custom": {"Giờ quy đổi": 12.5},
     "links": [{"type": "Blocks", "dir": "inward", "key": "TCT-3", "statusCategory": "new"}], "reopenCount": 2,
     "labels": ["bao-cao"], "fixVersions": ["Đợt 1"], "originalEstimate": 36000, "startDate": "2026-11-01",
     "transitions": [{"at": "2026-11-02T08:00:00.000+0700", "from": "Open", "to": "Done"}], "lastComment": {"author": "A", "isMe": false, "created": "2026-11-06T09:00:00.000+0700", "body": "x"}},
    {"key": "KTPT-2", "summary": "Theo dõi", "isWatcher": true, "mentionsMe": true}
  ],
  "worklogs": [{"id": "10", "issueKey": "KTPT-1", "started": "2026-11-04T08:00:00.000+0700", "seconds": 7200, "comment": "viết"}],
  "mentions": [{"id": "99", "issueKey": "KTPT-2", "author": "Thư ký", "body": "[~tv1] xem giúp", "created": "2026-11-06T09:00:00.000+0700", "answered": true}],
  "customFieldNames": ["Giờ quy đổi"]
}$$);
insert into public.jira_secrets (user_id, sync_key_hash) values (:tv1, 'hash-bi-mat');
reset role;

set role authenticated;
-- 1. Chủ tài khoản thấy dữ liệu của mình (đã ghi đè dữ liệu cũ).
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.jira_issues') = 2, 'chủ thấy 2 mã việc');
select t.ok(t.count($$select * from public.jira_issues where issue_key = 'OLD-1'$$) = 0, 'dữ liệu cũ bị thay');
select t.ok((select custom ->> 'Giờ quy đổi' from public.jira_issues where issue_key = 'KTPT-1') = '12.5', 'giữ trường tùy chỉnh');
select t.ok(t.count('select * from public.jira_worklogs') = 1, 'chủ thấy worklog');
select t.ok(t.count('select * from public.jira_mentions where answered') = 1, 'chủ thấy comment nhắc tên (đã trả lời)');
select t.ok((select reopen_count = 2 and labels = array['bao-cao'] and fix_versions = array['Đợt 1'] and original_estimate = 36000
  and start_date = '2026-11-01' and links -> 0 ->> 'key' = 'TCT-3' and jsonb_array_length(transitions) = 1 and last_comment ->> 'author' = 'A'
  from public.jira_issues where issue_key = 'KTPT-1'), 'giữ các trường quản lý đầu việc');
select t.ok((select links = '[]' and labels = '{}' and reopen_count = 0 from public.jira_issues where issue_key = 'KTPT-2'), 'giá trị mặc định khi thiếu');
select t.ok((select my_attachment_count = 2 from public.jira_issues where issue_key = 'KTPT-1'), 'lưu số file mình đính kèm');
select t.ok((select my_attachment_count is null from public.jira_issues where issue_key = 'KTPT-2'), 'không có thông tin file thì để trống');
select t.ok((select issue_count = 2 and worklog_count = 1 and jira_username = 'tv1' and custom_field_names = array['Giờ quy đổi'] from public.jira_accounts), 'trạng thái kết nối');
-- Bí mật không đọc được qua API, kể cả của chính mình.
select t.denied('select * from public.jira_secrets', 'đọc bảng bí mật');
select t.ok(not has_table_privilege('authenticated', 'public.jira_secrets', 'select'), 'không có quyền select jira_secrets');
-- Không tự ghi dữ liệu Jira hay gọi hàm lưu.
select t.denied($$insert into public.jira_issues (user_id, issue_key) values (auth.uid(), 'GIA-1')$$, 'tự chèn mã việc');
select t.denied($$update public.jira_accounts set issue_count = 999$$, 'tự sửa trạng thái');
select t.denied(format($$select public.jira_save_snapshot(%L, 'server', '{"me":{"name":"x"},"issues":[],"worklogs":[],"mentions":[]}')$$, :tv2), 'gọi hàm lưu');

-- 2. Người khác, kể cả quản trị và Hiệu trưởng, không thấy.
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.jira_issues') + t.count('select * from public.jira_worklogs') + t.count('select * from public.jira_mentions') + t.count('select * from public.jira_accounts') = 0, 'đồng nghiệp không thấy');
select t.denied('delete from public.jira_issues', 'đồng nghiệp xóa dữ liệu người khác');
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count('select * from public.jira_issues') + t.count('select * from public.jira_accounts') = 0, 'quản trị không thấy');
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count('select * from public.jira_issues') + t.count('select * from public.jira_worklogs') = 0, 'Hiệu trưởng không thấy');

-- 3. Chủ tự xóa dữ liệu của mình.
select set_config('request.jwt.claim.sub', :tv1, false);
delete from public.jira_mentions;
select t.ok(t.count('select * from public.jira_mentions') = 0, 'chủ xóa được dữ liệu của mình');
reset role;
