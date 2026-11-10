import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PublicBookingForm } from '@/components/BookingForms';
import { computeSlots, durationLabel, type Busy, type SlotSettings } from '@/lib/booking-slots';
import { fmtTime, vnDay, weekdayShort } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Đặt lịch hẹn', robots: { index: false } };

type PageInfo = SlotSettings & { host_name: string; title: string | null; intro: string | null };

export default async function PublicBookingPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tl?: string; gio?: string; tu?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc('booking_page_public', { p_slug: slug });
  const info = (rows as PageInfo[] | null)?.[0];
  if (!info) notFound();

  const now = new Date();
  const to = new Date(now.getTime() + (info.horizon_days + 1) * 86400000).toISOString();
  const { data: busy } = await supabase.rpc('booking_page_busy', { p_slug: slug, p_from: now.toISOString(), p_to: to });
  const { byDuration } = computeSlots(info, (busy ?? []) as Busy[], now);
  const durations = [...info.durations].sort((a, b) => a - b);
  const dur = durations.includes(Number(sp.tl)) ? Number(sp.tl) : durations.includes(30) ? 30 : durations[0];
  const slots = byDuration.get(dur) ?? [];
  const chosen = sp.gio ? slots.find((s) => s.start === sp.gio) : undefined;

  // Người đã đăng nhập: điền sẵn tên và email.
  const { data: claims } = await supabase.auth.getClaims();
  let me: { full_name: string; email: string } | null = null;
  if (claims?.claims?.sub) {
    const { data } = await supabase.from('profiles').select('full_name, email').eq('id', claims.claims.sub).maybeSingle();
    me = data;
  }

  // Nhóm theo ngày, mỗi lần hiện 7 ngày có giờ trống.
  const days = [...new Set(slots.map((s) => s.day))];
  const startIdx = Math.max(0, sp.tu ? days.indexOf(sp.tu) : 0);
  const shown = days.slice(startIdx, startIdx + 7);
  const nextDay = days[startIdx + 7];
  const prevDay = startIdx > 0 ? days[Math.max(0, startIdx - 7)] : null;
  const q = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ tl: String(dur), ...o }).forEach(([k, v]) => v && p.set(k, v));
    return `/hen/${slug}?${p}`;
  };

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-800 text-xs font-bold text-white">UEB</span>
        <div>
          <h1 className="text-xl font-semibold">{info.title || `Họp với ${info.host_name}`}</h1>
          <p className="text-sm muted">Giờ Việt Nam (GMT+7)</p>
        </div>
      </div>
      {info.intro && <p className="mb-4 whitespace-pre-line text-sm">{info.intro}</p>}

      {chosen ? (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm muted">Bạn chọn</div>
              <div className="font-semibold">{weekdayShort(chosen.day)}, {chosen.day.slice(8)}/{chosen.day.slice(5, 7)}/{chosen.day.slice(0, 4)} · {fmtTime(chosen.start)} – {fmtTime(chosen.end)} ({durationLabel(dur)})</div>
            </div>
            <Link href={q({ tu: sp.tu })} className="btn-secondary">Chọn giờ khác</Link>
          </div>
          <PublicBookingForm slug={slug} startsAt={chosen.start} minutes={dur} name={me?.full_name || undefined} email={me?.email} />
          <p className="mt-3 text-xs muted">Yêu cầu sẽ chờ {info.host_name} xác nhận. Địa điểm hoặc link họp hiện ở trang trạng thái sau khi được xác nhận.</p>
        </section>
      ) : (
        <>
          {sp.gio && <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Giờ bạn chọn vừa hết chỗ. Hãy chọn giờ khác.</p>}
          <nav className="mb-4 flex flex-wrap gap-2" aria-label="Thời lượng">
            {durations.map((d) => (
              <Link key={d} href={`/hen/${slug}?tl=${d}`} aria-current={d === dur ? 'true' : undefined} className={d === dur ? 'btn px-3 py-1' : 'btn-secondary px-3 py-1'}>{durationLabel(d)}</Link>
            ))}
          </nav>
          {shown.length ? (
            <div className="space-y-3">
              {shown.map((day) => (
                <section key={day} className="card">
                  <h2 className="mb-2 font-semibold">{weekdayShort(day)}, {day.slice(8)}/{day.slice(5, 7)}</h2>
                  <ul className="flex flex-wrap gap-2">
                    {slots.filter((s) => s.day === day).map((s) => (
                      <li key={s.start}><Link href={q({ gio: s.start, tu: sp.tu })} className="btn-secondary px-3 py-1 text-sm">{fmtTime(s.start)}</Link></li>
                    ))}
                  </ul>
                </section>
              ))}
              <div className="flex justify-between">
                {prevDay ? <Link href={q({ tu: prevDay })} className="btn-secondary">← Ngày trước</Link> : <span />}
                {nextDay && <Link href={q({ tu: nextDay })} className="btn-secondary">Ngày sau →</Link>}
              </div>
            </div>
          ) : (
            <p className="card text-sm muted">Hiện không còn giờ trống cho thời lượng này. Hãy thử thời lượng khác hoặc quay lại sau.</p>
          )}
        </>
      )}
      <p className="mt-6 text-center text-xs muted">Hệ thống quản trị công việc UEB · <Link href="/" className="hover:underline">Đăng nhập</Link></p>
    </main>
  );
}
