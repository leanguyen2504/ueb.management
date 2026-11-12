-- Tăng tốc đọc dữ liệu: quyền xem (RLS) được tính một lần cho mỗi truy vấn thay vì
-- tính lại cho từng dòng. Không đổi ai được xem gì.
--
-- Trước đây mỗi dòng của groups, tasks, events, group_members... gọi private.has_group_perm,
-- trong đó lại gọi is_active_user, is_admin, is_all_scope_secretary: khoảng 0,7 ms một dòng,
-- nên danh sách 57 nhóm mất khoảng 40 ms và tăng đều theo số nhóm, số việc.
-- Nay quyền được tính một lần thành danh sách mã nhóm, rồi mỗi dòng chỉ còn so khớp.
-- auth.uid() và các hàm không tham số được bọc trong (select ...) để Postgres chỉ tính một lần
-- (khuyến nghị "auth_rls_initplan" của Supabase).

-- 1. Danh sách nhóm mà tôi có quyền perm: cùng quy tắc với private.has_group_perm ----------
create or replace function private.group_ids_with_perm(perm text)
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select case
    when not private.is_active_user() then '{}'::uuid[]
    -- Không gian cá nhân (có chủ): chỉ chủ. Nhóm thường: quản trị và thư ký toàn quyền thấy hết.
    when private.is_admin() or private.is_all_scope_secretary() then array(
      select g.id from public.groups g
      where g.owner_id is null or g.owner_id = auth.uid()
    )
    else array(
      select g.id from public.groups g where g.owner_id = auth.uid()
      union all
      select m.group_id
      from public.group_members m
      join public.groups g on g.id = m.group_id and g.owner_id is null
      where m.user_id = auth.uid()
        and case perm
          when 'view' then m.can_view
          when 'create' then m.can_create
          when 'edit' then m.can_edit
          when 'upload' then m.can_upload
          when 'manage_members' then m.can_manage_members
          else false
        end
    )
  end;
$$;

-- 2. Các lịch Google tôi được xem: cùng quy tắc với private.can_see_calendar_source ---------
create or replace function private.visible_calendar_source_ids()
returns uuid[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.id), '{}'::uuid[])
  from public.calendar_sources s
  where s.is_enabled and private.can_see_calendar(s.visibility);
$$;

revoke all on function private.group_ids_with_perm(text) from public;
revoke all on function private.visible_calendar_source_ids() from public;
grant execute on function private.group_ids_with_perm(text) to authenticated;
grant execute on function private.visible_calendar_source_ids() to authenticated;

-- 3. Quyền xem theo nhóm ------------------------------------------------------------------
alter policy groups_read on public.groups using (
  id = any ((select private.group_ids_with_perm('view'))::uuid[])
  or (owner_id is null and (select private.is_principal()) and (select private.is_active_user()))
);

alter policy tasks_read on public.tasks using (
  group_id = any ((select private.group_ids_with_perm('view'))::uuid[])
  or (assignee_id = (select auth.uid()) and (select private.is_active_user()))
);

alter policy events_read on public.events using (
  group_id = any ((select private.group_ids_with_perm('view'))::uuid[])
);

alter policy members_read on public.group_members using (
  user_id = (select auth.uid())
  or group_id = any ((select private.group_ids_with_perm('view'))::uuid[])
);

alter policy log_read on public.activity_log using (
  (select private.is_admin())
  or (group_id is not null and group_id = any ((select private.group_ids_with_perm('view'))::uuid[]))
);

alter policy join_requests_read on public.join_requests using (
  requester_id = (select auth.uid())
  or group_id = any ((select private.group_ids_with_perm('manage_members'))::uuid[])
);

alter policy invitations_read on public.invitations using (
  (select private.is_admin())
  or ((select private.is_active_user()) and created_by = (select auth.uid()))
  or (group_id is not null and group_id = any ((select private.group_ids_with_perm('manage_members'))::uuid[]))
);

-- 4. Lịch Google và hồ sơ cuộc họp -----------------------------------------------------------
alter policy calendar_events_read on public.calendar_events using (
  source_id = any ((select private.visible_calendar_source_ids())::uuid[])
);

alter policy meeting_items_read on public.meeting_items using (
  source_id = any ((select private.visible_calendar_source_ids())::uuid[])
);

alter policy meeting_records_read on public.meeting_records using (
  source_id = any ((select private.visible_calendar_source_ids())::uuid[])
);

-- 5. Dữ liệu của riêng tôi: chỉ bọc auth.uid() và is_active_user() --------------------------
alter policy profiles_read on public.profiles using (
  (select private.is_active_user()) or id = (select auth.uid())
);
alter policy profiles_update_self on public.profiles
  using (id = (select auth.uid()) and (select private.is_active_user()))
  with check (id = (select auth.uid()));

alter policy notifications_read on public.notifications using (user_id = (select auth.uid()));
alter policy notifications_update on public.notifications
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy notifications_delete on public.notifications using (user_id = (select auth.uid()));

alter policy bookings_read on public.bookings using (
  (select private.is_active_user())
  and (requester_id = (select auth.uid()) or host_id = (select auth.uid()) or (select private.is_admin()))
);
alter policy bookings_update on public.bookings
  using ((select private.is_active_user())
    and (requester_id = (select auth.uid()) or host_id = (select auth.uid()) or (select private.is_admin())))
  with check ((select private.is_active_user())
    and (requester_id = (select auth.uid()) or host_id = (select auth.uid()) or (select private.is_admin())));

alter policy booking_pages_insert on public.booking_pages
  with check (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy booking_pages_update on public.booking_pages
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid()));

alter policy personal_items_read on public.personal_items using (
  (select private.is_active_user()) and (owner_id = (select auth.uid()) or assigned_by = (select auth.uid()))
);
alter policy personal_items_update on public.personal_items
  using ((select private.is_active_user()) and (owner_id = (select auth.uid()) or assigned_by = (select auth.uid())))
  with check (owner_id = (select auth.uid()) or assigned_by = (select auth.uid()));
alter policy personal_items_delete on public.personal_items using (
  (select private.is_active_user()) and (owner_id = (select auth.uid()) or assigned_by = (select auth.uid()))
);

alter policy attendance_own_read on public.attendance_checkins
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy attendance_own_update on public.attendance_checkins
  using (user_id = (select auth.uid()) and (select private.is_active_user()))
  with check (user_id = (select auth.uid())
    and day >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 31)
    and day <= ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 7));
alter policy attendance_own_insert on public.attendance_checkins
  with check (user_id = (select auth.uid()) and (select private.is_active_user())
    and day >= ((now() at time zone 'Asia/Ho_Chi_Minh')::date - 31)
    and day <= ((now() at time zone 'Asia/Ho_Chi_Minh')::date + 7));
alter policy attendance_own_delete on public.attendance_checkins using (user_id = (select auth.uid()));

alter policy attendance_punches_own on public.attendance_punches
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy attendance_punches_own_delete on public.attendance_punches using (user_id = (select auth.uid()));
alter policy attendance_punch_sync_own on public.attendance_punch_sync
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy attendance_punch_sync_own_delete on public.attendance_punch_sync using (user_id = (select auth.uid()));

alter policy jira_accounts_own on public.jira_accounts
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy jira_accounts_own_delete on public.jira_accounts using (user_id = (select auth.uid()));
alter policy jira_issues_own on public.jira_issues
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy jira_issues_own_delete on public.jira_issues using (user_id = (select auth.uid()));
alter policy jira_worklogs_own on public.jira_worklogs
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy jira_worklogs_own_delete on public.jira_worklogs using (user_id = (select auth.uid()));
alter policy jira_mentions_own on public.jira_mentions
  using (user_id = (select auth.uid()) and (select private.is_active_user()));
alter policy jira_mentions_own_delete on public.jira_mentions using (user_id = (select auth.uid()));

-- 6. Chỉ mục cho khóa ngoại còn thiếu (khuyến nghị của Supabase) ------------------------------
create index if not exists groups_parent_idx on public.groups (parent_id);
create index if not exists join_requests_requester_idx on public.join_requests (requester_id);
create index if not exists join_requests_task_idx on public.join_requests (task_id);
create index if not exists invitations_group_idx on public.invitations (group_id);
