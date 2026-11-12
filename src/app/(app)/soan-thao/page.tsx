import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from './tabs';
import { ReviewBox } from './ReviewBox';

export const metadata: Metadata = { title: 'Soạn thảo' };

export default async function SoanThaoPage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Rà soát thể thức văn bản hành chính theo Nghị định 30/2020/NĐ-CP và các công cụ hỗ trợ soạn thảo." />
      <SoanThaoTabs current="ra-soat" />
      <ReviewBox />
    </>
  );
}
