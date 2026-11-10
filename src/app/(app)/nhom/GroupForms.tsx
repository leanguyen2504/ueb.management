'use client';

import { useActionState } from 'react';
import { addMember, createGroup, updateGroup } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { KIND_LABEL, type Group } from '@/lib/types';

function KindSelect({ value }: { value?: string }) {
  return (
    <select name="kind" defaultValue={value ?? 'unit'} className="input">
      {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

export function CreateGroupForm() {
  const [state, action] = useActionState(createGroup, null);
  return (
    <details className="card group py-3" open={Boolean(state?.error)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        <span>+ Tạo đơn vị, dự án hoặc sự kiện</span>
        <span className="text-xs font-normal muted group-open:hidden">Bấm để mở</span>
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_3fr]">
          <div><label className="label" htmlFor="g-name">Tên nhóm</label><input id="g-name" name="name" required maxLength={200} className="input" placeholder="Ví dụ: Phòng Hành chính" /></div>
          <div><label className="label" htmlFor="g-kind">Loại</label><KindSelect /></div>
          <div><label className="label" htmlFor="g-desc">Mô tả</label><input id="g-desc" name="description" maxLength={2000} className="input" /></div>
        </div>
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="Đang tạo…">Tạo nhóm</SubmitButton>
          <p className="text-xs muted">Bạn sẽ là Trưởng nhóm của nhóm mới.</p>
        </div>
      </form>
    </details>
  );
}

export function EditGroupForm({ group }: { group: Group }) {
  const [state, action] = useActionState(updateGroup, null);
  const defaults: [keyof Group, string][] = [
    ['default_can_view', 'Xem'],
    ['default_can_create', 'Tạo'],
    ['default_can_edit', 'Sửa'],
    ['default_can_upload', 'Tải/gắn tài liệu'],
  ];
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Thông tin nhóm</h2>
      <input type="hidden" name="id" value={group.id} />
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="e-name">Tên nhóm</label><input id="e-name" name="name" required maxLength={200} defaultValue={group.name} className="input" /></div>
        <div><label className="label" htmlFor="e-kind">Loại</label><KindSelect value={group.kind} /></div>
      </div>
      <div><label className="label" htmlFor="e-desc">Mô tả</label><textarea id="e-desc" name="description" rows={2} defaultValue={group.description ?? ''} className="input" /></div>
      <fieldset>
        <legend className="label">Quyền mặc định cho thành viên mới</legend>
        <div className="flex flex-wrap gap-4">
          {defaults.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={Boolean(group[k])} /> {label}</label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}

export function AddMemberForm({ groupId, canAssignRole }: { groupId: string; canAssignRole: boolean }) {
  const [state, action] = useActionState(addMember, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="group_id" value={groupId} />
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
        <div className="flex-1"><label className="label" htmlFor="m-email">Thêm thành viên bằng email</label><input id="m-email" name="email" type="email" required placeholder="ten@vnu.edu.vn" className="input" /></div>
        {canAssignRole && (
          <div>
            <label className="label" htmlFor="m-role">Vai trò</label>
            <select id="m-role" name="role" defaultValue="member" className="input">
              <option value="member">Thành viên</option>
              <option value="clerk">Văn thư</option>
              <option value="manager">Trưởng nhóm</option>
            </select>
          </div>
        )}
        <SubmitButton pendingText="Đang thêm…">Thêm</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
