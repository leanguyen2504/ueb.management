'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';

export type LoginState = { step: 'email' | 'code'; email?: string; error?: string; info?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Bước 1: kiểm tra email được phép rồi gửi mã đăng nhập.
export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { step: 'email', error: 'Email chưa đúng định dạng.' };
  const domain = email.split('@')[1];
  if (!serverEnv.allowedDomains().includes(domain)) {
    return { step: 'email', email, error: `Chỉ email @${serverEnv.allowedDomains().join(', @')} được đăng nhập.` };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('id, is_active').eq('email', email).maybeSingle();
  if (profile && !profile.is_active) return { step: 'email', email, error: 'Tài khoản này đã bị khóa. Hãy liên hệ quản trị hệ thống.' };

  if (!profile) {
    // Khởi tạo quản trị lần đầu: chỉ khi hệ thống chưa có quản trị và email trùng BOOTSTRAP_ADMIN_EMAIL.
    const bootstrap = serverEnv.bootstrapAdminEmail();
    if (bootstrap && email === bootstrap) {
      const { data: settings } = await admin.from('system_settings').select('current_admin_id').single();
      if (settings && !settings.current_admin_id) {
        const { data: existing } = await admin.from('invitations').select('id').eq('email', email).eq('make_admin', true).is('accepted_at', null).maybeSingle();
        if (!existing) await admin.from('invitations').insert({ email, make_admin: true });
      }
    }
    const { count } = await admin
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString());
    if (!count) return { step: 'email', email, error: 'Email này chưa được mời. Hãy nhờ một người đang dùng hệ thống gửi lời mời cho bạn (mục "Mời đồng nghiệp").' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await currentOrigin()}/auth/confirm` },
  });
  if (error) {
    // "For security purposes...": cùng một email gửi lại quá nhanh (khoảng 1 phút).
    // "email rate limit exceeded": hết hạn mức gửi thư của cả hệ thống (máy gửi mặc định: vài thư mỗi giờ).
    const message =
      /security purposes/i.test(error.message)
        ? 'Bạn vừa yêu cầu mã. Hãy đợi khoảng một phút rồi thử lại.'
        : /email rate limit/i.test(error.message)
          ? 'Hệ thống đã gửi hết số thư cho phép trong giờ này. Hãy thử lại sau khoảng một giờ, hoặc báo quản trị hệ thống cấu hình hộp thư gửi riêng (SMTP).'
          : 'Không gửi được thư đăng nhập. Hãy thử lại sau.';
    return { step: 'email', email, error: message };
  }
  return { step: 'code', email, info: `Đã gửi thư đăng nhập tới ${email} (kiểm tra cả thư mục Spam). Bấm liên kết trong thư trên chính trình duyệt này, hoặc nhập mã nếu thư có mã.` };
}

// Địa chỉ web đang dùng (bản chính hoặc bản thử) để liên kết trong thư quay về đúng chỗ.
async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return serverEnv.appUrl();
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// Bước 2: xác minh mã 6 số.
export async function verifyCode(prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') || prev.email || '').trim().toLowerCase();
  const token = String(form.get('code') || '').replace(/\s/g, '');
  if (!/^\d{6,10}$/.test(token)) return { step: 'code', email, error: 'Mã gồm các chữ số trong email.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { step: 'code', email, error: 'Mã không đúng hoặc đã hết hạn. Hãy kiểm tra lại hoặc gửi mã mới.' };
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/dang-nhap');
}
