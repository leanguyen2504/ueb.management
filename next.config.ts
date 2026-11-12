import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Trang vừa mở trong 30 giây được giữ lại ở trình duyệt: bấm qua lại giữa các trang hiện ngay,
    // không phải chờ máy chủ. Lưu, sửa, xóa (server action có revalidatePath) vẫn làm mới ngay.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
