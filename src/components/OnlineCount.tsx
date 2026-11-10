'use client';

// Số người đang mở ứng dụng, đếm bằng Supabase Realtime Presence (mỗi tài khoản tính một,
// dù mở nhiều tab). Chỉ gửi mã người dùng, không gửi dữ liệu khác.
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

// Gói Supabase Free cho tối đa 200 kết nối Realtime đồng thời; mỗi người đang mở app dùng một
// kết nối. Đổi bằng NEXT_PUBLIC_ONLINE_CAPACITY khi nâng gói.
const CAPACITY = Number(process.env.NEXT_PUBLIC_ONLINE_CAPACITY) || 200;

export function OnlineCount({ url, anonKey, userId }: { url: string; anonKey: string; userId: string }) {
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(url, anonKey);
    const channel = supabase.channel('dang-truy-cap', { config: { presence: { key: userId } } });
    channel
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') channel.track({ at: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [url, anonKey, userId]);

  const ratio = online === null ? 0 : online / CAPACITY;
  const color = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <p className="flex items-center gap-2 px-2 text-xs muted" title={`Số người đang mở ứng dụng / số người hệ thống phục vụ mượt cùng lúc (${CAPACITY}).`}>
      <span className={`inline-block h-2 w-2 rounded-full ${online === null ? 'bg-slate-400' : color}`} aria-hidden="true" />
      <span>
        Đang truy cập: <strong className="text-slate-700 dark:text-slate-200">{online ?? '…'}</strong> / {CAPACITY}
      </span>
    </p>
  );
}
