'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { addMeetingItems, saveMeetingRecord, updateMeetingItem } from './actions';
import { DOC_TYPES, POST_DOC_TYPES, PRE_DOC_TYPES, STATUS_LABEL, type DocType } from '@/lib/meeting-rules';

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
      <DocTypeSelect id={`${uid}-dt`} />
      <div>
        <label className="label" htmlFor={`${uid}-party`}>Bên gửi / mảng</label>
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

export type ItemValues = { id: string; party: string | null; title: string | null; url: string | null; note: string | null; assignee_id: string | null; doc_type: string | null; file_name?: string | null };

export function EditItemForm({ item, people, partiesListId }: { item: ItemValues; people: PersonOption[]; partiesListId: string }) {
  const [state, action] = useActionState(updateMeetingItem, null);
  const uid = `e-${item.id}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={item.id} />
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
        <div><label className="label" htmlFor={`${uid}-party`}>Bên gửi</label><input id={`${uid}-party`} name="party" maxLength={120} className="input" list={partiesListId} defaultValue={item.party ?? ''} /></div>
        <AssigneeSelect id={`${uid}-as`} people={people} value={item.assignee_id} />
        <DocTypeSelect id={`${uid}-dt`} value={item.doc_type} />
      </div>
      <div><label className="label" htmlFor={`${uid}-note`}>Ghi chú</label><input id={`${uid}-note`} name="note" maxLength={500} className="input" defaultValue={item.note ?? ''} /></div>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}

export type RecordValues = { jira_key: string | null; drive_folder_url: string | null; status: string | null; follow_up: string | null };

// Thông tin chung của buổi họp: mã Jira, thư mục Drive, tình trạng, nội dung cần theo dõi.
export function RecordForm({ meeting, values, autoJira, autoStatusLabel, uid }: { meeting: MeetingRef; values: RecordValues | null; autoJira: string | null; autoStatusLabel: string; uid: string }) {
  const [state, action] = useActionState(saveMeetingRecord, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="source_id" value={meeting.source_id} />
      <input type="hidden" name="event_key" value={meeting.event_key} />
      <input type="hidden" name="meeting_title" value={meeting.title} />
      <input type="hidden" name="meeting_starts_at" value={meeting.starts_at} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${uid}-jira`}>Mã Jira</label>
          <input id={`${uid}-jira`} name="jira_key" className="input" maxLength={30} defaultValue={values?.jira_key ?? ''} placeholder={autoJira ? `${autoJira} (đọc từ lịch)` : 'Ví dụ: KHTC-6447'} />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-folder`}>Thư mục Drive của buổi họp</label>
          <input id={`${uid}-folder`} name="drive_folder_url" type="url" className="input" defaultValue={values?.drive_folder_url ?? ''} placeholder="https://drive.google.com/drive/folders/..." />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-st`}>Tình trạng xử lý</label>
          <select id={`${uid}-st`} name="status" className="input" defaultValue={values?.status ?? ''}>
            <option value="">Tự động ({autoStatusLabel})</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${uid}-fu`}>Nội dung cần tiếp tục theo dõi</label>
        <textarea id={`${uid}-fu`} name="follow_up" rows={2} maxLength={2000} className="input" defaultValue={values?.follow_up ?? ''} placeholder="Ví dụ: Phòng ĐT gửi kế hoạch chỉnh sửa trước 20/11" />
      </div>
      <FormMessage state={state} />
      <SubmitButton>Lưu thông tin</SubmitButton>
    </form>
  );
}
