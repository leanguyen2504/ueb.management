import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

// Dùng chung cho các route /hop/tep, /nhom/tep, /viec/tep, /nguoi/tep: kiểm tra người xem
// có quyền (RLS của bảng chứa tệp và của Storage) rồi trả link ký tạm thời.
//  - mặc định: chuyển thẳng tới tệp (link 5 phút);
//  - ?tai=1: tải về đúng tên tệp gốc;
//  - ?xem=1: trả JSON { url, name } cho khung xem trước trong web (link 15 phút, đủ cho
//    trình xem Office đọc tệp Word/Excel/PowerPoint).
export async function serveStoredFile(req: NextRequest, table: string, bucket: string) {
  const s = await getSession();
  const preview = req.nextUrl.searchParams.get('xem') === '1';
  if (!s?.ctx?.is_active) {
    return preview ? NextResponse.json({ error: 'Phiên đăng nhập đã hết, hãy đăng nhập lại.' }, { status: 401 }) : NextResponse.redirect(new URL('/dang-nhap', req.url));
  }
  const fail = (msg: string) => (preview ? NextResponse.json({ error: msg }, { status: 404 }) : new NextResponse(msg, { status: 404 }));
  const path = req.nextUrl.searchParams.get('p') ?? '';
  if (!path || path.length > 400 || path.includes('..')) return fail('Không tìm thấy tệp.');
  const { data: row } = await s.supabase.from(table).select('file_name').eq('file_path', path).maybeSingle<{ file_name: string | null }>();
  if (!row) return fail('Không tìm thấy tệp hoặc bạn không có quyền xem.');
  const download = !preview && req.nextUrl.searchParams.get('tai') === '1' ? (row.file_name || true) : undefined;
  const { data, error } = await s.supabase.storage.from(bucket).createSignedUrl(path, preview ? 900 : 300, download ? { download } : undefined);
  if (error || !data) return fail('Không mở được tệp.');
  if (preview) return NextResponse.json({ url: data.signedUrl, name: row.file_name || path.split('/').pop() }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.redirect(data.signedUrl);
}
