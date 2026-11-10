// Đọc biến môi trường ở một chỗ để báo lỗi rõ ràng khi thiếu.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Thiếu biến môi trường ${name}. Xem .env.example và docs/cau-hinh.md.`);
  return value;
}

// Biến NEXT_PUBLIC_ phải được đọc bằng tên đầy đủ để Next.js nhúng vào trình duyệt.
export const publicEnv = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
};

export const serverEnv = {
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  serviceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  allowedDomains: () =>
    (process.env.ALLOWED_EMAIL_DOMAINS || 'vnu.edu.vn')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  bootstrapAdminEmail: () => (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase(),
};

// Các module tích hợp bật/tắt bằng biến môi trường, mặc định tắt.
const flag = (v: string | undefined) => (v || '').trim().toLowerCase() === 'true';
export const features = {
  googleCalendar: () => flag(process.env.FEATURE_GOOGLE_CALENDAR),
};

export const TIMEZONE = 'Asia/Ho_Chi_Minh';
