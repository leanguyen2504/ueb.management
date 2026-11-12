-- Dữ liệu máy chấm công của trường (chamcong4lan.ueb.edu.vn), mỗi người chỉ của chính mình.
--
-- Hệ thống chấm công nằm trong mạng nội bộ, máy chủ web không gọi tới được. Nút "Đồng bộ Jira → UEB"
-- (bookmarklet) khi bấm trên trang Báo cáo chấm công sẽ đọc báo cáo bằng phiên đăng nhập của chính người
-- dùng, chỉ giữ các dòng của họ, rồi gửi về /api/jira/cham-cong kèm mã đồng bộ. Máy chủ kiểm tra lại
-- tài khoản (trùng tên đăng nhập Jira) trước khi gọi attendance_save_punches.
--
-- attendance_punches: mỗi ngày một dòng (giờ vào/ra sáng chiều, vi phạm, giải trình, số lỗi).
-- attendance_punch_sync: lần đồng bộ gần nhất (khoảng ngày, thời điểm máy chấm công tự đồng bộ, lỗi đọc đơn nghỉ).

create table public.attendance_punches (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  -- Giờ dạng "HH:MM" như máy chấm công trả về.
  in_am text check (in_am ~ '^\d{2}:\d{2}$'),
  out_am text check (out_am ~ '^\d{2}:\d{2}$'),
  in_pm text check (in_pm ~ '^\d{2}:\d{2}$'),
  out_pm text check (out_pm ~ '^\d{2}:\d{2}$'),
  -- Vi phạm từng ca, cách nhau "; " (Đi muộn …, Về sớm …, Không chấm …).
  violation_am text check (char_length(violation_am) <= 500),
  violation_pm text check (char_length(violation_pm) <= 500),
  -- Giải trình: đơn Jira đã được TCNS duyệt, dạng "MÃ-ĐƠN · Loại nghỉ", cách nhau "; ".
  excuse_am text check (char_length(excuse_am) <= 500),
  excuse_pm text check (char_length(excuse_pm) <= 500),
  minutes_late numeric(8, 1) not null default 0,
  minutes_converted numeric(8, 1) not null default 0,
  error_count int not null default 0,
  -- Cuối tuần được hoán đổi thành ngày làm việc.
  makeup_day boolean not null default false,
  primary key (user_id, day)
);

create table public.attendance_punch_sync (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  punch_username text,
  full_name text,
  unit_name text,
  title text,
  range_from date not null,
  range_to date not null,
  row_count int not null default 0,
  -- Thời điểm máy chấm công lấy dữ liệu từ máy quẹt thẻ lần cuối (theo hệ thống chấm công).
  source_synced_at timestamptz,
  -- Hệ thống chấm công không đọc được đơn nghỉ phép từ Jira: số lỗi chưa trừ nghỉ phép.
  excuse_error boolean not null default false,
  synced_at timestamptz not null default now()
);

alter table public.attendance_punches enable row level security;
alter table public.attendance_punch_sync enable row level security;
revoke all on public.attendance_punches, public.attendance_punch_sync from anon, authenticated;
grant select, delete on public.attendance_punches, public.attendance_punch_sync to authenticated;

create policy attendance_punches_own on public.attendance_punches for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy attendance_punches_own_delete on public.attendance_punches for delete to authenticated
  using (user_id = auth.uid());
create policy attendance_punch_sync_own on public.attendance_punch_sync for select to authenticated
  using (user_id = auth.uid() and private.is_active_user());
create policy attendance_punch_sync_own_delete on public.attendance_punch_sync for delete to authenticated
  using (user_id = auth.uid());

-- Ghi đè dữ liệu chấm công của một người trong khoảng [from, to] (một giao dịch). Chỉ máy chủ gọi.
create function public.attendance_save_punches(p_user uuid, p_snap jsonb)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_from date := (p_snap ->> 'from')::date;
  v_to date := (p_snap ->> 'to')::date;
  v_count int;
begin
  if not exists (select 1 from public.profiles where id = p_user and is_active) then
    raise exception 'Tài khoản không hoạt động';
  end if;
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 400 then
    raise exception 'Khoảng ngày không hợp lệ';
  end if;

  delete from public.attendance_punches where user_id = p_user and day between v_from and v_to;

  insert into public.attendance_punches (user_id, day, in_am, out_am, in_pm, out_pm, violation_am, violation_pm,
    excuse_am, excuse_pm, minutes_late, minutes_converted, error_count, makeup_day)
  select distinct on (r.day) p_user, r.day,
    nullif(substring(r."inAm" from '^\d{2}:\d{2}$'), ''), nullif(substring(r."outAm" from '^\d{2}:\d{2}$'), ''),
    nullif(substring(r."inPm" from '^\d{2}:\d{2}$'), ''), nullif(substring(r."outPm" from '^\d{2}:\d{2}$'), ''),
    nullif(left(r."violationAm", 500), ''), nullif(left(r."violationPm", 500), ''),
    nullif(left(r."excuseAm", 500), ''), nullif(left(r."excusePm", 500), ''),
    least(greatest(coalesce(r."minutesLate", 0), 0), 9999999), least(greatest(coalesce(r."minutesConverted", 0), 0), 9999999),
    least(greatest(coalesce(r."errorCount", 0), 0), 100), coalesce(r."makeupDay", false)
  from jsonb_to_recordset(coalesce(p_snap -> 'rows', '[]')) as r(day date, "inAm" text, "outAm" text, "inPm" text, "outPm" text,
    "violationAm" text, "violationPm" text, "excuseAm" text, "excusePm" text, "minutesLate" numeric,
    "minutesConverted" numeric, "errorCount" int, "makeupDay" boolean)
  where r.day between v_from and v_to;
  get diagnostics v_count = row_count;

  insert into public.attendance_punch_sync as s (user_id, punch_username, full_name, unit_name, title, range_from, range_to,
    row_count, source_synced_at, excuse_error, synced_at)
  values (p_user, left(p_snap #>> '{me,username}', 200), left(p_snap #>> '{me,name}', 200), left(p_snap #>> '{me,unit}', 300),
    left(p_snap #>> '{me,title}', 200), v_from, v_to, v_count, (p_snap ->> 'sourceSyncedAt')::timestamptz,
    coalesce((p_snap ->> 'excuseError')::boolean, false), now())
  on conflict (user_id) do update set
    punch_username = excluded.punch_username, full_name = excluded.full_name, unit_name = excluded.unit_name,
    title = excluded.title, range_from = least(s.range_from, excluded.range_from), range_to = greatest(s.range_to, excluded.range_to),
    row_count = (select count(*) from public.attendance_punches where user_id = p_user),
    source_synced_at = excluded.source_synced_at, excuse_error = excluded.excuse_error, synced_at = now();
  return v_count;
end;
$$;
revoke all on function public.attendance_save_punches(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.attendance_save_punches(uuid, jsonb) to service_role;
