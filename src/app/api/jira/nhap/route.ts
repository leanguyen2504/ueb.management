import { NextResponse, type NextRequest } from 'next/server';
import { parseSnapshot, saveSnapshot, userIdForSyncKey } from '@/lib/jira/server';

// Nhận dữ liệu Jira cá nhân do nút "Đồng bộ Jira" gửi từ trang Jira (khác tên miền, nên cần CORS).
// Xác thực bằng mã đồng bộ riêng của từng người (Authorization: Bearer ueb_jira_…), không dùng cookie.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
  if (text.length > 4_000_000) return reply({ error: 'Dữ liệu quá lớn.' }, 413);
  let snap;
  try {
    snap = parseSnapshot(JSON.parse(text));
  } catch {
    snap = null;
  }
  if (!snap) return reply({ error: 'Dữ liệu gửi lên không đúng định dạng.' }, 400);
  try {
    await saveSnapshot(userId, 'bookmarklet', snap);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Lỗi lưu dữ liệu.' }, 500);
  }
  return reply({ ok: true, issues: snap.issues.length, worklogs: snap.worklogs.length, mentions: snap.mentions.length });
}
