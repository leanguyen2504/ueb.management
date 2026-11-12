# Soạn thảo

Mục **Soạn thảo** (thanh bên, hoặc menu tài khoản trên điện thoại) có ba trang:

1. **Rà soát thể thức** (`/soan-thao`): kéo thả file Word `.docx`. Web kiểm tra theo Nghị định 30/2020/NĐ-CP (Phụ lục I, III, VI) và quy tắc rà soát văn bản hành chính của tổ thư ký, hiện bảng lỗi (vị trí, hiện tại, sửa thành, lý do, mức độ) và cho tải bản đã chỉnh.
   - Tự sửa: khổ A4, lề, phông Times New Roman, chữ đen, cỡ/đậm/nghiêng/canh lề từng thành phần, số ký hiệu, ngày tháng, nơi nhận, bố cục 2 cột phần đầu và phần ký, đường kẻ, số trang, dấu cách, dấu câu, "hoà" → "hòa", một số lỗi chính tả hay gặp.
   - Chỉ báo, không tự sửa: thiếu thành phần bắt buộc, ký hiệu không khớp tên loại, trích yếu in hoa, đánh số nhảy, bố cục thiếu phần theo loại văn bản.
   - File được xử lý hoàn toàn trên trình duyệt (mã ở `src/lib/docx/`), không gửi lên máy chủ, không gọi dịch vụ AI.
2. **Ghi chú nhanh** (`/soan-thao/ghi-chu`): ghi chú riêng từng người, ghim, sửa, tìm. Cần chạy `supabase/migrations/20261112900001_ghi_chu_nhanh.sql` trong Supabase SQL Editor.
3. **Công cụ soạn thảo** (`/soan-thao/cong-cu`): tạo khung văn bản `.docx` đúng thể thức, rà soát nhanh đoạn chữ dán vào, bảng tra viết tắt tên loại và thể thức từng thành phần.
