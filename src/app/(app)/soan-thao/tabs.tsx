import Link from 'next/link';
import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Soạn thảo.
export function SoanThaoTabs({ current }: { current: 'cong-cu' | 'ghi-chu' | 'template' }) {
  return (
    <SectionTabs current={current} tabs={[
      { key: 'cong-cu', href: '/soan-thao', label: 'Công cụ soạn thảo' },
      { key: 'ghi-chu', href: '/soan-thao/ghi-chu', label: 'Công cụ ghi chú' },
      { key: 'template', href: '/soan-thao/template', label: 'Template' },
    ]} />
  );
}

export const TEMPLATES = [
  { key: 'van-ban', label: 'Khung văn bản hành chính', group: 'Hành chính' },
  { key: 'phieu-trinh', label: 'Phiếu trình', group: 'Hành chính' },
  { key: 'bao-cao-cong-viec', label: 'Báo cáo tuần, tháng', group: 'Hành chính' },
  { key: 'don-cong-tac', label: 'Đơn xin đi công tác', group: 'Hành chính' },
  { key: 'danh-gia-cong-chuc', label: 'Phiếu đánh giá công chức (ĐG.01)', group: 'Hành chính' },
  { key: 'danh-gia-vien-chuc', label: 'Phiếu đánh giá viên chức, NLĐ (ĐG.02)', group: 'Hành chính' },
  { key: 'du-toan', label: 'Dự toán, quyết toán kinh phí', group: 'Tài chính' },
  { key: 'de-nghi-thanh-toan', label: 'Giấy đề nghị thanh toán', group: 'Tài chính' },
  { key: 'de-nghi-tam-ung', label: 'Giấy đề nghị tạm ứng', group: 'Tài chính' },
  { key: 'danh-sach-chi-tra', label: 'Danh sách chi trả, ký nhận', group: 'Tài chính' },
  { key: 'slide', label: 'Slide bài giảng, hội thảo, bảo vệ đề tài', group: 'Giảng dạy, nghiên cứu' },
  { key: 'de-cuong-hoc-phan', label: 'Đề cương học phần', group: 'Giảng dạy, nghiên cứu' },
  { key: 'thuyet-minh-de-tai', label: 'Đề cương đề tài NCKH', group: 'Giảng dạy, nghiên cứu' },
  { key: 'ly-lich-khoa-hoc', label: 'Lý lịch khoa học (Mẫu 04)', group: 'Giảng dạy, nghiên cứu' },
] as const;
export type TemplateKey = (typeof TEMPLATES)[number]['key'];
const GROUPS = ['Hành chính', 'Tài chính', 'Giảng dạy, nghiên cứu'] as const;

// Chọn loại template trong thẻ Template, chia theo nhóm.
export function TemplatePicker({ current }: { current: TemplateKey }) {
  return (
    <div className="card mb-5 grid gap-3 md:grid-cols-3" aria-label="Chọn template">
      {GROUPS.map((g) => (
        <div key={g}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide muted">{g}</div>
          <div className="flex flex-wrap gap-1.5">
            {TEMPLATES.filter((t) => t.group === g).map((t) => (
              <Link
                key={t.key}
                href={`/soan-thao/template?loai=${t.key}`}
                aria-current={t.key === current ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 text-sm transition ${t.key === current ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
