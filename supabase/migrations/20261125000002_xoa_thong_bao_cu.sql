-- Tự xóa thông báo thường (danh sách dưới "Cần xử lý ngay") sau 45 ngày không đụng đến,
-- để đỡ tốn dung lượng. "Không đụng đến" = tạo và lần đọc gần nhất (nếu có) đều đã quá 45 ngày.
-- Nhắc việc gấp/đến hạn không lưu trong bảng này (tính trực tiếp) nên không bị ảnh hưởng.

create index if not exists notifications_created_idx on public.notifications (created_at);

create or replace function private.xoa_thong_bao_cu()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.notifications
  where created_at < now() - interval '45 days'
    and coalesce(read_at, created_at) < now() - interval '45 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function private.xoa_thong_bao_cu() from public, anon, authenticated;

-- Chạy mỗi ngày lúc 3:00 sáng giờ Việt Nam (20:00 UTC). Chạy lại file này chỉ cập nhật lịch, không tạo trùng.
-- Postgres không có pg_cron (ví dụ Postgres tạm khi kiểm thử) thì bỏ qua bước hẹn giờ.
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('xoa-thong-bao-cu', '0 20 * * *', 'select private.xoa_thong_bao_cu()');
  end if;
end;
$do$;
