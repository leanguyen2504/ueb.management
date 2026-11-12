-- Báo yêu cầu tham gia nhóm cho người duyệt được.
-- Trước đây chỉ báo cho Trưởng nhóm, Văn thư và người được quản lý thành viên trong nhóm.
-- Nhóm chưa có ai giữ các vai trò đó thì không ai nhận thông báo, yêu cầu nằm chờ.
-- Nay: vẫn báo Trưởng nhóm, Văn thư (và người quản lý thành viên) đang hoạt động;
-- nếu nhóm chưa có ai như vậy thì báo chủ không gian cá nhân, hoặc quản trị hệ thống
-- và thư ký toàn trường (những người duyệt được mọi nhóm).

create or replace function public.request_join(p_group uuid, p_task uuid default null, p_message text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  t public.tasks;
  rid uuid;
  who text := coalesce(private.display_name(auth.uid()), 'Một người dùng');
  msg text := nullif(trim(coalesce(p_message, '')), '');
  recipients uuid[];
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản không hoạt động' using errcode = '42501';
  end if;
  select * into g from public.groups where id = p_group;
  if g.id is null or g.archived_at is not null then
    raise exception 'Nhóm không tồn tại hoặc đã lưu trữ' using errcode = '22023';
  end if;
  if p_task is not null then
    select * into t from public.tasks where id = p_task and group_id = p_group;
    if t.id is null or t.status = 'done' then
      raise exception 'Việc không còn mở' using errcode = '22023';
    end if;
    if t.assignee_id = uid then
      raise exception 'Bạn đã được giao việc này' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id = uid) then
    raise exception 'Bạn đã là thành viên nhóm này' using errcode = '22023';
  end if;
  if exists (select 1 from public.join_requests r where r.group_id = p_group and r.requester_id = uid
             and r.task_id is not distinct from p_task and r.status = 'pending') then
    raise exception 'Bạn đã gửi yêu cầu này, đang chờ duyệt' using errcode = '22023';
  end if;

  insert into public.join_requests (group_id, task_id, requester_id, message)
  values (p_group, p_task, uid, msg)
  returning id into rid;

  -- Người nhận: Trưởng nhóm, Văn thư, người quản lý thành viên của nhóm.
  select array_agg(distinct m.user_id) into recipients
  from public.group_members m
  join public.profiles p on p.id = m.user_id and p.is_active
  where m.group_id = p_group and (m.is_manager or m.is_clerk or m.can_manage_members) and m.user_id <> uid;

  -- Không có ai: báo người duyệt được thay.
  if recipients is null then
    if g.owner_id is not null then
      recipients := array_remove(array[g.owner_id], uid);
    else
      select array_agg(distinct x.id) into recipients
      from (
        select s.current_admin_id as id from public.system_settings s where s.current_admin_id is not null
        union
        select sc.user_id from public.secretary_scopes sc
        join public.profiles p on p.id = sc.user_id and p.is_active and p.system_role = 'secretary'
        where sc.all_groups
      ) x
      where x.id <> uid;
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, link, actor_id)
  select r, 'join_request',
    case when p_task is null then who || ' xin tham gia ' || g.name else who || ' xin tham gia việc: ' || t.title end,
    msg, '/nhom/' || p_group || '?tab=thanh-vien', uid
  from unnest(coalesce(recipients, '{}'::uuid[])) as r;
  return rid;
end;
$$;
revoke execute on function public.request_join(uuid, uuid, text) from public, anon;
grant execute on function public.request_join(uuid, uuid, text) to authenticated;
