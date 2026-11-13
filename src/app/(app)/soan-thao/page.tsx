import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from './tabs';
import { ReviewBox } from './ReviewBox';
import { PdfTools } from './pdf/PdfTools';

export const metadata: Metadata = { title: 'Soạn thảo' };

export default async function SoanThaoPage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Rà soát thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP, chuyển Word, ảnh sang PDF. Ghi chú, ghi âm nằm ở thẻ Công cụ ghi chú, các mẫu văn bản, slide, dự toán nằm ở thẻ Template." />
      <SoanThaoTabs current="cong-cu" />
      <div className="space-y-5">
        <ReviewBox />
        <PdfTools />
      </div>
    </>
  );
}
