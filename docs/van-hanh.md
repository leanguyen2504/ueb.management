# Vận hành

## Mời người dùng

- Quản trị hệ thống: **Người dùng → Mời người dùng**, nhập một hoặc nhiều email, chọn vai trò.
- Người quản lý nhóm: trong trang nhóm, **Thêm thành viên bằng email**. Nếu người đó chưa có tài khoản, hệ thống tạo lời mời; lần đầu đăng nhập họ tự vào nhóm.
- Chỉ người được mời mới đăng nhập được. Mọi người dùng đang hoạt động đều mời được đồng nghiệp @vnu.edu.vn trong mục **Mời đồng nghiệp**, kèm một nhóm đề xuất (trong số nhóm mình xem được); người được mời vào nhóm đó với quyền mặc định của nhóm. Quản trị hệ thống mời được mọi vai trò trong trang Người dùng. Lời mời có hạn 30 ngày.

## Khóa tài khoản

**Người dùng**, bỏ tích "Hoạt động", bấm Lưu. Tài khoản bị khóa vẫn còn trong hệ thống (để giữ lịch sử) nhưng không xem được dữ liệu nào.

## Nhật ký

Quản trị và Hiệu trưởng xem **Nhật ký** để biết ai thay đổi gì, lúc nào. Thành viên xem hoạt động gần đây ngay trong trang nhóm.

## Sao lưu và khôi phục

- Supabase gói Pro sao lưu hằng ngày; gói miễn phí không có, và dự án miễn phí bị tạm dừng sau một tuần không truy cập.
- Tự sao lưu bất cứ lúc nào: `pg_dump` bằng chuỗi kết nối trong **Project Settings → Database**, lưu file ở nơi an toàn của đơn vị (không đưa lên GitHub).
- Khôi phục sang project mới: chạy migration, rồi nạp dữ liệu từ bản sao lưu; cập nhật biến môi trường trên Vercel trỏ sang project mới.
