export type CalView = 'ngay' | 'tuan' | 'thang' | 'lich-bieu' | 'bang';

export const VIEW_LABEL: Record<CalView, string> = { ngay: 'Ngày', tuan: 'Tuần', thang: 'Tháng', 'lich-bieu': 'Lịch biểu', bang: 'Bảng' };

// Một nguồn lịch hiện ở cột trái (bật/tắt được), ví dụ "Lịch nhóm", "Lịch tuần BGH".
export type CalSource = { key: string; label: string; color: string };

export type CalItem = {
  key: string;
  source: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  // Dòng phụ: loại, nhóm, người gặp...
  sub?: string | null;
  location?: string | null;
  description?: string | null;
  links?: { href: string; label: string; external?: boolean }[];
  deleteId?: string;
};

// Bảng màu giống Google Calendar, dùng cho các nguồn lịch.
export const PALETTE = ['#039be5', '#33b679', '#f4511e', '#8e24aa', '#e67c73', '#f6bf26', '#0b8043', '#3f51b5', '#d50000', '#616161'];
