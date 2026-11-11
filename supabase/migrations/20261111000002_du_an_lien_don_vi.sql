-- Dự án liên đơn vị: một dự án/sự kiện gắn được nhiều đơn vị/tổ cùng làm.
-- Dự án tự hiện trong mục "Dự án liên đơn vị" của từng đơn vị được gắn.
-- Gắn đơn vị không cấp quyền xem: người của đơn vị thấy tên dự án, lãnh đạo, đầu mối
-- như danh bạ, muốn xem chi tiết thì xin tham gia.

create table public.group_units (
  group_id uuid not null references public.groups (id) on delete cascade,
  unit_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (group_id, unit_id),
  check (group_id <> unit_id)
);
create index group_units_unit_idx on public.group_units (unit_id);
alter table public.group_units enable row level security;
revoke all on public.group_units from anon, authenticated;
grant select, insert, delete on public.group_units to authenticated;

-- Như danh bạ nhóm: mọi người dùng đang hoạt động xem được dự án gắn với đơn vị nào.
create policy group_units_read on public.group_units for select to authenticated
  using (private.is_active_user());
-- Người sửa được dự án thì gắn/gỡ đơn vị.
create policy group_units_insert on public.group_units for insert to authenticated
  with check (private.has_group_perm(group_id, 'edit'));
create policy group_units_delete on public.group_units for delete to authenticated
  using (private.has_group_perm(group_id, 'edit'));

-- Chỉ gắn vào nhóm loại "Đơn vị" đang hoạt động; báo cho Trưởng nhóm, Văn thư của đơn vị.
create function private.check_group_unit()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  u public.groups;
  p public.groups;
begin
  select * into u from public.groups where id = new.unit_id;
  if u.id is null or u.kind <> 'unit' or u.archived_at is not null then
    raise exception 'Chỉ gắn được vào đơn vị/tổ đang hoạt động' using errcode = '22023';
  end if;
  select * into p from public.groups where id = new.group_id;
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
create trigger group_units_check before insert on public.group_units
  for each row execute function private.check_group_unit();
