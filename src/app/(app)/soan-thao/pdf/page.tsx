import { redirect } from 'next/navigation';

// Công cụ chuyển PDF nằm trong trang Công cụ soạn thảo.
export default function PdfPage() {
  redirect('/soan-thao');
}
