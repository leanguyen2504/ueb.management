import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Lịch. Hiệu trưởng không cần Lịch cá nhân và Chấm công.
export function LichTabs({ current, pendingBookings, pendingAssigned, isPrincipal }: { current: 'lich' | 'ca-nhan' | 'cham-cong' | 'dat'; pendingBookings?: number; pendingAssigned?: number; isPrincipal?: boolean }) {
  return (
    <SectionTabs current={current} tabs={[
      { key: 'lich', href: '/lich', label: 'Lịch' },
      ...(isPrincipal ? [] : [
        { key: 'ca-nhan', href: '/lich/ca-nhan', label: 'Lịch cá nhân', count: pendingAssigned },
        { key: 'cham-cong', href: '/lich/cham-cong', label: 'Chấm công' },
      ]),
      { key: 'dat', href: '/dat-lich', label: 'Trang đặt lịch', count: pendingBookings },
    ]} />
  );
}
