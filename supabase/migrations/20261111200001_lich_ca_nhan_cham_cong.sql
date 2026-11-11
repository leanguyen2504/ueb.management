-- Lịch cá nhân và chấm công.
--
-- personal_items: mục trên lịch cá nhân của một người (lịch dạy/giảng, sự kiện, việc, khác).
--   - Tự tạo: owner_id = mình, assigned_by = null, trạng thái "accepted".
--   - Được phân công: một đồng nghiệp cùng nhóm/đơn vị tạo cho mình; assigned_by = người giao,
--     trạng thái "pending" đến khi mình nhận hoặc từ chối. Mục được giao hiện luôn trên lịch của mình.
-- attendance_checkins: mỗi người tự điểm danh mỗi ngày (ở trường, ở khoa, đi giảng...).
-- Đơn nghỉ phép và đăng ký làm ngoài giờ không lưu ở đây: trang Chấm công đọc trực tiếp từ dữ liệu
-- Jira cá nhân (jira_issues), nên mỗi lần đồng bộ Jira thì bảng chấm công tự cập nhật.

-- Hai người cùng là thành viên một nhóm/đơn vị (hoặc mình xem được mọi nhóm).
create function private.shares_group(p_other uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_admin() or private.is_principal() or private.is_all_scope_secretary()
    or exists (
      select 1 from public.group_members a
      join public.group_members b on b.group_id = a.group_id
      join public.groups g on g.id = a.group_id and g.archived_at is null
      where a.user_id = auth.uid() and b.user_id = p_other
    )
  );
$$;

create table public.personal_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  -- giang_day: lịch dạy/giảng; su_kien: sự kiện, hội thảo; cong_viec: việc; khac: khác.
  kind text not null default 'cong_viec' check (kind in ('giang_day', 'su_kien', 'cong_viec', 'khac')),
  -- Vai trò của mình trong mục này.
  role text check (role in ('giang_vien_chinh', 'tro_giang', 'bao_cao_vien', 'to_chuc', 'tham_du', 'thuc_hien')),
  -- Nơi làm việc: ở trường, ở khoa, ngoài trường (công tác), trực tuyến.
  place text check (place in ('truong', 'khoa', 'ngoai_truong', 'truc_tuyen')),
  title text not null check (char_length(title) between 1 and 300),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  location text check (char_length(location) <= 300),
  description text check (char_length(description) <= 4000),
  -- pending: chờ người được giao nhận; accepted: đã nhận; declined: từ chối; done: xong.
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'declined', 'done')),
  response_note text check (char_length(response_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  check (ends_at - starts_at <= interval '62 days')
);
create index personal_items_owner_idx on public.personal_items (owner_id, starts_at);
create index personal_items_assigner_idx on public.personal_items (assigned_by, starts_at) where assigned_by is not null;

-- Điền người giao, trạng thái; chặn sửa sai vai.
create function private.check_personal_item()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_id = auth.uid() then
      new.assigned_by := null;
      new.status := case when new.status = 'done' then 'done' else 'accepted' end;
    else
      new.assigned_by := auth.uid();
      new.status := 'pending';
    end if;
    new.response_note := null;
    return new;
  end if;

  new.updated_at := now();
  if new.owner_id is distinct from old.owner_id or new.assigned_by is distinct from old.assigned_by then
    raise exception 'Không được đổi người nhận hoặc người giao' using errcode = '42501';
  end if;
  if old.assigned_by is not null and auth.uid() = old.owner_id then
    -- Người được giao chỉ đổi trạng thái và ghi chú trả lời.
    if (new.kind, new.role, new.place, new.title, new.starts_at, new.ends_at, new.all_day, new.location, new.description)
       is distinct from
       (old.kind, old.role, old.place, old.title, old.starts_at, old.ends_at, old.all_day, old.location, old.description) then
      raise exception 'Việc do người khác giao: bạn chỉ nhận, từ chối hoặc báo xong' using errcode = '42501';
    end if;
    if new.status = 'pending' then
      raise exception 'Trạng thái không hợp lệ' using errcode = '22023';
    end if;
  elsif old.assigned_by is not null and auth.uid() = old.assigned_by then
    -- Người giao sửa nội dung; sửa xong thì chờ người nhận xác nhận lại.
    if new.status is distinct from old.status or new.response_note is distinct from old.response_note then
      raise exception 'Chỉ người được giao đổi trạng thái' using errcode = '42501';
    end if;
    if (new.title, new.starts_at, new.ends_at, new.all_day, new.place) is distinct from
       (old.title, old.starts_at, old.ends_at, old.all_day, old.place) then
      new.status := 'pending';
      new.response_note := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger personal_items_check before insert or update on public.personal_items
  for each row execute function private.check_personal_item();

-- Thông báo: người được giao khi có việc mới / việc bị sửa; người giao khi người nhận trả lời.
create function private.notify_personal_item()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  t text := to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
begin
  if new.assigned_by is null then return null; end if;
  if tg_op = 'INSERT' then
    perform private.notify(new.owner_id, 'personal_assigned',
      'Bạn được phân công: ' || new.title,
      coalesce(private.display_name(new.assigned_by), 'Đồng nghiệp') || ' giao · ' || t,
      '/lich/ca-nhan?ngay=' || to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'));
  elsif new.status is distinct from old.status and new.status <> 'pending' then
    perform private.notify(new.assigned_by, 'personal_response',
      coalesce(private.display_name(new.owner_id), 'Người được giao') || case new.status
        when 'accepted' then ' đã nhận: ' when 'declined' then ' từ chối: ' else ' đã xong: ' end || new.title,
      new.response_note,
      '/lich/ca-nhan?muc=da-giao');
  elsif new.status = 'pending' and old.status <> 'pending' then
    perform private.notify(new.owner_id, 'personal_assigned',
      'Việc được giao đã thay đổi: ' || new.title,
      coalesce(private.display_name(new.assigned_by), 'Đồng nghiệp') || ' sửa · ' || t,
      '/lich/ca-nhan?ngay=' || to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'));
  end if;
  return null;
end;
$$;
create trigger personal_items_notify after insert or update on public.personal_items
  for each row execute function private.notify_personal_item();

alter table public.personal_items enable row level security;
revoke all on public.personal_items from anon;
grant select, insert, update, delete on public.personal_items to authenticated;

create policy personal_items_read on public.personal_items for select to authenticated
  using (private.is_active_user() and (owner_id = auth.uid() or assigned_by = auth.uid()));
create policy personal_items_insert on public.personal_items for insert to authenticated
  with check (
    private.is_active_user() and (
      (owner_id = auth.uid() and assigned_by is null)
      or (assigned_by = auth.uid() and owner_id <> auth.uid() and private.shares_group(owner_id)
          and exists (select 1 from public.profiles p where p.id = owner_id and p.is_active))
    )
  );
create policy personal_items_update on public.personal_items for update to authenticated
  using (private.is_active_user() and (owner_id = auth.uid() or assigned_by = auth.uid()))
  with check (owner_id = auth.uid() or assigned_by = auth.uid());
create policy personal_items_delete on public.personal_items for delete to authenticated
  using (private.is_active_user() and (owner_id = auth.uid() or assigned_by = auth.uid()));

create table public.attendance_checkins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  -- truong: ở trường; khoa: ở khoa; giang: đi giảng; cong_tac: công tác ngoài trường; tu_xa: làm từ xa.
  place text not null check (place in ('truong', 'khoa', 'giang', 'cong_tac', 'tu_xa')),
  note text check (char_length(note) <= 500),
  checked_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.attendance_checkins enable row level security;
revoke all on public.attendance_checkins from anon;
grant select, insert, update, delete on public.attendance_checkins to authenticated;
create policy attendance_own_read on public.attendance_checkins for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
-- Chỉ điểm danh cho chính mình, trong khoảng từ 31 ngày trước đến 7 ngày tới.
create policy attendance_own_insert on public.attendance_checkins for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user()
    and day between (now() at time zone 'Asia/Ho_Chi_Minh')::date - 31 and (now() at time zone 'Asia/Ho_Chi_Minh')::date + 7);
create policy attendance_own_update on public.attendance_checkins for update to authenticated
  using (user_id = auth.uid() and private.is_active_user())
  with check (user_id = auth.uid()
    and day between (now() at time zone 'Asia/Ho_Chi_Minh')::date - 31 and (now() at time zone 'Asia/Ho_Chi_Minh')::date + 7);
create policy attendance_own_delete on public.attendance_checkins for delete to authenticated
  using (user_id = auth.uid());
