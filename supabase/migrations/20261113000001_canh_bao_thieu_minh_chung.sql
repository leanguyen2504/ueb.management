-- Cảnh báo mã Jira đã log work nhưng thiếu comment hoặc file sản phẩm đính kèm.
-- Lưu số file chính mình đính kèm trên từng mã (null: bản đồng bộ cũ chưa có thông tin này).
alter table public.jira_issues add column if not exists my_attachment_count int;

create or replace function public.jira_save_snapshot(p_user uuid, p_source text, p_snap jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user and is_active) then
    raise exception 'Tài khoản không hoạt động';
  end if;

  delete from public.jira_issues where user_id = p_user;
  delete from public.jira_worklogs where user_id = p_user;
  delete from public.jira_mentions where user_id = p_user;

  insert into public.jira_issues (user_id, issue_key, summary, status, status_category, issue_type, project_key,
    project_name, priority, assignee_name, reporter_name, is_assignee, is_reporter, is_watcher, has_my_worklog,
    mentions_me, created_at_jira, updated_at_jira, resolved_at, due_date, my_seconds, custom,
    priority_rank, start_date, original_estimate, remaining_estimate, time_spent, parent_key, parent_summary, epic_key,
    subtask_total, subtask_done, links, transitions, status_since, reopen_count, sprint, fix_versions, labels, components,
    last_comment, my_last_comment_at, my_attachment_count)
  select distinct on (i.key) p_user, left(i.key, 40), left(coalesce(i.summary, ''), 500), left(i.status, 80), left(i."statusCategory", 20),
    left(i."issueType", 80), left(i."projectKey", 40), left(i."projectName", 200), left(i.priority, 40),
    left(i.assignee, 200), left(i.reporter, 200), coalesce(i."isAssignee", false), coalesce(i."isReporter", false),
    coalesce(i."isWatcher", false), coalesce(i."hasMyWorklog", false), coalesce(i."mentionsMe", false),
    i.created, i.updated, i.resolved, i.due, greatest(coalesce(i."mySeconds", 0), 0), coalesce(i.custom, '{}'),
    i."priorityRank", i."startDate", i."originalEstimate", i."remainingEstimate", i."timeSpent", left(i."parentKey", 40),
    left(i."parentSummary", 500), left(i."epicKey", 40), coalesce(i."subtaskTotal", 0), coalesce(i."subtaskDone", 0),
    case when jsonb_typeof(i.links) = 'array' then i.links else '[]' end,
    case when jsonb_typeof(i.transitions) = 'array' then i.transitions else '[]' end,
    i."statusSince", coalesce(i."reopenCount", 0), left(i.sprint, 200),
    coalesce((select array_agg(left(x, 100)) from jsonb_array_elements_text(case when jsonb_typeof(i."fixVersions") = 'array' then i."fixVersions" else '[]' end) x), '{}'),
    coalesce((select array_agg(left(x, 100)) from jsonb_array_elements_text(case when jsonb_typeof(i.labels) = 'array' then i.labels else '[]' end) x), '{}'),
    coalesce((select array_agg(left(x, 100)) from jsonb_array_elements_text(case when jsonb_typeof(i.components) = 'array' then i.components else '[]' end) x), '{}'),
    case when jsonb_typeof(i."lastComment") = 'object' then i."lastComment" end, i."myLastCommentAt",
    case when i."myAttachmentCount" is null then null else greatest(i."myAttachmentCount", 0) end
  from jsonb_to_recordset(coalesce(p_snap -> 'issues', '[]')) as i(
    key text, summary text, status text, "statusCategory" text, "issueType" text, "projectKey" text, "projectName" text,
    priority text, assignee text, reporter text, "isAssignee" boolean, "isReporter" boolean, "isWatcher" boolean,
    "hasMyWorklog" boolean, "mentionsMe" boolean, created timestamptz, updated timestamptz, resolved timestamptz,
    due date, "mySeconds" int, custom jsonb, "priorityRank" int, "startDate" date, "originalEstimate" int,
    "remainingEstimate" int, "timeSpent" int, "parentKey" text, "parentSummary" text, "epicKey" text, "subtaskTotal" int,
    "subtaskDone" int, links jsonb, transitions jsonb, "statusSince" timestamptz, "reopenCount" int, sprint text,
    "fixVersions" jsonb, labels jsonb, components jsonb, "lastComment" jsonb, "myLastCommentAt" timestamptz, "myAttachmentCount" int)
  where i.key is not null;

  insert into public.jira_worklogs (user_id, worklog_id, issue_key, started_at, seconds, comment)
  select distinct on (w.id) p_user, left(w.id, 40), left(w."issueKey", 40), w.started, greatest(coalesce(w.seconds, 0), 0), left(w.comment, 1000)
  from jsonb_to_recordset(coalesce(p_snap -> 'worklogs', '[]')) as w(id text, "issueKey" text, started timestamptz, seconds int, comment text)
  where w.id is not null and w.started is not null;

  insert into public.jira_mentions (user_id, comment_id, issue_key, author_name, body, created_at, answered)
  select distinct on (m.id) p_user, left(m.id, 40), left(m."issueKey", 40), left(m.author, 200), left(coalesce(m.body, ''), 2000), m.created,
    coalesce(m.answered, false)
  from jsonb_to_recordset(coalesce(p_snap -> 'mentions', '[]')) as m(id text, "issueKey" text, author text, body text, created timestamptz, answered boolean)
  where m.id is not null and m.created is not null;

  insert into public.jira_accounts as a (user_id, jira_username, jira_display_name, last_synced_at, last_source, last_error,
    issue_count, worklog_count, mention_count, custom_field_names, updated_at)
  values (p_user, left(p_snap #>> '{me,name}', 200), left(p_snap #>> '{me,displayName}', 200), now(), p_source, null,
    (select count(*) from public.jira_issues where user_id = p_user),
    (select count(*) from public.jira_worklogs where user_id = p_user),
    (select count(*) from public.jira_mentions where user_id = p_user),
    coalesce((select array_agg(left(x, 200)) from jsonb_array_elements_text(coalesce(p_snap -> 'customFieldNames', '[]')) x), '{}'),
    now())
  on conflict (user_id) do update set
    jira_username = excluded.jira_username, jira_display_name = excluded.jira_display_name,
    last_synced_at = excluded.last_synced_at, last_source = excluded.last_source, last_error = null,
    issue_count = excluded.issue_count, worklog_count = excluded.worklog_count, mention_count = excluded.mention_count,
    custom_field_names = excluded.custom_field_names, updated_at = now();
end;
$$;
revoke all on function public.jira_save_snapshot(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.jira_save_snapshot(uuid, text, jsonb) to service_role;
