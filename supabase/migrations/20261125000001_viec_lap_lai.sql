-- Việc lặp lại (recurring): một đầu việc duy nhất tự chuyển sang kỳ sau khi được đánh dấu Hoàn thành.
-- Ví dụ "Báo cáo tiến độ NCS hằng tuần, hạn Chủ nhật": bấm Hoàn thành thì việc quay về Cần làm với
-- hạn Chủ nhật tuần sau, thay vì phải tạo sẵn hàng trăm việc lẻ.

alter table public.tasks
  add column if not exists repeat_rule text,
  add column if not exists repeat_until date,
  add column if not exists repeat_done_count integer not null default 0,
  add column if not exists repeat_last_done_at timestamptz;

alter table public.tasks drop constraint if exists tasks_repeat_rule_check;
alter table public.tasks add constraint tasks_repeat_rule_check
  check (repeat_rule is null or repeat_rule in ('daily', 'weekly', 'monthly'));
-- Việc lặp lại phải có hạn để tính kỳ sau.
alter table public.tasks drop constraint if exists tasks_repeat_due_check;
alter table public.tasks add constraint tasks_repeat_due_check
  check (repeat_rule is null or due_date is not null);

comment on column public.tasks.repeat_rule is 'Lặp lại: daily, weekly, monthly; null là không lặp';
comment on column public.tasks.repeat_until is 'Lặp đến ngày (hạn của kỳ cuối); null là lặp mãi';
comment on column public.tasks.repeat_done_count is 'Số kỳ đã hoàn thành';
comment on column public.tasks.repeat_last_done_at is 'Lần gần nhất hoàn thành một kỳ';

-- Chạy sau tasks_check (trigger cùng loại chạy theo thứ tự tên), nên việc đổi hạn ở đây không bị
-- chặn với người được giao chỉ có quyền đổi trạng thái.
create or replace function private.repeat_task()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  next_due date;
  shift integer;
  guard integer := 0;
begin
  if tg_op = 'UPDATE'
     and (new.repeat_rule, new.repeat_until) is distinct from (old.repeat_rule, old.repeat_until)
     and not private.has_group_perm(old.group_id, 'edit') then
    raise exception 'Bạn không có quyền đổi lịch lặp lại của việc này' using errcode = '42501';
  end if;

  if new.repeat_rule is null or new.due_date is null or new.status <> 'done'
     or (tg_op = 'UPDATE' and old.status = 'done') then
    return new;
  end if;

  -- Kỳ sau tính từ hạn hiện tại; nếu hoàn thành trễ nhiều kỳ thì nhảy tới kỳ chưa qua.
  next_due := new.due_date;
  loop
    next_due := case new.repeat_rule
      when 'daily' then next_due + 1
      when 'weekly' then next_due + 7
      else (next_due + interval '1 month')::date
    end;
    guard := guard + 1;
    exit when next_due >= today or guard > 1000;
  end loop;

  new.repeat_done_count := coalesce(new.repeat_done_count, 0) + 1;
  new.repeat_last_done_at := now();

  -- Hết lịch lặp: giữ trạng thái Hoàn thành cho kỳ cuối.
  if new.repeat_until is not null and next_due > new.repeat_until then
    return new;
  end if;

  shift := next_due - new.due_date;
  new.due_date := next_due;
  if new.start_date is not null then
    new.start_date := new.start_date + shift;
  end if;
  new.status := 'todo';
  new.progress := null;
  new.completed_at := null;
  return new;
end;
$$;

drop trigger if exists tasks_repeat on public.tasks;
create trigger tasks_repeat before insert or update on public.tasks
  for each row execute function private.repeat_task();
