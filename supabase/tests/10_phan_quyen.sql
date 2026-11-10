-- Kiểm thử RLS giai đoạn 1. Mỗi khẳng định sai sẽ dừng script với thông báo.
\set ON_ERROR_STOP 1

create schema t;
grant usage on schema t to authenticated, anon;

create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'SAI: %', msg; end if;
end $$;

-- Chạy câu lệnh và mong đợi bị từ chối (lỗi hoặc không dòng nào bị ảnh hưởng).
create function t.denied(stmt text, msg text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    return;
  end;
  if n > 0 then raise exception 'SAI (đáng lẽ bị chặn): %', msg; end if;
end $$;

create function t.count(q text) returns int language plpgsql as $$
declare n int;
begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;

grant execute on all functions in schema t to authenticated, anon;

-- Mã người dùng cố định
\set admin '''00000000-0000-0000-0000-00000000000a'''
\set hieutruong '''00000000-0000-0000-0000-0000000000b1'''
\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set thuky2 '''00000000-0000-0000-0000-0000000000c2'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

-- 1. Khởi tạo quản trị: chỉ có lời mời make_admin (máy chủ tạo bằng khóa service).
insert into public.invitations (email, make_admin) values ('ntkling@vnu.edu.vn', true);
insert into auth.users (id, email) values (:admin, 'NTKLing@vnu.edu.vn');
select t.ok((select current_admin_id from public.system_settings) = :admin, 'người được mời make_admin trở thành quản trị');
select t.ok((select email from public.profiles where id = :admin) = 'ntkling@vnu.edu.vn', 'email được chuẩn hóa chữ thường');

-- 2. Đăng ký không được mời hoặc sai tên miền bị chặn.
select t.denied($$insert into auth.users (email) values ('nguoila@vnu.edu.vn')$$, 'email chưa được mời');
select t.denied($$insert into auth.users (email) values ('ai@gmail.com')$$, 'email ngoài tên miền');

-- 3. Quản trị mời người dùng (chạy như người dùng đã đăng nhập, RLS áp dụng).
set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.invitations (email, system_role) values
  ('hieutruong@vnu.edu.vn', 'principal'),
  ('thuky@vnu.edu.vn', 'secretary'),
  ('thuky2@vnu.edu.vn', 'secretary'),
  ('tv1@vnu.edu.vn', 'member'),
  ('tv2@vnu.edu.vn', 'member');
select t.denied($$insert into public.invitations (email, make_admin) values ('x@vnu.edu.vn', true)$$, 'không ai tạo được lời mời make_admin qua API');
reset role;

insert into auth.users (id, email) values
  (:hieutruong, 'hieutruong@vnu.edu.vn'),
  (:thuky, 'thuky@vnu.edu.vn'),
  (:thuky2, 'thuky2@vnu.edu.vn'),
  (:tv1, 'tv1@vnu.edu.vn'),
  (:tv2, 'tv2@vnu.edu.vn');
select t.ok((select system_role from public.profiles where id = :hieutruong) = 'principal', 'vai trò lấy từ lời mời');

-- 4. Quản trị cấp phạm vi "tất cả nhóm" cho thư ký 2.
set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
select public.admin_set_secretary_scope(:thuky2, true);

-- 5. Thư ký 1 tạo nhóm, thành người quản lý, thêm thành viên 1 chỉ có quyền xem.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.groups (id, name, kind) values ('10000000-0000-0000-0000-000000000001', 'Phòng Hành chính', 'unit');
select t.ok((select is_manager from public.group_members where group_id = '10000000-0000-0000-0000-000000000001' and user_id = :thuky), 'người tạo nhóm là người quản lý');
insert into public.group_members (group_id, user_id) values ('10000000-0000-0000-0000-000000000001', :tv1);
select t.ok((select created_by from public.groups where id = '10000000-0000-0000-0000-000000000001') = :thuky, 'created_by do trigger điền');

-- Thư ký không tự đổi được vai trò hay quyền quản trị.
select t.denied(format($$update public.profiles set system_role = 'principal' where id = %L$$, :thuky), 'tự nâng vai trò');
select t.denied($$update public.system_settings set current_admin_id = auth.uid()$$, 'tự nhận quyền quản trị');
select t.denied(format($$select public.admin_set_user(%L, 'principal', true)$$, :thuky), 'thư ký gọi hàm quản trị');

-- 6. Thành viên 1: xem được nhóm, không thêm được thành viên, không tạo được nhóm.
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.groups') = 1, 'thành viên thấy nhóm mình tham gia');
select t.denied(format($$insert into public.group_members (group_id, user_id) values ('10000000-0000-0000-0000-000000000001', %L)$$, :tv2), 'thành viên thêm người');
select t.denied($$insert into public.groups (name) values ('Nhóm lạ')$$, 'thành viên tạo nhóm');
select t.denied($$update public.groups set name = 'Đổi tên' where true$$, 'thành viên đổi tên nhóm');
select t.denied(format($$update public.group_members set can_manage_members = true where user_id = %L$$, :tv1), 'thành viên tự cấp quyền');
-- Tự sửa tên của mình thì được.
update public.profiles set full_name = 'Thành viên Một' where id = auth.uid();
select t.ok((select full_name from public.profiles where id = :tv1) = 'Thành viên Một', 'tự sửa tên');

-- 7. Thành viên 2 (chưa vào nhóm nào): không thấy nhóm, không thấy nhật ký nhóm.
select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.groups') = 0, 'người ngoài nhóm không thấy nhóm');
select t.ok(t.count('select * from public.activity_log') = 0, 'người ngoài nhóm không thấy nhật ký');
select t.ok(t.count('select * from public.invitations') = 0, 'thành viên không thấy lời mời');

-- 8. Hiệu trưởng thấy mọi nhóm và nhật ký, sửa được nhóm? Không quản lý thành viên.
select set_config('request.jwt.claim.sub', :hieutruong, false);
select t.ok(t.count('select * from public.groups') = 1, 'Hiệu trưởng thấy mọi nhóm');
select t.ok(t.count('select * from public.activity_log') > 0, 'Hiệu trưởng xem nhật ký');
select t.denied(format($$insert into public.group_members (group_id, user_id) values ('10000000-0000-0000-0000-000000000001', %L)$$, :tv2), 'Hiệu trưởng không quản lý thành viên');

-- 9. Thư ký có phạm vi tất cả nhóm quản lý được nhóm do người khác tạo.
select set_config('request.jwt.claim.sub', :thuky2, false);
insert into public.group_members (group_id, user_id) values ('10000000-0000-0000-0000-000000000001', :tv2);
select t.ok(t.count('select * from public.group_members') = 3, 'thư ký phạm vi toàn trường thấy thành viên');

-- 10. Người quản lý nhóm mời thành viên mới vào nhóm, nhưng không mời được thư ký.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.invitations (email, group_id) values ('moi@vnu.edu.vn', '10000000-0000-0000-0000-000000000001');
select t.denied($$insert into public.invitations (email, system_role, group_id) values ('moi2@vnu.edu.vn', 'secretary', '10000000-0000-0000-0000-000000000001')$$, 'người quản lý nhóm mời thư ký');
reset role;
insert into auth.users (email) values ('moi@vnu.edu.vn');
select t.ok((select count(*) from public.group_members m join public.profiles p on p.id = m.user_id where p.email = 'moi@vnu.edu.vn') = 1, 'lời mời nhóm thêm thành viên khi đăng ký');

-- 11. Quản trị khóa thành viên 1: tài khoản bị khóa không thấy gì nữa.
set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
select public.admin_set_user(:tv1, 'member', false);
select t.denied(format($$select public.admin_set_user(%L, 'member', false)$$, :admin), 'quản trị tự khóa mình');
select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok(t.count('select * from public.groups') = 0, 'tài khoản bị khóa không thấy nhóm');
select set_config('request.jwt.claim.sub', :tv1, false);
select t.denied($$update public.profiles set full_name = 'x' where id = auth.uid()$$, 'tài khoản bị khóa sửa hồ sơ');

-- 12. Nhật ký không sửa, không xóa được, kể cả quản trị.
select set_config('request.jwt.claim.sub', :admin, false);
select t.denied($$delete from public.activity_log where true$$, 'xóa nhật ký');
select t.denied($$update public.activity_log set action = 'x' where true$$, 'sửa nhật ký');
select t.ok(t.count($$select * from public.activity_log where entity_type = 'profiles' and action = 'update' and actor_id = '00000000-0000-0000-0000-00000000000a'$$) >= 1, 'đổi vai trò được ghi nhật ký với người thực hiện');

-- 13. Khách chưa đăng nhập không đọc được bảng nào.
reset role;
set role anon;
select t.denied($$select * from public.profiles$$, 'khách đọc profiles');
reset role;

-- 14. Người dùng thường mời đồng nghiệp cùng tên miền, kèm nhóm đề xuất mình xem được.
set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.invitations (email, group_id) values ('dongnghiep@vnu.edu.vn', '10000000-0000-0000-0000-000000000001');
select t.ok(t.count($$select * from public.invitations where email = 'dongnghiep@vnu.edu.vn'$$) = 1, 'người mời thấy lời mời mình gửi');
select t.denied($$insert into public.invitations (email) values ('ai@gmail.com')$$, 'mời email ngoài tên miền');
select t.denied($$insert into public.invitations (email, system_role) values ('x2@vnu.edu.vn', 'secretary')$$, 'thành viên mời thư ký');
select t.denied($$insert into public.invitations (email, group_id, is_manager) values ('x3@vnu.edu.vn', '10000000-0000-0000-0000-000000000001', true)$$, 'thành viên mời người quản lý nhóm');
-- Nhóm mình không xem được thì không đề xuất được.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into public.groups (id, name) values ('10000000-0000-0000-0000-000000000002', 'Nhóm kín');
set role authenticated;
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied($$insert into public.invitations (email, group_id) values ('x4@vnu.edu.vn', '10000000-0000-0000-0000-000000000002')$$, 'đề xuất nhóm mình không xem được');
-- Tài khoản bị khóa không mời được.
select set_config('request.jwt.claim.sub', :tv1, false);
select t.denied($$insert into public.invitations (email) values ('x5@vnu.edu.vn')$$, 'tài khoản bị khóa mời người');
reset role;
insert into auth.users (email) values ('dongnghiep@vnu.edu.vn');
select t.ok((select system_role from public.profiles where email = 'dongnghiep@vnu.edu.vn') = 'member', 'người được đồng nghiệp mời là thành viên');
select t.ok((select m.can_view and not m.is_manager from public.group_members m join public.profiles p on p.id = m.user_id where p.email = 'dongnghiep@vnu.edu.vn'), 'người được mời vào nhóm đề xuất với quyền mặc định');

select 'OK: kiểm thử phân quyền giai đoạn 1' as ket_qua;
