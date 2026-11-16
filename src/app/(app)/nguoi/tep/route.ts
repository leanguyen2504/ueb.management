import type { NextRequest } from 'next/server';
import { serveStoredFile } from '@/lib/file-route';

// Mở file hồ sơ (CV…) mà một người đã tải lên: chỉ đồng nghiệp đã đăng nhập mới nhận được link.
export const GET = (req: NextRequest) => serveStoredFile(req, 'profile_links', 'profile-files');
