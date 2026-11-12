-- Kiểm thử dữ liệu máy chấm công: chỉ máy chủ ghi, mỗi người chỉ đọc của mình, ghi đè theo khoảng ngày.
\set ON_ERROR_STOP 1

\set tv4 '''00000000-0000-0000-0000-0000000000d4'''
\set tv5 '''00000000-0000-0000-0000-0000000000d5'''

create temp table saved as select 0 as n;
grant all on saved to service_role;
set role service_role;
update saved set n = public.attendance_save_punches(:tv4, $${
  "from": "2026-11-01", "to": "2026-11-30", "sourceSyncedAt": "2026-11-12T08:00:00+07:00", "excuseError": false,
  "me": {"username": "tv4", "name": "Thành viên 4", "unit": "Phòng A", "title": "Chuyên viên"},
  "rows": [
    {"day": "2026-11-03", "inAm": "07:58", "outAm": "11:40", "inPm": "13:20", "outPm": "17:05", "errorCount": 0},
    {"day": "2026-11-04", "inAm": "08:20", "outAm": "11:40", "violationAm": "Đi muộn 20'", "minutesLate": 20, "minutesConverted": 20, "errorCount": 1, "violationPm": "Không chấm"},
    {"day": "2026-11-05", "inAm": "7h", "excuseAm": "NP-12 · Nghỉ phép năm"},
    {"day": "2026-12-01", "inAm": "08:00"}
  ]
}$$);
reset role;
select t.ok((select n from saved) = 3, 'lưu 3 ngày trong khoảng, bỏ ngày ngoài khoảng');

set role authenticated;
select set_config('request.jwt.claim.sub', :tv4, false);
select t.ok(t.count('select * from public.attendance_punches') = 3, 'chủ thấy dữ liệu của mình');
select t.ok((select in_am is null and excuse_am = 'NP-12 · Nghỉ phép năm' from public.attendance_punches where day = '2026-11-05'), 'giờ sai định dạng bị bỏ');
select t.ok((select error_count = 1 and violation_pm = 'Không chấm' from public.attendance_punches where day = '2026-11-04'), 'giữ vi phạm, số lỗi');
select t.ok((select row_count = 3 and punch_username = 'tv4' from public.attendance_punch_sync), 'ghi lần đồng bộ');
select t.denied($$insert into public.attendance_punches (user_id, day) values (auth.uid(), '2026-11-06')$$, 'người dùng không tự ghi');
select t.denied($$update public.attendance_punches set error_count = 0$$, 'người dùng không tự sửa');
select t.denied(format($$select public.attendance_save_punches(%L, '{"from":"2026-11-01","to":"2026-11-02"}')$$, :tv4), 'người dùng không gọi hàm lưu');

select set_config('request.jwt.claim.sub', :tv5, false);
select t.ok(t.count('select * from public.attendance_punches') = 0, 'người khác không thấy');
select t.ok(t.count('select * from public.attendance_punch_sync') = 0, 'người khác không thấy lần đồng bộ');
reset role;

-- Đồng bộ lại một khoảng nhỏ hơn: chỉ ghi đè trong khoảng đó.
set role service_role;
select public.attendance_save_punches(:tv4, '{"from":"2026-11-04","to":"2026-11-04","rows":[{"day":"2026-11-04","inAm":"07:55","outAm":"11:35","inPm":"13:25","outPm":"17:02"}]}');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', :tv4, false);
select t.ok(t.count('select * from public.attendance_punches') = 3, 'ngày ngoài khoảng giữ nguyên');
select t.ok((select error_count = 0 and violation_pm is null from public.attendance_punches where day = '2026-11-04'), 'ngày trong khoảng được ghi đè');
select t.ok((select range_from = '2026-11-01' and range_to = '2026-11-30' and row_count = 3 from public.attendance_punch_sync), 'khoảng đã có được giữ');
-- Chủ tự xóa dữ liệu của mình.
delete from public.attendance_punches;
select t.ok(t.count('select * from public.attendance_punches') = 0, 'chủ tự xóa được');
reset role;
