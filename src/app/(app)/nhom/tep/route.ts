import type { NextRequest } from 'next/server';
import { serveStoredFile } from '@/lib/file-route';

// Mở tệp trong mục Tài liệu của không gian: chỉ người xem được không gian mới nhận được link.
export const GET = (req: NextRequest) => serveStoredFile(req, 'group_files', 'group-files');
