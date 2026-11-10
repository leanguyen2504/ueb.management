-- Giai đoạn 2-3 (phần đầu): đầu việc, lịch, trang đặt lịch và thông báo.
-- Mọi bảng đều bật RLS; quyền đi theo quyền trong nhóm (private.has_group_perm).

-- ---------------------------------------------------------------------------
-- Kiểu dữ liệu
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('todo', 'doing', 'review', 'done');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.event_kind as enum ('meeting', 'event', 'deadline', 'other');
create type public.booking_status as enum ('pending', 'accepted', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------------

-- Đầu việc thuộc một nhóm (đơn vị, dự án hoặc sự kiện).
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  due_date date,
  assignee_id uuid references public.profiles (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index tasks_group_idx on public.tasks (group_id, status);
create index tasks_assignee_idx on public.tasks (assignee_id, status);

-- Lịch của nhóm: cuộc họp, sự kiện, hạn chót.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 300),
  description text,
  location text,
  kind public.event_kind not null default 'meeting',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (ends_at >= starts_at)
);
create index events_group_idx on public.events (group_id, starts_at);
create index events_time_idx on public.events (starts_at);

-- Trang đặt lịch của một người (Hiệu trưởng, thư ký...): người khác gửi yêu cầu gặp.
create table public.booking_pages (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  is_open boolean not null default true,
  intro text,
  -- Khung giờ nhận lịch, ví dụ "Sáng thứ Ba và thứ Năm, 8:00-11:00".
  hours_note text,
  slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  requester_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  topic text not null check (length(trim(topic)) between 1 and 300),
  note text,
  status public.booking_status not null default 'pending',
  response_note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (ends_at > starts_at),
  check (host_id <> requester_id)
);
create index bookings_host_idx on public.bookings (host_id, starts_at);
create index bookings_requester_idx on public.bookings (requester_id, starts_at);

-- Thông báo trong ứng dụng; chỉ trigger tạo, người nhận đánh dấu đã đọc hoặc xóa.
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  actor_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger cột lịch sử và nhật ký
-- ---------------------------------------------------------------------------

create trigger tasks_audit before insert or update on public.tasks
  for each row execute function private.set_audit_columns();
create trigger events_audit before insert or update on public.events
  for each row execute function private.set_audit_columns();
create trigger booking_pages_audit before insert or update on public.booking_pages
  for each row execute function private.set_audit_columns();
create trigger bookings_audit before insert or update on public.bookings
  for each row execute function private.set_audit_columns();

create trigger tasks_log after insert or update or delete on public.tasks
  for each row execute function private.log_change();
create trigger events_log after insert or update or delete on public.events
  for each row execute function private.log_change();
create trigger bookings_log after insert or update or delete on public.bookings
  for each row execute function private.log_change();

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ
-- ---------------------------------------------------------------------------

-- Người được giao việc phải là thành viên nhóm (hoặc người xem được mọi nhóm).
-- Người được giao nhưng không có quyền sửa chỉ được đổi trạng thái.
create function private.check_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if not exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id and p.is_active
        and (
          p.system_role = 'principal'
          or exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id = p.id and m.can_view)
          or exists (select 1 from public.system_settings s where s.current_admin_id = p.id)
          or (p.system_role = 'secretary' and exists (select 1 from public.secretary_scopes c where c.user_id = p.id and c.all_groups))
        )
    ) then
      raise exception 'Người được giao việc phải là thành viên của nhóm' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id then
      raise exception 'Không chuyển đầu việc sang nhóm khác' using errcode = '42501';
    end if;
    if not private.has_group_perm(old.group_id, 'edit')
       and (new.title, new.description, new.priority, new.due_date, new.assignee_id)
           is distinct from (old.title, old.description, old.priority, old.due_date, old.assignee_id) then
      raise exception 'Bạn chỉ được đổi trạng thái của việc được giao' using errcode = '42501';
    end if;
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger tasks_check before insert or update on public.tasks
  for each row execute function private.check_task();

create function private.check_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.group_id <> old.group_id then
    raise exception 'Không chuyển lịch sang nhóm khác' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_check before insert or update on public.events
  for each row execute function private.check_event();

-- Đặt lịch: người đặt chỉ hủy được; người nhận chỉ đồng ý/từ chối kèm ghi chú.
-- Không cho hai lịch đã đồng ý của cùng một người trùng giờ.
create function private.check_booking()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Yêu cầu mới phải ở trạng thái chờ' using errcode = '42501';
    end if;
    if not exists (select 1 from public.booking_pages b join public.profiles p on p.id = b.user_id
                   where b.user_id = new.host_id and b.is_open and p.is_active) then
      raise exception 'Người này chưa mở trang đặt lịch' using errcode = '42501';
    end if;
    if new.starts_at < now() then
      raise exception 'Không đặt lịch vào thời điểm đã qua' using errcode = '22023';
    end if;
  else
    if (new.host_id, new.requester_id, new.starts_at, new.ends_at, new.topic, new.note)
       is distinct from (old.host_id, old.requester_id, old.starts_at, old.ends_at, old.topic, old.note) then
      raise exception 'Không sửa nội dung yêu cầu đã gửi; hãy hủy và gửi yêu cầu mới' using errcode = '42501';
    end if;
    if new.status <> old.status then
      if uid = old.requester_id and not private.is_admin() then
        if new.status <> 'cancelled' or old.status not in ('pending', 'accepted') then
          raise exception 'Người đặt chỉ hủy được yêu cầu của mình' using errcode = '42501';
        end if;
      elsif uid = old.host_id or private.is_admin() then
        if new.status not in ('accepted', 'declined', 'cancelled') then
          raise exception 'Trạng thái không hợp lệ' using errcode = '22023';
        end if;
      else
        raise exception 'Bạn không xử lý được yêu cầu này' using errcode = '42501';
      end if;
    elsif new.response_note is distinct from old.response_note and uid <> old.host_id and not private.is_admin() then
      raise exception 'Chỉ người nhận ghi phản hồi' using errcode = '42501';
    end if;
  end if;

  if new.status = 'accepted' and exists (
    select 1 from public.bookings b
    where b.host_id = new.host_id and b.status = 'accepted' and b.id <> new.id
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'Khung giờ này đã có lịch được đồng ý' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger bookings_check before insert or update on public.bookings
  for each row execute function private.check_booking();

-- ---------------------------------------------------------------------------
-- Thông báo tự động
-- ---------------------------------------------------------------------------

create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select p_user, p_kind, p_title, p_body, p_link, auth.uid()
  where p_user is not null and p_user is distinct from auth.uid();
$$;
revoke execute on function private.notify(uuid, text, text, text, text) from authenticated;

create function private.display_name(p_user uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), p.email, 'Một người dùng') from public.profiles p where p.id = p_user;
$$;

create function private.notify_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.notify(new.assignee_id, 'task_assigned',
      'Bạn được giao việc: ' || new.title,
      coalesce(private.display_name(auth.uid()), 'Hệ thống') || ' giao'
        || coalesce(', hạn ' || to_char(new.due_date, 'DD/MM/YYYY'), ''),
      '/viec');
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.created_by is not null then
    perform private.notify(new.created_by, 'task_status',
      'Việc "' || new.title || '" chuyển sang ' || case new.status
        when 'todo' then 'Cần làm' when 'doing' then 'Đang làm' when 'review' then 'Chờ duyệt' else 'Hoàn thành' end,
      coalesce(private.display_name(auth.uid()), 'Hệ thống') || ' cập nhật',
      '/nhom/' || new.group_id);
  end if;
  return null;
end;
$$;
create trigger tasks_notify after insert or update on public.tasks
  for each row execute function private.notify_task();

create function private.notify_event()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select m.user_id, 'event_created',
    'Lịch mới: ' || new.title,
    to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') || coalesce(' · ' || new.location, ''),
    '/lich',
    auth.uid()
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.group_id = new.group_id and m.can_view and m.user_id is distinct from auth.uid();
  return null;
end;
$$;
create trigger events_notify after insert on public.events
  for each row execute function private.notify_event();

create function private.notify_booking()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  when_text text := to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.host_id, 'booking_new',
      'Yêu cầu gặp: ' || new.topic,
      private.display_name(new.requester_id) || ' đề nghị lúc ' || when_text, '/dat-lich');
  elsif new.status <> old.status then
    if new.status = 'cancelled' and auth.uid() = new.requester_id then
      perform private.notify(new.host_id, 'booking_cancelled',
        'Đã hủy lịch gặp: ' || new.topic, private.display_name(new.requester_id) || ' hủy lịch lúc ' || when_text, '/dat-lich');
    else
      perform private.notify(new.requester_id, 'booking_' || new.status::text,
        case new.status when 'accepted' then 'Lịch gặp được đồng ý: ' when 'declined' then 'Lịch gặp bị từ chối: ' else 'Lịch gặp bị hủy: ' end || new.topic,
        when_text || coalesce(' · ' || new.response_note, ''), '/dat-lich');
    end if;
  end if;
  return null;
end;
$$;
create trigger bookings_notify after insert or update on public.bookings
  for each row execute function private.notify_booking();

-- ---------------------------------------------------------------------------
-- Phân quyền (RLS)
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.booking_pages enable row level security;
alter table public.bookings enable row level security;
alter table public.notifications enable row level security;

revoke all on public.tasks, public.events, public.booking_pages, public.bookings, public.notifications from anon;

-- tasks: xem theo quyền xem nhóm hoặc khi là người được giao.
create policy tasks_read on public.tasks for select to authenticated
  using (private.has_group_perm(group_id, 'view') or (assignee_id = auth.uid() and private.is_active_user()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.has_group_perm(group_id, 'create'));
create policy tasks_update on public.tasks for update to authenticated
  using (private.has_group_perm(group_id, 'edit') or (assignee_id = auth.uid() and private.is_active_user()))
  with check (private.has_group_perm(group_id, 'edit') or (assignee_id = auth.uid() and private.is_active_user()));
create policy tasks_delete on public.tasks for delete to authenticated
  using (private.has_group_perm(group_id, 'edit'));

-- events
create policy events_read on public.events for select to authenticated
  using (private.has_group_perm(group_id, 'view'));
create policy events_insert on public.events for insert to authenticated
  with check (private.has_group_perm(group_id, 'create'));
create policy events_update on public.events for update to authenticated
  using (private.has_group_perm(group_id, 'edit'))
  with check (private.has_group_perm(group_id, 'edit'));
create policy events_delete on public.events for delete to authenticated
  using (private.has_group_perm(group_id, 'edit'));

-- booking_pages: ai đang hoạt động cũng xem được trang đặt lịch; chỉ chủ trang sửa.
revoke delete on public.booking_pages from authenticated;
create policy booking_pages_read on public.booking_pages for select to authenticated
  using (private.is_active_user());
create policy booking_pages_insert on public.booking_pages for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy booking_pages_update on public.booking_pages for update to authenticated
  using (user_id = auth.uid() and private.is_active_user())
  with check (user_id = auth.uid());

-- bookings: chỉ người đặt, người nhận và quản trị thấy nội dung.
revoke delete on public.bookings from authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (private.is_active_user() and (requester_id = auth.uid() or host_id = auth.uid() or private.is_admin()));
create policy bookings_insert on public.bookings for insert to authenticated
  with check (requester_id = auth.uid() and private.is_active_user());
create policy bookings_update on public.bookings for update to authenticated
  using (private.is_active_user() and (requester_id = auth.uid() or host_id = auth.uid() or private.is_admin()))
  with check (private.is_active_user() and (requester_id = auth.uid() or host_id = auth.uid() or private.is_admin()));

-- notifications: chỉ người nhận; chỉ được đổi read_at.
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Giờ bận của người nhận (chỉ giờ, không lộ nội dung) để người đặt tránh trùng.
create function public.booking_busy(p_host uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at from public.bookings b
  where private.is_active_user() and b.host_id = p_host and b.status in ('accepted', 'pending')
    and b.starts_at < p_to and b.ends_at > p_from
  order by b.starts_at;
$$;
revoke execute on function public.booking_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.booking_busy(uuid, timestamptz, timestamptz) to authenticated;
