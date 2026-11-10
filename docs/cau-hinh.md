# Cấu hình và triển khai

Hướng dẫn cho người dựng hệ thống lần đầu hoặc người tiếp nhận. Tất cả giá trị bí mật nằm trong Vercel và Supabase, không nằm trong repo.

## 1. Tạo dự án Supabase

1. Tạo project mới tại supabase.com, khu vực **Southeast Asia (Singapore)**. Nên dùng tài khoản/tổ chức của đơn vị để dễ bàn giao.
2. Chạy migration trong `supabase/migrations` theo thứ tự tên file. Cách đơn giản nhất: mở **SQL Editor**, dán nội dung từng file và chạy. Hoặc dùng Supabase CLI:
   ```bash
   npx supabase link --project-ref <mã-project>
   npx supabase db push
   ```
3. **Authentication → Sign In / Providers → Email**: bật Email, bật "Confirm email".
4. **Authentication → Email Templates → Magic Link**: cho mẫu thư có cả mã và liên kết, ví dụ:
   ```html
   <h2>Đăng nhập Quản trị công việc UEB</h2>
   <p>Mã đăng nhập của bạn: <strong>{{ .Token }}</strong></p>
   <p>Hoặc bấm: <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Đăng nhập</a></p>
   ```
   Làm tương tự cho mẫu **Confirm signup** (lần đăng nhập đầu tiên của một người dùng dùng mẫu này).
   Supabase chỉ cho sửa mẫu thư khi đã khai báo SMTP riêng (bước 6). Nếu chưa sửa được, ứng dụng vẫn chạy với mẫu mặc định: thư chỉ có liên kết, người dùng phải mở liên kết trên chính trình duyệt đã bấm "Gửi mã đăng nhập".
5. **Authentication → URL Configuration**: Site URL = địa chỉ web trên Vercel; thêm `https://<địa-chỉ-web>/**` vào Redirect URLs (và `https://*-<tên-team>.vercel.app/**` nếu muốn thử trên bản Preview).
6. **Authentication → SMTP Settings**: khai báo hộp thư gửi của trường. Máy gửi thư mặc định của Supabase chỉ cho vài email mỗi giờ, không đủ dùng thật.
7. **Project Settings → API**: lấy Project URL, khóa `anon` (công khai) và khóa `service_role` (bí mật).

## 2. Tạo dự án Vercel

1. Import repo GitHub này vào Vercel (Framework: Next.js, giữ mặc định). `vercel.json` đặt máy chủ ở Singapore (`sin1`), cùng khu vực với Supabase, để trang tải nhanh từ Việt Nam.
2. **Settings → Environment Variables**: khai báo các biến ở bảng dưới cho Production và Preview.
3. Deploy. Mỗi pull request có một bản Preview riêng.

## 3. Biến môi trường

| Biến | Bí mật | Bắt buộc | Ý nghĩa |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Không | Có | Project URL của Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Không (bị RLS giới hạn) | Có | Khóa anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **Có** | Có | Khóa service_role, chỉ dùng ở máy chủ |
| `NEXT_PUBLIC_APP_URL` | Không | Có | Địa chỉ web, ví dụ `https://ueb-management.vercel.app` |
| `APP_TIMEZONE` | Không | Có | `Asia/Ho_Chi_Minh` |
| `ALLOWED_EMAIL_DOMAINS` | Không | Có | `vnu.edu.vn` (nhiều tên miền cách nhau bằng dấu phẩy) |
| `BOOTSTRAP_ADMIN_EMAIL` | Không | Lần đầu | `ntkling@vnu.edu.vn`. Chỉ có tác dụng khi hệ thống chưa có quản trị |

Module lịch Google dùng chung cần thêm `FEATURE_GOOGLE_CALENDAR`, `GOOGLE_SERVICE_ACCOUNT_JSON` (hoặc `GOOGLE_CALENDAR_API_KEY`) và `CRON_SECRET`: xem [google-calendar.md](google-calendar.md).

Các biến cho email, Google Drive và Jira (xem `.env.example`) dùng ở các giai đoạn sau và để trống cho tới khi được cấp quyền.

Tên miền cho phép cũng được lưu trong bảng `system_settings.allowed_email_domains`; cơ sở dữ liệu dùng giá trị này để chặn tài khoản ngoài tên miền. Nếu đổi `ALLOWED_EMAIL_DOMAINS`, đổi cả bảng này bằng SQL Editor.

## 4. Khởi tạo quản trị hệ thống

1. Đặt `BOOTSTRAP_ADMIN_EMAIL` trên Vercel rồi deploy.
2. Người có email đó mở trang đăng nhập, nhập email, nhập mã nhận được.
3. Tài khoản này trở thành quản trị hệ thống. Từ đó biến `BOOTSTRAP_ADMIN_EMAIL` không còn tác dụng; quyền quản trị chỉ chuyển được qua chức năng bàn giao (giai đoạn 4).
4. Quản trị vào **Người dùng** để mời Hiệu trưởng, thư ký và thành viên.
