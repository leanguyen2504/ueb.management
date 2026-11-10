'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { addMeetingItems, updateMeetingItem } from './actions';

export type PersonOption = { id: string; label: string };
export type MeetingRef = { source_id: string; event_key: string; title: string; starts_at: string };

function AssigneeSelect({ id, people, value }: { id: string; people: PersonOption[]; value?: string | null }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Người đôn đốc</label>
      <select id={id} name="assignee_id" className="input" defaultValue={value ?? ''}>
        <option value="">Tôi</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  );
}

export function AddItemForm({ meeting, people, partiesListId, uid }: { meeting: MeetingRef; people: PersonOption[]; partiesListId: string; uid: string }) {
  const [state, action] = useActionState(addMeetingItems, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="source_id" value={meeting.source_id} />
      <input type="hidden" name="event_key" value={meeting.event_key} />
      <input type="hidden" name="meeting_title" value={meeting.title} />
      <input type="hidden" name="meeting_starts_at" value={meeting.starts_at} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${uid}-kind`}>Loại</label>
          <select id={`${uid}-kind`} name="kind" className="input" defaultValue="pre">
            <option value="pre">Tài liệu trước họp</option>
            <option value="minutes">Biên bản, kết luận sau họp</option>
          </select>
        </div>
        <AssigneeSelect id={`${uid}-as`} people={people} />
      </div>
      <div>
        <label className="label" htmlFor={`${uid}-party`}>Bên gửi</label>
        <textarea id={`${uid}-party`} name="party" rows={2} className="input"
          placeholder={'Ví dụ: Phòng Đào tạo\nKhoa KTPT\n(mỗi dòng một bên; chưa có link thì mỗi bên thành một dòng "chờ gửi")'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`${uid}-url`}>Link Google Drive (để trống nếu chưa nhận)</label><input id={`${uid}-url`} name="url" type="url" className="input" placeholder="https://drive.google.com/..." /></div>
        <div><label className="label" htmlFor={`${uid}-title`}>Tên tài liệu</label><input id={`${uid}-title`} name="title" maxLength={200} className="input" placeholder="Ví dụ: Báo cáo OKR quý 4" /></div>
      </div>
      <div><label className="label" htmlFor={`${uid}-note`}>Ghi chú</label><input id={`${uid}-note`} name="note" maxLength={500} className="input" placeholder="Ví dụ: đã gọi điện nhắc ngày 9/11" /></div>
      <FormMessage state={state} />
      <SubmitButton>Thêm</SubmitButton>
    </form>
  );
}

export type ItemValues = { id: string; party: string | null; title: string | null; url: string | null; note: string | null; assignee_id: string | null };

export function EditItemForm({ item, people, partiesListId }: { item: ItemValues; people: PersonOption[]; partiesListId: string }) {
  const [state, action] = useActionState(updateMeetingItem, null);
  const uid = `e-${item.id}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={item.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`${uid}-url`}>Link Google Drive</label><input id={`${uid}-url`} name="url" type="url" className="input" defaultValue={item.url ?? ''} placeholder="https://drive.google.com/..." /></div>
        <div><label className="label" htmlFor={`${uid}-title`}>Tên tài liệu</label><input id={`${uid}-title`} name="title" maxLength={200} className="input" defaultValue={item.title ?? ''} /></div>
        <div><label className="label" htmlFor={`${uid}-party`}>Bên gửi</label><input id={`${uid}-party`} name="party" maxLength={120} className="input" list={partiesListId} defaultValue={item.party ?? ''} /></div>
        <AssigneeSelect id={`${uid}-as`} people={people} value={item.assignee_id} />
      </div>
      <div><label className="label" htmlFor={`${uid}-note`}>Ghi chú</label><input id={`${uid}-note`} name="note" maxLength={500} className="input" defaultValue={item.note ?? ''} /></div>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}
