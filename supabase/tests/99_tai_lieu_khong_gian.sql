-- Mục Tài liệu của không gian: link Drive chung và tệp/link tài liệu.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set tai '''00000000-0000-0000-0000-0000000d0c01'''
\set xem '''00000000-0000-0000-0000-0000000d0c02'''
\set ngoai '''00000000-0000-0000-0000-0000000d0c03'''
\set sua '''00000000-0000-0000-0000-0000000d0c04'''

insert into auth.users (id, email) values (:tai, 'tl.tai@vnu.edu.vn'), (:xem, 'tl.xem@vnu.edu.vn'), (:ngoai, 'tl.ngoai@vnu.edu.vn'), (:sua, 'tl.sua@vnu.edu.vn');

set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.groups (name, kind) values ('Tổ thử tài liệu', 'other');
select set_config('t.g', (select id from public.groups where name = 'Tổ thử tài liệu')::text, false);
insert into public.group_members (group_id, user_id, can_view, can_upload) values (current_setting('t.g')::uuid, :tai, true, true);
insert into public.group_members (group_id, user_id, can_view, can_upload) values (current_setting('t.g')::uuid, :xem, true, false);
insert into public.group_members (group_id, user_id, can_view, can_edit) values (current_setting('t.g')::uuid, :sua, true, true);

-- Người có quyền tải/gắn tài liệu đặt link Drive chung và thêm tài liệu.
select set_config('request.jwt.claim.sub', :tai, false);
select public.set_group_drive(current_setting('t.g')::uuid, 'https://drive.google.com/drive/folders/abc');
select t.ok((select drive_url from public.groups where id = current_setting('t.g')::uuid) = 'https://drive.google.com/drive/folders/abc', 'đặt link Drive chung');
select t.denied(format('select public.set_group_drive(%L, %L)', current_setting('t.g'), 'http://khong-an-toan'), 'link phải là https');
insert into public.group_files (group_id, file_path, file_name, file_size) values (current_setting('t.g')::uuid, current_setting('t.g') || '/x/bien_ban.pdf', 'Biên bản.pdf', 1000);
insert into public.group_files (group_id, url) values (current_setting('t.g')::uuid, 'https://docs.google.com/document/d/1');
select t.denied(format('insert into public.group_files (group_id, file_path) values (%L, %L)', current_setting('t.g'), '00000000-0000-0000-0000-000000000000/x/a.pdf'), 'đường dẫn tệp phải nằm trong thư mục của không gian');

-- Thành viên chỉ xem: thấy tài liệu, không thêm, không đổi link, không gỡ tài liệu của người khác.
select set_config('request.jwt.claim.sub', :xem, false);
select t.ok(t.count('select * from public.group_files') = 2, 'thành viên xem thấy tài liệu');
select t.denied(format('select public.set_group_drive(%L, %L)', current_setting('t.g'), 'https://drive.google.com/x'), 'không có quyền tải thì không đổi link Drive');
select t.denied(format('insert into public.group_files (group_id, url) values (%L, %L)', current_setting('t.g'), 'https://x.y/z'), 'không có quyền tải thì không thêm tài liệu');
delete from public.group_files;
reset role;
select t.ok(t.count('select * from public.group_files') = 2, 'người chỉ xem không gỡ được tài liệu');
set role authenticated;

-- Người ngoài không thấy gì.
select set_config('request.jwt.claim.sub', :ngoai, false);
select t.ok(t.count('select * from public.group_files') = 0, 'người ngoài không thấy tài liệu');
select t.denied(format('select public.set_group_drive(%L, %L)', current_setting('t.g'), 'https://drive.google.com/x'), 'người ngoài không đặt link Drive');

-- Người có quyền sửa gỡ được tài liệu của người khác.
select set_config('request.jwt.claim.sub', :sua, false);
delete from public.group_files where url is not null;
select t.ok(t.count('select * from public.group_files') = 1, 'quyền sửa gỡ được tài liệu');

-- Người tải lên tự gỡ tài liệu của mình; gỡ link Drive bằng chuỗi rỗng.
select set_config('request.jwt.claim.sub', :tai, false);
delete from public.group_files;
select t.ok(t.count('select * from public.group_files') = 0, 'người tải lên tự gỡ được');
select public.set_group_drive(current_setting('t.g')::uuid, '');
select t.ok((select drive_url from public.groups where id = current_setting('t.g')::uuid) is null, 'gỡ link Drive chung');
reset role;
