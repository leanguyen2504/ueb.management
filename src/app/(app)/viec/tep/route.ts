import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';

// Mở tệp sản phẩm của đầu việc: chỉ người xem được việc (RLS của task_links và của Storage)
// mới nhận được link ký tạm thời 5 phút.
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.ctx?.is_active) return NextResponse.redirect(new URL('/dang-nhap', req.url));
  const path = req.nextUrl.searchParams.get('p') ?? '';
  if (!path || path.length > 400 || path.includes('..')) return new NextResponse('Không tìm thấy tệp.', { status: 404 });
  const { data: link } = await s.supabase.from('task_links').select('file_name').eq('file_path', path).maybeSingle();
  if (!link) return new NextResponse('Không tìm thấy tệp hoặc bạn không có quyền xem.', { status: 404 });
  const download = req.nextUrl.searchParams.get('tai') === '1' ? (link.file_name || true) : undefined;
  const { data, error } = await s.supabase.storage.from('task-files').createSignedUrl(path, 300, download ? { download } : undefined);
  if (error || !data) return new NextResponse('Không mở được tệp.', { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
