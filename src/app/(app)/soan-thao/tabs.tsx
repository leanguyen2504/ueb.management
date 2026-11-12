import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Soạn thảo.
export function SoanThaoTabs({ current }: { current: 'ra-soat' | 'ghi-chu' | 'cong-cu' | 'slide' }) {
  return (
    <SectionTabs current={current} tabs={[
      { key: 'ra-soat', href: '/soan-thao', label: 'Rà soát thể thức' },
      { key: 'ghi-chu', href: '/soan-thao/ghi-chu', label: 'Ghi chú nhanh' },
      { key: 'cong-cu', href: '/soan-thao/cong-cu', label: 'Công cụ soạn thảo' },
      { key: 'slide', href: '/soan-thao/slide', label: 'Slide bài giảng' },
    ]} />
  );
}
