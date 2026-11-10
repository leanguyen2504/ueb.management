import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from '@/lib/env';

// Client dùng khóa service, bỏ qua RLS. Chỉ dùng ở máy chủ cho các việc
// hệ thống (kiểm tra lời mời trước khi gửi mã đăng nhập). Không bao giờ gửi xuống trình duyệt.
export function createAdminClient() {
  return createClient(publicEnv.supabaseUrl(), serverEnv.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
