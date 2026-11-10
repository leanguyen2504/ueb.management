import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { buildSummary } from '@/lib/meeting-summary';
import { fmtDate, fmtTime, vnDay } from '@/lib/format';
import { jiraUrl } from '@/lib/meeting-rules';
import { serverEnv } from '@/lib/env';

// Xuất bảng tổng hợp ra CSV (UTF-8 có BOM để Excel đọc đúng tiếng Việt).
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.ctx?.is_active) return NextResponse.redirect(new URL('/dang-nhap', req.url));
  const p = req.nextUrl.searchParams;
  const { range, rows } = await buildSummary(s.supabase, s.userId, {
    ngay: p.get('ngay') ?? undefined, pham_vi: p.get('pham-vi') ?? undefined,
    mang: p.get('mang') ?? undefined, dau_moi: p.get('dau-moi')?.toLowerCase() ?? undefined,
  });
  const base = serverEnv.jiraBaseUrl();
  const cell = (v: string) => {
    // Chặn công thức khi mở bằng Excel.
    const t = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${t.replace(/"/g, '""')}"`;
  };
  const links = (l: { label: string; url: string }[]) => l.map((x) => `${x.label}: ${x.url}`).join('\n');
  const lines = [
    ['Mã Jira', 'Tên cuộc họp', 'Ngày', 'Giờ', 'Đơn vị liên quan', 'Link tài liệu trước họp', 'Link biên bản / sau họp', 'Người cập nhật', 'Tình trạng', 'Link Jira'],
    ...rows.map((r) => [
      r.meeting.jira_key ?? '', r.meeting.title, fmtDate(vnDay(r.meeting.starts_at)), r.meeting.all_day ? '' : fmtTime(r.meeting.starts_at),
      r.units.join(', '), links(r.pre), links(r.post), r.updaters.join(', '), r.status,
      r.meeting.jira_key ? jiraUrl(base, r.meeting.jira_key) ?? '' : '',
    ]),
  ].map((row) => row.map(cell).join(','));
  const body = '﻿' + lines.join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tong-hop-ho-so-hop-${range.from}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
