'use client';

import { useActionState } from 'react';
import { createEvent, createTask, requestBooking, saveBookingPage } from '@/lib/work';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { EVENT_KIND_LABEL, TASK_PRIORITY_LABEL, type BookingPage } from '@/lib/types';

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

export function TaskForm({ groupId, groups, people }: { groupId?: string; groups?: Option[]; people?: Option[] }) {
  const [state, action] = useActionState(createTask, null);
  return (
    <form action={action} className="space-y-3">
      <GroupField groupId={groupId} groups={groups} id="t-group" />
      <div><label className="label" htmlFor="t-title">Tên việc</label><input id="t-title" name="title" required maxLength={300} className="input" placeholder="Ví dụ: Chuẩn bị tờ trình" /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="t-assignee">Người thực hiện</label>
          <select id="t-assignee" name="assignee_id" className="input" defaultValue="">
            <option value="">Chưa giao</option>
            {(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
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

export function EventForm({ groupId, groups }: { groupId?: string; groups?: Option[] }) {
  const [state, action] = useActionState(createEvent, null);
  return (
    <form action={action} className="space-y-3">
      <GroupField groupId={groupId} groups={groups} id="e-group" />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="ev-title">Tiêu đề</label><input id="ev-title" name="title" required maxLength={300} className="input" placeholder="Ví dụ: Họp giao ban tuần" /></div>
        <div>
          <label className="label" htmlFor="ev-kind">Loại</label>
          <select id="ev-kind" name="kind" defaultValue="meeting" className="input">
            {Object.entries(EVENT_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="ev-start">Bắt đầu</label><input id="ev-start" name="starts_at" type="datetime-local" required className="input" /></div>
        <div><label className="label" htmlFor="ev-end">Kết thúc</label><input id="ev-end" name="ends_at" type="datetime-local" className="input" /></div>
      </div>
      <div><label className="label" htmlFor="ev-loc">Địa điểm</label><input id="ev-loc" name="location" maxLength={300} className="input" /></div>
      <div><label className="label" htmlFor="ev-desc">Ghi chú</label><textarea id="ev-desc" name="description" rows={2} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang lưu…">Thêm vào lịch</SubmitButton>
      <p className="text-xs muted">Thành viên của nhóm sẽ nhận thông báo. Giờ theo giờ Việt Nam.</p>
    </form>
  );
}

export function BookingPageForm({ page }: { page: BookingPage | null }) {
  const [state, action] = useActionState(saveBookingPage, null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="is_open" defaultChecked={page?.is_open ?? true} /> Nhận yêu cầu đặt lịch</label>
      <div><label className="label" htmlFor="bp-hours">Khung giờ nhận lịch</label><input id="bp-hours" name="hours_note" defaultValue={page?.hours_note ?? ''} maxLength={300} className="input" placeholder="Ví dụ: Sáng thứ Ba và thứ Năm, 8:00 đến 11:00" /></div>
      <div><label className="label" htmlFor="bp-intro">Lời nhắn cho người đặt</label><textarea id="bp-intro" name="intro" rows={2} defaultValue={page?.intro ?? ''} className="input" placeholder="Ví dụ: Ghi rõ nội dung và tài liệu cần xem trước." /></div>
      <div className="max-w-40"><label className="label" htmlFor="bp-slot">Mỗi lượt (phút)</label><input id="bp-slot" name="slot_minutes" type="number" min={10} max={240} step={5} defaultValue={page?.slot_minutes ?? 30} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton>{page ? 'Lưu' : 'Mở trang đặt lịch'}</SubmitButton>
    </form>
  );
}

export function BookingRequestForm({ hostId, slotMinutes }: { hostId: string; slotMinutes: number }) {
  const [state, action] = useActionState(requestBooking, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="host_id" value={hostId} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="b-start">Thời gian</label><input id="b-start" name="starts_at" type="datetime-local" required className="input" /></div>
        <div><label className="label" htmlFor="b-min">Thời lượng (phút)</label><input id="b-min" name="minutes" type="number" min={10} max={240} step={5} defaultValue={slotMinutes} className="input" /></div>
      </div>
      <div><label className="label" htmlFor="b-topic">Nội dung cần gặp</label><input id="b-topic" name="topic" required maxLength={300} className="input" /></div>
      <div><label className="label" htmlFor="b-note">Ghi chú thêm</label><textarea id="b-note" name="note" rows={2} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang gửi…">Gửi yêu cầu</SubmitButton>
    </form>
  );
}
