-- Kiểm thử tăng tốc RLS: danh sách nhóm/lịch tính một lần phải trùng khớp với hàm kiểm tra
-- từng dòng cũ, cho mọi người dùng, mọi nhóm và mọi loại quyền trong dữ liệu kiểm thử.
\set ON_ERROR_STOP 1

do $$
declare
  u record; g record; p text; n int := 0;
  fast uuid[]; cal uuid[];
begin
  for u in select id from public.profiles union all select null::uuid loop
    perform set_config('request.jwt.claim.sub', coalesce(u.id::text, ''), true);
    foreach p in array array['view', 'create', 'edit', 'upload', 'manage_members'] loop
      fast := private.group_ids_with_perm(p);
      for g in select id from public.groups loop
        if private.has_group_perm(g.id, p) is distinct from (g.id = any (fast)) then
          raise exception 'SAI: quyền % ở nhóm % của người % lệch với has_group_perm', p, g.id, u.id;
        end if;
        n := n + 1;
      end loop;
    end loop;
    cal := private.visible_calendar_source_ids();
    for g in select id from public.calendar_sources loop
      if private.can_see_calendar_source(g.id) is distinct from (g.id = any (cal)) then
        raise exception 'SAI: lịch % của người % lệch với can_see_calendar_source', g.id, u.id;
      end if;
    end loop;
  end loop;
  if n = 0 then raise exception 'SAI: không có dữ liệu để so khớp'; end if;
  raise notice 'đã so khớp % cặp người, nhóm, quyền', n;
end $$;
