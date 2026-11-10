# Hệ thống quản trị công việc UEB

Web app tiếng Việt để Hiệu trưởng và tổ thư ký theo dõi nhóm, dự án, sự kiện, cuộc họp, tài liệu và đầu việc. Ứng dụng không gọi dịch vụ AI nào khi chạy.

- Mã nguồn: GitHub (repo này)
- Triển khai web: Vercel (Next.js)
- Đăng nhập và cơ sở dữ liệu: Supabase (Postgres, phân quyền bằng Row Level Security)

## Tình trạng

| Giai đoạn | Nội dung | Trạng thái |
| --- | --- | --- |
| 1. Nền tảng | Đăng nhập bằng mã gửi qua email trường, người dùng, lời mời, nhóm, quyền theo nhóm, RLS, nhật ký hoạt động, giao diện sáng/tối, dùng được trên điện thoại | Đang làm |
| 2. Nghiệp vụ | Dự án/sự kiện, mốc, đầu việc, trạng thái tùy chỉnh, cuộc họp, tài liệu Drive dạng liên kết, Jira dạng liên kết, tìm kiếm | Chưa làm |
| 3. Cá nhân và nhắc việc | Dashboard của tôi, Việc của tôi, Lịch, Trang đặt lịch, Trợ lý công việc theo quy tắc, tổng quan, xuất Excel, nhắc việc | Chưa làm |
| 4. Bàn giao | Phiên bàn giao quản trị, xuất dữ liệu bàn giao | Chưa làm |
| 5. Tích hợp | Google Calendar (chỉ đọc), Google Drive, Jira (chỉ đọc), khi được cấp quyền | Chưa làm |

## Tài liệu

- [Cấu hình và triển khai](docs/cau-hinh.md): tạo Supabase, Vercel, biến môi trường.
- [Phân quyền](docs/phan-quyen.md): vai trò, quyền theo nhóm và cách cơ sở dữ liệu kiểm tra.
- [Vận hành](docs/van-hanh.md): mời người dùng, khóa tài khoản, xem nhật ký, sao lưu.

## Chạy trên máy

```bash
npm install
cp .env.example .env.local   # điền giá trị, không commit file này
npm run dev
```

Kiểm thử phân quyền cơ sở dữ liệu (cần Postgres 15+ cài trên máy, hoặc đặt `DATABASE_URL`):

```bash
npm run test:db
```

## Nguyên tắc an toàn

- Không đưa mật khẩu, API key, token hay file `.env` lên GitHub. Repo này đang để công khai.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng ở máy chủ, không bao giờ có tiền tố `NEXT_PUBLIC_`.
- Mọi quyền được kiểm tra ở cơ sở dữ liệu bằng RLS; giao diện chỉ ẩn/hiện nút.
