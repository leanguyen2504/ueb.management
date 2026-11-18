'use client';

import { useActionState, useEffect, useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { moveGroup, requestDelete, updateSpace } from '../actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';

type Item = { id: string; name: string; description?: string | null; card: ReactNode; pendingDelete?: boolean; canEdit?: boolean };
type Target = { id: string; name: string };

const MIME = 'application/x-ueb-space';
const DELETE = '__xoa';
const EDIT = '__sua';

// Lưới thẻ không gian kéo thả được: thả một thẻ lên thẻ khác để đưa vào trong đó,
// hoặc thả lên ô "Đưa lên" để chuyển ra nhóm cấp trên. Có thêm ô chọn cho bàn phím và điện thoại.
// Ô ⋯ còn có mục sửa tên, mô tả và mục xóa: Trưởng nhóm xóa ngay, người khác gửi đề nghị để Trưởng nhóm duyệt.
export function SpaceGrid({ groupId, items, up, canMove, canDelete }: { groupId: string; items: Item[]; up: Target | null; canMove: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  const name = (id: string) => (up?.id === id ? up.name : items.find((i) => i.id === id)?.name ?? '');
  const move = (id: string, dest: string) => {
    if (!id || !dest || id === dest) return;
    const what = name(id);
    const where = name(dest);
    if (!window.confirm(`Chuyển “${what}” vào “${where}”?`)) return;
    start(async () => {
      const r = await moveGroup(id, dest, groupId);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Đã chuyển “${what}” vào “${where}”.` });
      if (!r.error) router.refresh();
    });
  };

  const remove = (it: Item) => {
    let reason: string | null = null;
    if (canDelete) {
      if (!window.confirm(`Xóa vĩnh viễn “${it.name}” cùng mọi việc, lịch, thành viên bên trong? Không hoàn tác được.`)) return;
    } else {
      reason = window.prompt(`Đề nghị Trưởng nhóm xóa “${it.name}”.\nLý do (không bắt buộc):`, '');
      if (reason === null) return;
    }
    start(async () => {
      const r = await requestDelete('group', it.id, groupId, reason);
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: r.ok! });
      if (!r.error) router.refresh();
    });
  };
  const choose = (it: Item, value: string) => {
    if (value === EDIT) { setMsg(null); setEditing(it.id); return; }
    return value === DELETE ? remove(it) : move(it.id, value);
  };

  const dropProps = (dest: string) =>
    canMove
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragging || dragging === dest) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOver(dest);
          },
          onDragLeave: () => setOver((o) => (o === dest ? null : o)),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData(MIME) || dragging;
            setOver(null);
            setDragging(null);
            if (id) move(id, dest);
          },
        }
      : {};

  return (
    <div>
      {canMove && items.length > 0 && (
        <p className="mb-2 text-xs muted">Kéo một thẻ thả vào thẻ khác để đưa vào trong đó, như thư mục con.</p>
      )}
      {msg && (
        <p role="status" className={`mb-2 text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{msg.text}</p>
      )}
      {canMove && up && dragging && (
        <div
          {...dropProps(up.id)}
          className={`mb-3 rounded-xl border-2 border-dashed p-3 text-center text-sm ${over === up.id ? 'border-brand-600 bg-brand-600/10' : 'border-slate-300 dark:border-slate-700'}`}
        >
          ↑ Thả vào đây để đưa lên {up.name}
        </div>
      )}
      <ul className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${pending ? 'opacity-60' : ''}`}>
        {items.map((it) => (
          <li
            key={it.id}
            draggable={canMove && editing !== it.id}
            onDragStart={canMove ? (e) => { e.dataTransfer.setData(MIME, it.id); e.dataTransfer.effectAllowed = 'move'; setDragging(it.id); setMsg(null); } : undefined}
            onDragEnd={canMove ? () => { setDragging(null); setOver(null); } : undefined}
            {...dropProps(it.id)}
            className={`relative rounded-xl ${dragging === it.id ? 'opacity-40' : ''} ${over === it.id ? 'ring-2 ring-brand-600 ring-offset-2 dark:ring-brand-300' : ''} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
          >
            {it.card}
            {editing === it.id && <SpaceEditForm item={it} fromId={groupId} onDone={() => setEditing(null)} />}
            {((canMove && (items.length > 1 || up)) || !it.pendingDelete || it.canEdit) && (
              <label className="absolute right-2 top-2">
                <span className="sr-only">Thao tác với {it.name}</span>
                <select
                  value=""
                  disabled={pending}
                  onChange={(e) => choose(it, e.target.value)}
                  title="Sửa, chuyển, xóa…"
                  className="w-7 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent px-1 text-center text-xs text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <option value="">⋯</option>
                  {it.canEdit && <option value={EDIT}>Sửa tên, mô tả…</option>}
                  {canMove && up && <option value={up.id}>↑ Đưa lên {up.name}</option>}
                  {canMove && items.filter((o) => o.id !== it.id).map((o) => (
                    <option key={o.id} value={o.id}>Vào {o.name}</option>
                  ))}
                  {!it.pendingDelete && <option value={DELETE}>{canDelete ? 'Xóa không gian…' : 'Đề nghị xóa…'}</option>}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpaceEditForm({ item, fromId, onDone }: { item: Item; fromId: string; onDone: () => void }) {
  const [state, action] = useActionState(updateSpace, null);
  useEffect(() => { if (state?.ok) onDone(); }, [state, onDone]);
  const p = `sp-${item.id}`;
  return (
    <form action={action} className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="from_id" value={fromId} />
      <div><label className="label" htmlFor={`${p}-name`}>Tên không gian</label><input id={`${p}-name`} name="name" required maxLength={200} defaultValue={item.name} className="input" autoFocus /></div>
      <div><label className="label" htmlFor={`${p}-desc`}>Mô tả</label><textarea id={`${p}-desc`} name="description" rows={2} maxLength={2000} defaultValue={item.description ?? ''} className="input" /></div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton pendingText="Đang lưu…">Lưu</SubmitButton>
        <button type="button" onClick={onDone} className="btn-secondary">Hủy</button>
      </div>
    </form>
  );
}
