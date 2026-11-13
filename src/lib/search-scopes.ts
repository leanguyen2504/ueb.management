// Các mảng để lọc nhanh. Thứ tự này là thứ tự chip trên trang và trong ô chọn ở thanh trên cùng.
export const SEARCH_SCOPES = [
  { key: 'hop', label: 'Cuộc họp' },
  { key: 'tai-lieu', label: 'Tài liệu' },
  { key: 'jira', label: 'Jira' },
  { key: 'viec', label: 'Việc' },
  { key: 'nhom', label: 'Dự án và nhóm' },
  { key: 'lich', label: 'Lịch nhóm' },
  { key: 'nguoi', label: 'Người' },
] as const;
