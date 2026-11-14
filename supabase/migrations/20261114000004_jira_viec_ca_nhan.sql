-- Cho gắn mã Jira cả vào việc Cá nhân. Việc Cá nhân chỉ chủ thấy (RLS không đổi),
-- nên mã Jira gắn ở đó cũng chỉ chủ thấy; người khác trên cây Jira vẫn thấy mã đó là "chưa link".
create or replace function private.check_task_jira()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.jira_key is null then
    new.jira_url := null;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
