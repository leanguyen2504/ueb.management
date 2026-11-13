import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from '../tabs';
import { NoteTools } from './NoteTools';

export const metadata: Metadata = { title: 'Công cụ ghi chú' };

export default async function GhiChuPage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Ghi chú nhanh, ghi âm cuộc họp và chuyển ghi âm thành văn bản (tiếng Việt, tiếng Anh hoặc xen kẽ). Mọi thứ nằm trên máy của bạn, không tải lên máy chủ." />
      <SoanThaoTabs current="ghi-chu" />
      <NoteTools />
    </>
  );
}
