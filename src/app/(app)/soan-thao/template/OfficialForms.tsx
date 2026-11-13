'use client';

// Biểu mẫu gốc do ĐHQGHN công bố (cổng thủ tục hành chính tthc.vnu.edu.vn, trang vnu.edu.vn).
// Mẫu nào đã đưa file gốc lên web thì điền ngay trong Template; còn lại liên kết tới file gốc hoặc trang thủ tục.
import { useState } from 'react';

type Item = { label: string; href: string; kind: string; note?: string };
const TT = 'https://tthc.vnu.edu.vn/thu-tuc/';
const CDN = 'https://cdnportal.vnu.edu.vn/data/0/documents/2026/11/04/upload_9/';
const UP = 'https://vnu.edu.vn/upload/2023/06/33128/file/';

export const OFFICIAL: { group: string; items: Item[] }[] = [
  {
    group: 'Hành chính, tổ chức cán bộ',
    items: [
      { label: 'Mẫu 01 - Đơn xin nghỉ phép năm', href: '/mau/Mau_01_Don_xin_nghi_phep_nam.docx', kind: 'Word (.docx)' },
      { label: 'Nghỉ phép, nghỉ không lương (Mẫu 01, 02): thủ tục và nộp trực tuyến', href: `${TT}xin-nghi-phep-nam-5c96b437`, kind: 'Trang thủ tục' },
      { label: 'Nghỉ ốm, thai sản (Mẫu 03, 04): thủ tục và nộp trực tuyến', href: `${TT}xin-nghi-om-thai-san-9f63feae`, kind: 'Trang thủ tục' },
      { label: 'ĐG.01 - Phiếu đánh giá, phân loại công chức', href: '/soan-thao/template?loai=danh-gia-cong-chuc', kind: 'Điền trên web' },
      { label: 'ĐG.02 - Phiếu đánh giá, phân loại viên chức, người lao động', href: '/soan-thao/template?loai=danh-gia-vien-chuc', kind: 'Điền trên web' },
      { label: 'ĐG.04 - Bảng tổng hợp kết quả đánh giá, phân loại', href: 'https://docs.google.com/spreadsheets/d/1ES5ayd_qumYUaP4YIvN9k3XrMLf6D3xp/edit', kind: 'Google Sheets', note: 'Đăng nhập tài khoản @vnu.edu.vn' },
      { label: 'Đánh giá viên chức cuối năm (ĐG.01-ĐG.04): thủ tục', href: `${TT}danh-gia-cong-chuc-vien-chuc-nguoi-lao-dong-cuoi-nam-a51c85c6`, kind: 'Trang thủ tục' },
      { label: 'Phiếu sơ yếu lý lịch, lý lịch khoa học viên chức', href: 'https://docs.google.com/spreadsheets/d/1FJuwEpIFd5RAqe7FJOt5SMF5fVUvjazt/edit', kind: 'Excel trên Drive' },
      { label: 'Đăng ký sử dụng Hội trường Nguyễn Văn Đạo', href: `${TT}dang-ky-su-dung-hoi-truong-nguyen-van-dao-042ad30b`, kind: 'Trang thủ tục' },
      { label: 'Đăng ký tài khoản email, eOffice, Internet', href: `${TT}dang-ky-tai-khoan-su-dung-cac-dich-vu-mang-truy-cap-email-eoffice-internet-2016a2bb`, kind: 'Trang thủ tục' },
      { label: 'Xét danh hiệu thi đua, khen thưởng (trích ngang, báo cáo thành tích)', href: `${TT}xet-danh-hieu-thi-dua-khen-thuong-5bac7d6a`, kind: 'Trang thủ tục' },
      { label: 'Tất cả thủ tục hành chính ĐHQGHN', href: 'https://tthc.vnu.edu.vn', kind: 'Cổng thủ tục' },
    ],
  },
  {
    group: 'Giảng dạy, nghiên cứu khoa học',
    items: [
      { label: 'Bộ biểu mẫu nhiệm vụ KH&CN, ĐMST theo QĐ 2868/QĐ-ĐHQGHN (2026)', href: `${CDN}bieu-mau-nhiem-vu-khcn-dmst-2868.docx`, kind: 'Word (.docx)', note: 'Bộ mẫu mới nhất, gồm thuyết minh, lý lịch khoa học, đơn đăng ký chủ trì' },
      { label: 'QĐ 2868/QĐ-ĐHQGHN - Quy định quản lý nhiệm vụ KH&CN cấp ĐHQGHN', href: `${CDN}qd-2868-quy-dinh-quan-ly-nhiem-vu-khcn-cap-dhqghn-trinh-ky.pdf`, kind: 'PDF' },
      { label: 'Kiểm tra giữa kỳ, đề nghị thay đổi khi thực hiện đề tài', href: `${TT}kiem-tra-danh-gia-giua-ki-thay-doi-trong-qua-trinh-trien-khai-nhiem-vu-kh-cn-cap-dhqghn-ddd0534f`, kind: 'Trang thủ tục' },
      { label: 'Nghiệm thu nhiệm vụ KH&CN cấp ĐHQGHN (biên bản, phiếu đánh giá, thanh lý)', href: `${TT}nghiem-thu-nhiem-vu-kh-cn-cap-dhqghn-c56f2c86`, kind: 'Trang thủ tục' },
      { label: 'Đăng ký nhóm nghiên cứu mạnh', href: `${TT}dang-ky-nhom-nghien-cuu-manh-9a47d37b`, kind: 'Trang thủ tục' },
      { label: 'Xét khen thưởng NCKH sinh viên cấp ĐHQGHN', href: `${TT}xet-khen-thuong-nckh-sinh-vien-cap-dhqghn-fb213c00`, kind: 'Trang thủ tục' },
      { label: 'Xét giải thưởng KH&CN cấp ĐHQGHN', href: `${TT}xet-giai-thuong-kh-cn-cap-dhqghn-202bb113`, kind: 'Trang thủ tục' },
      { label: 'Hướng dẫn 3115 - Hỗ trợ công bố quốc tế (kèm mẫu đề nghị)', href: `${UP}I_17_%203115%20H%C6%B0%E1%BB%9Bng%20d%E1%BA%ABn%20h%E1%BB%97%20tr%E1%BB%A3%20c%C3%B4ng%20b%E1%BB%91%20qu%E1%BB%91c%20t%E1%BA%BF.doc`, kind: 'Word (.doc)' },
      { label: 'Thông tư 02/2023/TT-BKHCN - Lập dự toán nhiệm vụ KH&CN', href: `${UP}II_8_%20TT02_2023_%20BKHCN.doc`, kind: 'Word (.doc)' },
    ],
  },
  {
    group: 'Hợp tác quốc tế, hội nghị',
    items: [
      { label: 'Thủ tục đoàn ra (đơn xin đi nước ngoài, dự toán kinh phí)', href: `${TT}thu-tuc-doan-ra-32ca6f4f`, kind: 'Trang thủ tục' },
      { label: 'Thủ tục đoàn vào (công văn, đơn gia hạn)', href: `${TT}thu-tuc-doan-vao-287d7881`, kind: 'Trang thủ tục' },
      { label: 'Đăng ký hội nghị, hội thảo quốc tế (công văn, đề án)', href: `${TT}dang-ky-hoi-nghi-hoi-thao-quoc-te-8852285b`, kind: 'Trang thủ tục' },
      { label: 'Ký thỏa thuận hợp tác, hợp đồng triển khai', href: `${TT}ky-van-ban-thoa-thuan-hop-tac-hop-dong-trien-khai-cua-cac-don-vi-truc-thuoc-9bc75200`, kind: 'Trang thủ tục' },
    ],
  },
];

export function OfficialForms() {
  const [sel, setSel] = useState('');
  const item = OFFICIAL.flatMap((g) => g.items).find((i) => i.href === sel);
  return (
    <div className="card mb-5 flex flex-wrap items-center gap-3 text-sm">
      <div className="min-w-[220px] flex-1">
        <div className="font-semibold">Biểu mẫu gốc của ĐHQGHN</div>
        <div className="text-xs muted">Mục ghi “Điền trên web” mở ngay mẫu gốc trong Template để điền và tải Word. Mục khác mở file ĐHQGHN đang công bố hoặc trang thủ tục hướng dẫn hồ sơ, nộp trực tuyến.</div>
      </div>
      <select className="input w-auto max-w-full py-1.5" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Chọn biểu mẫu gốc của ĐHQGHN">
        <option value="">Chọn biểu mẫu…</option>
        {OFFICIAL.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((i) => <option key={i.href} value={i.href}>{i.label}</option>)}
          </optgroup>
        ))}
      </select>
      {item?.href.startsWith('/soan-thao') && <a className="btn px-3 py-1.5 text-sm" href={item.href}>Điền trên web</a>}
      {item && !item.href.startsWith('/soan-thao') && (
        <a className="btn px-3 py-1.5 text-sm" href={item.href} target="_blank" rel="noopener noreferrer">
          {item.kind.startsWith('Trang') || item.kind.startsWith('Cổng') ? 'Mở trang' : 'Mở / tải'} ({item.kind})
        </a>
      )}
      {item?.note && <span className="w-full text-xs muted">{item.note}</span>}
    </div>
  );
}
