-- Kiểm thử cây công việc Jira dùng chung: chỉ máy chủ ghi; mọi tài khoản đang hoạt động xem được; bỏ đơn nghỉ phép.
\set ON_ERROR_STOP 1

\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''

reset role;
set role service_role;
select public.jira_save_tree(:thuky, $$[
  {"key": "KKTPT-100", "summary": "Kiến tập Hải Phòng 2026", "issueType": "Task", "status": "In Progress", "statusCategory": "indeterminate", "projectKey": "KKTPT", "projectName": "Khoa Kinh tế Phát triển", "assignee": "Trưởng khoa", "due": "2026-12-01"},
  {"key": "KKTPT-7377", "summary": "Dự trù kinh phí", "issueType": "Work", "status": "In Progress", "statusCategory": "indeterminate", "projectKey": "KKTPT", "parentKey": "KKTPT-100", "assignee": "Lưu Quốc Đạt", "updated": "2026-11-13T10:00:00.000+0700"},
  {"key": "KKTPT-7378", "summary": "Gửi KHTC", "issueType": "Sub-task", "status": "Open", "statusCategory": "new", "projectKey": "KKTPT", "parentKey": "KKTPT-7377", "partial": true},
  {"key": "KKTPT-9", "summary": "Nghỉ phép", "issueType": "Chuyên viên/ Giảng viên nghỉ phép"},
  {"key": "sai", "summary": "x"}
]$$);
-- Lần sau chỉ biết một phần: không xóa người được giao, hạn của mã đã đủ thông tin.
select public.jira_save_tree(:tv2, $$[{"key": "KKTPT-100", "summary": "Kiến tập HP 2026", "status": "Done", "statusCategory": "done", "partial": true}]$$);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.jira_tree') = 3, 'thành viên thấy 3 mã (bỏ đơn nghỉ phép và mã sai)');
select t.ok((select parent_key = 'KKTPT-7377' from public.jira_tree where issue_key = 'KKTPT-7378'), 'sub-task có việc cha');
select t.ok((select assignee_name = 'Trưởng khoa' and due_date = '2026-12-01' and status_category = 'done' from public.jira_tree where issue_key = 'KKTPT-100'), 'cập nhật một phần giữ người được giao, hạn');
select t.denied($$insert into public.jira_tree (issue_key) values ('X-1')$$, 'người dùng không ghi trực tiếp');
select t.denied($$select public.jira_save_tree(auth.uid(), '[]')$$, 'người dùng không gọi hàm ghi');
reset role;
