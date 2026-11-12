-- Sản phẩm của đầu việc: ngoài link Google Drive, nay kéo thả được tệp từ máy
-- hoặc gõ thẳng nội dung (link ngoài Google Drive thì lưu như nội dung). Tệp lưu ở bucket riêng tư "task-files", đường dẫn
-- <task_id>/<mã ngẫu nhiên>/<tên file>; người xem mở qua /viec/tep (máy chủ kiểm tra
-- quyền rồi tạo link ký tạm thời). Quyền như link sản phẩm: ai xem được việc thì xem được tệp,
-- người được giao hoặc người có quyền tải/gắn tài liệu trong nhóm thì tải lên được.

alter table public.task_links alter column url drop not null;
alter table public.task_links drop constraint if exists task_links_url_check;
alter table public.task_links add constraint task_links_url_check
  check (url is null or (url ~ '^https://(drive|docs)\.google\.com/' and char_length(url) <= 1000));
alter table public.task_links
  add column if not exists body text check (body is null or char_length(body) between 1 and 5000),
  add column if not exists file_path text unique check (file_path is null or (file_path like task_id::text || '/%' and char_length(file_path) <= 400)),
  add column if not exists file_name text check (file_name is null or char_length(file_name) <= 255),
  add column if not exists file_size bigint check (file_size is null or file_size between 0 and 52428800);
alter table public.task_links drop constraint if exists task_links_has_content;
alter table public.task_links add constraint task_links_has_content
  check (url is not null or body is not null or file_path is not null);
grant insert (body, file_path, file_name, file_size) on public.task_links to authenticated;

-- Phần đầu của đường dẫn file là mã việc (uuid).
create or replace function private.storage_first_uuid(object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.storage_first_uuid(text) to authenticated;

-- Gắn được sản phẩm cho việc: người được giao, hoặc có quyền tải/gắn tài liệu trong nhóm.
create or replace function private.can_attach_task(p_task uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.tasks t where t.id = p_task
      and (t.assignee_id = auth.uid() or private.has_group_perm(t.group_id, 'upload'))
  );
$$;
grant execute on function private.can_attach_task(uuid) to authenticated;

create or replace function private.can_remove_task_file(p_task uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.can_attach_task(p_task) or exists (
    select 1 from public.tasks t where t.id = p_task and private.has_group_perm(t.group_id, 'edit')
  );
$$;
grant execute on function private.can_remove_task_file(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('task-files', 'task-files', false, 26214400, array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'text/plain', 'text/csv',
      'image/jpeg', 'image/png', 'image/webp',
      'application/zip', 'application/x-zip-compressed'
    ])
    on conflict (id) do nothing;

    drop policy if exists task_files_read on storage.objects;
    drop policy if exists task_files_insert on storage.objects;
    drop policy if exists task_files_delete on storage.objects;
    -- Xem: thấy được việc (RLS của bảng tasks).
    execute $p$create policy task_files_read on storage.objects for select to authenticated
      using (bucket_id = 'task-files' and exists (select 1 from public.tasks t where t.id = private.storage_first_uuid(name)))$p$;
    execute $p$create policy task_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'task-files' and private.can_attach_task(private.storage_first_uuid(name)))$p$;
    execute $p$create policy task_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'task-files' and private.can_remove_task_file(private.storage_first_uuid(name)))$p$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
