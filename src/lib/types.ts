export type SystemRole = 'principal' | 'secretary' | 'member';
export type GroupKind = 'unit' | 'project' | 'event' | 'other';

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  unit: string | null;
  position: string | null;
  phone: string | null;
  office: string | null;
  bio: string | null;
  avatar_path?: string | null;
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
  unit_category: UnitCategory | null;
  /** Có giá trị khi là không gian cá nhân (chỉ chủ sở hữu thấy). */
  owner_id: string | null;
  default_can_view: boolean;
  default_can_create: boolean;
  default_can_edit: boolean;
  default_can_upload: boolean;
  archived_at: string | null;
  /** Link Drive chung của không gian (mục Tài liệu); chưa chạy SQL 20261112800001 thì không có. */
  drive_url?: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type GroupFile = {
  id: string;
  group_id: string;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  label: string | null;
  created_at: string;
  created_by: string | null;
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

// Phân loại đơn vị (cột Loại): thay cho 3 nhóm cha trước đây.
export type UnitCategory = 'chuc_nang' | 'dao_tao' | 'nghien_cuu';
export const UNIT_CATEGORY_LABEL: Record<UnitCategory, string> = {
  chuc_nang: 'Đơn vị chức năng',
  dao_tao: 'Đơn vị đào tạo (Khoa, Viện)',
  nghien_cuu: 'Đơn vị nghiên cứu và dịch vụ',
};
export function groupTypeLabel(g: { kind: string; unit_category?: string | null; owner_id?: string | null }): string {
  if (g.owner_id) return 'Cá nhân';
  if (g.kind === 'unit' && g.unit_category && g.unit_category in UNIT_CATEGORY_LABEL) return UNIT_CATEGORY_LABEL[g.unit_category as UnitCategory];
  return KIND_LABEL[g.kind as GroupKind] ?? g.kind;
}

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
export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';
export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export type Task = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  /** Giờ hạn (HH:MM:SS), không bắt buộc; chưa chạy SQL 20261125000001 thì không có. */
  due_time?: string | null;
  start_date: string | null;
  progress: number | null;
  assignee_id: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_at: string;
  /** Mã Jira gắn với việc (không có ở việc Cá nhân); có thể chưa có cột nếu chưa chạy SQL. */
  jira_key?: string | null;
  jira_url?: string | null;
  /** Lặp lại (chưa chạy SQL 20261125100001 thì không có). Hoàn thành thì hệ thống tạo lần kế tiếp. */
  repeat_rule?: RepeatRule | null;
  repeat_every?: number | null;
  /** Thứ trong tuần cho kiểu weekly: 1 = Thứ Hai … 7 = Chủ nhật. */
  repeat_days?: number[] | null;
  repeat_until?: string | null;
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
  slug: string | null;
  title: string | null;
  intro: string | null;
  location: string | null;
  durations: number[];
  weekly_hours: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', [string, string]>>;
  min_notice_minutes: number;
  horizon_days: number;
  buffer_minutes: number;
};

export type Booking = {
  id: string;
  host_id: string;
  requester_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
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

// Nhắc việc ở quả chuông (hàm my_alerts): tính trực tiếp từ dữ liệu, tự hết khi việc đã xử lý.
export type AlertLevel = 'qua_han' | 'gap' | 'sap_den_han' | 'can_xu_ly';
export type AppAlert = {
  ref_key: string;
  source: 'viec' | 'jira' | 'lich' | 'ca_nhan' | 'dat_lich' | 'nhom';
  level: AlertLevel;
  title: string;
  body: string | null;
  link: string | null;
  due_at: string | null;
};
export const ALERT_LEVEL_LABEL: Record<AlertLevel, string> = {
  qua_han: 'Quá hạn',
  gap: 'Gấp',
  sap_den_han: 'Trong 24 giờ',
  can_xu_ly: 'Cần xử lý',
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
export const REPEAT_RULE_LABEL: Record<RepeatRule, string> = {
  daily: 'Hằng ngày',
  weekdays: 'Ngày làm việc (T2–T6)',
  weekly: 'Hằng tuần',
  monthly: 'Hằng tháng',
  yearly: 'Hằng năm',
};
/** Đơn vị cho ô "Mỗi N …". */
export const REPEAT_UNIT: Record<RepeatRule, string> = { daily: 'ngày', weekdays: '', weekly: 'tuần', monthly: 'tháng', yearly: 'năm' };
export const WEEKDAY_SHORT: Record<number, string> = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 7: 'CN' };

/** Mô tả ngắn: "Hằng tuần (T2, T5)", "Mỗi 2 tuần (T2)", "Hằng tháng · đến 31/12/2026". */
export function repeatText(t: Pick<Task, 'repeat_rule' | 'repeat_every' | 'repeat_days' | 'repeat_until'>, fmt: (d: string) => string = (d) => d): string | null {
  const r = t.repeat_rule;
  if (!r) return null;
  const n = t.repeat_every ?? 1;
  let s = n > 1 && r !== 'weekdays' ? `Mỗi ${n} ${REPEAT_UNIT[r]}` : REPEAT_RULE_LABEL[r];
  if (r === 'weekly' && t.repeat_days?.length) s += ` (${[...t.repeat_days].sort().map((d) => WEEKDAY_SHORT[d]).join(', ')})`;
  if (t.repeat_until) s += ` · đến ${fmt(t.repeat_until)}`;
  return s;
}

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

export type TaskLink = {
  id: string;
  task_id: string;
  url: string | null;
  label: string | null;
  // Nội dung gõ thẳng và tệp tải lên (có sau SQL 20261112600002).
  body?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  created_at: string;
  created_by: string | null;
};
