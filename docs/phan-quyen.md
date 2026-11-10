# Phân quyền

Quyền có hai lớp: vai trò hệ thống (gắn với người dùng) và quyền trong nhóm (gắn với từng lần tham gia nhóm). Giao diện chỉ ẩn/hiện nút; việc chặn thật sự do chính sách RLS trong Postgres thực hiện, nên gọi API trực tiếp cũng không vượt được.

## Vai trò hệ thống

| Vai trò | Phạm vi |
| --- | --- |
| Quản trị hệ thống (một người, lưu ở `system_settings.current_admin_id`) | Toàn bộ dữ liệu; mời người dùng, đổi vai trò, khóa tài khoản, cấp phạm vi thư ký; khởi tạo bàn giao |
| Hiệu trưởng | Xem, tạo, sửa ở mọi nhóm; xem nhật ký; không quản lý thành viên |
| Thư ký | Tạo nhóm mới (trở thành người quản lý nhóm đó); quản lý các nhóm mình là người quản lý. Nếu được cấp "toàn trường": quản lý mọi nhóm |
| Thành viên | Theo quyền trong từng nhóm |

## Quyền trong nhóm

Mỗi dòng `group_members` có 5 quyền: xem, tạo, sửa, tải/gắn tài liệu, quản lý thành viên. Người quản lý nhóm luôn có đủ 5 quyền (trigger tự bật). Nhóm có bộ quyền mặc định cho thành viên mới.

## Hàm kiểm tra quyền

Nằm trong schema `private` (không mở qua API):

- `private.is_admin()`, `private.is_principal()`, `private.is_all_scope_secretary()`
- `private.has_group_perm(group_id, perm)`: quyền `view | create | edit | upload | manage_members` trong nhóm
- Tài khoản bị khóa (`profiles.is_active = false`) không có quyền nào.

Đổi vai trò và phạm vi thư ký chỉ qua hàm `admin_set_user` và `admin_set_secretary_scope`, cả hai kiểm tra quyền quản trị. Người dùng chỉ tự sửa được họ tên, đơn vị, chức vụ của mình.

## Đầu việc, lịch, đặt lịch, thông báo

| Bảng | Xem | Tạo | Sửa / xóa |
| --- | --- | --- | --- |
| `tasks` | quyền xem nhóm, hoặc là người được giao | quyền tạo trong nhóm | quyền sửa trong nhóm; người được giao (không có quyền sửa) chỉ đổi được trạng thái |
| `events` | quyền xem nhóm | quyền tạo trong nhóm | quyền sửa trong nhóm |
| `booking_pages` | mọi người dùng đang hoạt động | chính chủ | chính chủ |
| `bookings` | người đặt, người nhận, quản trị | người đặt (luôn ở trạng thái chờ) | người nhận đồng ý/từ chối; người đặt chỉ hủy; không sửa nội dung đã gửi; không đồng ý hai lịch trùng giờ |
| `notifications` | chỉ người nhận | chỉ trigger | người nhận đánh dấu đã đọc hoặc xóa |

Người được giao việc phải là thành viên nhóm (hoặc Hiệu trưởng, quản trị, thư ký toàn trường). Người khác chỉ thấy giờ bận của người nhận lịch qua hàm `booking_busy`, không thấy nội dung.

## Lịch sử và nhật ký

- Mọi bảng có `created_by`, `created_at`, `updated_by`, `updated_at`, do trigger điền; người dùng không sửa được.
- Mọi thêm/sửa/xóa được ghi vào `activity_log` kèm dữ liệu trước và sau. Không ai sửa hay xóa được nhật ký.

## Kiểm thử

`supabase/tests/10_phan_quyen.sql` đăng nhập giả lập từng vai trò và kiểm tra các trường hợp được phép và bị chặn. Chạy bằng `npm run test:db`; CI chạy lại mỗi lần có pull request.
