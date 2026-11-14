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

## Xuất báo cáo Excel và chia sẻ cho người liên quan

- Thẻ **Báo cáo Excel** trên trang Jira của tôi (`/jira?muc=bao-cao`) xuất file `.xlsx` (route `/jira/xuat`) cho: chỉ mình, một nhóm/dự án/đơn vị, mọi người liên quan, hoặc từng người được chọn; kỳ báo cáo tùy chọn. File có 6 trang: Tổng hợp theo người, Theo tháng, Sản phẩm đã nộp, Theo loại sản phẩm, Worklog, Mã việc. File được dựng bằng `src/lib/xlsx.ts`, không cần thư viện ngoài.
- Dữ liệu người khác chỉ có khi chính họ bật **Chia sẻ dữ liệu Jira của tôi**: cho Trưởng nhóm, Văn thư các nhóm mình tham gia (`leads`) hoặc mọi thành viên nhóm chung (`members`). Mặc định `none`. Không tính không gian cá nhân và nhóm đã lưu trữ.
- Người được chia sẻ chỉ đọc qua các hàm `jira_related_people`, `jira_related_issues`, `jira_related_worklogs` (migration `20261112000001_chia_se_jira.sql`), không có comment, lời nhắc tên, lịch sử trạng thái. Bảng gốc vẫn chỉ chủ đọc được. Kiểm thử: `supabase/tests/99_chia_se_jira.sql`.
- Mọi bảng trên trang (Tất cả mã Jira, Worklog, Sản phẩm, Chấm công, kiểu xem Bảng của Lịch) dùng chung `src/components/table/DataTable.tsx`: lọc từng cột, sắp xếp, chọn cột hiển thị (nhớ trên máy), mở rộng dòng, cộng tổng và tải Excel đúng phần đang lọc.

## Dữ liệu máy chấm công của trường

Hệ thống chấm công (`https://chamcong4lan.ueb.edu.vn/ChamCong/BaoCao`) nằm trong mạng của trường, máy chủ web không gọi tới được. Vì vậy dùng lại nút "Đồng bộ Jira → UEB":

- Bấm nút khi đang mở trang Báo cáo chấm công (đã đăng nhập). Mã `/api/jira/nut` nhận ra trang chấm công, gọi `GET /api/chamcong/bao-cao?tu=&den=` của chính trang đó theo từng tháng (3 tháng gần nhất), chỉ giữ dòng của người đăng nhập (theo email ở `#userEmailDisplay` hoặc họ tên ở `#userNameDisplay`), rồi gửi về `POST /api/jira/cham-cong` kèm mã đồng bộ.
- Máy chủ chọn lại đúng tài khoản chấm công (trùng tên đăng nhập Jira, phần trước @ của email, hoặc họ tên khớp hồ sơ nếu chỉ một người trùng tên) trước khi lưu, nên không lưu dữ liệu của người khác. Lưu bằng `attendance_save_punches` (chỉ service role), ghi đè đúng khoảng ngày vừa gửi.
- Bảng `attendance_punches` (mỗi ngày một dòng: giờ vào/ra sáng chiều, vi phạm, giải trình, phút quy đổi, số lỗi) và `attendance_punch_sync` (lần đồng bộ gần nhất, cờ `excuse_error` khi hệ thống chấm công báo không đọc được đơn nghỉ). RLS: chỉ chủ đọc và xóa.
- Để tab chấm công mở thì nút tự đồng bộ lại tháng hiện tại mỗi 10 phút; trang Lịch → Chấm công tự làm mới mỗi phút. Muốn thật sự thời gian thực mà không cần mở tab thì cần trường mở API cho máy chủ web, hoặc một máy trong mạng trường chạy đồng bộ định kỳ.
- Trang Chấm công cảnh báo: ngày có lỗi chưa giải trình (kèm đối chiếu đơn nghỉ trên Jira: đã duyệt nhưng máy chưa ghi nhận, đang chờ duyệt, hay chưa có đơn), hệ thống chấm công không đọc được đơn nghỉ, dữ liệu máy chấm công cũ hơn 1 ngày.

## Mã Jira trên đầu việc

- Mỗi đầu việc trong nhóm, dự án, đơn vị (không phải việc **Cá nhân**) có dòng **+ Gắn mã Jira**: dán link Jira hoặc gõ mã (ví dụ `KKTPT-7377`), Enter là lưu; để trống rồi Enter là bỏ mã. Người sửa được việc và người được giao đều gắn được.
- Cột `tasks.jira_key`, `tasks.jira_url` (migration `20261114000001_jira_dau_viec.sql`); trigger `tasks_jira` chặn gắn mã cho việc Cá nhân. Kiểm thử: `supabase/tests/99_zzzzz_jira_dau_viec.sql`.
- Sau khi gắn, trang Việc và trang nhóm đối chiếu mã với **Jira của tôi** của chính người xem (`src/lib/jira/brief.ts`) để hiện loại (Task/Work/Sub-task), trạng thái, việc cha ("thuộc …": việc cha của sub-task hoặc liên kết Gantt *is child task of*), số việc con xong, giờ mình đã log. Mã không có trong dữ liệu của người xem thì chỉ hiện mã và link.
- Hệ thống không tạo hay sửa issue trên Jira.

## Cây công việc Jira (dùng chung)

- Trang `/jira/cay` (trang Jira của tôi → thẻ **Cây công việc**) hiện Task của các đơn vị > Work > Sub-task, chia theo dự án Jira (đơn vị); lọc theo đơn vị, tìm theo mã/tên/người làm, ẩn cây đã xong. Mỗi dòng có các đầu việc trên web đang gắn mã đó.
- Mỗi lần ai đó đồng bộ Jira, `collectMyJira` đọc thêm việc cha (cha của sub-task, hoặc liên kết Gantt *is child task of*) và các việc con (*is parent task of*, sub-task), tối đa 3 vòng và 800 mã, rồi ghi vào bảng dùng chung `jira_tree` qua `jira_save_tree` (migration `20261114000002_cay_cong_viec_jira.sql`). Lỗi ở bước này không làm hỏng lần đồng bộ.
- `jira_tree` chỉ có mã, tên, loại, trạng thái, đơn vị, người được giao, hạn, việc cha; không có worklog, comment, mô tả; bỏ đơn nghỉ phép, làm ngoài giờ. Mọi tài khoản đang hoạt động xem được. Mã không ai đồng bộ lại trong 120 ngày tự bị xóa. Kiểm thử: `supabase/tests/99_zzzzzz_cay_cong_viec_jira.sql`.
- Ô mã Jira trên đầu việc cũng dùng `jira_tree` khi mã không có trong Jira của tôi, và có link **Xem cây**.
