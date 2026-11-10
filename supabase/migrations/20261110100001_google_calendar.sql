-- Module Google Calendar (chỉ đọc): lịch dùng chung của Tổ thư ký.
-- Một tài khoản dịch vụ Google (khóa nằm trong biến môi trường Vercel, không nằm
-- trong cơ sở dữ liệu) được chia sẻ quyền xem các lịch Google dùng chung. Máy chủ
-- đọc lịch qua Google Calendar API và lưu các buổi họp vào calendar_events.
-- Module chỉ chạy khi FEATURE_GOOGLE_CALENDAR=true.

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  -- Mã lịch Google, ví dụ abc123@group.calendar.google.com
  calendar_id text not null unique check (char_length(calendar_id) between 3 and 300),
  label text not null check (char_length(label) between 1 and 80),
  -- office: Hiệu trưởng, thư ký và quản trị xem được. all: mọi người dùng đang hoạt động.
  visibility text not null default 'office' check (visibility in ('office', 'all')),
  is_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  event_count int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  google_event_id text not null,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  url text,
  html_link text,
  unique (source_id, google_event_id)
);
create index calendar_events_range_idx on public.calendar_events (starts_at, ends_at);

create trigger calendar_sources_audit before insert or update on public.calendar_sources
  for each row execute function private.set_audit_columns();

create function private.can_see_calendar(vis text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    vis = 'all'
    or private.is_admin()
    or coalesce(private.my_role() in ('principal', 'secretary'), false)
  );
$$;
grant execute on function private.can_see_calendar(text) to authenticated;

alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;

revoke all on public.calendar_sources from anon, authenticated;
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_sources, public.calendar_events to authenticated;
-- Chỉ quản trị thêm, sửa, xóa nguồn lịch. Trạng thái đồng bộ do máy chủ ghi.
grant insert (calendar_id, label, visibility, is_enabled) on public.calendar_sources to authenticated;
grant update (label, visibility, is_enabled) on public.calendar_sources to authenticated;
grant delete on public.calendar_sources to authenticated;

create policy calendar_sources_read on public.calendar_sources for select to authenticated
  using (private.is_admin() or (is_enabled and private.can_see_calendar(visibility)));
create policy calendar_sources_insert on public.calendar_sources for insert to authenticated
  with check (private.is_admin());
create policy calendar_sources_update on public.calendar_sources for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy calendar_sources_delete on public.calendar_sources for delete to authenticated
  using (private.is_admin());

-- Buổi họp: chỉ đọc, theo quyền của nguồn lịch. Chỉ máy chủ (khóa service) ghi.
create policy calendar_events_read on public.calendar_events for select to authenticated
  using (exists (
    select 1 from public.calendar_sources s
    where s.id = source_id and s.is_enabled and private.can_see_calendar(s.visibility)
  ));

-- Ghi nhật ký khi quản trị đổi nguồn lịch.
create function private.log_calendar_source()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (old.label, old.visibility, old.is_enabled) is not distinct from (new.label, new.visibility, new.is_enabled) then
    return new; -- chỉ đổi trạng thái đồng bộ
  end if;
  insert into public.activity_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    'calendar_sources',
    coalesce(new.id, old.id)::text,
    case when tg_op <> 'INSERT' then jsonb_build_object('calendar_id', old.calendar_id, 'label', old.label, 'visibility', old.visibility, 'is_enabled', old.is_enabled) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('calendar_id', new.calendar_id, 'label', new.label, 'visibility', new.visibility, 'is_enabled', new.is_enabled) end
  );
  return coalesce(new, old);
end;
$$;
create trigger calendar_sources_log after insert or update or delete on public.calendar_sources
  for each row execute function private.log_calendar_source();
