-- Trang đặt lịch công khai: ai có liên kết đều chọn giờ trống và gửi yêu cầu gặp,
-- kể cả khách ngoài không có tài khoản. Giờ trống tính từ Lịch của tôi
-- (lịch các nhóm mình tham gia và lịch gặp đã nhận). Khách không bao giờ thấy
-- nội dung lịch, chỉ thấy giờ còn trống. Địa điểm/link họp chỉ hiện sau khi xác nhận.

alter table public.booking_pages
  add column slug text unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,58})[a-z0-9]$'),
  add column title text check (length(title) <= 200),
  add column location text check (length(location) <= 500),
  add column durations int[] not null default array[15, 30, 45, 60, 90, 120]
    check (array_length(durations, 1) between 1 and 6 and durations <@ array[15, 30, 45, 60, 90, 120]),
  -- Khóa 1..7 (thứ Hai..Chủ nhật), giá trị ["08:00","17:00"]; không có khóa là không nhận lịch ngày đó.
  add column weekly_hours jsonb not null default
    '{"1":["08:00","17:00"],"2":["08:00","17:00"],"3":["08:00","17:00"],"4":["08:00","17:00"],"5":["08:00","17:00"]}'::jsonb,
  add column min_notice_minutes int not null default 0 check (min_notice_minutes between 0 and 20160),
  add column horizon_days int not null default 30 check (horizon_days between 1 and 180),
  add column buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120);

alter table public.bookings
  alter column requester_id drop not null,
  add column guest_name text check (length(guest_name) <= 200),
  add column guest_email text check (length(guest_email) <= 320),
  -- Mã bí mật để khách xem trạng thái yêu cầu mà không cần đăng nhập.
  add column guest_token uuid not null default gen_random_uuid() unique,
  add constraint bookings_who check (requester_id is not null or (guest_name is not null and guest_email is not null));

-- Kiểm tra định dạng giờ làm việc.
create function private.valid_weekly_hours(h jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(h) = 'object' and not exists (
    select 1 from jsonb_each(h) e
    where e.key not in ('1', '2', '3', '4', '5', '6', '7')
       or jsonb_typeof(e.value) <> 'array'
       or jsonb_array_length(e.value) <> 2
       or not (e.value ->> 0 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       or not (e.value ->> 1 ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
       or (e.value ->> 0) >= (e.value ->> 1)
  );
$$;
alter table public.booking_pages add constraint booking_pages_hours_ok check (private.valid_weekly_hours(weekly_hours));

-- Giờ bận của chủ trang (lịch nhóm mình tham gia + lịch gặp chờ/đã nhận).
-- Nhãn chỉ trả cho chính chủ trang; người khác chỉ thấy khoảng thời gian.
create function public.booking_page_busy(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, label text)
language sql stable security definer
set search_path = ''
as $$
  with page as (
    select b.user_id from public.booking_pages b
    join public.profiles p on p.id = b.user_id and p.is_active
    where b.slug = p_slug and (b.is_open or b.user_id = auth.uid())
  )
  select e.starts_at, e.ends_at, case when page.user_id = auth.uid() then e.title end
  from page
  join public.group_members m on m.user_id = page.user_id and m.can_view
  join public.events e on e.group_id = m.group_id
  where e.starts_at < p_to and e.ends_at > p_from
  union all
  select k.starts_at, k.ends_at,
    case when page.user_id = auth.uid() then 'Lịch gặp: ' || k.topic end
  from page
  join public.bookings k on k.host_id = page.user_id and k.status in ('pending', 'accepted')
  where k.starts_at < p_to and k.ends_at > p_from
  order by 1;
$$;

-- Thông tin công khai của trang đặt lịch (không lộ địa điểm họp).
create function public.booking_page_public(p_slug text)
returns table (
  host_name text, title text, intro text, durations int[], weekly_hours jsonb,
  min_notice_minutes int, horizon_days int, buffer_minutes int
)
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)), b.title, b.intro, b.durations, b.weekly_hours,
         b.min_notice_minutes, b.horizon_days, b.buffer_minutes
  from public.booking_pages b
  join public.profiles p on p.id = b.user_id and p.is_active
  where b.slug = p_slug and b.is_open;
$$;

-- Gửi yêu cầu đặt lịch qua liên kết. Kiểm tra lại mọi điều kiện ở cơ sở dữ liệu.
create function public.book_public(
  p_slug text, p_starts_at timestamptz, p_minutes int,
  p_name text, p_email text, p_topic text, p_note text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  pg public.booking_pages;
  tz text := 'Asia/Ho_Chi_Minh';
  local_start timestamp := p_starts_at at time zone tz;
  local_end timestamp := (p_starts_at + make_interval(mins => p_minutes)) at time zone tz;
  hours jsonb;
  ends timestamptz := p_starts_at + make_interval(mins => p_minutes);
  uid uuid := case when private.is_active_user() then auth.uid() end;
  token uuid;
begin
  select b.* into pg from public.booking_pages b
  join public.profiles p on p.id = b.user_id and p.is_active
  where b.slug = p_slug and b.is_open;
  if pg.user_id is null then
    raise exception 'Trang đặt lịch không tồn tại hoặc đã tắt' using errcode = '22023';
  end if;
  if uid = pg.user_id then
    raise exception 'Bạn không tự đặt lịch với chính mình' using errcode = '22023';
  end if;
  if not (p_minutes = any (pg.durations)) then
    raise exception 'Thời lượng không được nhận' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 200
     or coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 320
     or length(trim(coalesce(p_topic, ''))) not between 1 and 300
     or length(coalesce(p_note, '')) > 2000 then
    raise exception 'Hãy nhập đủ tên, email hợp lệ và nội dung' using errcode = '22023';
  end if;
  if extract(minute from local_start)::int % 15 <> 0 or extract(second from local_start) <> 0 then
    raise exception 'Giờ bắt đầu phải theo bước 15 phút' using errcode = '22023';
  end if;
  if p_starts_at < now() + make_interval(mins => pg.min_notice_minutes) then
    raise exception 'Giờ này quá gần, cần đặt trước lâu hơn' using errcode = '22023';
  end if;
  if p_starts_at > now() + make_interval(days => pg.horizon_days) then
    raise exception 'Giờ này nằm ngoài khoảng thời gian nhận lịch' using errcode = '22023';
  end if;
  hours := pg.weekly_hours -> extract(isodow from local_start)::int::text;
  if hours is null or local_end::date <> local_start::date
     or local_start::time < (hours ->> 0)::time or local_end::time > (hours ->> 1)::time then
    raise exception 'Giờ này ngoài giờ nhận lịch' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.booking_page_busy(p_slug, p_starts_at - make_interval(mins => pg.buffer_minutes), ends + make_interval(mins => pg.buffer_minutes)) b
  ) then
    raise exception 'Giờ này vừa có lịch khác, hãy chọn giờ khác' using errcode = '23P01';
  end if;
  -- Chống gửi tràn: mỗi email tối đa 3 yêu cầu đang chờ với một người.
  if (select count(*) from public.bookings k
      where k.host_id = pg.user_id and k.status = 'pending' and lower(coalesce(k.guest_email, '')) = lower(p_email)) >= 3 then
    raise exception 'Bạn đã có 3 yêu cầu đang chờ với người này' using errcode = '22023';
  end if;

  insert into public.bookings (host_id, requester_id, guest_name, guest_email, starts_at, ends_at, topic, note)
  values (pg.user_id, uid, trim(p_name), lower(trim(p_email)), p_starts_at, ends, trim(p_topic), nullif(trim(coalesce(p_note, '')), ''))
  returning guest_token into token;
  return token;
end;
$$;

-- Khách xem trạng thái yêu cầu bằng mã bí mật; địa điểm chỉ hiện khi đã xác nhận.
create function public.booking_by_token(p_token uuid)
returns table (
  host_name text, topic text, starts_at timestamptz, ends_at timestamptz,
  status public.booking_status, response_note text, location text
)
language sql stable security definer
set search_path = ''
as $$
  select coalesce(nullif(p.full_name, ''), split_part(p.email, '@', 1)), k.topic, k.starts_at, k.ends_at, k.status,
         k.response_note, case when k.status = 'accepted' then b.location end
  from public.bookings k
  join public.profiles p on p.id = k.host_id
  left join public.booking_pages b on b.user_id = k.host_id
  where k.guest_token = p_token;
$$;

-- Khách hủy yêu cầu của mình bằng mã bí mật.
create function public.cancel_by_token(p_token uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.bookings set status = 'cancelled'
  where guest_token = p_token and status in ('pending', 'accepted') and ends_at > now();
end;
$$;

revoke execute on function public.booking_page_busy(text, timestamptz, timestamptz) from public;
revoke execute on function public.booking_page_public(text) from public;
revoke execute on function public.book_public(text, timestamptz, int, text, text, text, text) from public;
revoke execute on function public.booking_by_token(uuid) from public;
revoke execute on function public.cancel_by_token(uuid) from public;
grant execute on function public.booking_page_busy(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.booking_page_public(text) to anon, authenticated;
grant execute on function public.book_public(text, timestamptz, int, text, text, text, text) to anon, authenticated;
grant execute on function public.booking_by_token(uuid) to anon, authenticated;
grant execute on function public.cancel_by_token(uuid) to anon, authenticated;

-- Kiểm tra yêu cầu đặt lịch. Chạy với quyền người gọi (security invoker) để biết
-- thao tác đến từ người dùng (authenticated) hay từ hàm hệ thống (book_public, cancel_by_token).
create or replace function private.check_booking()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  via_system boolean := current_user not in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'Yêu cầu mới phải ở trạng thái chờ' using errcode = '42501';
    end if;
    if not exists (select 1 from public.booking_pages b join public.profiles p on p.id = b.user_id
                   where b.user_id = new.host_id and b.is_open and p.is_active) then
      raise exception 'Người này chưa mở trang đặt lịch' using errcode = '42501';
    end if;
    if new.starts_at < now() then
      raise exception 'Không đặt lịch vào thời điểm đã qua' using errcode = '22023';
    end if;
  else
    if (new.host_id, new.requester_id, new.starts_at, new.ends_at, new.topic, new.note, new.guest_name, new.guest_email, new.guest_token)
       is distinct from (old.host_id, old.requester_id, old.starts_at, old.ends_at, old.topic, old.note, old.guest_name, old.guest_email, old.guest_token) then
      raise exception 'Không sửa nội dung yêu cầu đã gửi; hãy hủy và gửi yêu cầu mới' using errcode = '42501';
    end if;
    if new.status <> old.status then
      if via_system then
        -- Khách hủy qua liên kết bí mật: chỉ được hủy.
        if new.status <> 'cancelled' then
          raise exception 'Trạng thái không hợp lệ' using errcode = '42501';
        end if;
      elsif uid = old.host_id or private.is_admin() then
        if new.status not in ('accepted', 'declined', 'cancelled') then
          raise exception 'Trạng thái không hợp lệ' using errcode = '22023';
        end if;
      elsif uid = old.requester_id then
        if new.status <> 'cancelled' or old.status not in ('pending', 'accepted') then
          raise exception 'Người đặt chỉ hủy được yêu cầu của mình' using errcode = '42501';
        end if;
      else
        raise exception 'Bạn không xử lý được yêu cầu này' using errcode = '42501';
      end if;
    elsif new.response_note is distinct from old.response_note and not via_system
          and uid is distinct from old.host_id and not private.is_admin() then
      raise exception 'Chỉ người nhận ghi phản hồi' using errcode = '42501';
    end if;
  end if;

  if new.status = 'accepted' and exists (
    select 1 from public.bookings b
    where b.host_id = new.host_id and b.status = 'accepted' and b.id <> new.id
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(new.starts_at, new.ends_at)
  ) then
    raise exception 'Khung giờ này đã có lịch được đồng ý' using errcode = '23P01';
  end if;
  return new;
end;
$$;

-- Thông báo: dùng tên khách khi người đặt không có tài khoản.
create or replace function private.notify_booking()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  when_text text := to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  who text := coalesce(private.display_name(new.requester_id), new.guest_name || ' (' || new.guest_email || ')', 'Khách');
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.host_id, 'booking_new',
      'Yêu cầu gặp: ' || new.topic, who || ' đề nghị lúc ' || when_text, '/dat-lich');
  elsif new.status <> old.status then
    if new.status = 'cancelled' and (auth.uid() is null or auth.uid() is distinct from new.host_id) then
      perform private.notify(new.host_id, 'booking_cancelled',
        'Đã hủy lịch gặp: ' || new.topic, who || ' hủy lịch lúc ' || when_text, '/dat-lich');
    elsif new.requester_id is not null then
      perform private.notify(new.requester_id, 'booking_' || new.status::text,
        case new.status when 'accepted' then 'Lịch gặp được đồng ý: ' when 'declined' then 'Lịch gặp bị từ chối: ' else 'Lịch gặp bị hủy: ' end || new.topic,
        when_text || coalesce(' · ' || new.response_note, ''), '/dat-lich');
    end if;
  end if;
  return null;
end;
$$;

-- Mọi yêu cầu đặt lịch đi qua book_public để áp dụng giờ nhận lịch, thời lượng, khoảng nghỉ.
alter policy bookings_insert on public.bookings with check (false);
revoke insert on public.bookings from authenticated;
-- Hàm cũ không còn dùng (thay bằng booking_page_busy).
revoke execute on function public.booking_busy(uuid, timestamptz, timestamptz) from authenticated;
