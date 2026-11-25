-- Nhắc việc gấp, cần làm, đến hạn trong 24 giờ (hiện ở quả chuông).
-- Danh sách được tính trực tiếp từ dữ liệu: việc xử lý xong thì tự biến mất.
-- Người dùng có thể gỡ tay từng mục; mục đã gỡ hiện lại nếu hạn hoặc độ ưu tiên thay đổi.

create table if not exists public.alert_dismissals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  ref_key text not null check (char_length(ref_key) <= 300),
  dismissed_at timestamptz not null default now(),
  primary key (user_id, ref_key)
);
alter table public.alert_dismissals enable row level security;
revoke all on public.alert_dismissals from anon, authenticated;
grant select, insert, delete on public.alert_dismissals to authenticated;
drop policy if exists alert_dismissals_own on public.alert_dismissals;
create policy alert_dismissals_own on public.alert_dismissals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- level: qua_han (quá hạn), gap (ưu tiên gấp), sap_den_han (trong 24 giờ), can_xu_ly (chờ mình duyệt, trả lời).
-- Chạy với quyền người gọi nên RLS vẫn áp dụng.
create or replace function public.my_alerts()
returns table (ref_key text, source text, level text, title text, body text, link text, due_at timestamptz)
language sql stable
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid,
           (now() at time zone 'Asia/Ho_Chi_Minh')::date as today
  ),
  items as (
    -- 1. Việc được giao cho mình, chưa xong: quá hạn, gấp, hoặc hạn hôm nay/ngày mai.
    select 'task:' || t.id || ':' || coalesce(t.due_date::text, '') || ':' || t.priority as ref_key,
           'viec' as source,
           case when t.due_date < me.today then 'qua_han'
                when t.priority = 'urgent' then 'gap'
                else 'sap_den_han' end as level,
           t.title,
           g.name || coalesce(' · Hạn ' || to_char(t.due_date, 'DD/MM/YYYY'), '') as body,
           '/nhom/' || t.group_id as link,
           (t.due_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' as due_at
    from public.tasks t
    join public.groups g on g.id = t.group_id, me
    where t.assignee_id = me.uid and t.status <> 'done'
      and (t.priority = 'urgent' or t.due_date <= me.today + 1)

    union all
    -- 2. Mã Jira mình được giao, chưa xong: quá hạn, Highest, hoặc hạn hôm nay/ngày mai.
    select 'jira:' || j.issue_key || ':' || coalesce(j.due_date::text, '') || ':' || coalesce(j.priority, ''),
           'jira',
           case when j.due_date < me.today then 'qua_han'
                when lower(coalesce(j.priority, '')) in ('highest', 'blocker', 'critical') then 'gap'
                else 'sap_den_han' end,
           j.issue_key || ' · ' || j.summary,
           coalesce(j.status, '') || coalesce(' · Hạn ' || to_char(j.due_date, 'DD/MM/YYYY'), ''),
           '/jira',
           (j.due_date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
    from public.jira_issues j, me
    where j.user_id = me.uid and j.is_assignee
      and coalesce(j.status_category, '') <> 'done' and j.resolved_at is null
      and (lower(coalesce(j.priority, '')) in ('highest', 'blocker', 'critical') or j.due_date <= me.today + 1)

    union all
    -- 3. Lịch của nhóm mình tham gia, bắt đầu trong 24 giờ tới (hoặc hạn chót đang diễn ra).
    select 'event:' || e.id || ':' || e.starts_at,
           'lich',
           'sap_den_han',
           case e.kind when 'deadline' then 'Hạn chót: ' when 'meeting' then 'Họp: ' else '' end || e.title,
           g.name || ' · ' || to_char(e.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
             || coalesce(' · ' || e.location, ''),
           '/lich?ngay=' || to_char(e.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
           e.starts_at
    from public.events e
    join public.groups g on g.id = e.group_id
    join public.group_members gm on gm.group_id = e.group_id, me
    where gm.user_id = me.uid
      and e.starts_at < now() + interval '24 hours' and e.ends_at > now()
      and (e.starts_at >= now() or e.kind = 'deadline')

    union all
    -- 4. Lịch cá nhân: được giao chờ mình nhận; hoặc sắp diễn ra / sắp đến hạn trong 24 giờ.
    select 'personal:' || p.id || ':' || p.status || ':' || p.starts_at || ':' || p.ends_at,
           'ca_nhan',
           case when p.status = 'pending' then 'can_xu_ly' else 'sap_den_han' end,
           case when p.status = 'pending' then 'Chờ bạn nhận: ' else '' end || p.title,
           to_char(p.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || coalesce(' · ' || p.location, ''),
           '/lich/ca-nhan?ngay=' || to_char(p.starts_at at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'),
           case when p.kind = 'cong_viec' and p.starts_at < now() then p.ends_at else p.starts_at end
    from public.personal_items p, me
    where p.owner_id = me.uid and p.ends_at > now()
      and (p.status = 'pending'
           or (p.status = 'accepted'
               and (p.starts_at between now() and now() + interval '24 hours'
                    or (p.kind = 'cong_viec' and p.ends_at <= now() + interval '24 hours'))))

    union all
    -- 5. Đặt lịch gặp: yêu cầu chờ mình trả lời; lịch đã nhận diễn ra trong 24 giờ.
    select 'booking:' || b.id || ':' || b.status || ':' || b.starts_at,
           'dat_lich',
           case when b.status = 'pending' then 'can_xu_ly' else 'sap_den_han' end,
           case when b.status = 'pending' then 'Yêu cầu gặp chờ trả lời: ' else 'Lịch gặp: ' end || b.topic,
           coalesce(private.display_name(case when b.host_id = me.uid then b.requester_id else b.host_id end), b.guest_name, '')
             || ' · ' || to_char(b.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'),
           '/dat-lich',
           b.starts_at
    from public.bookings b, me
    where b.ends_at > now()
      and ((b.status = 'pending' and b.host_id = me.uid)
           or (b.status = 'accepted' and me.uid in (b.host_id, b.requester_id)
               and b.starts_at <= now() + interval '24 hours'))

    union all
    -- 6. Xin tham gia nhóm mình quản lý (RLS chỉ cho người duyệt được thấy).
    select 'join:' || r.id,
           'nhom',
           'can_xu_ly',
           'Xin tham gia: ' || g.name,
           coalesce(private.display_name(r.requester_id), '') || coalesce(' · ' || r.message, ''),
           '/nhom/' || r.group_id || '?tab=thanh-vien',
           r.created_at
    from public.join_requests r
    join public.groups g on g.id = r.group_id, me
    where r.status = 'pending' and r.requester_id <> me.uid

    union all
    -- 7. Yêu cầu xóa chờ mình duyệt.
    select 'delete:' || d.id,
           'nhom',
           'can_xu_ly',
           'Yêu cầu xóa: ' || d.item_title,
           coalesce(private.display_name(d.requester_id), '') || coalesce(' · ' || d.reason, ''),
           '/nhom/' || d.group_id || '#yeu-cau-xoa',
           d.created_at
    from public.delete_requests d, me
    where d.status = 'pending' and d.requester_id <> me.uid
  )
  select i.ref_key, i.source, i.level, i.title, nullif(i.body, ''), i.link, i.due_at
  from items i
  where not exists (
    select 1 from public.alert_dismissals x
    where x.user_id = auth.uid() and x.ref_key = i.ref_key
  )
  order by case i.level when 'qua_han' then 0 when 'gap' then 1 when 'sap_den_han' then 2 else 3 end,
           i.due_at nulls last
  limit 100;
$$;
revoke execute on function public.my_alerts() from public, anon;
grant execute on function public.my_alerts() to authenticated;
