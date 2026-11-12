import Link from 'next/link';
import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Soạn thảo.
export function SoanThaoTabs({ current }: { current: 'cong-cu' | 'template' }) {
  return (
    <SectionTabs current={current} tabs={[
      { key: 'cong-cu', href: '/soan-thao', label: 'Công cụ soạn thảo' },
      { key: 'template', href: '/soan-thao/template', label: 'Template' },
    ]} />
  );
}

export const TEMPLATES = [
  { key: 'van-ban', label: 'Văn bản hành chính', note: 'Khung .docx đúng Nghị định 30/2020' },
  { key: 'slide', label: 'Slide bài giảng UEB', note: 'PowerPoint có biểu đồ, sơ đồ, bảng' },
  { key: 'du-toan', label: 'Dự toán chi phí', note: 'Excel có công thức, theo quy định' },
] as const;
export type TemplateKey = (typeof TEMPLATES)[number]['key'];

// Chọn loại template trong thẻ Template.
export function TemplatePicker({ current }: { current: TemplateKey }) {
  return (
    <div className="mb-5 grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Loại template">
      {TEMPLATES.map((t) => (
        <Link
          key={t.key}
          role="tab"
          aria-selected={t.key === current}
          href={`/soan-thao/template?loai=${t.key}`}
          className={`rounded-xl border px-4 py-3 transition ${t.key === current ? 'border-brand-600 bg-brand-50 dark:border-brand-300 dark:bg-brand-900/30' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}
        >
          <div className="text-sm font-semibold">{t.label}</div>
          <div className="text-xs muted">{t.note}</div>
        </Link>
      ))}
    </div>
  );
}
