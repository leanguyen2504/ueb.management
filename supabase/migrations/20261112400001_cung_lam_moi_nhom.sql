-- Đơn vị/nhóm cùng làm: gắn được mọi nhóm, dự án, không gian đang hoạt động, không chỉ nhóm
-- loại "Đơn vị". Ví dụ dự án gắn "Tổ công tác trọng điểm" (một không gian chung) để dự án hiện
-- trong mục Dự án liên đơn vị của tổ đó. Không gắn vào không gian cá nhân, nhóm đã lưu trữ;
-- nhóm loại Đơn vị không tự gắn nhóm khác (đơn vị là nơi nhận dự án, không phải dự án).
-- Quyền gắn/gỡ không đổi: ai sửa được dự án thì gắn, gỡ được.
create or replace function private.check_group_unit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  u public.groups;
  p public.groups;
begin
  select * into u from public.groups where id = new.unit_id;
  if u.id is null or u.archived_at is not null or u.owner_id is not null then
    raise exception 'Chỉ gắn được vào nhóm, dự án đang hoạt động' using errcode = '22023';
  end if;
  select * into p from public.groups where id = new.group_id;
  if p.kind = 'unit' then
    raise exception 'Nhóm loại Đơn vị không gắn nhóm cùng làm' using errcode = '22023';
  end if;
  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select m.user_id, 'unit_tagged',
    coalesce(private.display_name(auth.uid()), 'Ai đó') || ' gắn ' || u.name || ' vào dự án ' || p.name,
    'Dự án hiện trong mục Dự án liên đơn vị của ' || u.name || '.',
    '/nhom/' || p.id, auth.uid()
  from public.group_members m
  where m.group_id = u.id and (m.is_manager or m.is_clerk) and m.user_id is distinct from auth.uid();
  return new;
end;
$$;
