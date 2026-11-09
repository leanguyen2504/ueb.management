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
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Tạo nhóm mới</h2>
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="g-name">Tên nhóm</label><input id="g-name" name="name" required maxLength={200} className="input" placeholder="Ví dụ: Phòng Hành chính, Hội nghị khoa học 2026" /></div>
        <div><label className="label" htmlFor="g-kind">Loại</label><KindSelect /></div>
      </div>
      <div><label className="label" htmlFor="g-desc">Mô tả</label><textarea id="g-desc" name="description" rows={2} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang tạo…">Tạo nhóm</SubmitButton>
      <p className="text-xs muted">Bạn sẽ là người quản lý của nhóm mới.</p>
    </form>
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

export function AddMemberForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(addMember, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="group_id" value={groupId} />
      <div className="flex flex-col gap-2 md:flex-row md:items-end">
        <div className="flex-1"><label className="label" htmlFor="m-email">Thêm thành viên bằng email</label><input id="m-email" name="email" type="email" required placeholder="ten@vnu.edu.vn" className="input" /></div>
        <label className="flex items-center gap-2 text-sm md:pb-2"><input type="checkbox" name="is_manager" /> Người quản lý</label>
        <SubmitButton pendingText="Đang thêm…">Thêm</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
