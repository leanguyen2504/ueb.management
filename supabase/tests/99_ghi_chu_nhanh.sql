-- Kiểm thử ghi chú nhanh: chỉ chủ ghi chú thấy, sửa, xóa.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;

select set_config('request.jwt.claim.sub', :tv1, false);
insert into public.quick_notes (body) values ('Nhắc gửi tờ trình cho Phòng Hành chính');
select t.ok(t.count('select * from public.quick_notes') = 1, 'chủ thấy ghi chú vừa tạo');
select t.ok((select owner_id from public.quick_notes limit 1) = :tv1, 'chủ là người tạo');
update public.quick_notes set pinned = true, owner_id = :tv2;
select t.ok((select pinned and owner_id = :tv1 from public.quick_notes limit 1), 'ghim được, không đổi được chủ');
select t.denied(format($$insert into public.quick_notes (owner_id, body) values (%L, 'x')$$, :tv2), 'không tạo ghi chú cho người khác');
select t.denied($$insert into public.quick_notes (body) values ('   ')$$, 'không lưu ghi chú trống');

select set_config('request.jwt.claim.sub', :tv2, false);
select t.ok(t.count('select * from public.quick_notes') = 0, 'người khác không thấy');
update public.quick_notes set body = 'sửa trộm';
delete from public.quick_notes;
select set_config('request.jwt.claim.sub', :admin, false);
select t.ok(t.count('select * from public.quick_notes') = 0, 'quản trị không thấy');

select set_config('request.jwt.claim.sub', :tv1, false);
select t.ok((select body from public.quick_notes limit 1) = 'Nhắc gửi tờ trình cho Phòng Hành chính', 'người khác không sửa được');
delete from public.quick_notes;
select t.ok(t.count('select * from public.quick_notes') = 0, 'chủ xóa được');

reset role;
