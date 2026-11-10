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
  ['can_manage_members', 'Quản lý thành viên'],
] as const;
export type PermKey = (typeof PERMS)[number][0];
