'use client';

import { useActionState } from 'react';
import { inviteUser } from '@/lib/invite';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { ROLE_LABEL } from '@/lib/types';

export type GroupOption = { id: string; name: string; parent?: string | null };

export function InviteForm({ groups, showRole = false }: { groups: GroupOption[]; showRole?: boolean }) {
  const [state, action] = useActionState(inviteUser, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Mời đồng nghiệp</h2>
      <div>
        <label className="label" htmlFor="i-emails">Email @vnu.edu.vn (nhiều email cách nhau bằng dấu phẩy hoặc xuống dòng)</label>
        <textarea id="i-emails" name="emails" rows={3} required className="input" placeholder="ten@vnu.edu.vn" />
      </div>
      <div>
        <label className="label" htmlFor="i-group">Nhóm đề xuất</label>
        <select id="i-group" name="group_id" defaultValue="" className="input">
          <option value="">Chưa chọn nhóm</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.parent ? `${g.parent} › ${g.name}` : g.name}</option>)}
        </select>
      </div>
      {showRole && (
        <div>
          <label className="label" htmlFor="i-role">Vai trò</label>
          <select id="i-role" name="system_role" defaultValue="member" className="input">
            {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang mời…">Gửi lời mời</SubmitButton>
      <p className="text-xs muted">Người được mời vào nhóm đề xuất với quyền mặc định của nhóm. Lời mời có hạn 30 ngày; họ vào trang web, nhập email trường để nhận thư đăng nhập.</p>
    </form>
  );
}
