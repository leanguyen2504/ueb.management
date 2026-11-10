-- Hồ sơ cuộc họp: gắn link tài liệu (thường là file/thư mục Google Drive) vào từng
-- buổi họp đọc từ lịch Google dùng chung, gồm tài liệu trước họp của các bên và biên
-- bản sau họp. File vẫn nằm trên Drive; cơ sở dữ liệu chỉ lưu link.
--
-- Văn thư/thư ký liên hệ các bên (khoa, viện, phòng...) để xin tài liệu, tạo dòng
-- "chờ gửi" cho từng bên rồi dán link khi nhận được. Hiệu trưởng xem được bên nào đã gửi.
--
-- Buổi họp trong calendar_events được xóa và nạp lại mỗi lần đồng bộ, nên hồ sơ gắn
-- theo (source_id, event_key = google_event_id), là mã giữ nguyên giữa các lần đồng bộ.

-- File đính kèm sẵn trên sự kiện Google Calendar và link Drive trong mô tả: [{title, url}].
alter table public.calendar_events add column attachments jsonb not null default '[]'::jsonb;

create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 500),
  -- Bản chụp tên và giờ buổi họp lúc gắn, để hồ sơ vẫn đọc được khi buổi họp bị xóa khỏi lịch.
  meeting_title text not null default '' check (char_length(meeting_title) <= 300),
  meeting_starts_at timestamptz not null,
  -- pre: tài liệu trước họp. minutes: biên bản, kết luận sau họp.
  kind text not null default 'pre' check (kind in ('pre', 'minutes')),
  -- Bên gửi tài liệu, ví dụ "Phòng Đào tạo". Để trống: tài liệu chung.
  party text check (party is null or char_length(party) between 1 and 120),
  -- Nhóm/đơn vị trong app ứng với bên đó (nếu có): thành viên nhóm thấy buổi họp trong mục "Của tôi".
  party_group_id uuid references public.groups (id) on delete set null,
  -- Người phụ trách đôn đốc bên đó gửi tài liệu. Mặc định là người tạo dòng.
  assignee_id uuid references public.profiles (id) on delete set null,
  title text check (title is null or char_length(title) between 1 and 200),
  -- Để trống: đang chờ bên đó gửi.
  url text check (url is null or (url ~* '^https://[^[:space:]]+$' and char_length(url) <= 1000)),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index meeting_items_event_idx on public.meeting_items (source_id, event_key);
create index meeting_items_starts_idx on public.meeting_items (meeting_starts_at);
create index meeting_items_assignee_idx on public.meeting_items (assignee_id, meeting_starts_at);
create index meeting_items_group_idx on public.meeting_items (party_group_id, meeting_starts_at);

create trigger meeting_items_audit before insert or update on public.meeting_items
  for each row execute function private.set_audit_columns();

-- Lấy tên và giờ buổi họp từ lịch nếu buổi họp đang có trong calendar_events.
create function private.fill_meeting_item()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  ev record;
begin
  select e.title, e.starts_at into ev
  from public.calendar_events e
  where e.source_id = new.source_id and e.google_event_id = new.event_key
  limit 1;
  if found then
    new.meeting_title := ev.title;
    new.meeting_starts_at := ev.starts_at;
  end if;
  if new.assignee_id is null then
    new.assignee_id := auth.uid();
  end if;
  -- Có nhóm mà chưa ghi tên bên thì lấy tên nhóm.
  if new.party is null and new.party_group_id is not null then
    select left(g.name, 120) into new.party from public.groups g where g.id = new.party_group_id;
  end if;
  return new;
end;
$$;
create trigger meeting_items_fill before insert on public.meeting_items
  for each row execute function private.fill_meeting_item();

-- Ai xem hồ sơ: người xem được lịch đó (Hiệu trưởng, thư ký, quản trị; hoặc mọi người
-- nếu lịch để "Mọi người dùng").
create function private.can_see_calendar_source(sid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.calendar_sources s
    where s.id = sid and s.is_enabled and private.can_see_calendar(s.visibility)
  );
$$;
grant execute on function private.can_see_calendar_source(uuid) to authenticated;

-- Ai gắn, sửa, xóa tài liệu: người xem được lịch và là Hiệu trưởng, thư ký, quản trị,
-- hoặc Văn thư của một nhóm.
create function private.can_file_meeting(sid uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.can_see_calendar_source(sid) and (
    private.is_admin()
    or coalesce(private.my_role() in ('principal', 'secretary'), false)
    or exists (select 1 from public.group_members m where m.user_id = auth.uid() and m.is_clerk)
  );
$$;
grant execute on function private.can_file_meeting(uuid) to authenticated;

alter table public.meeting_items enable row level security;
revoke all on public.meeting_items from anon, authenticated;
grant select, delete on public.meeting_items to authenticated;
grant insert (source_id, event_key, meeting_title, meeting_starts_at, kind, party, party_group_id, assignee_id, title, url, note) on public.meeting_items to authenticated;
-- Không đổi được buổi họp của một dòng; chỉ sửa nội dung.
grant update (kind, party, party_group_id, assignee_id, title, url, note) on public.meeting_items to authenticated;

create policy meeting_items_read on public.meeting_items for select to authenticated
  using (private.can_see_calendar_source(source_id));
create policy meeting_items_insert on public.meeting_items for insert to authenticated
  with check (private.can_file_meeting(source_id));
create policy meeting_items_update on public.meeting_items for update to authenticated
  using (private.can_file_meeting(source_id)) with check (private.can_file_meeting(source_id));
create policy meeting_items_delete on public.meeting_items for delete to authenticated
  using (private.can_file_meeting(source_id));

-- Nhật ký: ai gắn, đổi, gỡ tài liệu của buổi họp nào.
create function private.log_meeting_item()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.activity_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    'meeting_items',
    coalesce(new.id, old.id)::text,
    case when tg_op <> 'INSERT' then jsonb_build_object('meeting', old.meeting_title, 'kind', old.kind, 'party', old.party, 'assignee_id', old.assignee_id, 'title', old.title, 'url', old.url) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('meeting', new.meeting_title, 'kind', new.kind, 'party', new.party, 'assignee_id', new.assignee_id, 'title', new.title, 'url', new.url) end
  );
  return coalesce(new, old);
end;
$$;
create trigger meeting_items_log after insert or update or delete on public.meeting_items
  for each row execute function private.log_meeting_item();

-- Báo cho người được giao đôn đốc (không báo khi tự giao cho mình).
create function private.notify_meeting_assignee()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.notify(
      new.assignee_id,
      'meeting_item_assigned',
      'Đôn đốc tài liệu: ' || coalesce(new.party, 'tài liệu chung'),
      left(new.meeting_title, 200) || ' · ' || to_char(new.meeting_starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY'),
      '/hop?ngay=' || to_char(new.meeting_starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
    );
  end if;
  return new;
end;
$$;
create trigger meeting_items_notify after insert or update of assignee_id on public.meeting_items
  for each row execute function private.notify_meeting_assignee();
