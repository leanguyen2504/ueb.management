-- Mở cho mọi người có email @vnu.edu.vn tự đăng nhập (trước đó chỉ người được mời), thêm:
-- 1. Giới hạn số người truy cập cùng lúc (mặc định 200). Quản trị, Hiệu trưởng, thư ký luôn vào được.
-- 2. Danh bạ nhóm: mọi người dùng đang hoạt động thấy tên, mô tả, đơn vị quản lý,
--    lãnh đạo và đầu mối liên hệ của mọi nhóm, và tên các việc đang mở để xin tham gia.
--    Không thấy tài liệu, mô tả việc, sản phẩm, lịch hay hồ sơ bên trong nhóm (RLS giữ nguyên).
-- 3. Yêu cầu tham gia nhóm hoặc một việc trong nhóm; Trưởng nhóm/Văn thư duyệt.

-- 0. Mở đăng nhập cho mọi email thuộc tên miền được phép --------------------------------
-- open_signup = true: ai có email @vnu.edu.vn cũng tự vào được, là thành viên thường,
-- chưa thuộc nhóm nào. Lời mời (nếu có) vẫn áp vai trò và nhóm như trước.
-- open_signup = false: quay về chỉ người được mời.
alter table public.system_settings add column open_signup boolean not null default true;

create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  settings public.system_settings;
  addr text := lower(new.email);
  inv public.invitations;
begin
  select * into settings from public.system_settings;
  if addr is null or not (split_part(addr, '@', 2) = any (settings.allowed_email_domains)) then
    raise exception 'Email % không thuộc tên miền được phép', addr;
  end if;

  select * into inv from public.invitations i
  where i.email = addr and i.accepted_at is null and i.expires_at > now()
  order by i.make_admin desc, i.created_at
  limit 1;
  if inv.id is null and not settings.open_signup then
    raise exception 'Email % chưa được mời vào hệ thống', addr;
  end if;

  insert into public.profiles (id, email, full_name, system_role)
  values (new.id, addr, coalesce(new.raw_user_meta_data ->> 'full_name', ''), coalesce(inv.system_role, 'member'));

  if inv.id is null then
    return new;
  end if;

  if inv.make_admin and settings.current_admin_id is null then
    update public.system_settings set current_admin_id = new.id, updated_at = now();
  end if;

  insert into public.group_members (group_id, user_id, is_manager, is_clerk, can_view, can_create, can_edit, can_upload)
  select i.group_id, new.id, i.is_manager, i.is_clerk, g.default_can_view, g.default_can_create, g.default_can_edit, g.default_can_upload
  from public.invitations i
  join public.groups g on g.id = i.group_id
  where i.email = addr and i.accepted_at is null and i.expires_at > now()
  on conflict do nothing;

  update public.invitations set accepted_at = now()
  where email = addr and accepted_at is null;

  return new;
end;
$$;

-- 1. Giới hạn truy cập cùng lúc --------------------------------------------------------
alter table public.system_settings
  add column max_online integer not null default 200 check (max_online between 1 and 100000);

-- Lần cuối mỗi người mở một trang. Chỉ hàm enter_app đọc/ghi.
create table public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now()
);
create index presence_seen_idx on public.presence (seen_at);
alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;

-- Gọi mỗi lần mở trang. Người đã đang dùng (mở trang trong 10 phút qua) luôn được tiếp tục;
-- người mới vào chỉ được vào khi số người đang dùng còn dưới max_online.
create function public.enter_app()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cap integer;
  online integer;
  last timestamptz;
  privileged boolean;
begin
  if uid is null or not private.is_active_user() then
    return jsonb_build_object('allowed', false, 'online', 0, 'max', 0);
  end if;
  select max_online into cap from public.system_settings;
  select seen_at into last from public.presence where user_id = uid;
  select count(*) into online from public.presence where seen_at > now() - interval '10 minutes' and user_id <> uid;
  privileged := private.is_admin() or exists (
    select 1 from public.profiles p where p.id = uid and p.system_role in ('principal', 'secretary'));
  if not privileged and (last is null or last <= now() - interval '10 minutes') and online >= cap then
    return jsonb_build_object('allowed', false, 'online', online, 'max', cap);
  end if;
  -- Ghi tối đa mỗi phút một lần để đỡ tải.
  if last is null or last < now() - interval '1 minute' then
    insert into public.presence (user_id, seen_at) values (uid, now())
    on conflict (user_id) do update set seen_at = excluded.seen_at;
  end if;
  return jsonb_build_object('allowed', true, 'online', online + 1, 'max', cap);
end;
$$;
revoke execute on function public.enter_app() from public, anon;
grant execute on function public.enter_app() to authenticated;

-- 2. Danh bạ nhóm --------------------------------------------------------------------
create function public.group_directory()
returns table (
  id uuid, name text, description text, kind text, parent_id uuid, parent_name text,
  member_count integer, open_tasks integer, is_member boolean, can_view boolean,
  my_role text, updated_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select g.id, g.name, g.description, g.kind::text, g.parent_id, p.name,
    (select count(*)::int from public.group_members m where m.group_id = g.id),
    (select count(*)::int from public.tasks t where t.group_id = g.id and t.status <> 'done'),
    exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
    private.has_group_perm(g.id, 'view'),
    (select case when m.is_manager then 'Trưởng nhóm' when m.is_clerk then 'Văn thư' else 'Thành viên' end
       from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
    g.updated_at
  from public.groups g
  left join public.groups p on p.id = g.parent_id
  where private.is_active_user() and g.archived_at is null
  order by g.name;
$$;
revoke execute on function public.group_directory() from public, anon;
grant execute on function public.group_directory() to authenticated;

-- Lãnh đạo (Trưởng nhóm) và đầu mối liên hệ (Văn thư) của một nhóm.
create function public.group_contacts(p_group uuid)
returns table (user_id uuid, full_name text, email text, "position" text, phone text, office text, role text)
language sql stable security definer
set search_path = ''
as $$
  select pr.id, pr.full_name, pr.email, pr.position, pr.phone, pr.office,
    case when m.is_manager then 'Trưởng nhóm' else 'Đầu mối liên hệ' end
  from public.group_members m
  join public.profiles pr on pr.id = m.user_id and pr.is_active
  where private.is_active_user() and m.group_id = p_group and (m.is_manager or m.is_clerk)
  order by m.is_manager desc, pr.full_name;
$$;
revoke execute on function public.group_contacts(uuid) from public, anon;
grant execute on function public.group_contacts(uuid) to authenticated;

-- Tên các việc đang mở của một nhóm (chỉ tên, hạn và đã có người làm chưa) để xin tham gia.
create function public.group_open_task_titles(p_group uuid)
returns table (id uuid, title text, due_date date, has_assignee boolean)
language sql stable security definer
set search_path = ''
as $$
  select t.id, t.title, t.due_date, t.assignee_id is not null
  from public.tasks t
  join public.groups g on g.id = t.group_id and g.archived_at is null
  where private.is_active_user() and t.group_id = p_group and t.status <> 'done'
  order by t.due_date nulls last, t.title
  limit 100;
$$;
revoke execute on function public.group_open_task_titles(uuid) from public, anon;
grant execute on function public.group_open_task_titles(uuid) to authenticated;

-- 3. Yêu cầu tham gia ----------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- Để trống: xin vào nhóm. Có giá trị: xin tham gia việc này (được thêm vào nhóm khi duyệt).
  task_id uuid references public.tasks (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz
);
create unique index join_requests_one_pending on public.join_requests
  (group_id, coalesce(task_id, '00000000-0000-0000-0000-000000000000'::uuid), requester_id) where status = 'pending';
create index join_requests_group_idx on public.join_requests (group_id, status, created_at desc);
alter table public.join_requests enable row level security;
revoke all on public.join_requests from anon, authenticated;
grant select on public.join_requests to authenticated;
create policy join_requests_read on public.join_requests for select to authenticated
  using (requester_id = auth.uid() or private.has_group_perm(group_id, 'manage_members'));

create function public.request_join(p_group uuid, p_task uuid default null, p_message text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  t public.tasks;
  rid uuid;
  who text := coalesce(private.display_name(auth.uid()), 'Một người dùng');
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select * into g from public.groups where id = p_group;
  if g.id is null or g.archived_at is not null then
    raise exception 'Nhóm không tồn tại hoặc đã lưu trữ' using errcode = '22023';
  end if;
  if p_task is not null then
    select * into t from public.tasks where id = p_task and group_id = p_group;
    if t.id is null or t.status = 'done' then
      raise exception 'Việc không còn mở' using errcode = '22023';
    end if;
    if t.assignee_id = uid then
      raise exception 'Bạn đã được giao việc này' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = uid) then
    raise exception 'Bạn đã là thành viên nhóm này' using errcode = '22023';
  end if;
  if exists (select 1 from public.join_requests r where r.group_id = p_group and r.requester_id = uid
             and r.task_id is not distinct from p_task and r.status = 'pending') then
    raise exception 'Bạn đã gửi yêu cầu này, đang chờ duyệt' using errcode = '22023';
  end if;

  insert into public.join_requests (group_id, task_id, requester_id, message)
  values (p_group, p_task, uid, nullif(trim(coalesce(p_message, '')), ''))
  returning id into rid;

  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select m.user_id, 'join_request',
    case when p_task is null then who || ' xin tham gia ' || g.name else who || ' xin tham gia việc: ' || t.title end,
    nullif(trim(coalesce(p_message, '')), ''),
    '/nhom/' || p_group || '?tab=thanh-vien', uid
  from public.group_members m
  where m.group_id = p_group and (m.is_manager or m.is_clerk or m.can_manage_members) and m.user_id <> uid;
  return rid;
end;
$$;
revoke execute on function public.request_join(uuid, uuid, text) from public, anon;
grant execute on function public.request_join(uuid, uuid, text) to authenticated;

create function public.decide_join_request(p_id uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.join_requests;
  g public.groups;
  t public.tasks;
begin
  select * into r from public.join_requests where id = p_id;
  if r.id is null or not private.has_group_perm(r.group_id, 'manage_members') then
    raise exception 'Bạn không có quyền duyệt yêu cầu này' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'Yêu cầu đã được xử lý' using errcode = '22023';
  end if;
  select * into g from public.groups where id = r.group_id;

  update public.join_requests set status = case when p_accept then 'accepted' else 'declined' end,
    decided_by = uid, decided_at = now()
  where id = p_id;

  if p_accept then
    insert into public.group_members (group_id, user_id, can_view, can_create, can_edit, can_upload)
    values (r.group_id, r.requester_id, true, g.default_can_create, g.default_can_edit, g.default_can_upload)
    on conflict (group_id, user_id) do update set can_view = true;
    if r.task_id is not null then
      select * into t from public.tasks where id = r.task_id;
      -- Việc chưa có người làm và người duyệt có quyền sửa việc: giao luôn cho người xin.
      -- Ngược lại chỉ thêm vào nhóm; Trưởng nhóm phân việc sau.
      if t.id is not null and t.assignee_id is null and t.status <> 'done' and private.has_group_perm(r.group_id, 'edit') then
        update public.tasks set assignee_id = r.requester_id where id = t.id;
        t.assignee_id := r.requester_id;
      end if;
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  values (r.requester_id, 'join_decided',
    case when p_accept then 'Yêu cầu tham gia được chấp nhận: ' else 'Yêu cầu tham gia bị từ chối: ' end
      || coalesce(t.title, g.name),
    case when r.task_id is not null and p_accept and t.assignee_id is distinct from r.requester_id
      then 'Bạn đã được thêm vào nhóm ' || g.name || '; Trưởng nhóm sẽ phân công cụ thể trong việc này.' end,
    '/nhom/' || r.group_id, uid);
end;
$$;
revoke execute on function public.decide_join_request(uuid, boolean) from public, anon;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;

create function public.cancel_join_request(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.join_requests set status = 'cancelled', decided_at = now()
  where id = p_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Không hủy được yêu cầu này' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
grant execute on function public.cancel_join_request(uuid) to authenticated;
