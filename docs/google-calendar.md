# Module Google Calendar (lịch dùng chung, chỉ đọc)

Hệ thống đọc một hoặc nhiều lịch Google dùng chung (ví dụ "Lịch tuần BGH UEB") và hiện các buổi họp trên trang Lịch. Hệ thống **chỉ đọc**, không tạo, sửa hay xóa gì bên Google. Module tắt mặc định và chỉ chạy khi `FEATURE_GOOGLE_CALENDAR=true`.

## Cách hoạt động

- Quản trị hệ thống thêm lịch tại **Tài khoản → Cấu hình lịch Google dùng chung** (`/quan-tri/lich-google`), bằng mã lịch hoặc dán link lịch dùng chung.
- Máy chủ đọc lịch qua Google Calendar API, lưu các buổi họp từ 30 ngày trước đến 180 ngày sau vào bảng `calendar_events`. Buổi họp lặp lại được Google trải ra từng lần.
- Lịch được tải lại khi có người mở trang Lịch (nếu bản lưu đã cũ hơn 10 phút), khi quản trị bấm "Tải lại ngay", và mỗi sáng 5 giờ bằng Vercel Cron.
- Mỗi lịch có mục **Tính là giờ bận của**: chọn những người (ví dụ Hiệu trưởng) mà trang đặt lịch phải ẩn các giờ trùng với buổi họp trong lịch này.
- Mỗi lịch có quyền xem riêng: **Hiệu trưởng, thư ký và quản trị** (mặc định) hoặc **Mọi người dùng**. Quyền được kiểm tra bằng RLS trong cơ sở dữ liệu.

## Hai cách cấp quyền đọc lịch

| | Tài khoản dịch vụ (khuyên dùng) | API key |
| --- | --- | --- |
| Dùng khi | Lịch riêng tư, có người quản lý chia sẻ lịch | Lịch đã để **công khai** |
| Biến môi trường | `GOOGLE_SERVICE_ACCOUNT_JSON` (bí mật) | `GOOGLE_CALENDAR_API_KEY` |
| Cần làm bên lịch | Chia sẻ lịch cho email tài khoản dịch vụ | Không |

Nếu khai báo cả hai, hệ thống dùng tài khoản dịch vụ.

**Không cần khóa nếu lịch công khai:** khi không có biến nào ở trên, hệ thống đọc lịch qua địa chỉ iCal công khai của Google (`/calendar/ical/<mã lịch>/public/basic.ics`). Chỉ cần bật module và thêm mã lịch. Cách này không có link "Mở trên Google Calendar" cho từng buổi họp.

## Bước 1. Tạo project Google Cloud và bật Calendar API

1. Mở <https://console.cloud.google.com/>, đăng nhập bằng tài khoản sẽ quản lý lâu dài (nên là tài khoản của đơn vị để dễ bàn giao).
2. Chọn **Select a project → New project**, đặt tên ví dụ `ueb-management`, bấm **Create**.
3. Vào **APIs & Services → Library**, tìm **Google Calendar API**, bấm **Enable**.

Không cần khai báo màn hình xin quyền (OAuth consent screen) cho cách này.

## Bước 2a. Tạo tài khoản dịch vụ và khóa

1. **IAM & Admin → Service Accounts → Create service account**. Tên: `ueb-lich`. Bỏ qua phần cấp vai trò (không cần vai trò nào), bấm **Done**.
2. Bấm vào tài khoản vừa tạo, mở thẻ **Keys → Add key → Create new key → JSON**. Trình duyệt tải về một file `.json`.
3. Ghi lại email của tài khoản dịch vụ (dạng `ueb-lich@ueb-management.iam.gserviceaccount.com`).

File `.json` là chìa khóa bí mật: không gửi qua chat, email, không đưa lên GitHub. Nếu Google báo "Service account key creation is disabled", tổ chức Google Cloud đang chặn tạo khóa; khi đó dùng project ở tài khoản không thuộc tổ chức, hoặc nhờ quản trị Google Cloud tắt chính sách `iam.disableServiceAccountKeyCreation` cho project này.

## Bước 2b. Chia sẻ lịch cho tài khoản dịch vụ

Người có quyền **Thay đổi và quản lý việc chia sẻ** của lịch làm:

1. Mở Google Calendar, rê chuột vào lịch (ví dụ "Lịch tuần BGH UEB") → dấu ba chấm → **Cài đặt và chia sẻ**.
2. Mục **Chia sẻ với những người hoặc nhóm cụ thể → Thêm người**, dán email tài khoản dịch vụ, chọn quyền **Xem tất cả chi tiết sự kiện**, bấm **Gửi**.
3. Kéo xuống mục **Tích hợp lịch**, chép **Mã lịch**.

Nếu lịch thuộc tài khoản @vnu.edu.vn và Google báo không chia sẻ được ra ngoài tổ chức, quản trị Google Workspace của trường cần cho phép chia sẻ lịch ra ngoài, hoặc dùng cách API key nếu lịch đã công khai.

## Bước 2 (thay thế). API key cho lịch công khai

1. **APIs & Services → Credentials → Create credentials → API key**.
2. Bấm vào key, mục **API restrictions** chọn **Restrict key → Google Calendar API**, lưu.

## Bước 3. Khai báo trên Vercel

**Project → Settings → Environment Variables**, cho Production (và Preview nếu muốn thử):

| Biến | Giá trị |
| --- | --- |
| `FEATURE_GOOGLE_CALENDAR` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Mở file `.json` bằng Notepad, chép **toàn bộ** nội dung, dán vào. Đánh dấu Sensitive. |
| `GOOGLE_CALENDAR_API_KEY` | (chỉ khi dùng API key) |
| `CRON_SECRET` | Chuỗi ngẫu nhiên dài, để Vercel Cron gọi `/api/cron/dong-bo-lich` |

Sau đó **Deployments → Redeploy** để biến mới có hiệu lực.

## Bước 4. Thêm lịch vào hệ thống

1. Đăng nhập bằng tài khoản quản trị, vào **Tài khoản → Cấu hình lịch Google dùng chung**.
2. Dán mã lịch hoặc link lịch dùng chung, đặt tên hiển thị, chọn ai được xem, bấm **Thêm lịch**. Hệ thống tải lịch ngay và báo số buổi họp, hoặc báo lỗi kèm cách sửa.

## Tắt module

Đặt `FEATURE_GOOGLE_CALENDAR=false` và redeploy: trang Lịch không còn hiện buổi họp từ Google, cron bỏ qua. Dữ liệu đã lưu vẫn còn trong bảng; xóa nguồn lịch ở trang cấu hình sẽ xóa luôn các buổi họp của nguồn đó. Để thu hồi hẳn quyền, gỡ email tài khoản dịch vụ khỏi phần chia sẻ lịch và xóa khóa trong Google Cloud.

## Cho người phát triển

- Mã: `src/lib/google-calendar/`. Trang Lịch gọi `getGoogleCalendarEvents(supabase, userId, fromISO, toISO)`.
- Đăng nhập Google bằng JWT ký RS256 (`service-account.ts`), không dùng thư viện ngoài. Phạm vi quyền: `calendar.readonly`.
- Bảng: `calendar_sources` (quản trị ghi, có nhật ký), `calendar_events` (chỉ máy chủ ghi bằng khóa service). Kiểm thử RLS: `supabase/tests/40_lich_google.sql`.

## Hồ sơ cuộc họp (tài liệu trước họp, biên bản)

Trang **Hồ sơ cuộc họp** (`/hop`) liệt kê buổi họp theo ngày hoặc tuần từ các lịch Google dùng chung. Mỗi buổi họp có hai phần:

- **Tài liệu trước họp**: mỗi bên (khoa, viện, phòng...) một dòng. Văn thư/thư ký ghi các bên cần gửi (mỗi dòng một bên); dòng chưa có link hiện **Chờ gửi**. Khi nhận được file, bấm **Dán link** và dán link Google Drive. File vẫn nằm trên Drive, hệ thống chỉ lưu link.
- **Biên bản, kết luận sau họp**: dán link biên bản sau khi họp xong.

Mỗi dòng có **người đôn đốc** (mặc định là người tạo); người được giao nhận thông báo. Tên bên trùng tên một nhóm trong hệ thống thì được gắn với nhóm đó, và thành viên nhóm thấy buổi họp khi lọc **Của tôi**. Bộ lọc **Còn thiếu** chỉ hiện buổi họp còn bên chưa gửi.

File đã đính kèm vào sự kiện trên Google Calendar và link Drive dán trong mô tả sự kiện tự hiện trong phần tài liệu (đọc qua API: cần tài khoản dịch vụ hoặc API key; đọc qua iCal công khai thì chỉ có link trong mô tả và file đính kèm nếu Google có xuất).

Quyền: ai xem được lịch thì xem được hồ sơ. Hiệu trưởng, thư ký, quản trị và Văn thư của nhóm (nếu xem được lịch đó) mới thêm, sửa, gỡ. Mọi thao tác được ghi nhật ký. Hồ sơ gắn theo mã sự kiện Google nên không mất khi lịch đồng bộ lại hoặc buổi họp bị dời giờ.

### Quy trình theo văn bản phân công hồ sơ họp

- Mỗi buổi họp có thêm: mã Jira (tự đọc từ tên sự kiện dạng `(KHTC-6447)`, hoặc đầu mối ghi), link thư mục Drive của buổi họp, tình trạng xử lý (để trống thì tự suy ra) và nội dung cần theo dõi.
- Hạn: tài liệu trước họp muộn nhất 24 giờ trước giờ họp, biên bản muộn nhất 24 giờ sau khi họp xong. Quá hạn hiện màu đỏ, sắp đến hạn hiện màu vàng.
- Mảng công tác và đầu mối: `/quan-tri/mang-cong-tac` (Hiệu trưởng, thư ký, quản trị sửa). Đầu mối lưu bằng email nên có thể phân công trước khi người đó đăng nhập.
- Bảng tổng hợp 7 cột: `/hop/tong-hop`, lọc theo tuần/tháng, mảng, đầu mối; nút "Xuất Excel" tải file CSV.
- Link Jira: đặt biến môi trường `JIRA_BASE_URL` (địa chỉ máy chủ Jira nội bộ) trên Vercel. Hệ thống chỉ tạo link `…/browse/MÃ`, không gọi Jira. Không đặt thì mã Jira hiện dạng chữ.
