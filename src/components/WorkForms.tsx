'use client';

import { useActionState, useEffect, useState } from 'react';
import { createEvent, createPersonalProject, createTask, updateEvent, updateTask } from '@/lib/work';
import { useCalDraft, vnLocalInput } from '@/components/calendar/draft';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { EVENT_KIND_LABEL, TASK_PRIORITY_LABEL, type Task } from '@/lib/types';

export type Option = { id: string; label: string };

function GroupField({ groupId, groups, id }: { groupId?: string; groups?: Option[]; id: string }) {
  if (groupId) return <input type="hidden" name="group_id" value={groupId} />;
  return (
    <div>
      <label className="label" htmlFor={id}>Nhóm / dự án</label>
      <select id={id} name="group_id" required className="input" defaultValue="">
        <option value="" disabled>Chọn nhóm</option>
        {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
    </div>
  );
}

/** self: giao luôn cho chính mình (trang Việc), không hiện ô Người thực hiện. */
export function TaskForm({ groupId, groups, people, self }: { groupId?: string; groups?: Option[]; people?: Option[]; self?: string }) {
  const [state, action] = useActionState(createTask, null);
  return (
    <form action={action} className="space-y-3">
      <GroupField groupId={groupId} groups={groups} id="t-group" />
      <div><label className="label" htmlFor="t-title">Tên việc</label><input id="t-title" name="title" required maxLength={300} className="input" placeholder="Ví dụ: Chuẩn bị tờ trình" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {self ? (
          <div>
            <input type="hidden" name="assignee_id" value={self} />
            <label className="label" htmlFor="t-start">Bắt đầu</label><input id="t-start" name="start_date" type="date" className="input" />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="t-assignee">Người thực hiện</label>
            <select id="t-assignee" name="assignee_id" className="input" defaultValue="">
              <option value="">Chưa giao</option>
              {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}
        <div><label className="label" htmlFor="t-due">Hạn</label><input id="t-due" name="due_date" type="date" className="input" /></div>
        <div>
          <label className="label" htmlFor="t-pri">Ưu tiên</label>
          <select id="t-pri" name="priority" defaultValue="normal" className="input">
            {Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div><label className="label" htmlFor="t-desc">Mô tả</label><textarea id="t-desc" name="description" rows={2} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang tạo…">Tạo việc</SubmitButton>
    </form>
  );
}

// Mở từ lịch: điền sẵn khung giờ vừa kéo chọn; mở bằng nút Sửa: sửa lịch đang chọn.
export function EventForm({ groupId, groups, personal }: { groupId?: string; groups?: Option[]; personal?: boolean }) {
  const draft = useCalDraft();
  const ed = draft.edit;
  const raw = ed?.edit ?? {};
  const [state, action] = useActionState(ed ? updateEvent : createEvent, null);
  const { close } = draft;
  useEffect(() => { if (state?.ok && close) close(); }, [state, close]);
  // Lịch nhóm luôn có giờ: chọn cả ngày (ở kiểu xem tháng) thì điền sẵn 08:00–09:00 ngày đó.
  const day = draft.start ? vnLocalInput(draft.start).slice(0, 10) : '';
  const startVal = ed ? vnLocalInput(ed.starts_at) : draft.start ? (draft.allDay ? `${day}T08:00` : vnLocalInput(draft.start)) : undefined;
  const endVal = ed ? vnLocalInput(ed.ends_at) : draft.end ? (draft.allDay ? `${day}T09:00` : vnLocalInput(draft.end)) : undefined;
  return (
    <form action={action} className="space-y-3">
      {ed ? <input type="hidden" name="id" value={ed.editId?.split(':')[1] ?? ''} /> : <GroupField groupId={groupId} groups={groups} id="e-group" />}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="ev-title">Tiêu đề</label><input id="ev-title" name="title" required maxLength={300} className="input" autoFocus={Boolean(close)} defaultValue={ed ? String(raw.title ?? ed.title) : ''} placeholder="Ví dụ: Họp giao ban tuần" /></div>
        <div>
          <label className="label" htmlFor="ev-kind">Loại</label>
          <select id="ev-kind" name="kind" defaultValue={typeof raw.kind === 'string' ? raw.kind : 'meeting'} className="input">
            {Object.entries(EVENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ev-start">Bắt đầu</label><input id="ev-start" name="starts_at" type="datetime-local" required defaultValue={startVal} className="input" /></div>
        <div><label className="label" htmlFor="ev-end">Kết thúc</label><input id="ev-end" name="ends_at" type="datetime-local" defaultValue={endVal} className="input" /></div>
      </div>
      <div><label className="label" htmlFor="ev-loc">Địa điểm</label><input id="ev-loc" name="location" maxLength={300} defaultValue={ed?.location ?? ''} className="input" /></div>
      <div><label className="label" htmlFor="ev-desc">Ghi chú</label><textarea id="ev-desc" name="description" rows={2} defaultValue={ed?.description ?? ''} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang lưu…">{ed ? 'Lưu thay đổi' : 'Thêm vào lịch'}</SubmitButton>
      <p className="text-xs muted">{ed ? 'Trên lịch có thể kéo để dời giờ, kéo mép dưới để đổi giờ kết thúc.' : personal ? 'Lịch trong mục Cá nhân chỉ bạn thấy; lịch của nhóm sẽ báo cho thành viên.' : 'Thành viên của nhóm sẽ nhận thông báo.'} Giờ theo giờ Việt Nam.</p>
    </form>
  );
}

export function PersonalProjectForm() {
  const [state, action] = useActionState(createPersonalProject, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="name" required maxLength={200} className="input flex-1" placeholder="Ví dụ: Nghiên cứu khoa học cá nhân" aria-label="Tên dự án cá nhân" />
        <SubmitButton pendingText="Đang tạo…">Tạo</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/**
 * Nút "Sửa" trên từng đầu việc: mở khung sửa tên, mô tả, người thực hiện, ngày bắt đầu, hạn, ưu tiên.
 * Trả về hai phần tử flex: nút (cạnh nút Lưu/Xóa) và khung sửa chiếm trọn một dòng bên dưới.
 * people: danh sách thành viên để đổi người thực hiện; không truyền thì giữ nguyên người được giao.
 */
export function TaskEditButton({ task, people }: { task: Task; people?: Option[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(updateTask, null);
  useEffect(() => { if (state?.ok) setOpen(false); }, [state]);
  const p = `te-${task.id}`;
  const options = people && task.assignee_id && !people.some((o) => o.id === task.assignee_id)
    ? [{ id: task.assignee_id, label: 'Người đang được giao' }, ...people]
    : people;
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="btn-secondary px-2 py-1 text-xs">
        {open ? 'Đóng' : 'Sửa'}
      </button>
      {open && (
        <form action={action} className="basis-full space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <input type="hidden" name="id" value={task.id} />
          <div><label className="label" htmlFor={`${p}-title`}>Tên việc</label><input id={`${p}-title`} name="title" required maxLength={300} defaultValue={task.title} className="input" autoFocus /></div>
          <div className="grid gap-3 sm:grid-cols-4">
            {options && (
              <div>
                <label className="label" htmlFor={`${p}-assignee`}>Người thực hiện</label>
                <select id={`${p}-assignee`} name="assignee_id" className="input" defaultValue={task.assignee_id ?? ''}>
                  <option value="">Chưa giao</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div><label className="label" htmlFor={`${p}-start`}>Bắt đầu</label><input id={`${p}-start`} name="start_date" type="date" defaultValue={task.start_date ?? ''} className="input" /></div>
            <div><label className="label" htmlFor={`${p}-due`}>Hạn</label><input id={`${p}-due`} name="due_date" type="date" defaultValue={task.due_date ?? ''} className="input" /></div>
            <div>
              <label className="label" htmlFor={`${p}-pri`}>Ưu tiên</label>
              <select id={`${p}-pri`} name="priority" defaultValue={task.priority} className="input">
                {Object.entries(TASK_PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`${p}-desc`}>Mô tả</label>
            <textarea id={`${p}-desc`} name="description" rows={3} defaultValue={task.description ?? ''} className="input" />
            <p className="mt-1 text-xs muted">Ghi &quot;Người phụ trách: …&quot; hoặc &quot;Phối hợp: …&quot; (mỗi ý một dòng) để hiện thành Bên phụ trách, Bên phối hợp.</p>
          </div>
          <FormMessage state={state} />
          <div className="flex gap-2">
            <SubmitButton pendingText="Đang lưu…">Lưu thay đổi</SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Hủy</button>
          </div>
        </form>
      )}
    </>
  );
}
