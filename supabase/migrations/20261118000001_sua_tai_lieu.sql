-- Cho phép đổi tên hiển thị của tài liệu trong mục Tài liệu của không gian (nút Sửa).
-- Chỉ được sửa cột label; ai được gỡ tài liệu thì được sửa tên (người tải lên, hoặc người có quyền Sửa).
-- Chạy sau 20261112800001_tai_lieu_khong_gian.sql. Chạy lại nhiều lần không sao.

-- Bỏ quyền sửa mọi cột (Supabase mặc định cấp cho authenticated), chỉ để lại cột label.
revoke update on public.group_files from authenticated;
grant update (label) on public.group_files to authenticated;

drop policy if exists group_files_update on public.group_files;
create policy group_files_update on public.group_files for update to authenticated
  using (
    (created_by = (select auth.uid()) and private.has_group_perm(group_id, 'view'))
    or private.has_group_perm(group_id, 'edit')
  )
  with check (
    (created_by = (select auth.uid()) and private.has_group_perm(group_id, 'view'))
    or private.has_group_perm(group_id, 'edit')
  );
