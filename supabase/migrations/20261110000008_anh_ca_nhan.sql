-- Ảnh cá nhân: lưu trong Supabase Storage, bucket riêng tư "avatars".
-- Mỗi người chỉ ghi vào thư mục mang mã của mình; người dùng đang hoạt động xem được
-- (qua link ký tạm thời do máy chủ tạo). Không có link công khai.
alter table public.profiles
  add column avatar_path text check (avatar_path is null or (avatar_path like id::text || '/%' and length(avatar_path) <= 200));
grant update (avatar_path) on public.profiles to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy avatars_read on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and private.is_active_user())$p$;
    execute $p$create policy avatars_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and private.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_update on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy avatars_delete on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end;
$$;
