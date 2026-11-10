import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { BookingPageForm, BookingRequestForm } from '@/components/WorkForms';
import { respondBooking } from '@/lib/work';
import { loadPeople } from '@/lib/people';
import { fmtDateTime, fmtTime, vnDay, weekdayShort } from '@/lib/format';
import { BOOKING_STATUS_LABEL, type Booking, type BookingPage } from '@/lib/types';

export const metadata: Metadata = { title: 'Trang đặt lịch' };

const STATUS_CLASS: Record<Booking['status'], string> = {
  pending: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
  accepted: 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  declined: 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
  cancelled: '',
};

export default async function BookingPageView({ searchParams }: { searchParams: Promise<{ gap?: string; loi?: string }> }) {
  const { gap, loi } = await searchParams;
  const { supabase, userId } = await requireSession();
  const nowIso = new Date().toISOString();
  const [{ data: pages }, { data: toMe }, { data: fromMe }] = await Promise.all([
    supabase.from('booking_pages').select('*').returns<BookingPage[]>(),
    supabase.from('bookings').select('*').eq('host_id', userId).gte('ends_at', nowIso).order('starts_at').returns<Booking[]>(),
    supabase.from('bookings').select('*').eq('requester_id', userId).order('starts_at', { ascending: false }).limit(30).returns<Booking[]>(),
  ]);
  const myPage = (pages ?? []).find((p) => p.user_id === userId) ?? null;
  const openHosts = (pages ?? []).filter((p) => p.is_open && p.user_id !== userId);
  const host = openHosts.find((p) => p.user_id === gap) ?? null;
  const { name, map } = await loadPeople(supabase, [
    ...openHosts.map((p) => p.user_id),
    ...(toMe ?? []).map((b) => b.requester_id),
    ...(fromMe ?? []).map((b) => b.host_id),
  ]);

  let busy: { starts_at: string; ends_at: string }[] = [];
  if (host) {
    const to = new Date(Date.now() + 14 * 86400000).toISOString();
    const { data } = await supabase.rpc('booking_busy', { p_host: host.user_id, p_from: nowIso, p_to: to });
    busy = (data ?? []) as typeof busy;
  }
  const pending = (toMe ?? []).filter((b) => b.status === 'pending');
  const accepted = (toMe ?? []).filter((b) => b.status === 'accepted');

  return (
    <>
      <PageHead title="Trang đặt lịch" sub="Gửi yêu cầu gặp Hiệu trưởng, thư ký hoặc đồng nghiệp đã mở trang đặt lịch; hoặc mở trang của bạn để người khác đặt." />
      {loi && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{loi}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Đặt lịch gặp</h2>
          {openHosts.length ? (
            <ul className="mb-4 flex flex-wrap gap-2">
              {openHosts.map((p) => (
                <li key={p.user_id}>
                  <Link href={`/dat-lich?gap=${p.user_id}`} className={p.user_id === gap ? 'btn' : 'btn-secondary'}>{name(p.user_id)}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">Chưa có ai mở trang đặt lịch.</p>
          )}
          {host && (
            <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div>
                <div className="font-medium">{name(host.user_id)} <span className="text-xs muted">{map.get(host.user_id)?.email}</span></div>
                {host.hours_note && <p className="text-sm">Nhận lịch: {host.hours_note}</p>}
                {host.intro && <p className="text-sm muted">{host.intro}</p>}
              </div>
              {busy.length > 0 && (
                <div>
                  <div className="label">Giờ đã có hẹn (14 ngày tới)</div>
                  <ul className="flex flex-wrap gap-1.5">
                    {busy.map((b, i) => (
                      <li key={i} className="chip">{weekdayShort(vnDay(b.starts_at))} {vnDay(b.starts_at).slice(8)}/{vnDay(b.starts_at).slice(5, 7)} · {fmtTime(b.starts_at)} đến {fmtTime(b.ends_at)}</li>
                    ))}
                  </ul>
                </div>
              )}
              <BookingRequestForm hostId={host.user_id} slotMinutes={host.slot_minutes} />
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Trang đặt lịch của tôi</h2>
          <BookingPageForm page={myPage} />
        </section>
      </div>

      {(pending.length > 0 || accepted.length > 0) && (
        <section className="card mt-4">
          <h2 className="mb-3 font-semibold">Yêu cầu gửi tới tôi</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...pending, ...accepted].map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.topic} <span className={`chip ml-1 ${STATUS_CLASS[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span></div>
                  <div className="text-xs muted">{name(b.requester_id)} · {fmtDateTime(b.starts_at)} đến {fmtTime(b.ends_at)}</div>
                  {b.note && <p className="mt-1 text-sm">{b.note}</p>}
                </div>
                <form action={respondBooking} className="flex flex-wrap items-center gap-1.5">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="response_note" defaultValue={b.response_note ?? ''} placeholder="Ghi chú phản hồi" className="input w-48 py-1 text-xs" aria-label="Ghi chú phản hồi" />
                  {b.status === 'pending' && <button name="status" value="accepted" className="btn px-2 py-1 text-xs">Đồng ý</button>}
                  {b.status === 'pending' && <button name="status" value="declined" className="btn-secondary px-2 py-1 text-xs">Từ chối</button>}
                  {b.status === 'accepted' && <button name="status" value="cancelled" className="btn-secondary px-2 py-1 text-xs">Hủy lịch</button>}
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-4">
        <h2 className="mb-3 font-semibold">Yêu cầu tôi đã gửi</h2>
        {fromMe?.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {fromMe.map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{b.topic} <span className={`chip ml-1 ${STATUS_CLASS[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span></div>
                  <div className="text-xs muted">Gặp {name(b.host_id)} · {fmtDateTime(b.starts_at)} đến {fmtTime(b.ends_at)}{b.response_note ? ` · Phản hồi: ${b.response_note}` : ''}</div>
                </div>
                {(b.status === 'pending' || b.status === 'accepted') && b.ends_at > nowIso && (
                  <form action={respondBooking}>
                    <input type="hidden" name="id" value={b.id} />
                    <button name="status" value="cancelled" className="px-2 py-1 text-xs text-red-600 hover:underline dark:text-red-400">Hủy</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm muted">Bạn chưa gửi yêu cầu nào.</p>
        )}
      </section>
    </>
  );
}
