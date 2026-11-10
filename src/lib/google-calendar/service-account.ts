import 'server-only';
import { createSign } from 'node:crypto';

// Đăng nhập Google bằng tài khoản dịch vụ (JWT ký RS256), không cần thư viện ngoài.
// Khóa nằm trong biến GOOGLE_SERVICE_ACCOUNT_JSON trên Vercel: dán nguyên nội dung
// file .json tải từ Google Cloud. Không bao giờ đưa khóa này vào repo.

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type ServiceAccount = { client_email: string; private_key: string };

export function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let j: Partial<ServiceAccount>;
  try {
    j = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ. Hãy dán nguyên nội dung file khóa .json.');
  }
  if (!j.client_email || !j.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON thiếu client_email hoặc private_key.');
  return { client_email: j.client_email, private_key: j.private_key.replace(/\\n/g, '\n') };
}

let cached: { token: string; exp: number; email: string } | null = null;

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp - 60 > now) return cached.token;
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Google không cấp quyền cho tài khoản dịch vụ: ${body.error_description ?? res.status}. Kiểm tra lại khóa trong GOOGLE_SERVICE_ACCOUNT_JSON.`);
  }
  cached = { token: body.access_token, exp: now + (body.expires_in ?? 3600), email: sa.client_email };
  return body.access_token;
}

// Chọn cách xác thực: ưu tiên tài khoản dịch vụ, rồi API key
// (GOOGLE_CALENDAR_API_KEY, chỉ đọc được lịch công khai).
// Không có khóa nào thì đọc lịch công khai qua địa chỉ iCal công khai.
export async function resolveAuth(): Promise<{ token: string } | { apiKey: string } | { publicIcs: true }> {
  const sa = readServiceAccount();
  if (sa) return { token: await getAccessToken(sa) };
  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY?.trim();
  if (apiKey) return { apiKey };
  return { publicIcs: true };
}

export function serviceAccountEmail(): string | null {
  try {
    return readServiceAccount()?.client_email ?? null;
  } catch {
    return null;
  }
}
