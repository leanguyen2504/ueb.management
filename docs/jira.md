# Jira của tôi (dữ liệu Jira cá nhân, chỉ đọc)

Trang `/jira` (menu tài khoản → **Jira của tôi**) cho mỗi người quản lý đầu việc Jira **của chính mình**, chia thành các thẻ:

- **Cần làm**: việc được giao chưa xong, xếp theo hạn (quá hạn tô đỏ, đến hạn trong 7 ngày tô vàng) rồi độ ưu tiên; kèm mục "Đang làm nhưng tuần này chưa log work".
- **Đang chờ tôi**: comment nhắc tên mình mà mình chưa comment lại; việc của mình đang chặn việc khác.
- **Đang chờ người khác**: việc của mình bị việc khác chặn; việc mình tạo hoặc theo dõi mà người khác đang làm.
- **Đã làm**: sản phẩm đã nộp và giờ quy đổi theo tháng, số lần bị trả lại.
- **Worklog**: giờ log theo tuần hoặc theo tháng (12 kỳ gần nhất).
- **Tất cả mã Jira**: lọc theo được giao, tự tạo, theo dõi, có worklog, nhắc tên.

Mỗi đầu việc hiện: trạng thái và số ngày ở trạng thái đó, hạn, ưu tiên, ngày bắt đầu, thời gian còn lại/ước tính, giờ mình đã log, việc con xong/tổng, số lần bị trả lại, việc cha, epic, sprint, đợt (fix version), thành phần, nhãn, việc đang chờ/đang chặn, comment mới nhất.

Không lấy worklog hay comment của đồng nghiệp, kể cả khi Jira cho phép người đó xem. Dữ liệu chỉ chủ tài khoản đọc được (RLS); quản trị, Hiệu trưởng và thư ký cũng không xem được. Hệ thống chỉ đọc Jira, không ghi gì lên Jira.

## Hai cách đưa dữ liệu lên

| | Nút "Đồng bộ Jira" (bookmarklet) | Đồng bộ tự động |
| --- | --- | --- |
| Chạy ở đâu | Trình duyệt của người dùng, trên trang Jira | Máy chủ web (Vercel), mỗi sáng 5 giờ 30 và khi bấm "Đồng bộ ngay" |
| Điều kiện | Mở được Jira (kể cả chỉ trong mạng trường) | Jira phải mở ra Internet; `FEATURE_JIRA=true` |
| Đăng nhập Jira | Dùng phiên đăng nhập Jira sẵn có, mật khẩu không rời trình duyệt | Personal Access Token của từng người, mã hóa AES-256-GCM bằng `TOKEN_ENCRYPTION_KEY` |
| Xác thực với web | Mã đồng bộ riêng (chỉ lưu bản băm SHA-256) | Phiên đăng nhập web |

### Nút "Đồng bộ Jira"

1. Vào **Jira của tôi → Tạo nút**, kéo nút đỏ **Đồng bộ Jira → UEB** lên thanh dấu trang.
2. Mở Jira của trường, đăng nhập, bấm dấu trang. Một khung nhỏ góc phải hiện tiến độ; xong sẽ có link quay về web.

Nút nạp mã từ `/api/jira/nut` (mã thu thập nằm ở `src/lib/jira/collect.ts`), đọc Jira REST API v2 bằng cookie của trang Jira, rồi gửi về `/api/jira/nhap`. Mỗi lần gửi thay toàn bộ dữ liệu cũ của người đó. Tạo lại nút thì nút cũ hết hiệu lực.

### Đồng bộ tự động

Chỉ bật khi máy chủ Vercel gọi được Jira (thử: mở địa chỉ Jira bằng 4G, không qua wifi trường).

1. Đặt trên Vercel: `JIRA_BASE_URL` (ví dụ `http://<máy chủ Jira>:8080`), `FEATURE_JIRA=true`, `TOKEN_ENCRYPTION_KEY` (tạo bằng `openssl rand -base64 32`, bí mật), `CRON_SECRET`.
2. Mỗi người tạo token trong Jira: ảnh đại diện → **Profile → Personal Access Tokens → Create token** (Jira 8.14 trở lên), rồi dán vào trang Jira của tôi. Có thể thu hồi token trong Jira bất cứ lúc nào.

## Dữ liệu lấy về

Truy vấn JQL (trong 400 ngày gần nhất, cộng mọi việc đang mở được giao):

```
assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()
OR worklogAuthor = currentUser() OR comment ~ "<tên đăng nhập>"
```

- **Worklog**: chỉ các dòng có tác giả là mình.
- **Việc của tôi**: được giao cho mình hoặc mình có log work (Jira của trường thường giao việc cho người duyệt, người làm là người log work).
- **Sản phẩm đã nộp**: việc của tôi đã sang nhóm trạng thái "Xong" (statusCategory = done), tính theo tháng hoàn thành, kèm bảng theo loại sản phẩm.
- **Giờ quy đổi**: lấy từ trường tùy chỉnh có tên chứa "quy đổi"; không có thì trường "Sản phẩm", đọc số giờ ở cuối giá trị (ví dụ "5-Biên bản loại 1-1h" là 1 giờ). Nếu tên khác, đặt `JIRA_CONVERTED_HOURS_FIELD` bằng đúng tên trường. Trang hiện danh sách tên các trường tùy chỉnh đang có để dễ chọn.
- **Comment nhắc tên**: comment của người khác có `[~tên đăng nhập]`; "đã trả lời" khi mình có comment trên mã đó sau lời nhắc.
- **Ngày bắt đầu**: trường tùy chỉnh có tên chứa "Start date" hoặc "Ngày bắt đầu". **Epic**: trường "Epic Link". **Sprint**: trường "Sprint" (lấy sprint cuối).
- **Bị chặn / đang chặn**: liên kết loại "Blocks" (chỉ tính việc bên kia chưa xong).
- **Lịch sử trạng thái**: lấy từ changelog (30 lần chuyển gần nhất). "Bị trả lại" là lần chuyển từ trạng thái nhóm Xong về trạng thái chưa xong.

Mỗi người có thể bấm **Ngắt kết nối và xóa dữ liệu Jira đã lưu** để xóa token, mã đồng bộ và toàn bộ dữ liệu.
