-- Xóa không gian, lịch (sự kiện) và việc thừa.
-- Trưởng nhóm (và quản trị, thư ký toàn trường; chủ không gian cá nhân) xóa thẳng.
-- Thành viên khác gửi yêu cầu xóa; Trưởng nhóm thấy yêu cầu ở trang nhóm, duyệt thì mới xóa.
-- Không gian thuộc nhóm cấp trên: Trưởng nhóm của nhóm cấp trên duyệt. Không gian còn
-- không gian con thì phải chuyển hoặc xóa các không gian con trước. Nhóm gốc chỉ lưu trữ.

-- 1. Ai được xóa thẳng trong một nhóm --------------------------------------------------
create or replace function private.can_delete_in(gid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then false
    when exists (select 1 from public.groups g where g.id = gid and g.owner_id is not null)
      then exists (select 1 from public.groups g where g.id = gid and g.owner_id = auth.uid())
    else private.is_group_lead(gid)
  end;
$$;
grant execute on function private.can_delete_in(uuid) to authenticated;

-- Việc và lịch: chỉ Trưởng nhóm xóa thẳng (trước đây ai có quyền sửa cũng xóa được).
alter policy tasks_delete on public.tasks using (private.can_delete_in(group_id));
alter policy events_delete on public.events using (private.can_delete_in(group_id));

-- 2. Bảng yêu cầu xóa -----------------------------------------------------------------
create table public.delete_requests (
  id uuid primary key default gen_random_uuid(),
  -- Nhóm duyệt: nhóm chứa việc/lịch, hoặc nhóm cấp trên của không gian cần xóa.
  group_id uuid not null references public.groups (id) on delete cascade,
  item_type text not null check (item_type in ('group', 'task', 'event')),
  item_id uuid not null,
  item_title text not null,
  reason text check (reason is null or char_length(reason) <= 500),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz
);
create unique index delete_requests_one_pending on public.delete_requests (item_type, item_id) where status = 'pending';
create index delete_requests_group_idx on public.delete_requests (group_id, status, created_at desc);
alter table public.delete_requests enable row level security;
revoke all on public.delete_requests from anon, authenticated;
grant select on public.delete_requests to authenticated;
create policy delete_requests_read on public.delete_requests for select to authenticated
  using ((requester_id = auth.uid() and private.is_active_user()) or private.can_delete_in(group_id));

-- Mục đã bị xóa bằng cách khác: đóng các yêu cầu còn chờ.
create function private.close_delete_requests()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.delete_requests set status = 'approved', decided_at = now(), decided_by = coalesce(decided_by, auth.uid())
  where item_id = old.id and item_type = tg_argv[0] and status = 'pending';
  return old;
end;
$$;
create trigger tasks_close_delete_requests after delete on public.tasks
  for each row execute function private.close_delete_requests('task');
create trigger events_close_delete_requests after delete on public.events
  for each row execute function private.close_delete_requests('event');
create trigger groups_close_delete_requests after delete on public.groups
  for each row execute function private.close_delete_requests('group');

-- 3. Tìm mục cần xóa: nhóm duyệt và tên ---------------------------------------------------
create function private.delete_target(p_type text, p_id uuid, out gid uuid, out title text, out own_gid uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  g public.groups;
begin
  if p_type = 'task' then
    select t.group_id, t.title, t.group_id into gid, title, own_gid from public.tasks t where t.id = p_id;
  elsif p_type = 'event' then
    select e.group_id, e.title, e.group_id into gid, title, own_gid from public.events e where e.id = p_id;
  elsif p_type = 'group' then
    select * into g from public.groups where id = p_id;
    if g.id is not null and g.parent_id is null then
      raise exception 'Nhóm gốc không xóa được; hãy lưu trữ nhóm' using errcode = '22023';
    end if;
    gid := g.parent_id; title := g.name; own_gid := g.id;
  else
    raise exception 'Loại mục không hợp lệ' using errcode = '22023';
  end if;
  if gid is null then
    raise exception 'Không tìm thấy mục cần xóa' using errcode = '22023';
  end if;
end;
$$;

create function private.perform_delete(p_type text, p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_type = 'task' then
    delete from public.tasks where id = p_id;
  elsif p_type = 'event' then
    delete from public.events where id = p_id;
  elsif p_type = 'group' then
    if exists (select 1 from public.groups c where c.parent_id = p_id) then
      raise exception 'Không gian này còn không gian con; hãy chuyển hoặc xóa các không gian con trước' using errcode = '22023';
    end if;
    delete from public.groups where id = p_id;
  end if;
end;
$$;

-- 4. Gửi yêu cầu xóa. Trưởng nhóm gửi thì xóa luôn. Trả về 'deleted' hoặc 'requested'.
create function public.request_delete(p_type text, p_id uuid, p_reason text default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tg record;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
  who text := coalesce(private.display_name(auth.uid()), 'Một thành viên');
  what text := case p_type when 'group' then 'không gian' when 'event' then 'lịch' else 'việc' end;
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select * into tg from private.delete_target(p_type, p_id);
  if not (private.has_group_perm(tg.gid, 'view') or private.has_group_perm(tg.own_gid, 'view')) then
    raise exception 'Bạn không có quyền với mục này' using errcode = '42501';
  end if;
  if char_length(coalesce(reason, '')) > 500 then
    raise exception 'Lý do tối đa 500 ký tự' using errcode = '22023';
  end if;

  if private.can_delete_in(tg.gid) then
    perform private.perform_delete(p_type, p_id);
    return 'deleted';
  end if;

  if p_type = 'group' and exists (select 1 from public.groups c where c.parent_id = p_id) then
    raise exception 'Không gian này còn không gian con; hãy chuyển hoặc xóa các không gian con trước' using errcode = '22023';
  end if;
  if exists (select 1 from public.delete_requests r where r.item_type = p_type and r.item_id = p_id and r.status = 'pending') then
    raise exception 'Mục này đã có yêu cầu xóa, đang chờ Trưởng nhóm duyệt' using errcode = '22023';
  end if;

  insert into public.delete_requests (group_id, item_type, item_id, item_title, reason, requester_id)
  values (tg.gid, p_type, p_id, tg.title, reason, uid);

  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select m.user_id, 'delete_request', who || ' đề nghị xóa ' || what || ': ' || tg.title, reason,
    '/nhom/' || tg.gid || '#yeu-cau-xoa', uid
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.group_id = tg.gid and m.is_manager and m.user_id <> uid;
  return 'requested';
end;
$$;
revoke execute on function public.request_delete(text, uuid, text) from public, anon;
grant execute on function public.request_delete(text, uuid, text) to authenticated;

-- 5. Trưởng nhóm duyệt hoặc từ chối ------------------------------------------------------
create function public.decide_delete_request(p_id uuid, p_approve boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.delete_requests;
  what text;
begin
  select * into r from public.delete_requests where id = p_id;
  if r.id is null or not private.can_delete_in(r.group_id) then
    raise exception 'Chỉ Trưởng nhóm mới duyệt được yêu cầu xóa' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'Yêu cầu đã được xử lý' using errcode = '22023';
  end if;
  what := case r.item_type when 'group' then 'không gian' when 'event' then 'lịch' else 'việc' end;

  update public.delete_requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_by = uid, decided_at = now()
  where id = p_id;
  if p_approve then
    perform private.perform_delete(r.item_type, r.item_id);
  end if;

  if r.requester_id <> uid then
    insert into public.notifications (user_id, kind, title, link, actor_id)
    values (r.requester_id, 'delete_decided',
      case when p_approve then 'Đã xóa ' || what || ': ' else 'Không xóa ' || what || ': ' end || r.item_title,
      '/nhom/' || r.group_id, uid);
  end if;
end;
$$;
revoke execute on function public.decide_delete_request(uuid, boolean) from public, anon;
grant execute on function public.decide_delete_request(uuid, boolean) to authenticated;

-- 6. Người gửi tự rút yêu cầu ------------------------------------------------------------
create function public.cancel_delete_request(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.delete_requests set status = 'cancelled', decided_at = now()
  where id = p_id and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Không rút được yêu cầu này' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.cancel_delete_request(uuid) from public, anon;
grant execute on function public.cancel_delete_request(uuid) to authenticated;

revoke execute on function private.delete_target(text, uuid) from public;
revoke execute on function private.perform_delete(text, uuid) from public;
revoke execute on function private.close_delete_requests() from public;
