import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { LichTabs } from '../lich/tabs';
import { BookingSettingsForm, CopyLink } from '@/components/BookingForms';
import { respondBooking, setBookingOpen } from '@/lib/work';
import { loadPeople } from '@/lib/people';
import { computeSlots, durationLabel, toSlug, type Busy } from '@/lib/booking-slots';
import { fmtDateTime, fmtTime, vnDay, weekdayShort } from '@/lib/format';
import { serverEnv } from '@/lib/env';
import { BOOKING_STATUS_LABEL, type Booking, type BookingPage } from '@/lib/types';

export const metadata: Metadata = { title: 'Trang đặt lịch' };

const STATUS_CLASS: Record<Booking['status'], string> = {
  pending: 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300',
  accepted: 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  declined: 'border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300',
  cancelled: '',
};
const slotText = (iso: string, end: string) => `${weekdayShort(vnDay(iso))}, ${vnDay(iso).slice(8)}/${vnDay(iso).slice(5, 7)} · ${fmtTime(iso)} – ${fmtTime(end)}`;

async function origin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return serverEnv.appUrl();
  return `${h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

export default async function BookingOwnerPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const { loi } = await searchParams;
  const { supabase, userId, profile, ctx } = await requireSession();
  const nowIso = new Date().toISOString();
  const [{ data: page }, { data: toMe }, { data: fromMe }, { data: others }] = await Promise.all([
    supabase.from('booking_pages').select('*').eq('user_id', userId).maybeSingle<BookingPage>(),
    supabase.from('bookings').select('*').eq('host_id', userId).in('status', ['pending', 'accepted']).gte('ends_at', nowIso).order('starts_at').returns<Booking[]>(),
    supabase.from('bookings').select('*').eq('requester_id', userId).order('starts_at', { ascending: false }).limit(20).returns<Booking[]>(),
    supabase.from('booking_pages').select('user_id, slug, title').eq('is_open', true).neq('user_id', userId).not('slug', 'is', null),
  ]);
  const { name } = await loadPeople(supabase, [...(fromMe ?? []).map((b) => b.host_id), ...(toMe ?? []).map((b) => b.requester_id), ...(others ?? []).map((o) => o.user_id)]);
  const who = (b: Booking) => (b.requester_id ? name(b.requester_id) : `${b.guest_name} (${b.guest_email})`);

  let preview: ReturnType<typeof computeSlots> | null = null;
  if (page?.slug) {
    const to = new Date(Date.now() + (page.horizon_days + 1) * 86400000).toISOString();
    const { data: busy } = await supabase.rpc('booking_page_busy', { p_slug: page.slug, p_from: nowIso, p_to: to });
    preview = computeSlots(page, (busy ?? []) as Busy[]);
  }
  const link = page?.slug ? `${await origin()}/hen/${page.slug}` : null;
  const pending = (toMe ?? []).filter((b) => b.status === 'pending');
  const upcoming = (toMe ?? []).filter((b) => b.status === 'accepted');
  const topBlocked = preview ? [...preview.blockedBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) : [];

  return (
    <>
      <LichTabs current="dat" isPrincipal={ctx.role === 'principal'} pendingBookings={pending.length} />
      <PageHead
        title="Trang đặt lịch"
        sub="Gửi link để người khác chọn giờ trống và đặt lịch họp với bạn. Cuộc họp chỉ vào Lịch của tôi khi bạn xác nhận."
      />
      {loi && <p role="alert" className="mb-4 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-950 dark:text-orange-300">{loi}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <section className="card">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">Link đặt lịch</h2>
                <p className="text-sm muted">{!page ? 'Chưa tạo trang. Điền cài đặt bên cạnh rồi bấm Tạo trang đặt lịch.' : page.is_open ? 'Đang bật: ai có link đều đặt được lịch.' : 'Đang tắt: link không nhận lịch mới.'}</p>
              </div>
              {page && <span className={`chip ${page.is_open ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300' : ''}`}>{page.is_open ? '● Đang bật' : 'Đang tắt'}</span>}
            </div>
            {link && (
              <div className="space-y-3">
                <CopyLink url={link} />
                <form action={setBookingOpen}>
                  <input type="hidden" name="open" value={page!.is_open ? '0' : '1'} />
                  <button className="btn-secondary">{page!.is_open ? 'Tắt trang đặt lịch' : 'Bật trang đặt lịch'}</button>
                </form>
                <p className="text-xs muted">Gửi link này cho khách, kể cả người ngoài trường. Khách chọn ngày, chọn giờ, điền tên và email; bạn xác nhận ở mục Chờ xác nhận bên dưới. Khách chỉ thấy giờ trống, không thấy nội dung lịch của bạn.</p>
              </div>
            )}
          </section>

          {preview && page && (
            <section className="card">
              <h2 className="font-semibold">Khách đang thấy gì</h2>
              <p className="mb-3 text-sm muted">Kiểm tra nhanh trước khi gửi link.</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {[...preview.byDuration.entries()].map(([d, list]) => (
                  <li key={d}><b>{durationLabel(d)}:</b> {list.length ? `${list.length} khung giờ trong ${page.horizon_days} ngày, sớm nhất ${slotText(list[0].start, list[0].end)}` : 'không còn khung giờ nào'}</li>
                ))}
              </ul>
              {(preview.blocked15 > 0 || preview.tooSoon15 > 0) && (
                <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-1 font-semibold">Vì sao một số giờ không hiện:</div>
                  <ul className="list-disc space-y-1 pl-5">
                    {preview.blocked15 > 0 && (
                      <li>
                        {preview.blocked15} khung giờ 15 phút trong giờ nhận lịch bị ẩn vì trùng lịch trong Lịch của tôi{page.buffer_minutes ? ` (tính cả ${page.buffer_minutes} phút nghỉ)` : ''}. Lịch chặn nhiều nhất:
                        <ul className="mt-1 list-[circle] pl-5">
                          {topBlocked.map(([label, n]) => <li key={label}><b>{label}</b> (chặn {n} khung giờ)</li>)}
                        </ul>
                        Sửa, xóa hoặc rút ngắn các lịch này trong <Link href="/lich" className="underline">Lịch của tôi</Link> để mở lại giờ cho khách.
                      </li>
                    )}
                    {preview.tooSoon15 > 0 && <li>{preview.tooSoon15} khung giờ quá gần hiện tại theo cài đặt Đặt trước ít nhất.</li>}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section className="card">
            <h2 className="font-semibold">Chờ xác nhận ({pending.length})</h2>
            <p className="mb-3 text-sm muted">Xác nhận để thêm cuộc họp vào Lịch của tôi.</p>
            {pending.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {pending.map((b) => (
                  <li key={b.id} className="space-y-2 py-2.5">
                    <div>
                      <div className="font-medium">{b.topic}</div>
                      <div className="text-xs muted">{who(b)} · {slotText(b.starts_at, b.ends_at)}</div>
                      {b.note && <p className="mt-1 text-sm">{b.note}</p>}
                    </div>
                    <form action={respondBooking} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="id" value={b.id} />
                      <input name="response_note" placeholder="Lời nhắn cho người đặt (không bắt buộc)" className="input min-w-0 flex-1 py-1 text-xs" aria-label="Lời nhắn" />
                      <button name="status" value="accepted" className="btn px-2 py-1 text-xs">Xác nhận</button>
                      <button name="status" value="declined" className="btn-secondary px-2 py-1 text-xs">Từ chối</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Chưa có yêu cầu nào đang chờ.</p>}
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Sắp tới ({upcoming.length})</h2>
            {upcoming.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {upcoming.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{b.topic}</div>
                      <div className="text-xs muted">{who(b)} · {slotText(b.starts_at, b.ends_at)}{b.response_note ? ` · ${b.response_note}` : ''}</div>
                    </div>
                    <form action={respondBooking}>
                      <input type="hidden" name="id" value={b.id} />
                      <button name="status" value="cancelled" className="px-2 py-1 text-xs text-orange-600 hover:underline dark:text-orange-400">Hủy lịch</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm muted">Chưa có cuộc họp đã xác nhận.</p>}
          </section>

          {(others?.length || fromMe?.length) ? (
            <section className="card">
              <h2 className="mb-3 font-semibold">Đặt lịch với đồng nghiệp</h2>
              {others?.length ? (
                <ul className="mb-3 flex flex-wrap gap-2">
                  {others.map((o) => <li key={o.user_id}><a href={`/hen/${o.slug}`} className="btn-secondary">{o.title || name(o.user_id)}</a></li>)}
                </ul>
              ) : null}
              {fromMe?.length ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {fromMe.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-start gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{b.topic} <span className={`chip ml-1 ${STATUS_CLASS[b.status]}`}>{BOOKING_STATUS_LABEL[b.status]}</span></div>
                        <div className="text-xs muted">Gặp {name(b.host_id)} · {fmtDateTime(b.starts_at)}{b.response_note ? ` · ${b.response_note}` : ''}</div>
                      </div>
                      {(b.status === 'pending' || b.status === 'accepted') && b.ends_at > nowIso && (
                        <form action={respondBooking}>
                          <input type="hidden" name="id" value={b.id} />
                          <button name="status" value="cancelled" className="px-2 py-1 text-xs text-orange-600 hover:underline dark:text-orange-400">Hủy</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>

        <section className="card h-fit">
          <h2 className="font-semibold">Cài đặt</h2>
          <p className="mb-3 text-sm muted">Giờ Việt Nam. Khung giờ trùng với lịch của bạn tự ẩn.</p>
          <BookingSettingsForm page={page ?? null} defaultSlug={toSlug(profile.full_name || profile.email.split('@')[0])} defaultTitle={`Họp với ${profile.full_name || profile.email}`} />
        </section>
      </div>
    </>
  );
}
