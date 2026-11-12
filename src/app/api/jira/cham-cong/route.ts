import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { userIdForSyncKey } from '@/lib/jira/server';
import { normalizePunch, parsePunchUpload, pickOwnRows } from '@/lib/punch';

// Nhận dữ liệu máy chấm công do nút "Đồng bộ Jira → UEB" gửi từ trang Báo cáo chấm công của trường.
// Xác thực bằng mã đồng bộ Jira của từng người. Máy chủ chọn lại đúng dòng của người đó (theo tên đăng nhập Jira,
// email, họ tên) rồi mới lưu, nên dù trình duyệt gửi cả báo cáo cũng không lưu dữ liệu của người khác.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '600',
};
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  const userId = auth.startsWith('Bearer ') ? await userIdForSyncKey(auth.slice(7).trim()) : null;
  if (!userId) return reply({ error: 'Mã đồng bộ không đúng hoặc đã bị thay. Hãy tạo lại nút trên trang Jira của tôi.' }, 401);
  const text = await request.text();
  if (text.length > 3_000_000) return reply({ error: 'Dữ liệu quá lớn.' }, 413);
  let up;
  try {
    up = parsePunchUpload(JSON.parse(text));
  } catch {
    up = null;
  }
  if (!up) return reply({ error: 'Dữ liệu gửi lên không đúng định dạng.' }, 400);

  const admin = createAdminClient();
  const [{ data: acc }, { data: prof }] = await Promise.all([
    admin.from('jira_accounts').select('jira_username, jira_display_name').eq('user_id', userId).maybeSingle(),
    admin.from('profiles').select('full_name, email').eq('id', userId).maybeSingle(),
  ]);
  const picked = pickOwnRows(up.rows, {
    jiraUsername: acc?.jira_username ?? null,
    emails: [prof?.email, up.me.email].filter((e): e is string => !!e),
    // Tên trên trang chấm công chỉ dùng khi họ tên cũng khớp hồ sơ web hoặc Jira.
    names: [prof?.full_name, acc?.jira_display_name].filter((n): n is string => !!n),
  });
  if ('error' in picked) return reply({ error: picked.error }, 422);

  const rows = picked.rows.map(normalizePunch).filter((r) => r !== null);
  const first = picked.rows[0];
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  const { data: saved, error } = await admin.rpc('attendance_save_punches', {
    p_user: userId,
    p_snap: {
      from: up.from, to: up.to, sourceSyncedAt: up.sourceSyncedAt, excuseError: up.excuseError,
      me: { username: picked.username, name: s(first?.hoTen), unit: s(first?.donViTen), title: s(first?.chucDanh) },
      rows: rows.map((r) => ({
        day: r.day, inAm: r.in_am, outAm: r.out_am, inPm: r.in_pm, outPm: r.out_pm,
        violationAm: r.violation_am, violationPm: r.violation_pm, excuseAm: r.excuse_am, excusePm: r.excuse_pm,
        minutesLate: r.minutes_late, minutesConverted: r.minutes_converted, errorCount: r.error_count, makeupDay: r.makeup_day,
      })),
    },
  });
  if (error) return reply({ error: error.message }, 500);
  const errors = rows.filter((r) => r.error_count > 0).length;
  return reply({ ok: true, days: saved ?? rows.length, errorDays: errors, username: picked.username, excuseError: up.excuseError });
}
