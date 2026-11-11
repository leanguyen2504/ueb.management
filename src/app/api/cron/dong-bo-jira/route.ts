import { NextResponse, type NextRequest } from 'next/server';
import { features } from '@/lib/env';
import { syncAllFromServer } from '@/lib/jira/server';

// Vercel Cron gọi mỗi sáng (xem vercel.json): đồng bộ Jira cho những người đã lưu token.
// Chỉ chạy khi FEATURE_JIRA=true (Jira mở ra Internet).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!features.jiraServerSync()) return NextResponse.json({ skipped: 'FEATURE_JIRA tắt' });
  const results = await syncAllFromServer();
  return NextResponse.json({ synced: results.length, failed: results.filter((r) => !r.ok).length });
}
