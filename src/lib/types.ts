export type SystemRole = 'principal' | 'secretary' | 'member';
export type GroupKind = 'unit' | 'project' | 'event' | 'other';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  unit: string | null;
  position: string | null;
  system_role: SystemRole;
  is_active: boolean;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  kind: GroupKind;
  parent_id: string | null;
  description: string | null;
  default_can_view: boolean;
  default_can_create: boolean;
  default_can_edit: boolean;
  default_can_upload: boolean;
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  is_manager: boolean;
  is_clerk: boolean;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_upload: boolean;
  can_manage_members: boolean;
  updated_at: string;
  updated_by: string | null;
};

export type MyContext = {
  is_active: boolean;
  is_admin: boolean;
  role: SystemRole | null;
  all_groups_secretary: boolean;
  can_create_group: boolean;
};

export const ROLE_LABEL: Record<SystemRole, string> = {
  principal: 'Hiệu trưởng',
  secretary: 'Thư ký',
  member: 'Thành viên',
};

export const KIND_LABEL: Record<GroupKind, string> = {
  unit: 'Đơn vị',
  project: 'Dự án',
  event: 'Sự kiện',
  other: 'Khác',
};

export const PERMS = [
  ['can_view', 'Xem'],
  ['can_create', 'Tạo'],
  ['can_edit', 'Sửa'],
  ['can_upload', 'Tải/gắn tài liệu'],
  ['can_manage_members', 'Mời và gỡ thành viên'],
] as const;
export type PermKey = (typeof PERMS)[number][0];

export type TaskStatus = 'todo' | 'doing' | 'review' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type EventKind = 'meeting' | 'event' | 'deadline' | 'other';
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type Task = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_at: string;
};

export type CalEvent = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  location: string | null;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
};

export type BookingPage = {
  user_id: string;
  is_open: boolean;
  intro: string | null;
  hours_note: string | null;
  slot_minutes: number;
};

export type Booking = {
  id: string;
  host_id: string;
  requester_id: string;
  starts_at: string;
  ends_at: string;
  topic: string;
  note: string | null;
  status: BookingStatus;
  response_note: string | null;
  created_at: string;
};

export type AppNotification = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// Lịch từ nguồn ngoài (ví dụ Google Calendar chỉ đọc), trộn vào trang Lịch của tôi.
export type ExternalEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  all_day?: boolean;
  url?: string | null;
  source_label?: string;
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Cần làm',
  doing: 'Đang làm',
  review: 'Chờ duyệt',
  done: 'Hoàn thành',
};
export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn',
};
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  meeting: 'Cuộc họp',
  event: 'Sự kiện',
  deadline: 'Hạn chót',
  other: 'Khác',
};
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Chờ phản hồi',
  accepted: 'Đã đồng ý',
  declined: 'Từ chối',
  cancelled: 'Đã hủy',
};
