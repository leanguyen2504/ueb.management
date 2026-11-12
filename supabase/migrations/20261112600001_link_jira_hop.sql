-- Ô mã Jira trên dòng buổi họp: lưu thêm link Jira người dùng dán vào,
-- để mã hiện thành link kể cả khi chưa đặt JIRA_BASE_URL.
alter table public.meeting_records
  add column if not exists jira_url text
  check (jira_url is null or (jira_url ~* '^https?://[^[:space:]]+$' and char_length(jira_url) <= 1000));

grant insert (jira_url), update (jira_url) on public.meeting_records to authenticated;

notify pgrst, 'reload schema';
