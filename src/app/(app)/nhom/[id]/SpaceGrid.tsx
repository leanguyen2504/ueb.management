'use client';

import { useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { moveGroup } from '../actions';

type Item = { id: string; name: string; card: ReactNode };
type Target = { id: string; name: string };

const MIME = 'application/x-ueb-space';

// Lưới thẻ không gian kéo thả được: thả một thẻ lên thẻ khác để đưa vào trong đó,
// hoặc thả lên ô "Đưa lên" để chuyển ra nhóm cấp trên. Có thêm ô chọn cho bàn phím và điện thoại.
export function SpaceGrid({ groupId, items, up, canMove }: { groupId: string; items: Item[]; up: Target | null; canMove: boolean }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

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
            draggable={canMove}
            onDragStart={canMove ? (e) => { e.dataTransfer.setData(MIME, it.id); e.dataTransfer.effectAllowed = 'move'; setDragging(it.id); setMsg(null); } : undefined}
            onDragEnd={canMove ? () => { setDragging(null); setOver(null); } : undefined}
            {...dropProps(it.id)}
            className={`relative rounded-xl ${dragging === it.id ? 'opacity-40' : ''} ${over === it.id ? 'ring-2 ring-brand-600 ring-offset-2 dark:ring-brand-300' : ''} ${canMove ? 'cursor-grab active:cursor-grabbing' : ''}`}
          >
            {it.card}
            {canMove && (items.length > 1 || up) && (
              <label className="absolute right-2 top-2">
                <span className="sr-only">Chuyển {it.name} vào</span>
                <select
                  value=""
                  disabled={pending}
                  onChange={(e) => move(it.id, e.target.value)}
                  title="Chuyển vào…"
                  className="w-7 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent px-1 text-center text-xs text-slate-500 hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <option value="">⋯</option>
                  {up && <option value={up.id}>↑ Đưa lên {up.name}</option>}
                  {items.filter((o) => o.id !== it.id).map((o) => (
                    <option key={o.id} value={o.id}>Vào {o.name}</option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
