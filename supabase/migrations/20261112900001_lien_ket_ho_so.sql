-- Hồ sơ cá nhân: liên kết đến trang cá nhân (Facebook, LinkedIn, Google Scholar, website…)
-- và file hồ sơ (CV, lý lịch khoa học…). File hồ sơ có thể là tệp tải lên (bucket riêng tư
-- "profile-files", đường dẫn <mã người>/<mã ngẫu nhiên>/<tên file>) hoặc link Google Drive.
-- Giống ảnh cá nhân: chỉ đồng nghiệp đã đăng nhập (tài khoản đang hoạt động) xem được;
-- mỗi người chỉ thêm/sửa/gỡ mục của chính mình. Không có link công khai: tệp mở qua
-- /nguoi/tep (máy chủ kiểm tra quyền rồi tạo link ký tạm thời 5 phút).
-- Chạy lại nhiều lần không lỗi.

create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 'link' = trang cá nhân; 'doc' = file hồ sơ (CV…)
  kind text not null check (kind in ('link', 'doc')),
  label text check (label is null or char_length(label) <= 120),
  url text check (url is null or (url ~* '^https://[^[:space:]]+$' and char_length(url) <= 1000)),
  file_path text unique check (file_path is null or (file_path like user_id::text || '/%' and char_length(file_path) <= 400 and file_path not like '%..%')),
  file_name text check (file_name is null or char_length(file_name) <= 255),
  file_size bigint check (file_size is null or file_size between 0 and 10485760),
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- Mỗi mục có đúng một trong hai: link hoặc tệp tải lên; trang cá nhân luôn là link.
  constraint profile_links_one_target check ((url is null) <> (file_path is null)),
  constraint profile_links_link_has_url check (kind = 'doc' or url is not null)
);
create index if not exists profile_links_user_idx on public.profile_links (user_id, kind, position);

alter table public.profile_links enable row level security;
revoke all on public.profile_links from anon;
revoke insert, update on public.profile_links from authenticated;
grant select, delete on public.profile_links to authenticated;
grant insert (user_id, kind, label, url, file_path, file_name, file_size, position) on public.profile_links to authenticated;
grant update (label, position) on public.profile_links to authenticated;

drop policy if exists profile_links_read on public.profile_links;
create policy profile_links_read on public.profile_links for select to authenticated
  using ((select private.is_active_user()) or user_id = (select auth.uid()));
drop policy if exists profile_links_insert on public.profile_links;
create policy profile_links_insert on public.profile_links for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
drop policy if exists profile_links_update on public.profile_links;
create policy profile_links_update on public.profile_links for update to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()));
drop policy if exists profile_links_delete on public.profile_links;
create policy profile_links_delete on public.profile_links for delete to authenticated
  using (user_id = (select auth.uid()));

-- Giới hạn 30 mục mỗi người, tránh lạm dụng.
create or replace function private.profile_links_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.profile_links where user_id = new.user_id) >= 30 then
    raise exception 'Mỗi người tối đa 30 liên kết và file hồ sơ.';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_links_limit on public.profile_links;
create trigger profile_links_limit before insert on public.profile_links
  for each row execute function private.profile_links_limit();

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('profile-files', 'profile-files', false, 10485760, array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'text/plain',
      'image/jpeg', 'image/png', 'image/webp'
    ])
    on conflict (id) do nothing;

    execute 'drop policy if exists profile_files_read on storage.objects';
    execute $p$create policy profile_files_read on storage.objects for select to authenticated
      using (bucket_id = 'profile-files' and (select private.is_active_user()))$p$;
    execute 'drop policy if exists profile_files_insert on storage.objects';
    execute $p$create policy profile_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'profile-files' and (select private.is_active_user()) and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute 'drop policy if exists profile_files_delete on storage.objects';
    execute $p$create policy profile_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'profile-files' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end;
$$;
