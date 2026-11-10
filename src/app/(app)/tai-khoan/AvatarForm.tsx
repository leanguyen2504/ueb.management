'use client';

/* eslint-disable @next/next/no-img-element */
import { useActionState, useRef, useState, useTransition } from 'react';
import { removeAvatar, uploadAvatar } from './actions';
import { FormMessage } from '@/components/FormMessage';

// Cắt ảnh vuông ở giữa và thu nhỏ còn 400×400 trước khi gửi, để ảnh nhẹ (~50 KB).
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(400, side);
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
}

export function AvatarForm({ hasAvatar }: { hasAvatar: boolean }) {
  const [state, action, pending] = useActionState(uploadAvatar, null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setErr(null);
    if (!f) return;
    if (!f.type.startsWith('image/')) return setErr('Hãy chọn một tệp ảnh.');
    try {
      const blob = await shrink(f);
      const fd = new FormData();
      fd.set('avatar', new File([blob], 'anh.jpg', { type: 'image/jpeg' }));
      setPreview(URL.createObjectURL(blob));
      action(fd);
    } catch {
      setErr('Không đọc được ảnh này. Hãy thử ảnh JPG hoặc PNG khác.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Ảnh cá nhân</h2>
      <div className="flex flex-wrap items-center gap-3">
        {preview && <img src={preview} alt="Ảnh vừa chọn" className="h-16 w-16 rounded-full object-cover" />}
        <label className="btn cursor-pointer">
          {pending ? 'Đang tải lên…' : hasAvatar ? 'Đổi ảnh' : 'Chọn ảnh'}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={onPick} disabled={pending} />
        </label>
        {hasAvatar && (
          <button type="button" className="btn-secondary" disabled={removing} onClick={() => startRemove(() => removeAvatar())}>
            {removing ? 'Đang gỡ…' : 'Gỡ ảnh'}
          </button>
        )}
      </div>
      {err ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p> : <FormMessage state={state} />}
      <p className="text-xs muted">Ảnh được cắt vuông và thu nhỏ trước khi tải lên. Chỉ đồng nghiệp đã đăng nhập xem được.</p>
    </section>
  );
}
