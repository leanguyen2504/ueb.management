'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { saveArea } from './actions';

export type AreaValues = { id: string; name: string; group_id: string | null; primary_email: string | null; coordinator_emails: string[]; sort_order: number };

export function AreaForm({ area, groups, uid }: { area?: AreaValues; groups: { id: string; name: string }[]; uid: string }) {
  const [state, action] = useActionState(saveArea, null);
  return (
    <form action={action} className="space-y-3">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor={`${uid}-n`}>Mảng / đơn vị</label><input id={`${uid}-n`} name="name" required maxLength={120} className="input" defaultValue={area?.name ?? ''} placeholder="Ví dụ: Khoa Kinh tế Phát triển" /></div>
        <div>
          <label className="label" htmlFor={`${uid}-g`}>Nhóm trên hệ thống (nếu có)</label>
          <select id={`${uid}-g`} name="group_id" className="input" defaultValue={area?.group_id ?? ''}>
            <option value="">(Không gắn)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor={`${uid}-p`}>Email đầu mối phụ trách chính</label><input id={`${uid}-p`} name="primary_email" type="email" className="input" defaultValue={area?.primary_email ?? ''} placeholder="ten@vnu.edu.vn" /></div>
        <div><label className="label" htmlFor={`${uid}-c`}>Email người phối hợp (cách nhau dấu phẩy)</label><input id={`${uid}-c`} name="coordinator_emails" className="input" defaultValue={area?.coordinator_emails.join(', ') ?? ''} /></div>
        <div><label className="label" htmlFor={`${uid}-o`}>Thứ tự</label><input id={`${uid}-o`} name="sort_order" type="number" className="input" defaultValue={area?.sort_order ?? 0} /></div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>{area ? 'Lưu' : 'Thêm mảng'}</SubmitButton>
    </form>
  );
}
