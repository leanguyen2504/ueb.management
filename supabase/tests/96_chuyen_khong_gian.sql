-- Kiểm thử chuyển không gian (kéo thả). Chạy sau 95_.
\set ON_ERROR_STOP 1

\set admin '''00000000-0000-0000-0000-00000000000a'''
\set tv1 '''00000000-0000-0000-0000-0000000000d1'''
\set tv2 '''00000000-0000-0000-0000-0000000000d2'''

set role authenticated;
select set_config('request.jwt.claim.sub', :admin, false);
insert into public.groups (name, kind) values ('Khoa thử chuyển', 'unit');
select set_config('t.root', (select id from public.groups where name = 'Khoa thử chuyển')::text, false);
select set_config('t.a', public.create_subgroup(current_setting('t.root')::uuid, 'LVCM A', null, null)::text, false);
select set_config('t.b', public.create_subgroup(current_setting('t.root')::uuid, 'Kiến tập', null, null)::text, false);
select set_config('t.c', public.create_subgroup(current_setting('t.b')::uuid, 'Con của kiến tập', null, null)::text, false);

select public.move_group(current_setting('t.b')::uuid, current_setting('t.a')::uuid);
select t.ok((select parent_id = current_setting('t.a')::uuid from public.groups where id = current_setting('t.b')::uuid), 'chuyển vào LVCM');
select t.ok((select parent_id = current_setting('t.b')::uuid from public.groups where id = current_setting('t.c')::uuid), 'con đi theo');
select t.denied(format('select public.move_group(%L, %L)', current_setting('t.a'), current_setting('t.c')), 'không chuyển vào con của nó');
select t.denied(format('select public.move_group(%L, %L)', current_setting('t.a'), current_setting('t.a')), 'không chuyển vào chính nó');
select t.denied(format('select public.move_group(%L, %L)', current_setting('t.root'), current_setting('t.a')), 'không chuyển nhóm gốc');
select public.move_group(current_setting('t.b')::uuid, current_setting('t.root')::uuid);
select t.ok((select parent_id = current_setting('t.root')::uuid from public.groups where id = current_setting('t.b')::uuid), 'đưa lên cấp trên');

-- Người không có quyền quản lý không chuyển được.
select set_config('request.jwt.claim.sub', :tv2, false);
select t.denied(format('select public.move_group(%L, %L)', current_setting('t.b'), current_setting('t.a')), 'không có quyền thì không chuyển');

-- Cá nhân: sắp xếp trong không gian của mình được, chuyển ra ngoài thì không.
select set_config('request.jwt.claim.sub', :tv1, false);
select set_config('t.p1', public.create_personal_project('Dự án X')::text, false);
select set_config('t.p2', public.create_personal_project('Dự án Y')::text, false);
select public.move_group(current_setting('t.p2')::uuid, current_setting('t.p1')::uuid);
select t.ok((select parent_id = current_setting('t.p1')::uuid and owner_id = auth.uid() from public.groups where id = current_setting('t.p2')::uuid), 'sắp xếp trong Cá nhân');
reset role;
insert into public.group_members (group_id, user_id, is_manager) values (current_setting('t.a')::uuid, :tv1, true);
set role authenticated;
select t.denied(format('select public.move_group(%L, %L)', current_setting('t.p2'), current_setting('t.a')), 'không đưa việc cá nhân ra chung');
reset role;
