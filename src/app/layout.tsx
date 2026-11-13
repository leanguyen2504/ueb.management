import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Quản trị công việc UEB', template: '%s · Quản trị công việc UEB' },
  description: 'Theo dõi nhóm, dự án, sự kiện, cuộc họp, tài liệu và đầu việc của Trường Đại học Kinh tế - ĐHQGHN.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Đặt giao diện sáng/tối trước khi hiển thị để không bị nháy.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Lexend cho tiêu đề, Be Vietnam Pro cho nội dung: cả hai hiển thị tốt dấu tiếng Việt. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Lexend:wght@500;600&display=swap" />
        <style>{`:root{--font-body:'Be Vietnam Pro';--font-heading:'Lexend'}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
