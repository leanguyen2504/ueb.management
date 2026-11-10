-- Quy trình hồ sơ họp theo phân công đầu mối (văn bản "Chuẩn bị hồ sơ họp & tổng hợp tài liệu"):
--  * Mảng công tác (work_areas): mỗi mảng/đơn vị có một đầu mối phụ trách chính và người phối hợp.
--    Đầu mối ghi bằng email để gán được cả người chưa đăng nhập lần nào.
--  * Thông tin chung của buổi họp (meeting_records): mã Jira, thư mục Drive của buổi họp,
--    tình trạng xử lý, nội dung cần tiếp tục theo dõi.
--  * Loại tài liệu và mảng của từng dòng tài liệu (meeting_items.doc_type, area_id).

create table public.work_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 120),
  -- Nhóm/đơn vị trong hệ thống ứng với mảng này (nếu có).
  group_id uuid references public.groups (id) on delete set null,
  primary_email text check (primary_email is null or (primary_email = lower(primary_email) and primary_email ~ '^[^@[:space:]]+@[^@[:space:]]+$')),
  coordinator_emails text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index work_areas_group_idx on public.work_areas (group_id);
create trigger work_areas_audit before insert or update on public.work_areas
  for each row execute function private.set_audit_columns();

-- Email luôn viết thường, bỏ trùng, bỏ ô trống.
create function private.normalize_work_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.primary_email := nullif(lower(trim(new.primary_email)), '');
  new.coordinator_emails := coalesce(array(
    select distinct lower(trim(e)) from unnest(new.coordinator_emails) e
    where trim(e) <> '' and lower(trim(e)) is distinct from new.primary_email
  ), '{}');
  return new;
end;
$$;
create trigger work_areas_normalize before insert or update on public.work_areas
  for each row execute function private.normalize_work_area();

-- Hiệu trưởng, thư ký và quản trị quản lý danh mục mảng và phân công đầu mối.
create function private.is_office()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and (private.is_admin() or coalesce(private.my_role() in ('principal', 'secretary'), false));
$$;
grant execute on function private.is_office() to authenticated;

alter table public.work_areas enable row level security;
revoke all on public.work_areas from anon, authenticated;
grant select, delete on public.work_areas to authenticated;
grant insert (name, group_id, primary_email, coordinator_emails, sort_order) on public.work_areas to authenticated;
grant update (name, group_id, primary_email, coordinator_emails, sort_order) on public.work_areas to authenticated;
create policy work_areas_read on public.work_areas for select to authenticated using (private.is_active_user());
create policy work_areas_insert on public.work_areas for insert to authenticated with check (private.is_office());
create policy work_areas_update on public.work_areas for update to authenticated using (private.is_office()) with check (private.is_office());
create policy work_areas_delete on public.work_areas for delete to authenticated using (private.is_office());

-- ---------------------------------------------------------------------------
-- Tài liệu: loại tài liệu và mảng.
alter table public.meeting_items
  add column doc_type text check (doc_type is null or doc_type in (
    'giay_moi', 'chuong_trinh', 'bao_cao', 'to_trinh', 'du_thao_van_ban', 'du_thao_ket_luan', 'tai_lieu_kem',
    'bien_ban', 'du_thao_hoan_chinh', 'ket_luan', 'tai_lieu_bo_sung', 'khac'
  )),
  add column area_id uuid references public.work_areas (id) on delete set null;
create index meeting_items_area_idx on public.meeting_items (area_id, meeting_starts_at);
grant insert (doc_type, area_id) on public.meeting_items to authenticated;
grant update (doc_type, area_id) on public.meeting_items to authenticated;

-- ---------------------------------------------------------------------------
-- Thông tin chung của buổi họp.
create table public.meeting_records (
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 500),
  meeting_title text not null default '' check (char_length(meeting_title) <= 300),
  meeting_starts_at timestamptz not null,
  -- Mã Jira của cuộc họp, ví dụ KHTC-6447. Để trống: lấy mã trong mô tả sự kiện Google.
  jira_key text check (jira_key is null or jira_key ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$'),
  -- Thư mục Google Drive của buổi họp (thường đặt tên theo mã Jira).
  drive_folder_url text check (drive_folder_url is null or (drive_folder_url ~* '^https://[^[:space:]]+$' and char_length(drive_folder_url) <= 1000)),
  -- Để trống: hệ thống tự suy ra từ tài liệu đã có.
  status text check (status is null or status in ('chuan_bi', 'dang_thu_thap', 'du_tai_lieu', 'cho_bien_ban', 'hoan_tat', 'khong_can')),
  follow_up text check (follow_up is null or char_length(follow_up) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (source_id, event_key)
);
create index meeting_records_starts_idx on public.meeting_records (meeting_starts_at);
create index meeting_records_jira_idx on public.meeting_records (jira_key);
create trigger meeting_records_audit before insert or update on public.meeting_records
  for each row execute function private.set_audit_columns();

create function private.fill_meeting_record()
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
  return new;
end;
$$;
create trigger meeting_records_fill before insert on public.meeting_records
  for each row execute function private.fill_meeting_record();

alter table public.meeting_records enable row level security;
revoke all on public.meeting_records from anon, authenticated;
grant select, delete on public.meeting_records to authenticated;
grant insert (source_id, event_key, meeting_title, meeting_starts_at, jira_key, drive_folder_url, status, follow_up) on public.meeting_records to authenticated;
grant update (jira_key, drive_folder_url, status, follow_up) on public.meeting_records to authenticated;
create policy meeting_records_read on public.meeting_records for select to authenticated
  using (private.can_see_calendar_source(source_id));
create policy meeting_records_insert on public.meeting_records for insert to authenticated
  with check (private.can_file_meeting(source_id));
create policy meeting_records_update on public.meeting_records for update to authenticated
  using (private.can_file_meeting(source_id)) with check (private.can_file_meeting(source_id));
create policy meeting_records_delete on public.meeting_records for delete to authenticated
  using (private.can_file_meeting(source_id));

-- Nhật ký cho thông tin buổi họp và danh mục mảng.
create function private.log_meeting_record()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.activity_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    'meeting_records',
    coalesce(new.event_key, old.event_key),
    case when tg_op <> 'INSERT' then jsonb_build_object('meeting', old.meeting_title, 'jira_key', old.jira_key, 'drive_folder_url', old.drive_folder_url, 'status', old.status, 'follow_up', old.follow_up) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('meeting', new.meeting_title, 'jira_key', new.jira_key, 'drive_folder_url', new.drive_folder_url, 'status', new.status, 'follow_up', new.follow_up) end
  );
  return coalesce(new, old);
end;
$$;
create trigger meeting_records_log after insert or update or delete on public.meeting_records
  for each row execute function private.log_meeting_record();

create function private.log_work_area()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.activity_log (actor_id, action, entity_type, entity_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    'work_areas',
    coalesce(new.id, old.id)::text,
    case when tg_op <> 'INSERT' then jsonb_build_object('name', old.name, 'group_id', old.group_id, 'primary_email', old.primary_email, 'coordinator_emails', old.coordinator_emails) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('name', new.name, 'group_id', new.group_id, 'primary_email', new.primary_email, 'coordinator_emails', new.coordinator_emails) end
  );
  return coalesce(new, old);
end;
$$;
create trigger work_areas_log after insert or update or delete on public.work_areas
  for each row execute function private.log_work_area();

-- Ghi thêm loại tài liệu vào nhật ký tài liệu.
create or replace function private.log_meeting_item()
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
    case when tg_op <> 'INSERT' then jsonb_build_object('meeting', old.meeting_title, 'kind', old.kind, 'doc_type', old.doc_type, 'party', old.party, 'assignee_id', old.assignee_id, 'title', old.title, 'url', old.url) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('meeting', new.meeting_title, 'kind', new.kind, 'doc_type', new.doc_type, 'party', new.party, 'assignee_id', new.assignee_id, 'title', new.title, 'url', new.url) end
  );
  return coalesce(new, old);
end;
$$;
