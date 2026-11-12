// Liên kết trang cá nhân và file hồ sơ (CV…) trên Hồ sơ cá nhân.

export type ProfileLink = {
  id: string;
  kind: 'link' | 'doc';
  label: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
};

export const PROFILE_FILE_MAX = 10 * 1024 * 1024;
export const PROFILE_FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.odt,.txt,.jpg,.jpeg,.png,.webp';
export const PROFILE_LINKS_MAX = 30;

// Tên trang đoán từ tên miền, dùng khi người dùng không tự đặt tên.
const SITES: [RegExp, string][] = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'Facebook'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/^scholar\.google\./, 'Google Scholar'],
  [/(^|\.)orcid\.org$/, 'ORCID'],
  [/(^|\.)researchgate\.net$/, 'ResearchGate'],
  [/(^|\.)scopus\.com$/, 'Scopus'],
  [/(^|\.)webofscience\.com$|(^|\.)clarivate\.com$/, 'Web of Science'],
  [/(^|\.)academia\.edu$/, 'Academia.edu'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X (Twitter)'],
  [/(^|\.)zalo\.me$/, 'Zalo'],
  [/^drive\.google\.com$|^docs\.google\.com$/, 'Google Drive'],
  [/(^|\.)ueb\.edu\.vn$|(^|\.)ueb\.vnu\.edu\.vn$/, 'Trang UEB'],
  [/(^|\.)vnu\.edu\.vn$/, 'Trang ĐHQGHN'],
];

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function siteName(url: string): string {
  const host = hostOf(url);
  return SITES.find(([re]) => re.test(host))?.[1] ?? host;
}

// Tên hiện ra cho một mục: tên tự đặt, hoặc tên file, hoặc tên trang.
export function linkTitle(l: Pick<ProfileLink, 'kind' | 'label' | 'url' | 'file_name'>) {
  if (l.label) return l.label;
  if (l.file_name) return l.file_name;
  if (l.url) return l.kind === 'doc' ? `Hồ sơ trên ${siteName(l.url)}` : siteName(l.url);
  return 'Liên kết';
}

// Đường dẫn trong ứng dụng để mở tệp hồ sơ đã tải lên (máy chủ kiểm tra quyền).
export const fileHref = (path: string, download = false) => `/nguoi/tep?p=${encodeURIComponent(path)}${download ? '&tai=1' : ''}`;

export const fileSize = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
