-- Không gian con cho một sự kiện/việc chung trong nhóm: một nhóm con (parent_id)
-- chỉ gồm người tham gia. Thêm đôn đốc việc và đính kèm sản phẩm (link Google Drive/Docs).

-- 1. Tạo không gian con. Người có quyền tạo việc hoặc quản lý thành viên ở nhóm cha
-- được tạo; người tạo thành Trưởng nhóm của không gian con. Người tham gia phải là
-- thành viên của nhóm cha (thêm người ngoài sau bằng email như nhóm thường).
create function public.create_subgroup(p_parent uuid, p_name text, p_description text, p_member_ids uuid[])
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  parent public.groups;
  gid uuid;
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select * into parent from public.groups where id = p_parent;
  if parent.id is null or not (private.has_group_perm(p_parent, 'create') or private.has_group_perm(p_parent, 'manage_members')) then
    raise exception 'Bạn không có quyền tạo không gian con trong nhóm này' using errcode = '42501';
  end if;
  if parent.archived_at is not null then
    raise exception 'Nhóm đã lưu trữ' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'Tên không gian từ 1 đến 200 ký tự' using errcode = '22023';
  end if;

  insert into public.groups (name, kind, parent_id, description, default_can_view, default_can_create, default_can_edit, default_can_upload)
  values (trim(p_name), 'event', p_parent, nullif(trim(coalesce(p_description, '')), ''), true, true, false, true)
  returning id into gid;
  -- add_group_creator đã thêm người tạo làm Trưởng nhóm.

  insert into public.group_members (group_id, user_id, can_view, can_create, can_edit, can_upload)
  select gid, m.user_id, true, true, false, true
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.group_id = p_parent and m.user_id = any (coalesce(p_member_ids, '{}')) and m.user_id <> uid
  on conflict do nothing;

  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select m.user_id, 'subgroup_added', 'Bạn được thêm vào: ' || trim(p_name),
    coalesce(private.display_name(uid), 'Ai đó') || ' thêm bạn vào không gian của ' || parent.name,
    '/nhom/' || gid, uid
  from public.group_members m where m.group_id = gid and m.user_id <> uid;
  return gid;
end;
$$;
revoke execute on function public.create_subgroup(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.create_subgroup(uuid, text, text, uuid[]) to authenticated;

-- 2. Đôn đốc: gửi thông báo cho người được giao một việc chưa xong.
-- Người có quyền sửa việc trong nhóm, Trưởng nhóm/Văn thư, hoặc người tạo việc được đôn đốc.
-- Mỗi việc tối đa một lần mỗi giờ.
create table public.task_nudges (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
create index task_nudges_task_idx on public.task_nudges (task_id, created_at desc);
alter table public.task_nudges enable row level security;
revoke all on public.task_nudges from anon, authenticated;
grant select on public.task_nudges to authenticated;
create policy task_nudges_read on public.task_nudges for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

create function public.nudge_task(p_task uuid, p_message text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
  g public.groups;
begin
  select * into t from public.tasks where id = p_task;
  if t.id is null or not private.is_active_user()
     or not (private.has_group_perm(t.group_id, 'edit') or private.has_group_perm(t.group_id, 'manage_members')
             or (t.created_by = uid and private.has_group_perm(t.group_id, 'view'))) then
    raise exception 'Bạn không có quyền đôn đốc việc này' using errcode = '42501';
  end if;
  if t.assignee_id is null or t.status = 'done' then
    raise exception 'Việc chưa giao ai hoặc đã xong' using errcode = '22023';
  end if;
  if t.assignee_id = uid then
    raise exception 'Không tự đôn đốc chính mình' using errcode = '22023';
  end if;
  if exists (select 1 from public.task_nudges n where n.task_id = p_task and n.created_at > now() - interval '1 hour') then
    raise exception 'Việc này vừa được đôn đốc, hãy chờ 1 giờ' using errcode = '22023';
  end if;
  select * into g from public.groups where id = t.group_id;
  insert into public.task_nudges (task_id, actor_id) values (p_task, uid);
  perform private.notify(t.assignee_id, 'task_nudge',
    'Nhắc việc: ' || t.title,
    coalesce(private.display_name(uid), 'Ai đó') || ' (' || g.name || ') nhắc'
      || coalesce(', hạn ' || to_char(t.due_date, 'DD/MM/YYYY'), '')
      || coalesce(': ' || nullif(left(trim(p_message), 300), ''), ''),
    '/nhom/' || t.group_id);
end;
$$;
revoke execute on function public.nudge_task(uuid, text) from public, anon;
grant execute on function public.nudge_task(uuid, text) to authenticated;

-- 3. Sản phẩm của việc: chỉ lưu đường link Google Drive/Docs; không tạo link công khai,
-- không đổi quyền chia sẻ trên Drive.
create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  url text not null check (url ~ '^https://(drive|docs)\.google\.com/' and length(url) <= 1000),
  label text check (length(label) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid()
);
create index task_links_task_idx on public.task_links (task_id);
alter table public.task_links enable row level security;
revoke all on public.task_links from anon;
grant select, insert (task_id, url, label), delete on public.task_links to authenticated;

create policy task_links_read on public.task_links for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));
-- Người được giao việc, hoặc người có quyền tải/gắn tài liệu trong nhóm.
create policy task_links_insert on public.task_links for insert to authenticated
  with check (
    created_by = auth.uid() and private.is_active_user()
    and exists (
      select 1 from public.tasks t where t.id = task_id
        and (t.assignee_id = auth.uid() or private.has_group_perm(t.group_id, 'upload'))
    )
  );
create policy task_links_delete on public.task_links for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.tasks t where t.id = task_id and private.has_group_perm(t.group_id, 'edit'))
  );

create function private.log_task_link()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  rec public.task_links := case when tg_op = 'DELETE' then old else new end;
begin
  insert into public.activity_log (actor_id, action, entity_type, entity_id, group_id, old_data, new_data)
  select auth.uid(), lower(tg_op), 'task_links', rec.id::text, t.group_id,
    case when tg_op = 'DELETE' then to_jsonb(old) end, case when tg_op = 'INSERT' then to_jsonb(new) end
  from public.tasks t where t.id = rec.task_id;
  return null;
end;
$$;
create trigger task_links_log after insert or delete on public.task_links
  for each row execute function private.log_task_link();
