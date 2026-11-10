'use client';

import { useActionState } from 'react';
import { inviteUser } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { ROLE_LABEL } from '@/lib/types';

export function InviteForm() {
  const [state, action] = useActionState(inviteUser, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Mời người dùng</h2>
      <div><label className="label" htmlFor="i-emails">Email (nhiều email cách nhau bằng dấu phẩy hoặc xuống dòng)</label><textarea id="i-emails" name="emails" rows={3} required className="input" placeholder="ten@vnu.edu.vn" /></div>
      <div>
        <label className="label" htmlFor="i-role">Vai trò</label>
        <select id="i-role" name="system_role" defaultValue="member" className="input">
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang mời…">Gửi lời mời</SubmitButton>
      <p className="text-xs muted">Lời mời có hạn 30 ngày. Người được mời vào trang đăng nhập, nhập email trường và mã gửi tới email.</p>
    </form>
  );
}
