'use client';

import { useActionState } from 'react';
import { addSource } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';

export function AddSourceForm() {
  const [state, action] = useActionState(addSource, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Thêm lịch Google</h2>
      <div>
        <label className="label" htmlFor="gc-cal">Mã lịch hoặc link lịch dùng chung</label>
        <input id="gc-cal" name="calendar" required className="input" placeholder="abc123@group.calendar.google.com hoặc https://calendar.google.com/calendar/embed?src=..." />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="gc-label">Tên hiển thị</label><input id="gc-label" name="label" maxLength={80} className="input" placeholder="Lịch tuần BGH" /></div>
        <div>
          <label className="label" htmlFor="gc-vis">Ai được xem</label>
          <select id="gc-vis" name="visibility" className="input" defaultValue="office">
            <option value="office">Hiệu trưởng, thư ký và quản trị</option>
            <option value="all">Mọi người dùng</option>
          </select>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang thêm và tải lịch…">Thêm lịch</SubmitButton>
    </form>
  );
}
