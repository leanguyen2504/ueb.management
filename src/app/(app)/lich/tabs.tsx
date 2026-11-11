import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Lịch.
export function LichTabs({ current, pendingBookings, pendingAssigned }: { current: 'lich' | 'ca-nhan' | 'cham-cong' | 'dat'; pendingBookings?: number; pendingAssigned?: number }) {
  return (
    <SectionTabs current={current} tabs={[
      { key: 'ca-nhan', href: '/lich/ca-nhan', label: 'Lịch cá nhân', count: pendingAssigned },
      { key: 'cham-cong', href: '/lich/cham-cong', label: 'Chấm công' },
      { key: 'lich', href: '/lich', label: 'Lịch trường và nhóm' },
      { key: 'dat', href: '/dat-lich', label: 'Trang đặt lịch', count: pendingBookings },
    ]} />
  );
}
