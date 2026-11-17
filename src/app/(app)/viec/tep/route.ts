import type { NextRequest } from 'next/server';
import { serveStoredFile } from '@/lib/file-route';

// Mở tệp sản phẩm của đầu việc: chỉ người xem được việc mới nhận được link.
export const GET = (req: NextRequest) => serveStoredFile(req, 'task_links', 'task-files');
