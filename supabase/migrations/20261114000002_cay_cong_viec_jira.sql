-- Cây công việc Jira dùng chung: Task (đơn vị tạo) > Work > Sub-task, để thấy việc to nhỏ của các đơn vị UEB.
-- Mỗi lần ai đó bấm "Đồng bộ Jira", máy chủ ghi thêm các mã trong cây quanh việc của người đó:
-- việc cha (cha của sub-task, hoặc liên kết Gantt "is child task of"), các việc con và sub-task.
-- Chỉ lưu thông tin khung: mã, tên, loại, trạng thái, đơn vị (dự án Jira), người được giao, hạn, việc cha.
-- Không có worklog, comment, mô tả; không lưu đơn nghỉ phép, làm ngoài giờ.
-- Mọi tài khoản đang hoạt động đều xem được (khác bảng jira_issues chỉ chủ xem).
create table if not exists public.jira_tree (
  issue_key text primary key check (issue_key ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$'),
  summary text not null default '',
  issue_type text,
  status text,
  -- new / indeterminate / done
  status_category text,
  project_key text,
  project_name text,
  assignee_name text,
  due_date date,
  -- Việc cha trong cây (cha của sub-task, hoặc việc lớn nối bằng liên kết "is child task of").
  parent_key text,
  updated_at_jira timestamptz,
  seen_at timestamptz not null default now()
);
create index if not exists jira_tree_parent_idx on public.jira_tree (parent_key);
create index if not exists jira_tree_project_idx on public.jira_tree (project_key);

alter table public.jira_tree enable row level security;
revoke all on public.jira_tree from anon, authenticated;
grant select on public.jira_tree to authenticated;
drop policy if exists jira_tree_read on public.jira_tree;
create policy jira_tree_read on public.jira_tree for select to authenticated
  using (private.is_active_user());

-- Ghi các mã trong cây (chỉ máy chủ gọi). Mã đã có thì cập nhật; mã không ai đồng bộ lại trong 120 ngày thì xóa.
create or replace function public.jira_save_tree(p_user uuid, p_tree jsonb)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not exists (select 1 from public.profiles where id = p_user and is_active) then
    raise exception 'Tài khoản không hoạt động';
  end if;
  if jsonb_typeof(p_tree) <> 'array' then
    return 0;
  end if;

  -- Mã đọc đủ thông tin (partial = false) ghi đè; sub-task chỉ biết tên và trạng thái (partial = true) thì chỉ cập nhật phần đó.
  insert into public.jira_tree as t (issue_key, summary, issue_type, status, status_category, project_key, project_name,
    assignee_name, due_date, parent_key, updated_at_jira, seen_at)
  select distinct on (x.key) x.key, left(coalesce(x.summary, ''), 500), left(x."issueType", 80), left(x.status, 80),
    left(x."statusCategory", 20), left(x."projectKey", 40), left(x."projectName", 200), left(x.assignee, 200),
    case when x.due ~ '^\d{4}-\d{2}-\d{2}' then left(x.due, 10)::date end,
    case when x."parentKey" ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$' and x."parentKey" <> x.key then x."parentKey" end,
    case when x.updated ~ '^\d{4}-\d{2}-\d{2}' then x.updated::timestamptz end,
    now()
  from jsonb_to_recordset(p_tree) as x(key text, summary text, "issueType" text, status text, "statusCategory" text,
    "projectKey" text, "projectName" text, assignee text, due text, "parentKey" text, updated text, partial boolean)
  where x.key ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$'
    and coalesce(x."issueType", '') !~* '(nghỉ|phép|ngoài giờ|làm thêm)'
    and not coalesce(x.partial, false)
  order by x.key, x.updated desc nulls last
  on conflict (issue_key) do update set
    summary = excluded.summary, issue_type = excluded.issue_type, status = excluded.status,
    status_category = excluded.status_category, project_key = excluded.project_key, project_name = excluded.project_name,
    assignee_name = excluded.assignee_name, due_date = excluded.due_date,
    parent_key = coalesce(excluded.parent_key, t.parent_key),
    updated_at_jira = coalesce(excluded.updated_at_jira, t.updated_at_jira), seen_at = now();
  get diagnostics n = row_count;

  insert into public.jira_tree as t (issue_key, summary, issue_type, status, status_category, project_key, project_name, parent_key, seen_at)
  select distinct on (x.key) x.key, left(coalesce(x.summary, ''), 500), left(x."issueType", 80), left(x.status, 80),
    left(x."statusCategory", 20), left(x."projectKey", 40), left(x."projectName", 200),
    case when x."parentKey" ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$' and x."parentKey" <> x.key then x."parentKey" end, now()
  from jsonb_to_recordset(p_tree) as x(key text, summary text, "issueType" text, status text, "statusCategory" text,
    "projectKey" text, "projectName" text, "parentKey" text, partial boolean)
  where x.key ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$'
    and coalesce(x."issueType", '') !~* '(nghỉ|phép|ngoài giờ|làm thêm)'
    and coalesce(x.partial, false)
  order by x.key
  on conflict (issue_key) do update set
    summary = excluded.summary, status = excluded.status, status_category = excluded.status_category,
    parent_key = coalesce(t.parent_key, excluded.parent_key), seen_at = now();


  delete from public.jira_tree where seen_at < now() - interval '120 days';
  return n;
end;
$$;
revoke all on function public.jira_save_tree(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.jira_save_tree(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
