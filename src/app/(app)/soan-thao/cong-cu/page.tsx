import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from '../tabs';
import { QuickCheck, TemplateForm } from './Tools';
import { DOC_TYPES } from '@/lib/docx/review';

export const metadata: Metadata = { title: 'Công cụ soạn thảo' };

// Cỡ chữ, kiểu chữ từng thành phần (Phụ lục I, Nghị định 30/2020/NĐ-CP).
const PARTS: [string, string, string][] = [
  ['Quốc hiệu', 'In hoa, đứng, đậm', '12-13'],
  ['Tiêu ngữ', 'In thường, đứng, đậm; có đường kẻ dưới', '13-14'],
  ['Tên cơ quan chủ quản', 'In hoa, đứng', '12-13'],
  ['Tên cơ quan ban hành', 'In hoa, đứng, đậm; có đường kẻ dưới', '12-13'],
  ['Số, ký hiệu', 'In thường (ký hiệu in hoa), đứng', '13'],
  ['Địa danh, ngày tháng', 'In thường, nghiêng', '13-14'],
  ['Tên loại văn bản', 'In hoa, đứng, đậm, canh giữa', '13-14'],
  ['Trích yếu', 'In thường, đứng, đậm, canh giữa; có đường kẻ dưới', '13-14'],
  ['Trích yếu công văn (V/v)', 'In thường, đứng, dưới số ký hiệu', '12-13'],
  ['Nội dung', 'In thường, đứng, căn đều 2 lề, thụt đầu dòng 1-1,27 cm, cách đoạn ≥ 6pt, giãn dòng 1-1,5', '13-14'],
  ['Quyền hạn, chức vụ người ký', 'In hoa, đứng, đậm', '13-14'],
  ['Họ tên người ký', 'In thường, đứng, đậm', '13-14'],
  ['Chữ "Nơi nhận:"', 'In thường, nghiêng, đậm', '12'],
  ['Danh sách nơi nhận', 'In thường, đứng; cuối dòng dấu ;, dòng cuối "- Lưu: VT, ..."', '11'],
  ['Số trang', 'Chữ số Ả Rập, giữa lề trên, không đánh trang đầu', '13-14'],
];

export default async function ToolsPage() {
  await requireSession();
  return (
    <>
      <PageHead title="Soạn thảo" sub="Tạo khung văn bản đúng thể thức, rà soát nhanh một đoạn chữ và tra cứu quy định trình bày." />
      <SoanThaoTabs current="cong-cu" />
      <div className="space-y-5">
        <TemplateForm />
        <QuickCheck />
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <section className="card">
            <h2 className="text-base font-semibold">Viết tắt tên loại văn bản</h2>
            <p className="mt-1 text-xs muted">Phụ lục III, Nghị định 30/2020/NĐ-CP. Công văn, thư công không có chữ viết tắt.</p>
            <table className="table mt-2">
              <tbody>
                {DOC_TYPES.filter(([, a]) => a).map(([n, a]) => (
                  <tr key={n}><td className="py-1.5">{n.charAt(0) + n.slice(1).toLowerCase()}</td><td className="py-1.5 font-semibold">{a}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card">
            <h2 className="text-base font-semibold">Thể thức từng thành phần</h2>
            <p className="mt-1 text-xs muted">Khổ A4, Times New Roman, chữ đen. Lề trên, dưới 20-25 mm; trái 30-35 mm; phải 15-20 mm.</p>
            <div className="-mx-4 mt-2 overflow-x-auto md:-mx-5">
              <table className="table min-w-[560px]">
                <thead><tr><th>Thành phần</th><th>Kiểu chữ</th><th>Cỡ</th></tr></thead>
                <tbody>{PARTS.map(([a, b, c]) => <tr key={a}><td className="font-medium">{a}</td><td>{b}</td><td className="whitespace-nowrap">{c}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
