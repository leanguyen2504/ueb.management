'use client';

import { useActionState, useState } from 'react';
import { createSubgroup } from '@/lib/work';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';

export function SubgroupForm({ parentId, people, me, units = [] }: { parentId: string; people: { id: string; label: string }[]; me: string; units?: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createSubgroup, null);
  const [q, setQ] = useState('');
  const [uq, setUq] = useState('');
  const uShown = units.filter((u) => u.name.toLowerCase().includes(uq.trim().toLowerCase()));
  const others = people.filter((p) => p.id !== me);
  const shown = others.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="parent_id" value={parentId} />
      <div><label className="label" htmlFor="sg-name">Tên không gian</label><input id="sg-name" name="name" required maxLength={200} className="input" placeholder="Ví dụ: Ngày hội tư vấn tuyển sinh 2026" /></div>
      <div><label className="label" htmlFor="sg-desc">Mô tả</label><input id="sg-desc" name="description" maxLength={2000} className="input" /></div>
      <fieldset>
        <legend className="label">Người tham gia ({others.length} thành viên của nhóm)</legend>
        {others.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên…" className="input mb-2 py-1" aria-label="Tìm người tham gia" />}
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {others.map((p) => (
            <label key={p.id} className={`flex items-center gap-2 text-sm ${shown.includes(p) ? '' : 'hidden'}`}>
              <input type="checkbox" name="member_ids" value={p.id} /> {p.label}
            </label>
          ))}
          {!others.length && <p className="text-sm muted">Nhóm chưa có thành viên khác. Bạn có thể thêm người sau khi tạo.</p>}
        </div>
      </fieldset>
      {units.length > 0 && (
        <fieldset>
          <legend className="label">Đơn vị/phòng ban cùng làm (không bắt buộc)</legend>
          <p className="mb-2 text-xs muted">Không gian sẽ tự hiện trong trang của từng đơn vị được chọn; Trưởng nhóm, Văn thư của đơn vị đó nhận thông báo và mời người của họ vào.</p>
          <input value={uq} onChange={(e) => setUq(e.target.value)} placeholder="Tìm đơn vị…" className="input mb-2 py-1" aria-label="Tìm đơn vị" />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {units.map((u) => (
              <label key={u.id} className={`flex items-center gap-2 text-sm ${uShown.includes(u) ? '' : 'hidden'}`}>
                <input type="checkbox" name="unit_ids" value={u.id} /> {u.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang tạo…">Tạo không gian</SubmitButton>
      <p className="text-xs muted">Chỉ người tham gia (và lãnh đạo, quản trị) thấy việc trong không gian này. Bạn là Trưởng nhóm của không gian.</p>
    </form>
  );
}
