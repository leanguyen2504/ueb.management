-- Đơn vị/nhóm cùng làm: gắn được mọi nhóm, dự án, không gian đang hoạt động.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''

set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.groups (name, kind) values ('Dự án gắn tổ', 'project'), ('Tổ công tác trọng điểm', 'other'), ('Nhóm đã lưu', 'project'), ('Đơn vị thử gắn', 'unit');
select set_config('t.p', (select id from public.groups where name = 'Dự án gắn tổ')::text, false);
select set_config('t.to', (select id from public.groups where name = 'Tổ công tác trọng điểm')::text, false);
select set_config('t.cu', (select id from public.groups where name = 'Nhóm đã lưu')::text, false);
select set_config('t.dv', (select id from public.groups where name = 'Đơn vị thử gắn')::text, false);
update public.groups set archived_at = now() where id = current_setting('t.cu')::uuid;

insert into public.group_units (group_id, unit_id) values (current_setting('t.p')::uuid, current_setting('t.to')::uuid);
select t.ok(t.count(format('select * from public.group_units where group_id = %L and unit_id = %L', current_setting('t.p'), current_setting('t.to'))) = 1, 'gắn được nhóm không phải đơn vị');
select t.denied(format('insert into public.group_units (group_id, unit_id) values (%L, %L)', current_setting('t.p'), current_setting('t.cu')), 'không gắn nhóm đã lưu trữ');
select t.denied(format('insert into public.group_units (group_id, unit_id) values (%L, %L)', current_setting('t.dv'), current_setting('t.to')), 'đơn vị không gắn nhóm cùng làm');
reset role;
select 'OK: cùng làm mọi nhóm' as ket_qua;
