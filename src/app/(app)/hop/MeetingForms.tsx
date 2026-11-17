'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { updateMeetingItem } from './actions';
import { DOC_TYPES, POST_DOC_TYPES, PRE_DOC_TYPES, type DocType } from '@/lib/meeting-rules';

function DocTypeSelect({ id, value }: { id: string; value?: string | null }) {
  return (
    <div>
      <label className="label" htmlFor={id}>Loại tài liệu</label>
      <select id={id} name="doc_type" className="input" defaultValue={value ?? ''}>
        <option value="">(Không ghi)</option>
        <optgroup label="Trước họp">{PRE_DOC_TYPES.filter((d) => d !== 'khac').map((d) => <option key={d} value={d}>{DOC_TYPES[d]}</option>)}</optgroup>
        <optgroup label="Sau họp">{POST_DOC_TYPES.filter((d) => d !== 'khac').map((d) => <option key={d} value={d}>{DOC_TYPES[d]}</option>)}</optgroup>
        <option value="khac">{DOC_TYPES.khac}</option>
      </select>
    </div>
  );
}
export type { DocType };

export type MeetingRef = { source_id: string; event_key: string; title: string; starts_at: string };
export type ItemValues = { id: string; party: string | null; title: string | null; url: string | null; note: string | null; assignee_id: string | null; doc_type: string | null; file_name?: string | null };

export function EditItemForm({ item }: { item: ItemValues }) {
  const [state, action] = useActionState(updateMeetingItem, null);
  const uid = `e-${item.id}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={item.id} />
      {/* Bên gửi và người đôn đốc đã ẩn khỏi giao diện (mọi người gửi hộ nhau); giữ nguyên giá trị cũ khi lưu. */}
      <input type="hidden" name="party" value={item.party ?? ''} />
      <input type="hidden" name="assignee_id" value={item.assignee_id ?? ''} />
      <div className="grid gap-3 sm:grid-cols-2">
        {item.file_name ? (
          <div>
            <span className="label">Tệp đã tải lên</span>
            <input type="hidden" name="url" value={item.url ?? ''} />
            <p className="truncate py-2 text-sm">📎 {item.file_name}</p>
          </div>
        ) : (
          <div><label className="label" htmlFor={`${uid}-url`}>Link Google Drive</label><input id={`${uid}-url`} name="url" type="url" className="input" defaultValue={item.url ?? ''} placeholder="https://drive.google.com/..." /></div>
        )}
        <div><label className="label" htmlFor={`${uid}-title`}>Tên tài liệu</label><input id={`${uid}-title`} name="title" maxLength={200} className="input" defaultValue={item.title ?? ''} /></div>
        <DocTypeSelect id={`${uid}-dt`} value={item.doc_type} />
      </div>
      <div><label className="label" htmlFor={`${uid}-note`}>Ghi chú</label><input id={`${uid}-note`} name="note" maxLength={500} className="input" defaultValue={item.note ?? ''} /></div>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}
