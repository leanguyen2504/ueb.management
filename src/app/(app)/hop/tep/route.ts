import type { NextRequest } from 'next/server';
import { serveStoredFile } from '@/lib/file-route';

// Mở tệp đính kèm của hồ sơ họp: chỉ người xem được buổi họp mới nhận được link.
export const GET = (req: NextRequest) => serveStoredFile(req, 'meeting_items', 'meeting-files');
