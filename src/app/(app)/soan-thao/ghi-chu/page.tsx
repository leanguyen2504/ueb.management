import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SoanThaoTabs } from '../tabs';
import { NotesBoard, type Note } from './NotesBoard';

export const metadata: Metadata = { title: 'Ghi chú nhanh' };

export default async function NotesPage() {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from('quick_notes')
    .select('id, body, pinned, created_at, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(300);
  // Chưa chạy file SQL tạo bảng: báo cho người dùng thay vì lỗi trang.
  const missing = !!error && /quick_notes|42P01|PGRST205/i.test(`${error.code} ${error.message}`);
  return (
    <>
      <PageHead title="Soạn thảo" sub="Ghi nhanh ý tưởng, việc cần nhớ, đoạn văn dùng lại. Chỉ bạn xem được ghi chú của mình." />
      <SoanThaoTabs current="ghi-chu" />
      {missing ? (
        <p className="card text-sm">Mục Ghi chú nhanh chưa được bật: quản trị cần chạy file <code>supabase/migrations/20261112900001_ghi_chu_nhanh.sql</code> trong Supabase SQL Editor.</p>
      ) : error ? (
        <p role="alert" className="card text-sm text-orange-700 dark:text-orange-300">Không tải được ghi chú: {error.message}</p>
      ) : (
        <NotesBoard notes={(data ?? []) as Note[]} />
      )}
    </>
  );
}
