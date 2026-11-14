-- Ô mã Jira trên đầu việc (trừ việc Cá nhân): dán link Jira hoặc gõ mã, ví dụ KKTPT-7377.
-- Trang Việc đối chiếu mã với dữ liệu "Jira của tôi" của chính người xem để hiện loại (Task/Work/Sub-task),
-- trạng thái, việc cha và việc con. Hệ thống không ghi gì lên Jira; việc tạo issue vẫn làm trên Jira.
alter table public.tasks
  add column if not exists jira_key text
    check (jira_key is null or jira_key ~ '^[A-Z][A-Z0-9]{0,19}-[0-9]{1,9}$'),
  add column if not exists jira_url text
    check (jira_url is null or (jira_url ~* '^https?://[^[:space:]]+$' and char_length(jira_url) <= 1000));

create index if not exists tasks_jira_key_idx on public.tasks (jira_key) where jira_key is not null;

-- Việc Cá nhân không gắn Jira. Người được giao (kể cả không có quyền Sửa) gắn được mã,
-- vì trigger tasks_check chỉ khóa tên, mô tả, ưu tiên, hạn, người thực hiện.
create or replace function private.check_task_jira()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.jira_key is null then
    new.jira_url := null;
  elsif private.is_personal(new.group_id) then
    raise exception 'Việc Cá nhân không gắn mã Jira' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_jira on public.tasks;
create trigger tasks_jira before insert or update of jira_key, jira_url on public.tasks
  for each row execute function private.check_task_jira();

notify pgrst, 'reload schema';
