-- Tệp đính kèm cho hồ sơ cuộc họp: kéo thả file vào ô "Tài liệu trước họp" hoặc
-- "Biên bản sau họp". File lưu trong Supabase Storage, bucket riêng tư "meeting-files",
-- đường dẫn <source_id>/<năm-tháng>/<mã ngẫu nhiên>/<tên file>. Không có link công khai:
-- người xem mở qua /hop/tep (máy chủ kiểm tra quyền rồi tạo link ký tạm thời).
-- Quyền theo lịch: ai xem được lịch thì xem được file, ai gắn được tài liệu thì tải lên/gỡ được.

alter table public.meeting_items
  add column file_path text unique check (file_path is null or (file_path like source_id::text || '/%' and char_length(file_path) <= 400)),
  add column file_name text check (file_name is null or char_length(file_name) <= 255),
  add column file_size bigint check (file_size is null or file_size between 0 and 52428800);
grant insert (file_path, file_name, file_size) on public.meeting_items to authenticated;
grant update (file_path, file_name, file_size) on public.meeting_items to authenticated;

-- url của tài liệu tải lên là đường dẫn trong ứng dụng: /hop/tep?p=<file_path>.
alter table public.meeting_items drop constraint if exists meeting_items_url_check;
alter table public.meeting_items add constraint meeting_items_url_check check (
  url is null or ((url ~* '^https://[^[:space:]]+$' or url ~ '^/hop/tep\?p=[^[:space:]]+$') and char_length(url) <= 1000)
);

-- Phần đầu của đường dẫn file là mã lịch (uuid); không đúng dạng thì không cấp quyền.
create function private.storage_source_id(object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid end;
$$;
grant execute on function private.storage_source_id(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('meeting-files', 'meeting-files', false, 26214400, array[
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

    execute $p$create policy meeting_files_read on storage.objects for select to authenticated
      using (bucket_id = 'meeting-files' and private.can_see_calendar_source(private.storage_source_id(name)))$p$;
    execute $p$create policy meeting_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'meeting-files' and private.can_file_meeting(private.storage_source_id(name)))$p$;
    execute $p$create policy meeting_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'meeting-files' and private.can_file_meeting(private.storage_source_id(name)))$p$;
  end if;
end;
$$;
