import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /api/cron tự kiểm tra CRON_SECRET.
const PUBLIC_PATHS = ['/dang-nhap', '/auth', '/api/cron'];

// Làm mới phiên đăng nhập và chuyển người chưa đăng nhập về trang đăng nhập.
export async function updateSession(request: NextRequest) {
  // Supabase trả người dùng về Site URL kèm ?code=... (hoặc ?error=...) khi
  // địa chỉ chuyển hướng chưa nằm trong danh sách cho phép: chuyển sang /auth/confirm.
  const path0 = request.nextUrl.pathname;
  if (!path0.startsWith('/auth/')) {
    const sp = request.nextUrl.searchParams;
    if (sp.get('code')) {
      const to = request.nextUrl.clone();
      to.pathname = '/auth/confirm';
      to.search = `?code=${encodeURIComponent(sp.get('code')!)}`;
      return NextResponse.redirect(to);
    }
    if (sp.get('error_code') || (sp.get('error') && path0 !== '/dang-nhap')) {
      const to = request.nextUrl.clone();
      to.pathname = '/dang-nhap';
      to.search = '?loi=lien_ket';
      return NextResponse.redirect(to);
    }
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));
  if (!data?.claims && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = '/dang-nhap';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}
