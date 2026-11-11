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

Mỗi nhóm có hai vai trò: **Trưởng nhóm** (đủ mọi quyền) và **Văn thư**. Chỉ hai vai trò này mời, thêm và gỡ thành viên; quyền "quản lý thành viên" được tính tự động từ vai trò, không tích tay được. Văn thư chỉ thêm, sửa, gỡ thành viên thường; chỉ Trưởng nhóm, quản trị hệ thống và thư ký toàn trường bổ nhiệm hoặc gỡ Trưởng nhóm và Văn thư (trigger `guard_member_roles`).


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

## Đăng nhập, danh bạ nhóm và xin tham gia

- Ai có email thuộc tên miền được phép (`@vnu.edu.vn`) cũng tự đăng nhập được, là thành viên thường và chưa thuộc nhóm nào (`system_settings.open_signup`, mặc định bật; tắt thì quay về chỉ người được mời). Lời mời vẫn áp vai trò và nhóm như trước.
- Giới hạn người dùng cùng lúc: `system_settings.max_online` (mặc định 200). Mỗi lần mở trang, hàm `enter_app()` ghi lại thời điểm vào bảng `presence`; người mở trang trong 10 phút qua tính là đang dùng. Khi đủ người, người mới thấy trang "Hệ thống đang đông"; người đang dùng dở, quản trị, Hiệu trưởng và thư ký luôn vào được.
- Danh bạ nhóm: mọi người dùng đang hoạt động gọi được `group_directory()` (tên, mô tả, đơn vị quản lý, số thành viên, số việc mở), `group_contacts(id)` (Trưởng nhóm là lãnh đạo, Văn thư là đầu mối liên hệ, kèm email, điện thoại, phòng) và `group_open_task_titles(id)` (chỉ tên, hạn và đã có người phụ trách chưa). Tài liệu, mô tả việc, sản phẩm, lịch và danh sách thành viên vẫn do RLS giữ kín.
- Xin tham gia: `request_join(nhóm, việc?, lời nhắn)` tạo yêu cầu trong `join_requests` và báo cho Trưởng nhóm, Văn thư. Người có quyền quản lý thành viên duyệt bằng `decide_join_request`: nhận thì người xin vào nhóm với quyền mặc định (luôn có quyền xem); nếu xin một việc chưa có người phụ trách và người duyệt có quyền sửa thì được giao luôn việc đó. Người xin tự hủy bằng `cancel_join_request`. Không ghi thẳng vào bảng được.

## Dự án và việc chung nhiều đơn vị

- Bảng `group_units` gắn một dự án, sự kiện hoặc không gian với nhiều đơn vị/tổ cùng làm. Ai sửa được dự án thì gắn, gỡ được đơn vị; chỉ gắn vào nhóm loại Đơn vị đang hoạt động. Trưởng nhóm, Văn thư của đơn vị được gắn nhận thông báo.
- Dự án tự hiện trong mục "Dự án liên đơn vị" của từng đơn vị được gắn. Việc gắn không cấp quyền xem: người của đơn vị thấy thông tin như danh bạ và xin tham gia được.
- Trong trang đơn vị, "Việc chung nhiều đơn vị" tạo một không gian con (`create_subgroup`) rồi gắn đơn vị đó cùng các đơn vị đã chọn.

## Kiểm thử

`supabase/tests/10_phan_quyen.sql` đăng nhập giả lập từng vai trò và kiểm tra các trường hợp được phép và bị chặn. Chạy bằng `npm run test:db`; CI chạy lại mỗi lần có pull request.
