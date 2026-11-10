-- Hồ sơ cá nhân: thêm thông tin liên hệ và giới thiệu. Mọi người dùng đang hoạt động
-- xem được hồ sơ của nhau (chính sách profiles_read sẵn có); mỗi người chỉ tự sửa hồ sơ mình.

alter table public.profiles
  add column phone text check (length(phone) <= 30),
  add column office text check (length(office) <= 120),
  add column bio text check (length(bio) <= 2000);

grant update (phone, office, bio) on public.profiles to authenticated;
