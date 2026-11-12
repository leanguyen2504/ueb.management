'use client';

import { useActionState, useState } from 'react';
import { addMember, createGroup, setGroupUnits, updateGroup } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { KIND_LABEL, UNIT_CATEGORY_LABEL, type Group } from '@/lib/types';

export type UnitOption = { id: string; name: string; hint?: string };

// Danh sách đơn vị, nhóm, dự án có ô lọc theo tên, chọn nhiều.
export function UnitPicker({ units, selected = [] }: { units: UnitOption[]; selected?: string[] }) {
  const [q, setQ] = useState('');
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const shown = units.filter((u) => fold(`${u.name} ${u.hint ?? ''}`).includes(fold(q)));
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc đơn vị, nhóm, dự án…" className="input mb-2 py-1.5 text-sm" aria-label="Lọc đơn vị, nhóm, dự án" />
      <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 text-sm dark:border-slate-700">
        {units.map((u) => (
          <label key={u.id} className={`flex items-start gap-2 ${shown.includes(u) ? '' : 'hidden'}`}>
            <input type="checkbox" name="unit_ids" value={u.id} defaultChecked={selected.includes(u.id)} className="mt-1" />
            <span>{u.name}{u.hint && <span className="ml-1 text-xs muted">· {u.hint}</span>}</span>
          </label>
        ))}
        {!shown.length && <p className="muted">Không có nhóm khớp.</p>}
      </div>
    </div>
  );
}

// Phân loại đơn vị, chỉ hiện khi Loại là Đơn vị.
function CategorySelect({ value, id }: { value?: string | null; id: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Phân loại đơn vị</label>
      <select id={id} name="unit_category" defaultValue={value ?? ''} className="input">
        <option value="">Chưa phân loại</option>
        {Object.entries(UNIT_CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function KindSelect({ value, onChange, personal = false }: { value?: string; onChange?: (v: string) => void; personal?: boolean }) {
  return (
    <select name="kind" defaultValue={value ?? 'unit'} onChange={(e) => onChange?.(e.target.value)} className="input">
      {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      {personal && <option value="ca_nhan">Cá nhân (chỉ bạn thấy)</option>}
    </select>
  );
}

export function CreateGroupForm({ units = [] }: { units?: UnitOption[] }) {
  const [state, action] = useActionState(createGroup, null);
  const [kind, setKind] = useState('unit');
  return (
    <details id="tao-nhom" ref={(el) => { if (el && window.location.hash === '#tao-nhom') el.open = true; }} className="card group scroll-mt-20 py-3" open={Boolean(state?.error) || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        <span>+ Tạo đơn vị, dự án hoặc sự kiện</span>
        <span className="text-xs font-normal muted group-open:hidden">Bấm để mở</span>
      </summary>
      <form action={action} className="mt-3 space-y-3">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_3fr]">
          <div><label className="label" htmlFor="g-name">Tên nhóm</label><input id="g-name" name="name" required maxLength={200} className="input" placeholder="Ví dụ: Phòng Hành chính" /></div>
          <div><label className="label" htmlFor="g-kind">Loại</label><KindSelect onChange={setKind} personal /></div>
          <div><label className="label" htmlFor="g-desc">Mô tả</label><input id="g-desc" name="description" maxLength={2000} className="input" /></div>
        </div>
        {kind === 'unit' && <div className="md:w-1/3"><CategorySelect id="g-cat" /></div>}
        {kind === 'ca_nhan' && <p className="text-sm muted">Tạo dự án trong mục Cá nhân của bạn: chỉ bạn xem được, không thêm được người khác.</p>}
        {kind !== 'unit' && kind !== 'ca_nhan' && units.length > 0 && (
          <fieldset>
            <legend className="label">Các đơn vị, nhóm, dự án cùng làm (không bắt buộc)</legend>
            <p className="mb-2 text-xs muted">Dự án sẽ tự hiện trong mục &quot;Dự án liên đơn vị&quot; của từng đơn vị, nhóm được chọn.</p>
            <UnitPicker units={units} />
          </fieldset>
        )}
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
  const [kind, setKind] = useState<string>(group.kind);
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
        <div><label className="label" htmlFor="e-kind">Loại</label><KindSelect value={group.kind} onChange={setKind} /></div>
      </div>
      {kind === 'unit' && <CategorySelect id="e-cat" value={group.unit_category} />}
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

export function GroupUnitsForm({ groupId, units, selected }: { groupId: string; units: UnitOption[]; selected: string[] }) {
  const [state, action] = useActionState(setGroupUnits, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Các đơn vị, nhóm, dự án cùng làm</h2>
      <p className="text-xs muted">Dự án tự hiện trong mục &quot;Dự án liên đơn vị&quot; của từng đơn vị, nhóm được chọn (kể cả tổ công tác, không gian chung). Người của nhóm đó thấy tên, lãnh đạo, đầu mối và xin tham gia được; chi tiết vẫn chỉ thành viên dự án xem.</p>
      <input type="hidden" name="group_id" value={groupId} />
      <UnitPicker units={units} selected={selected} />
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}
