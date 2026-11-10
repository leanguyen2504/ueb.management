-- Kiểm thử Trưởng nhóm và Văn thư. Chạy sau 10_ và 20_ (dùng lại dữ liệu).
\set ON_ERROR_STOP 1

\set thuky '''00000000-0000-0000-0000-0000000000c1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''
\set ngoai '''00000000-0000-0000-0000-0000000000e1'''
\set g1 '''10000000-0000-0000-0000-000000000001'''

set role authenticated;

-- 1. Thành viên thường không tự có quyền quản lý thành viên, kể cả khi tích tay.
select set_config('request.jwt.claim.sub', :thuky, false);
update public.group_members set can_manage_members = true where group_id = :g1 and user_id = :tv2;
select t.ok(not (select can_manage_members from public.group_members where group_id = :g1 and user_id = :tv2), 'quyền quản lý thành viên chỉ đi theo vai trò');

-- 2. Trưởng nhóm bổ nhiệm tv2 làm Văn thư.
update public.group_members set is_clerk = true where group_id = :g1 and user_id = :tv2;
select t.ok((select can_manage_members and can_view from public.group_members where group_id = :g1 and user_id = :tv2), 'Văn thư có quyền quản lý thành viên');

-- 3. Văn thư thêm, gỡ thành viên thường và mời người vào nhóm.
select set_config('request.jwt.claim.sub', :tv2, false);
insert into public.group_members (group_id, user_id) values (:g1, :ngoai);
select t.ok(t.count(format($$select * from public.group_members where group_id = %L and user_id = %L$$, :g1, :ngoai)) = 1, 'Văn thư thêm thành viên');
delete from public.group_members where group_id = :g1 and user_id = :ngoai;
select t.ok(t.count(format($$select * from public.group_members where group_id = %L and user_id = %L$$, :g1, :ngoai)) = 0, 'Văn thư gỡ thành viên');
insert into public.invitations (email, group_id) values ('vanthumoi@vnu.edu.vn', :g1);

-- 4. Văn thư không đụng được tới Trưởng nhóm và không bổ nhiệm vai trò.
select t.denied(format($$delete from public.group_members where group_id = %L and user_id = %L$$, :g1, :thuky), 'Văn thư gỡ Trưởng nhóm');
select t.denied(format($$update public.group_members set can_edit = false where group_id = %L and user_id = %L$$, :g1, :thuky), 'Văn thư sửa quyền Trưởng nhóm');
select t.denied(format($$insert into public.group_members (group_id, user_id, is_clerk) values (%L, %L, true)$$, :g1, :ngoai), 'Văn thư bổ nhiệm Văn thư mới');
select t.denied(format($$insert into public.group_members (group_id, user_id, is_manager) values (%L, %L, true)$$, :g1, :ngoai), 'Văn thư bổ nhiệm Trưởng nhóm');
select t.denied(format($$insert into public.invitations (email, group_id, is_clerk) values ('x6@vnu.edu.vn', %L, true)$$, :g1), 'Văn thư mời người làm Văn thư');
select t.denied(format($$update public.group_members set is_clerk = false where group_id = %L and user_id = %L$$, :g1, :tv2), 'Văn thư tự đổi vai trò của mình');

-- 5. Thành viên thường không thêm, không gỡ được ai.
reset role;
insert into public.group_members (group_id, user_id) values (:g1, :ngoai);
set role authenticated;
select set_config('request.jwt.claim.sub', :ngoai, false);
select t.denied(format($$delete from public.group_members where group_id = %L and user_id = %L$$, :g1, :tv2), 'thành viên thường gỡ người khác');

-- 6. Trưởng nhóm mời người làm Văn thư; người đó vào nhóm với vai trò Văn thư.
select set_config('request.jwt.claim.sub', :thuky, false);
insert into public.invitations (email, group_id, is_clerk) values ('vanthu2@vnu.edu.vn', :g1, true);
reset role;
insert into auth.users (email) values ('vanthu2@vnu.edu.vn');
select t.ok((select m.is_clerk and m.can_manage_members from public.group_members m join public.profiles p on p.id = m.user_id where p.email = 'vanthu2@vnu.edu.vn'), 'người được mời làm Văn thư vào nhóm với vai trò Văn thư');

select 'OK: kiểm thử Trưởng nhóm và Văn thư' as ket_qua;
