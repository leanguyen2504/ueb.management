-- Mục "Tài liệu" của mỗi không gian (nhóm, dự án, sự kiện, không gian cá nhân):
--   1. Link Drive chung của không gian (cột groups.drive_url), đặt qua hàm set_group_drive.
--   2. Tệp kéo thả và link tài liệu (bảng group_files). Tệp lưu ở bucket riêng tư
--      "group-files", đường dẫn <group_id>/<mã ngẫu nhiên>/<tên file>; người xem mở qua
--      /nhom/tep (máy chủ kiểm tra quyền rồi tạo link ký tạm thời 5 phút).
-- Quyền: ai xem được không gian thì xem được tài liệu; người có quyền "Tải/gắn tài liệu"
-- thì đặt link Drive, tải tệp, gắn link; người tải lên hoặc người có quyền "Sửa" thì gỡ.
-- Hiệu trưởng ở nhóm không là thành viên không thấy tài liệu (như trước).
-- Chạy được nhiều lần.

-- 1. Link Drive chung ------------------------------------------------------------------
alter table public.groups
  add column if not exists drive_url text
  check (drive_url is null or (drive_url ~* '^https://[^[:space:]]+$' and char_length(drive_url) <= 1000));

-- Sửa thông tin nhóm cần quyền quản lý thành viên; link Drive chỉ cần quyền tải/gắn tài liệu,
-- nên đặt qua hàm riêng thay vì mở quyền sửa cả dòng groups.
create or replace function public.set_group_drive(p_group uuid, p_url text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  if not private.has_group_perm(p_group, 'upload') then
    raise exception 'Bạn không có quyền gắn tài liệu cho không gian này.' using errcode = '42501';
  end if;
  if v_url is not null and (v_url !~* '^https://[^[:space:]]+$' or char_length(v_url) > 1000) then
    raise exception 'Link Drive phải bắt đầu bằng https:// và không quá 1000 ký tự.' using errcode = '22023';
  end if;
  update public.groups set drive_url = v_url where id = p_group;
end;
$$;
revoke execute on function public.set_group_drive(uuid, text) from public, anon;
grant execute on function public.set_group_drive(uuid, text) to authenticated;

-- 2. Tệp và link tài liệu --------------------------------------------------------------
create table if not exists public.group_files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  url text check (url is null or (url ~* '^https://[^[:space:]]+$' and char_length(url) <= 1000)),
  file_path text unique check (file_path is null or (file_path like group_id::text || '/%' and char_length(file_path) <= 400)),
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_size bigint check (file_size is null or file_size between 0 and 52428800),
  label text check (label is null or char_length(label) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid(),
  constraint group_files_has_content check (url is not null or file_path is not null)
);
create index if not exists group_files_group_idx on public.group_files (group_id, created_at desc);
alter table public.group_files enable row level security;
revoke all on public.group_files from anon;
grant select, delete on public.group_files to authenticated;
grant insert (group_id, url, file_path, file_name, file_size, label) on public.group_files to authenticated;

drop policy if exists group_files_read on public.group_files;
drop policy if exists group_files_insert on public.group_files;
drop policy if exists group_files_delete on public.group_files;
create policy group_files_read on public.group_files for select to authenticated
  using (group_id = any ((select private.group_ids_with_perm('view'))::uuid[]));
create policy group_files_insert on public.group_files for insert to authenticated
  with check (created_by = (select auth.uid()) and private.has_group_perm(group_id, 'upload'));
create policy group_files_delete on public.group_files for delete to authenticated
  using (
    (created_by = (select auth.uid()) and private.has_group_perm(group_id, 'view'))
    or private.has_group_perm(group_id, 'edit')
  );

drop trigger if exists group_files_log on public.group_files;
create trigger group_files_log after insert or delete on public.group_files
  for each row execute function private.log_change();

-- 3. Chỗ lưu tệp ----------------------------------------------------------------------
-- private.storage_first_uuid có từ SQL 20261112600002; tạo lại cho chắc.
create or replace function private.storage_first_uuid(object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.storage_first_uuid(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('group-files', 'group-files', false, 52428800, array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'text/plain', 'text/csv',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/zip', 'application/x-zip-compressed',
      'application/vnd.rar', 'application/x-rar-compressed'
    ])
    on conflict (id) do nothing;

    drop policy if exists group_files_read on storage.objects;
    drop policy if exists group_files_insert on storage.objects;
    drop policy if exists group_files_delete on storage.objects;
    execute $p$create policy group_files_read on storage.objects for select to authenticated
      using (bucket_id = 'group-files' and private.has_group_perm(private.storage_first_uuid(name), 'view'))$p$;
    execute $p$create policy group_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'group-files' and private.has_group_perm(private.storage_first_uuid(name), 'upload'))$p$;
    execute $p$create policy group_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'group-files' and (
        private.has_group_perm(private.storage_first_uuid(name), 'edit')
        -- Tệp không còn dòng group_files (vừa gỡ, hoặc gắn hỏng): người tải được thì dọn được.
        or (private.has_group_perm(private.storage_first_uuid(name), 'upload')
            and not exists (select 1 from public.group_files f where f.file_path = name))
      ))$p$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
