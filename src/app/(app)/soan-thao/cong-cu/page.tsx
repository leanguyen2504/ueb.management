import { redirect } from 'next/navigation';

// Trang cũ: Công cụ soạn thảo nay là trang đầu của mục, khung văn bản chuyển sang thẻ Template.
export default function OldToolsPage() {
  redirect('/soan-thao/template?loai=van-ban');
}
