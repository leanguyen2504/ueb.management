import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs, TEMPLATES, TemplatePicker, type TemplateKey } from '../tabs';
import { TemplateForm } from '../cong-cu/Tools';
import { SlideMaker } from '../slide/SlideMaker';
import { BudgetMaker } from './BudgetMaker';
import { FormMaker } from './FormMaker';

export const metadata: Metadata = { title: 'Template' };

const SUB: Partial<Record<TemplateKey, string>> = {
  'van-ban': 'Điền thông tin, tải khung văn bản Word đã trình bày đúng thể thức Nghị định 30/2020/NĐ-CP.',
  slide: 'Nhập dàn ý, chọn loại trang (nội dung, biểu đồ, sơ đồ, bảng…), xem trước và tải file PowerPoint theo phong cách slide UEB.',
  'du-toan': 'Lập dự toán hoặc quyết toán kinh phí theo mẫu, tự cộng tiền và viết bằng chữ, tải file Excel có sẵn công thức.',
};

export default async function TemplatePage({ searchParams }: { searchParams: Promise<{ loai?: string }> }) {
  await requireSession();
  const { loai } = await searchParams;
  const cur = (TEMPLATES.find((t) => t.key === loai)?.key ?? 'van-ban') as TemplateKey;
  return (
    <>
      <PageHead title="Soạn thảo" sub={SUB[cur] ?? 'Điền các ô, tải file Word đã trình bày sẵn. Thông tin cá nhân (họ tên, đơn vị…) được nhớ cho các mẫu sau.'} />
      <SoanThaoTabs current="template" />
      <TemplatePicker current={cur} />
      {cur === 'van-ban' && <TemplateForm />}
      {cur === 'slide' && <SlideMaker />}
      {cur === 'du-toan' && <BudgetMaker />}
      {!['van-ban', 'slide', 'du-toan'].includes(cur) && <FormMaker formKey={cur} />}
    </>
  );
}
