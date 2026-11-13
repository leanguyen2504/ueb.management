import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from '../tabs';
import { PdfTools } from './PdfTools';

export const metadata: Metadata = { title: 'Chuyển sang PDF' };

export default async function PdfPage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Chuyển file Word, ảnh sang PDF và gộp nhiều file thành một PDF. File được xử lý ngay trên máy của bạn, không tải lên máy chủ." />
      <SoanThaoTabs current="pdf" />
      <PdfTools />
    </>
  );
}
