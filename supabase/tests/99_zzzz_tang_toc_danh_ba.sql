-- Danh bạ nhóm sau khi tăng tốc phải trùng khớp với cách tính cũ (từng nhóm một) cho mọi người.
\set ON_ERROR_STOP 1

do $$
declare u record; diff int; n int := 0;
begin
  for u in select id from public.profiles union all select null::uuid loop
    perform set_config('request.jwt.claim.sub', coalesce(u.id::text, ''), true);
    select count(*) into diff from (
      (select * from public.group_directory()
       except all
       select g.id, g.name, g.description, g.kind::text, g.parent_id, p.name,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         case when private.principal_outside(g.id) then null
           else (select count(*)::int from public.tasks t where t.group_id = g.id and t.status <> 'done') end,
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         private.has_group_perm(g.id, 'view'),
         (select case when m.is_manager then 'Trưởng nhóm' when m.is_clerk then 'Văn thư' else 'Thành viên' end
            from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
         g.updated_at
       from public.groups g left join public.groups p on p.id = g.parent_id
       where private.is_active_user() and g.archived_at is null and g.owner_id is null)
    ) x;
    -- Cùng số dòng: cộng với phép trừ ở trên nghĩa là hai cách tính cho ra đúng cùng một tập.
    if (select count(*) from public.group_directory()) <> (select count(*) from public.groups g
        where private.is_active_user() and g.archived_at is null and g.owner_id is null) then
      raise exception 'SAI: danh bạ của người % thiếu hoặc thừa dòng', u.id;
    end if;
    if diff > 0 then raise exception 'SAI: danh bạ của người % lệch % dòng', u.id, diff; end if;
    n := n + (select count(*) from public.group_directory());
  end loop;
  if n = 0 then raise exception 'SAI: danh bạ trống, không có gì để so khớp'; end if;
  raise notice 'đã so khớp % dòng danh bạ', n;
end $$;
