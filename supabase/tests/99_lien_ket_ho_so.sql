-- Liên kết trang cá nhân và file hồ sơ: đồng nghiệp xem được, chỉ tự thêm/gỡ mục của mình.
\set ON_ERROR_STOP 1
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.profile_links (kind, url, label) values ('link', 'https://www.linkedin.com/in/tv2', null);
insert into public.profile_links (kind, file_path, file_name, file_size) values ('doc', :tv2 || '/abc/CV.pdf', 'CV.pdf', 12345);
insert into public.profile_links (kind, url, label) values ('doc', 'https://drive.google.com/file/d/xyz', 'CV tiếng Anh');
select t.ok((select count(*) from public.profile_links where user_id = :tv2) = 3, 'tự thêm liên kết và file hồ sơ');
select t.denied(format($$insert into public.profile_links (user_id, kind, url) values (%L, 'link', 'https://x.com/a')$$, :thuky), 'thêm liên kết cho người khác');
select t.denied($$insert into public.profile_links (kind, url) values ('link', 'javascript:alert(1)')$$, 'link không phải https');
select t.denied($$insert into public.profile_links (kind, file_path, file_name) values ('doc', 'nguoi-khac/x/CV.pdf', 'CV.pdf')$$, 'tệp ngoài thư mục của mình');
select t.denied($$insert into public.profile_links (kind, file_path, file_name) values ('link', '00000000-0000-0000-0000-0000000000d2/y/a.pdf', 'a.pdf')$$, 'trang cá nhân phải là link');
select t.denied($$insert into public.profile_links (kind) values ('doc')$$, 'mục không có link lẫn tệp');
select t.denied($$update public.profile_links set url = 'https://evil.example' where user_id = auth.uid()$$, 'đổi link sau khi thêm (chỉ đổi tên, thứ tự)');

select set_config('request.jwt.claim.sub', :thuky, false);
select t.ok((select count(*) from public.profile_links where user_id = :tv2) = 3, 'đồng nghiệp xem được liên kết');
select t.denied(format($$delete from public.profile_links where user_id = %L$$, :tv2), 'gỡ liên kết của người khác');
select t.denied(format($$update public.profile_links set label = 'x' where user_id = %L$$, :tv2), 'sửa liên kết của người khác');

set role anon;
select t.denied($$select 1 from public.profile_links$$, 'khách chưa đăng nhập xem liên kết');

set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.profile_links (kind, url) select 'link', 'https://example.com/' || g from generate_series(1, 27) g;
select t.denied($$insert into public.profile_links (kind, url) values ('link', 'https://example.com/31')$$, 'quá 30 mục');
delete from public.profile_links where user_id = auth.uid();
select t.ok((select count(*) from public.profile_links where user_id = :tv2) = 0, 'tự gỡ mục của mình');
reset role;
select 'OK: kiểm thử liên kết và file hồ sơ' as ket_qua;
