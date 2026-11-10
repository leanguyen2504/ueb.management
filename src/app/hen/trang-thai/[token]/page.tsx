import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cancelByToken } from '@/lib/work';
import { fmtTime, vnDay, weekdayShort } from '@/lib/format';
import { BOOKING_STATUS_LABEL, type BookingStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trạng thái lịch hẹn', robots: { index: false } };

type Row = { host_name: string; topic: string; starts_at: string; ends_at: string; status: BookingStatus; response_note: string | null; location: string | null };

export default async function BookingStatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc('booking_by_token', { p_token: token });
  const b = (data as Row[] | null)?.[0];
  if (!b) notFound();
  const day = vnDay(b.starts_at);
  const active = (b.status === 'pending' || b.status === 'accepted') && new Date(b.ends_at) > new Date();
  const isUrl = b.location && /^https?:\/\//.test(b.location);

  return (
    <main className="mx-auto max-w-xl p-4 md:p-8">
      <section className="card space-y-3">
        <div className="text-sm muted">Lịch hẹn với {b.host_name}</div>
        <h1 className="text-xl font-semibold">{b.topic}</h1>
        <div>{weekdayShort(day)}, {day.slice(8)}/{day.slice(5, 7)}/{day.slice(0, 4)} · {fmtTime(b.starts_at)} – {fmtTime(b.ends_at)} (giờ Việt Nam)</div>
        <div><span className="chip">{BOOKING_STATUS_LABEL[b.status]}</span></div>
        {b.status === 'pending' && <p className="text-sm muted">Yêu cầu đang chờ xác nhận. Hãy lưu lại trang này (đánh dấu hoặc chép địa chỉ) để xem kết quả.</p>}
        {b.response_note && <p className="text-sm">Lời nhắn: {b.response_note}</p>}
        {b.status === 'accepted' && b.location && (
          <p className="text-sm">Địa điểm / link họp: {isUrl ? <a href={b.location} className="text-brand-600 underline" rel="noopener noreferrer" target="_blank">{b.location}</a> : b.location}</p>
        )}
        {active && (
          <form action={cancelByToken}>
            <input type="hidden" name="token" value={token} />
            <button className="btn-secondary">Hủy lịch hẹn</button>
          </form>
        )}
      </section>
    </main>
  );
}
