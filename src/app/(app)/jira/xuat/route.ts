import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { serverEnv } from '@/lib/env';
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx';
import { loadReport, parseScope } from '@/lib/jira/load';
import { KIND_LABEL, buildReportSheets, fileSlug, parsePeriod } from '@/lib/jira/team';

// Xuất báo cáo Jira ra Excel: của mình, hoặc của người liên quan đã chia sẻ (cùng nhóm, dự án, đơn vị).
// Quyền xem dữ liệu người khác do cơ sở dữ liệu kiểm tra (hàm jira_related_*).
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.ctx?.is_active) return NextResponse.redirect(new URL('/dang-nhap', req.url));
  const p = req.nextUrl.searchParams;
  const scope = parseScope(p);
  const period = parsePeriod(p.get('tu'), p.get('den'));
  const data = await loadReport(s.supabase, s.userId, scope, period);
  if ('error' in data) {
    return NextResponse.redirect(new URL(`/jira?muc=bao-cao&loi=${encodeURIComponent(data.error)}`, req.url));
  }
  const sheets = buildReportSheets({
    title: scope.kind === 'toi' ? `Báo cáo Jira cá nhân: ${data.people[0].full_name || data.people[0].email}` : `Báo cáo Jira: ${data.scopeLabel}`,
    scopeLabel: data.scopeLabel,
    exportedBy: s.profile?.full_name || s.profile?.email || '',
    people: data.people.map((x) => ({
      id: x.user_id, name: x.full_name || x.email, email: x.email, unit: x.unit,
      groups: x.groups.map((g) => `${g.name} (${KIND_LABEL[g.kind] ?? 'Nhóm'})`).join('; '),
      field: x.field, lastSynced: x.last_synced_at, jiraName: x.jira_display_name,
    })),
    issues: data.issues,
    worklogs: data.worklogs,
    period,
    jiraUrl: serverEnv.jiraBaseUrl(),
  });
  const name = `jira-${fileSlug(scope.kind === 'toi' ? data.people[0].full_name || 'ca-nhan' : data.scopeLabel)}-${period.from}-${period.to}.xlsx`;
  return new NextResponse(Buffer.from(buildXlsx(sheets)), {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
