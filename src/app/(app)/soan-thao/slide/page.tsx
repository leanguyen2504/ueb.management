import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from '../tabs';
import { SlideMaker } from './SlideMaker';

export const metadata: Metadata = { title: 'Slide bài giảng UEB' };

export default async function SlidePage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Nhập dàn ý bài giảng, xem trước và tải về file PowerPoint theo phong cách slide của Trường Đại học Kinh tế." />
      <SoanThaoTabs current="slide" />
      <SlideMaker />
    </>
  );
}
