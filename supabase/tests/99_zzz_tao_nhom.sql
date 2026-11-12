-- Tạo nhóm từ web: thêm nhóm có mã tự tạo, không đọc lại dòng vừa thêm (xem nhom/actions.ts).
-- Chạy sau 99_zz_tang_toc_rls.sql để kiểm với quyền xem tính một lần.
\set ON_ERROR_STOP 1

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.groups (id, name, kind) values ('20000000-0000-0000-0000-0000000000c1', 'Nhóm tạo từ web', 'project');
select t.ok(t.count($$select * from public.groups where id = '20000000-0000-0000-0000-0000000000c1'$$) = 1, 'quản trị tạo nhóm rồi xem được ngay');
reset role;
select 'OK: tạo nhóm' as ket_qua;
