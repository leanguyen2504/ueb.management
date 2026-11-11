-- Jira cá nhân (chỉ đọc): mỗi người tự đồng bộ dữ liệu Jira CỦA CHÍNH MÌNH
-- (worklog, mã việc được giao/tạo/theo dõi, comment nhắc tên) vào web.
-- Chỉ chủ tài khoản xem được dữ liệu của mình; quản trị, Hiệu trưởng, thư ký cũng không xem được.
-- Dữ liệu được ghi bởi máy chủ (khóa service) qua hàm jira_save_snapshot, theo hai đường:
--   1. Nút "Đồng bộ Jira" (bookmarklet) bấm trên trang Jira khi đang đăng nhập Jira, gửi về web kèm mã đồng bộ.
--   2. Máy chủ web tự gọi Jira bằng Personal Access Token (mã hóa) nếu Jira mở ra Internet.

create table public.jira_accounts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  jira_username text,
  jira_display_name text,
  has_token boolean not null default false,
  has_sync_key boolean not null default false,
  last_synced_at timestamptz,
  -- bookmarklet: bấm nút trên trang Jira; server: máy chủ web tự gọi Jira bằng token.
  last_source text check (last_source in ('bookmarklet', 'server')),
  last_error text,
  issue_count int not null default 0,
  worklog_count int not null default 0,
  mention_count int not null default 0,
  -- Tên các trường tùy chỉnh đã gặp (để chọn trường "giờ quy đổi").
  custom_field_names text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Bí mật: token Jira đã mã hóa và băm của mã đồng bộ. Không cấp quyền nào cho API,
-- chỉ máy chủ (khóa service) đọc/ghi.
create table public.jira_secrets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_enc text,
  sync_key_hash text unique,
  sync_key_used_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.jira_issues (
  user_id uuid not null references public.profiles (id) on delete cascade,
  issue_key text not null check (char_length(issue_key) between 1 and 40),
  summary text not null default '',
  status text,
  -- new / indeterminate / done (nhóm trạng thái của Jira)
  status_category text,
  issue_type text,
  project_key text,
  project_name text,
  priority text,
  assignee_name text,
  reporter_name text,
  is_assignee boolean not null default false,
  is_reporter boolean not null default false,
  is_watcher boolean not null default false,
  has_my_worklog boolean not null default false,
  mentions_me boolean not null default false,
  created_at_jira timestamptz,
  updated_at_jira timestamptz,
  resolved_at timestamptz,
  due_date date,
  -- Tổng giờ chính mình log vào mã này (giây).
  my_seconds int not null default 0,
  -- Các trường tùy chỉnh dạng đơn giản: {"Tên trường": giá trị}
  custom jsonb not null default '{}',
  primary key (user_id, issue_key)
);
create index jira_issues_resolved_idx on public.jira_issues (user_id, resolved_at);

create table public.jira_worklogs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  worklog_id text not null,
  issue_key text not null,
  started_at timestamptz not null,
  seconds int not null check (seconds >= 0),
  comment text,
  primary key (user_id, worklog_id)
);
create index jira_worklogs_started_idx on public.jira_worklogs (user_id, started_at);

create table public.jira_mentions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id text not null,
  issue_key text not null,
  author_name text,
  body text not null default '',
  created_at timestamptz not null,
  primary key (user_id, comment_id)
);
create index jira_mentions_created_idx on public.jira_mentions (user_id, created_at desc);

alter table public.jira_accounts enable row level security;
alter table public.jira_secrets enable row level security;
alter table public.jira_issues enable row level security;
alter table public.jira_worklogs enable row level security;
alter table public.jira_mentions enable row level security;

revoke all on public.jira_accounts, public.jira_secrets, public.jira_issues, public.jira_worklogs, public.jira_mentions from anon, authenticated;
grant select on public.jira_accounts, public.jira_issues, public.jira_worklogs, public.jira_mentions to authenticated;
-- Người dùng tự xóa dữ liệu Jira của mình (ngắt kết nối).
grant delete on public.jira_accounts, public.jira_issues, public.jira_worklogs, public.jira_mentions to authenticated;

create policy jira_accounts_own on public.jira_accounts for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy jira_accounts_own_delete on public.jira_accounts for delete to authenticated
  using (user_id = auth.uid());
create policy jira_issues_own on public.jira_issues for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy jira_issues_own_delete on public.jira_issues for delete to authenticated
  using (user_id = auth.uid());
create policy jira_worklogs_own on public.jira_worklogs for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy jira_worklogs_own_delete on public.jira_worklogs for delete to authenticated
  using (user_id = auth.uid());
create policy jira_mentions_own on public.jira_mentions for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy jira_mentions_own_delete on public.jira_mentions for delete to authenticated
  using (user_id = auth.uid());
-- jira_secrets: không có policy nào, nên chỉ khóa service đọc/ghi được.

-- Ghi đè toàn bộ ảnh chụp dữ liệu Jira của một người (một giao dịch). Chỉ máy chủ gọi.
create function public.jira_save_snapshot(p_user uuid, p_source text, p_snap jsonb)
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
    mentions_me, created_at_jira, updated_at_jira, resolved_at, due_date, my_seconds, custom)
  select distinct on (i.key) p_user, left(i.key, 40), left(coalesce(i.summary, ''), 500), left(i.status, 80), left(i."statusCategory", 20),
    left(i."issueType", 80), left(i."projectKey", 40), left(i."projectName", 200), left(i.priority, 40),
    left(i.assignee, 200), left(i.reporter, 200), coalesce(i."isAssignee", false), coalesce(i."isReporter", false),
    coalesce(i."isWatcher", false), coalesce(i."hasMyWorklog", false), coalesce(i."mentionsMe", false),
    i.created, i.updated, i.resolved, i.due, greatest(coalesce(i."mySeconds", 0), 0), coalesce(i.custom, '{}')
  from jsonb_to_recordset(coalesce(p_snap -> 'issues', '[]')) as i(
    key text, summary text, status text, "statusCategory" text, "issueType" text, "projectKey" text, "projectName" text,
    priority text, assignee text, reporter text, "isAssignee" boolean, "isReporter" boolean, "isWatcher" boolean,
    "hasMyWorklog" boolean, "mentionsMe" boolean, created timestamptz, updated timestamptz, resolved timestamptz,
    due date, "mySeconds" int, custom jsonb)
  where i.key is not null;

  insert into public.jira_worklogs (user_id, worklog_id, issue_key, started_at, seconds, comment)
  select distinct on (w.id) p_user, left(w.id, 40), left(w."issueKey", 40), w.started, greatest(coalesce(w.seconds, 0), 0), left(w.comment, 1000)
  from jsonb_to_recordset(coalesce(p_snap -> 'worklogs', '[]')) as w(id text, "issueKey" text, started timestamptz, seconds int, comment text)
  where w.id is not null and w.started is not null;

  insert into public.jira_mentions (user_id, comment_id, issue_key, author_name, body, created_at)
  select distinct on (m.id) p_user, left(m.id, 40), left(m."issueKey", 40), left(m.author, 200), left(coalesce(m.body, ''), 2000), m.created
  from jsonb_to_recordset(coalesce(p_snap -> 'mentions', '[]')) as m(id text, "issueKey" text, author text, body text, created timestamptz)
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
