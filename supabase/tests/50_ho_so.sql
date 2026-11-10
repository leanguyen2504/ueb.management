-- Hồ sơ cá nhân: ai cũng xem được hồ sơ đồng nghiệp; chỉ tự sửa hồ sơ mình, không tự đổi vai trò.
\set ON_ERROR_STOP 1
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
update public.profiles set phone = '0912 345 678', office = 'P.301', bio = 'Phụ trách truyền thông' where id = auth.uid();
select t.ok((select phone from public.profiles where id = :tv2) = '0912 345 678', 'tự sửa số điện thoại');
select t.ok((select count(*) from public.profiles where id = :thuky) = 1, 'xem được hồ sơ đồng nghiệp');
select t.denied(format($$update public.profiles set bio = 'x' where id = %L$$, :thuky), 'sửa hồ sơ người khác');
select t.denied($$update public.profiles set system_role = 'principal' where id = auth.uid()$$, 'tự đổi vai trò');
reset role;
select 'OK: kiểm thử hồ sơ cá nhân' as ket_qua;
