// Nội dung thẻ Hành chính: quy trình các thủ tục hành chính và quy định đi kèm.
//
// Cách bổ sung:
// - Thêm bước: thêm một phần tử vào `steps` của quy trình (title, who, when, detail).
// - Thêm biểu mẫu: thêm vào `forms` của bước (hoặc của cả quy trình). `href` bắt đầu bằng
//   "/" là trang trong web (ví dụ Template), còn lại là đường dẫn ngoài (Google Drive…).
// - Thêm thủ tục mới: thêm một phần tử vào PROCEDURES, `key` viết không dấu, nối bằng "-".
// - Văn bản căn cứ: thêm vào SOURCES rồi gọi theo `key` trong `sources` của quy trình.

export type FormRef = { label: string; href: string; note?: string };

export type Step = {
  title: string;
  who?: string; // Ai làm
  when?: string; // Thời hạn
  detail?: string[];
  forms?: FormRef[];
};

export type Procedure = {
  key: string;
  title: string;
  group: string;
  summary: string;
  deadline?: string; // Thời hạn chính, hiện trên thẻ chọn
  steps: Step[];
  rules?: string[]; // Lưu ý, quy định
  forms?: FormRef[]; // Biểu mẫu dùng chung cho cả quy trình
  sources?: string[]; // key trong SOURCES
  draft?: boolean; // Đang bổ sung
};

export type Source = { key: string; so: string; title: string; date: string; href?: string };

export const SOURCES: Source[] = [
  { key: '4783', so: '4783/ĐHKT-TT&PC', date: '20/12/2024', title: 'Tuân thủ công tác lập dự trù, tạm ứng và thanh quyết toán', href: 'https://drive.google.com/file/d/1251XiHvSkk0hN-a88RFqeryHPki9Q4jP/view' },
  { key: '1140', so: '1140/ĐHKT-TT&PC', date: '21/4/2025', title: 'Tuân thủ lập mã (Jira) dự trù, tạm ứng và thanh quyết toán', href: 'https://drive.google.com/file/d/1eV4v0F-5Zg_SGAP-k_MyVhvUXX2gUO9Q/view' },
  { key: '922', so: '922/HD-ĐHKT', date: '01/4/2025', title: 'Lập dự trù kinh phí theo danh mục dịch vụ và khoản mục thu chi (BM01, PL01, PL02)', href: 'https://drive.google.com/file/d/1iS9zDVqTmRb8NS0fBjRXvmPnyC5iEQEn/view' },
  { key: '3803', so: '3803/HD-ĐHKT', date: '13/10/2025', title: 'Lập, phê duyệt dự trù kinh phí và thanh quyết toán trên phần mềm', href: 'https://drive.google.com/file/d/17Ru1nuJv3MI-D8CCvnDzOSxCr0iC_XGX/view' },
  { key: 'quy-trinh-ho-so', so: 'Ghi chú nội bộ', date: '', title: 'Quy trình trình hồ sơ (4 bước)', href: 'https://drive.google.com/file/d/12LcYfJBuKyTGeei8opL-GRDubq2seXoz/view' },
];

// Đường dẫn phần mềm dự trù kinh phí của Trường (theo HD 3803).
export const PHAN_MEM_DU_TRU = 'http://112.137.137.119/default.aspx';

const JIRA_PTTC = 'Khi tạo mã Jira bắt buộc chọn trường "Phương thức tài chính", rồi chọn';

export const PROCEDURES: Procedure[] = [
  {
    key: 'du-tru',
    title: 'Lập dự trù kinh phí',
    group: 'Tài chính',
    summary: 'Cho mọi hoạt động, sự kiện có chi kinh phí. Trình kế hoạch trước, kế hoạch được duyệt mới lập dự trù trên phần mềm.',
    deadline: 'Gửi Phòng KHTC ít nhất 30 ngày trước sự kiện',
    sources: ['4783', '1140', '922', '3803', 'quy-trinh-ho-so'],
    steps: [
      {
        title: 'Trình kế hoạch tổ chức',
        who: 'Đơn vị',
        when: 'Hơn 1 tháng trước khi tổ chức',
        detail: [
          'Tạo mã Jira trình kế hoạch qua Phòng Đào tạo (nếu là hoạt động đào tạo) và Ban Giám hiệu.',
          'Kế hoạch nêu rõ mục đích, thời gian, địa điểm, quy mô (số người tham gia), phân công.',
        ],
        forms: [{ label: 'Khung văn bản hành chính (Kế hoạch, Tờ trình)', href: '/soan-thao/template?loai=van-ban' }],
      },
      {
        title: 'Lập bảng dự trù kinh phí',
        who: 'Đơn vị',
        detail: [
          'Lập theo mẫu BM01 (HD 922): mỗi dòng ghi nội dung, nhóm dịch vụ (PL01), ĐVT, số lượng, đơn giá, thành tiền, mã và tên khoản mục thu chi (PL02), nguồn kinh phí (NSNN hoặc TBS).',
          'Đơn giá theo Quy chế chi tiêu nội bộ hiện hành; ghi rõ căn cứ ở đầu bảng.',
          'Kèm Tờ trình phê duyệt kinh phí và minh chứng cần thiết (báo giá, danh sách…).',
        ],
        forms: [
          { label: 'Dự toán, quyết toán kinh phí (Excel tự tính)', href: '/soan-thao/template?loai=du-toan' },
          { label: 'Mẫu BM01, danh mục PL01, PL02 (HD 922)', href: 'https://drive.google.com/file/d/1iS9zDVqTmRb8NS0fBjRXvmPnyC5iEQEn/view' },
        ],
      },
      {
        title: 'Tạo mã Jira dự trù',
        who: 'Đơn vị',
        when: 'Sau khi kế hoạch được duyệt',
        detail: [
          `${JIRA_PTTC} "Dự trù kinh phí". Mã không chọn trường này sẽ bị Phòng KHTC trả lại, không giải quyết và tính lỗi.`,
        ],
      },
      {
        title: 'Nhập dự trù trên phần mềm và gửi đi',
        who: 'Đơn vị',
        when: 'Ít nhất 30 ngày trước sự kiện',
        detail: [
          `Vào phần mềm dự trù kinh phí (${PHAN_MEM_DU_TRU}), chọn Dự trù kinh phí.`,
          'Điền Tên dự trù, Ngày bắt đầu, Ngày kết thúc, Địa điểm, Số lượng quy mô, Mã Jira, Căn cứ, Quản lý hoạt động.',
          'Ở lưới chi tiết: chọn Định mức kinh phí (gõ từ khoá để lọc), hoặc tích "Không định mức" rồi nhập Đơn giá; chọn Nhóm dịch vụ, Khoản mục, Nguồn kinh phí, Loại khoản, Loại hình hoạt động.',
          'Bấm Lưu (ô Tên dự trù và cột Diễn giải chi tiết bắt buộc), rồi Gửi đi: ghi Ý kiến người gửi và chọn Người nhận.',
          'In phiếu: Lập dự trù kinh phí, Phiếu trình giải quyết công việc.',
        ],
      },
      {
        title: 'Phòng KHTC kiểm soát, lãnh đạo phê duyệt',
        who: 'Phòng KHTC, Ban Giám hiệu',
        when: 'Tối đa 11 ngày',
        detail: [
          'Phòng KHTC xử lý hồ sơ trong 5 ngày làm việc kể từ khi nhận đủ.',
          'Lãnh đạo phụ trách mảng (Phó Hiệu trưởng phụ trách tài chính) duyệt trong 2 ngày.',
          'Lãnh đạo Trường duyệt trong 4 ngày (Hiệu trưởng 2 ngày, Chủ tịch Hội đồng trường kiểm soát 2 ngày).',
          'Nếu bị trả lại: sửa theo ý kiến từng dòng (nút Ý kiến), lưu và gửi lại.',
        ],
      },
    ],
    rules: [
      'Mọi việc lập dự trù, tạm ứng, thanh quyết toán đều phải mở mã theo dõi trên phần mềm quản lý công việc (Jira).',
      'Kế hoạch ngân sách năm và danh sách sự kiện dự kiến của năm sau trình Ban Giám hiệu trước ngày 20/12.',
      'Không đúng hạn: Trưởng đơn vị bị trừ 0,5 Hhe; Phòng TT&PC giám sát và tổng hợp hằng tháng.',
    ],
  },
  {
    key: 'tam-ung',
    title: 'Đề nghị tạm ứng',
    group: 'Tài chính',
    summary: 'Tạm ứng theo dự trù đã được duyệt, làm trên phần mềm dự trù kinh phí.',
    deadline: 'Hoàn thành trong 7 ngày',
    sources: ['4783', '3803'],
    steps: [
      {
        title: 'Kiểm tra dự trù đã được duyệt',
        who: 'Đơn vị',
        detail: ['Chỉ tạm ứng được cho các mục đã có trong dự trù được duyệt. Ghi lại Mã dự trù.'],
      },
      {
        title: 'Lập phiếu Đề nghị tạm ứng trên phần mềm',
        who: 'Đơn vị',
        detail: [
          'Chọn Đề nghị tạm ứng, nhập Mã dự trù (phần mềm tự điền Tên dự trù, Mã Jira, Quản lý hoạt động).',
          'Nhập Nội dung đề nghị và Thông tin chuyển khoản.',
          'Bấm Chọn dự trù để lấy từng mục vào lưới chi tiết, nhập Số lượng và Thành tiền.',
          'Lưu, In phiếu (Đề nghị tạm ứng gộp, Bảng kê danh sách tạm ứng, Phiếu trình), rồi Gửi đi.',
        ],
        forms: [{ label: 'Giấy đề nghị tạm ứng', href: '/soan-thao/template?loai=de-nghi-tam-ung' }],
      },
      {
        title: 'Phòng KHTC kiểm soát, lãnh đạo phê duyệt',
        who: 'Phòng KHTC, Ban Giám hiệu',
        detail: ['Theo dõi trạng thái ở mục Tìm kiếm nhanh, Dữ liệu vừa gửi đi.'],
      },
    ],
  },
  {
    key: 'thanh-toan',
    title: 'Thanh toán, quyết toán',
    group: 'Tài chính',
    summary: 'Hoàn thiện chứng từ sau hoạt động, lập đề nghị thanh toán và quyết toán dự trù.',
    deadline: 'Gửi Phòng KHTC trong 20 ngày sau khi kết thúc',
    sources: ['4783', '1140', '3803', 'quy-trinh-ho-so'],
    steps: [
      {
        title: 'Tổ chức và hoàn thiện hồ sơ, chứng từ',
        who: 'Đơn vị',
        when: 'Ngay sau khi thực hiện xong',
        detail: [
          'Thu đủ hoá đơn, hợp đồng, biên bản nghiệm thu, danh sách ký nhận, minh chứng (ảnh, danh sách tham dự…).',
          'Chứng từ phải khớp với các mục trong dự trù đã duyệt.',
        ],
        forms: [{ label: 'Danh sách chi trả, ký nhận', href: '/soan-thao/template?loai=danh-sach-chi-tra' }],
      },
      {
        title: 'Tạo mã Jira thanh toán',
        who: 'Đơn vị',
        detail: [`${JIRA_PTTC} "Thanh toán kinh phí".`],
      },
      {
        title: 'Lập Đề nghị thanh toán trên phần mềm',
        who: 'Đơn vị',
        when: 'Trong 20 ngày sau khi kết thúc',
        detail: [
          'Chọn Đề nghị thanh toán, nhập Mã dự trù (hoặc tích "Không dự trù" nếu thanh toán không theo dự trù).',
          'Nhập Nội dung đề nghị, Thông tin chuyển khoản; tích "Cam kết hoá đơn" nếu có.',
          'Bấm Chọn dự trù để lấy từng mục, nhập Số lượng và Thành tiền thực chi.',
          'Lưu, In phiếu (Đề nghị thanh toán, Phiếu trình), rồi Gửi đi.',
        ],
        forms: [{ label: 'Giấy đề nghị thanh toán', href: '/soan-thao/template?loai=de-nghi-thanh-toan' }],
      },
      {
        title: 'Quyết toán dự trù',
        who: 'Người hỗ trợ của dự trù',
        detail: [
          'Vào Dữ liệu chưa quyết toán, chọn dự trù, bấm Xem đầy đủ rồi bấm Quyết toán.',
          'Phần mềm tự cộng số tiền đã tạm ứng, đã thanh toán của từng mục và tính chênh lệch.',
        ],
        forms: [{ label: 'Dự toán, quyết toán kinh phí', href: '/soan-thao/template?loai=du-toan' }],
      },
      {
        title: 'Phòng KHTC kiểm soát, lãnh đạo phê duyệt',
        who: 'Phòng KHTC, Ban Giám hiệu',
        when: 'Tối đa 11 ngày',
        detail: ['Phòng KHTC 5 ngày, lãnh đạo phụ trách mảng 2 ngày, lãnh đạo Trường 4 ngày.'],
      },
    ],
  },
  {
    key: 'kien-tap',
    title: 'Tổ chức kiến tập cho sinh viên',
    group: 'Đào tạo',
    summary: 'Ví dụ áp dụng quy trình dự trù, thanh toán cho một chuyến kiến tập.',
    deadline: 'Trình kế hoạch hơn 1 tháng trước',
    draft: true,
    sources: ['quy-trinh-ho-so'],
    steps: [
      {
        title: 'Họp thống nhất và lập kế hoạch kiến tập',
        who: 'Khoa',
        detail: ['Họp thống nhất địa điểm, thời gian, lớp tham gia, cán bộ đi cùng; lập biên bản họp.', 'Kế hoạch trình Phòng Đào tạo và Ban Giám hiệu.'],
        forms: [
          { label: 'Kế hoạch kiến tập (mẫu đã trình)', href: 'https://drive.google.com/file/d/1fXTdIgL6rmvpWu6e5_O7i3Aapr89btcN/view' },
          { label: 'Biên bản họp kiến tập', href: 'https://drive.google.com/file/d/1lPtMu4NNdl1StjzKZtOVMmqGtTMdDmBZ/view' },
        ],
      },
      {
        title: 'Lập dự trù kinh phí kiến tập',
        who: 'Khoa',
        detail: [
          'Làm theo quy trình Lập dự trù kinh phí ở trên.',
          'Định mức theo Bảng phân bổ kinh phí học phần kiến tập của Nhà trường; từ năm sau điều chỉnh theo Quy chế chi tiêu nội bộ.',
        ],
        forms: [{ label: 'Dự toán kinh phí (Excel)', href: '/soan-thao/template?loai=du-toan' }],
      },
      {
        title: 'Tổ chức đi kiến tập, thu minh chứng',
        who: 'Khoa',
        detail: ['Danh sách sinh viên, cán bộ tham gia; hợp đồng thuê xe; ảnh hoạt động.'],
      },
      {
        title: 'Thanh toán sau chuyến đi',
        who: 'Khoa',
        when: 'Trong 20 ngày sau khi kết thúc',
        detail: ['Làm theo quy trình Thanh toán, quyết toán ở trên.'],
      },
    ],
  },
];

// Mốc thời gian chung, hiện ở đầu trang.
export const KEY_DEADLINES: { label: string; value: string }[] = [
  { label: 'Gửi hồ sơ dự trù', value: '≥ 30 ngày trước sự kiện' },
  { label: 'Gửi hồ sơ thanh quyết toán', value: '≤ 20 ngày sau khi kết thúc' },
  { label: 'Thời gian xử lý, phê duyệt', value: 'Tối đa 11 ngày' },
];
