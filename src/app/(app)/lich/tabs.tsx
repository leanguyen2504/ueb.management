import { SectionTabs } from '@/components/PageHead';

// Các trang trong mục Lịch. Lịch cá nhân nằm ngay trong "Lịch của tôi" (ô chọn bên trái),
// không còn tab riêng. Hiệu trưởng không cần mục Chấm công.
export function LichTabs({ current, pendingBookings, isPrincipal }: { current: 'lich' | 'ca-nhan' | 'cham-cong' | 'dat'; pendingBookings?: number; pendingAssigned?: number; isPrincipal?: boolean }) {
  return (
    <SectionTabs current={current === 'ca-nhan' ? 'lich' : current} tabs={[
      { key: 'lich', href: '/lich', label: 'Lịch' },
      ...(isPrincipal ? [] : [{ key: 'cham-cong', href: '/lich/cham-cong', label: 'Chấm công' }]),
      { key: 'dat', href: '/dat-lich', label: 'Trang đặt lịch', count: pendingBookings },
    ]} />
  );
}
