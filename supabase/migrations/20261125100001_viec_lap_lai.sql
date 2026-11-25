-- Đầu việc lặp lại: hằng ngày, các ngày làm việc (T2–T6), hằng tuần (chọn thứ), hằng tháng, hằng năm,
-- mỗi N ngày/tuần/tháng/năm, có thể đặt ngày kết thúc.
-- Cách chạy: khi việc lặp lại chuyển sang Hoàn thành, hệ thống tự tạo lần kế tiếp (giữ tên, mô tả,
-- người thực hiện, ưu tiên, giờ hạn, khoảng cách bắt đầu → hạn). Lần kế tiếp là một đầu việc bình thường,
-- nên quả chuông nhắc việc (20261125000001_thong_bao_den_han.sql) tự nhắc theo hạn mới.
-- Chạy sau 20261125000001_thong_bao_den_han.sql (dùng cột due_time và hàm check_task của file đó).

alter table public.tasks
  add column if not exists repeat_rule text
    check (repeat_rule is null or repeat_rule in ('daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  add column if not exists repeat_every smallint not null default 1 check (repeat_every between 1 and 99),
  -- Thứ trong tuần cho kiểu weekly, theo ISO: 1 = Thứ Hai … 7 = Chủ nhật. Để trống: cùng thứ với hạn.
  add column if not exists repeat_days smallint[]
    check (repeat_days is null or (repeat_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[] and cardinality(repeat_days) between 1 and 7)),
  add column if not exists repeat_until date,
  -- Ngày gốc của chuỗi để tính các lần sau (giữ đúng ngày 31 khi lặp theo tháng).
  add column if not exists repeat_anchor date,
  -- Lần kế tiếp đã được tạo từ việc này (để hoàn thành lại không tạo trùng).
  add column if not exists repeat_next_id uuid;

-- Ngày hạn kế tiếp sau ngày p_after theo quy tắc lặp; null nếu không tìm được.
create or replace function private.task_next_due(
  p_anchor date, p_rule text, p_every int, p_days smallint[], p_after date
)
returns date
language plpgsql immutable
set search_path = ''
as $$
declare
  d date;
  k int;
  wk_anchor date;
  days int[];
begin
  if p_anchor is null or p_rule is null or p_after is null then
    return null;
  end if;
  p_every := greatest(coalesce(p_every, 1), 1);

  if p_rule = 'daily' then
    k := greatest(1, floor((p_after - p_anchor)::numeric / p_every)::int + 1);
    return p_anchor + k * p_every;

  elsif p_rule = 'weekdays' then
    d := p_after + 1;
    while extract(isodow from d) > 5 loop
      d := d + 1;
    end loop;
    return d;

  elsif p_rule = 'weekly' then
    days := coalesce(nullif(p_days::int[], '{}'), array[extract(isodow from p_anchor)::int]);
    wk_anchor := p_anchor - (extract(isodow from p_anchor)::int - 1);
    d := p_after + 1;
    for i in 1 .. 7 * p_every + 7 loop
      if extract(isodow from d)::int = any (days)
         and d >= wk_anchor
         and (((d - (extract(isodow from d)::int - 1)) - wk_anchor) / 7) % p_every = 0 then
        return d;
      end if;
      d := d + 1;
    end loop;
    return null;

  elsif p_rule in ('monthly', 'yearly') then
    if p_rule = 'yearly' then
      p_every := p_every * 12;
    end if;
    -- Bắt đầu gần đúng rồi tiến dần; luôn tính từ ngày gốc để ngày 31 không bị trôi thành 28.
    k := greatest(1, ((extract(year from p_after) - extract(year from p_anchor)) * 12
                      + extract(month from p_after) - extract(month from p_anchor))::int / p_every - 1);
    loop
      d := (p_anchor + make_interval(months => k * p_every))::date;
      exit when d > p_after;
      k := k + 1;
    end loop;
    return d;
  end if;
  return null;
end;
$$;

-- Trước khi ghi: chuẩn hóa các cột lặp lại; khi việc chuyển sang Hoàn thành thì dành sẵn mã cho lần kế tiếp.
create or replace function private.prepare_task_repeat()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  nxt date;
begin
  -- Cột này chỉ hệ thống ghi.
  if tg_op = 'INSERT' then
    new.repeat_next_id := null;
  else
    new.repeat_next_id := old.repeat_next_id;
  end if;

  if new.repeat_rule is null then
    new.repeat_days := null;
    new.repeat_until := null;
    new.repeat_anchor := null;
    new.repeat_every := 1;
    return new;
  end if;

  -- Việc lặp lại cần có hạn: chưa chọn thì lấy hôm nay.
  if new.due_date is null then
    new.due_date := today;
  end if;
  if new.repeat_rule <> 'weekly' then
    new.repeat_days := null;
  end if;
  if new.repeat_until is not null and new.repeat_until < new.due_date then
    raise exception 'Ngày kết thúc lặp lại phải sau hạn của việc' using errcode = '22023';
  end if;
  -- Đặt lặp lại lần đầu, đổi quy tắc, hoặc người dùng dời hạn: lấy hạn hiện tại làm ngày gốc.
  if new.repeat_anchor is null
     or (tg_op = 'UPDATE' and (new.due_date is distinct from old.due_date
                               or new.repeat_rule is distinct from old.repeat_rule
                               or new.repeat_every is distinct from old.repeat_every
                               or new.repeat_days is distinct from old.repeat_days)) then
    new.repeat_anchor := new.due_date;
  end if;

  if tg_op = 'UPDATE' and new.status = 'done' and old.status <> 'done' and old.repeat_next_id is null then
    -- Lần sau không rơi vào quá khứ: làm muộn thì nhảy tới lần gần nhất từ hôm nay.
    nxt := private.task_next_due(new.repeat_anchor, new.repeat_rule, new.repeat_every, new.repeat_days,
                                 greatest(new.due_date, today - 1));
    if nxt is not null and (new.repeat_until is null or nxt <= new.repeat_until) then
      new.repeat_next_id := gen_random_uuid();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_repeat_prepare on public.tasks;
create trigger tasks_repeat_prepare before insert or update on public.tasks
  for each row execute function private.prepare_task_repeat();

-- Sau khi ghi: tạo lần kế tiếp với mã đã dành sẵn.
create or replace function private.spawn_task_repeat()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  nxt date;
  r record;
begin
  if new.repeat_next_id is null or old.repeat_next_id is not null then
    return null;
  end if;
  nxt := private.task_next_due(new.repeat_anchor, new.repeat_rule, new.repeat_every, new.repeat_days,
                               greatest(new.due_date, today - 1));
  select new.group_id as group_id, new.title as title, new.description as description,
         new.priority as priority, new.assignee_id as assignee_id, nxt as due_date,
         new.due_time as due_time,
         case when new.start_date is not null then nxt - (new.due_date - new.start_date) end as start_date
  into r;
  begin
    insert into public.tasks (id, group_id, title, description, priority, assignee_id, due_date, due_time, start_date,
                              repeat_rule, repeat_every, repeat_days, repeat_until, repeat_anchor)
    values (new.repeat_next_id, r.group_id, r.title, r.description, r.priority, r.assignee_id, r.due_date, r.due_time,
            r.start_date, new.repeat_rule, new.repeat_every, new.repeat_days, new.repeat_until, new.repeat_anchor);
  exception when insufficient_privilege then
    -- Người được giao không còn trong nhóm: vẫn tạo lần kế tiếp nhưng để chưa giao.
    insert into public.tasks (id, group_id, title, description, priority, assignee_id, due_date, due_time, start_date,
                              repeat_rule, repeat_every, repeat_days, repeat_until, repeat_anchor)
    values (new.repeat_next_id, r.group_id, r.title, r.description, r.priority, null, r.due_date, r.due_time,
            r.start_date, new.repeat_rule, new.repeat_every, new.repeat_days, new.repeat_until, new.repeat_anchor);
  end;
  return null;
end;
$$;

drop trigger if exists tasks_repeat_spawn on public.tasks;
create trigger tasks_repeat_spawn after update of status on public.tasks
  for each row when (new.status = 'done' and old.status <> 'done')
  execute function private.spawn_task_repeat();

revoke execute on function private.task_next_due(date, text, int, smallint[], date) from public, anon;
revoke execute on function private.prepare_task_repeat() from public, anon, authenticated;
revoke execute on function private.spawn_task_repeat() from public, anon, authenticated;

-- Người chỉ được đổi trạng thái (không có quyền Sửa) cũng không được đổi lịch lặp lại.
-- Giống bản trong 20261125000001_thong_bao_den_han.sql, thêm các cột repeat_*.
create or replace function private.check_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
begin
  if new.due_date is null then
    new.due_time := null;
  end if;

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
       and (new.title, new.description, new.priority, new.due_date, new.due_time, new.assignee_id,
            new.repeat_rule, new.repeat_every, new.repeat_days, new.repeat_until)
           is distinct from (old.title, old.description, old.priority, old.due_date, old.due_time, old.assignee_id,
            old.repeat_rule, old.repeat_every, old.repeat_days, old.repeat_until) then
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
$function$;
