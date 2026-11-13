-- Sản phẩm Jira chỉ tính khi người làm đã comment trên mã việc mình log work.
-- Hàm chia sẻ trả thêm thời điểm comment cuối của chủ dữ liệu (chỉ thời điểm, không có nội dung comment)
-- để báo cáo nhóm tính sản phẩm theo cùng quy tắc với trang "Jira của tôi".
drop function if exists public.jira_related_issues(uuid[]);

create function public.jira_related_issues(p_users uuid[])
returns table (
  user_id uuid, issue_key text, summary text, status text, status_category text, issue_type text, project_key text,
  project_name text, priority text, assignee_name text, reporter_name text, is_assignee boolean, is_reporter boolean,
  is_watcher boolean, has_my_worklog boolean, created_at_jira timestamptz, updated_at_jira timestamptz,
  resolved_at timestamptz, due_date date, my_seconds int, start_date date, original_estimate int, remaining_estimate int,
  time_spent int, parent_key text, parent_summary text, epic_key text, subtask_total int, subtask_done int,
  reopen_count int, sprint text, fix_versions text[], labels text[], components text[], custom jsonb,
  my_last_comment_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select i.user_id, i.issue_key, i.summary, i.status, i.status_category, i.issue_type, i.project_key, i.project_name,
    i.priority, i.assignee_name, i.reporter_name, i.is_assignee, i.is_reporter, i.is_watcher, i.has_my_worklog,
    i.created_at_jira, i.updated_at_jira, i.resolved_at, i.due_date, i.my_seconds, i.start_date, i.original_estimate,
    i.remaining_estimate, i.time_spent, i.parent_key, i.parent_summary, i.epic_key, i.subtask_total, i.subtask_done,
    i.reopen_count, i.sprint, i.fix_versions, i.labels, i.components, i.custom, i.my_last_comment_at
  from public.jira_issues i
  where i.user_id in (select u from unnest(p_users) u where private.can_view_jira(u))
  limit 50000;
$$;

revoke all on function public.jira_related_issues(uuid[]) from public, anon;
grant execute on function public.jira_related_issues(uuid[]) to authenticated;
