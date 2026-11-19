-- Cho phép chuyển việc giữa các dự án trong mục Cá nhân của cùng một người (ví dụ tách "Luận án"
-- khỏi "Nghiên cứu khoa học cá nhân"). Việc của nhóm vẫn không chuyển sang nhóm khác được.
create or replace function private.check_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if not exists (
      select 1 from public.profiles p
      where p.id = new.assignee_id and p.is_active
        and (
          p.system_role = 'principal'
          or exists (select 1 from public.group_members m where m.group_id = new.group_id and m.user_id = p.id and m.can_view)
          or exists (select 1 from public.system_settings s where s.current_admin_id = p.id)
          or (p.system_role = 'secretary' and exists (select 1 from public.secretary_scopes c where c.user_id = p.id and c.all_groups))
        )
    ) then
      raise exception 'Người được giao việc phải là thành viên của nhóm' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.group_id <> old.group_id and not exists (
      select 1 from public.groups a, public.groups b
      where a.id = old.group_id and b.id = new.group_id
        and a.owner_id is not null and a.owner_id = b.owner_id and a.owner_id = auth.uid()
    ) then
      raise exception 'Không chuyển đầu việc sang nhóm khác' using errcode = '42501';
    end if;
    if not private.has_group_perm(old.group_id, 'edit')
       and (new.title, new.description, new.priority, new.due_date, new.assignee_id)
           is distinct from (old.title, old.description, old.priority, old.due_date, old.assignee_id) then
      raise exception 'Bạn chỉ được đổi trạng thái của việc được giao' using errcode = '42501';
    end if;
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
