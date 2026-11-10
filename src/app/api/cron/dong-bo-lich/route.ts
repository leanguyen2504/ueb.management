import { NextResponse, type NextRequest } from 'next/server';
import { features } from '@/lib/env';
import { syncCalendars } from '@/lib/google-calendar/sync';

// Vercel Cron gọi mỗi sáng (xem vercel.json) kèm Authorization: Bearer CRON_SECRET.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!features.googleCalendar()) return NextResponse.json({ skipped: 'FEATURE_GOOGLE_CALENDAR tắt' });
  try {
    const results = await syncCalendars({ force: true });
    return NextResponse.json({ synced: results.length, failed: results.filter((r) => !r.ok).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'lỗi' }, { status: 500 });
  }
}
