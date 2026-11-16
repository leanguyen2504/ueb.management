// Nhận biết tệp/link nào xem được ngay trong web, và xem bằng cách nào.
// Dùng ở trình duyệt (FileLink) nên không phụ thuộc gì phía máy chủ.

export type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'docx' | 'office' | 'none';

export type PreviewTarget =
  | { source: 'stored'; href: string; name: string; kind: PreviewKind } // tệp tải lên web (/hop/tep?p=…)
  | { source: 'google'; href: string; name: string; embed: string }; // link Google Drive/Docs

const STORED = /^\/(hop|nhom|viec|nguoi)\/tep$/;

export function extOf(name: string) {
  return name.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase() ?? '';
}

export function kindOf(name: string): PreviewKind {
  const e = extOf(name);
  if (e === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(e)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(e)) return 'video';
  if (['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'flac', 'weba'].includes(e)) return 'audio';
  if (['txt', 'csv', 'md', 'json', 'log', 'tsv', 'xml'].includes(e)) return 'text';
  if (e === 'docx') return 'docx';
  if (['doc', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pps', 'ppsx', 'odt', 'ods', 'odp', 'rtf'].includes(e)) return 'office';
  return 'none';
}

// Link Google → địa chỉ nhúng được (trang /preview của Drive/Docs, hoặc danh sách thư mục).
export function googleEmbed(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const path = u.pathname.replace(/\/u\/\d+\//, '/');
  if (u.hostname === 'docs.google.com') {
    const m = path.match(/^\/(document|spreadsheets|presentation|drawings)\/d\/([\w-]{10,})/);
    if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
    const f = path.match(/^\/forms\/d\/(e\/)?([\w-]{10,})/);
    if (f) return `https://docs.google.com/forms/d/${f[1] ?? ''}${f[2]}/viewform?embedded=true`;
    return null;
  }
  if (u.hostname === 'drive.google.com') {
    const file = path.match(/^\/file\/d\/([\w-]{10,})/)?.[1] ?? (/^\/(open|uc)$/.test(path) ? u.searchParams.get('id') : null);
    if (file && /^[\w-]{10,}$/.test(file)) return `https://drive.google.com/file/d/${file}/preview`;
    const folder = path.match(/^\/drive\/(?:[\w-]+\/)*folders\/([\w-]{10,})/)?.[1];
    if (folder) return `https://drive.google.com/embeddedfolderview?id=${folder}#grid`;
  }
  return null;
}

// href có xem trước được không. Chỉ gọi ở trình duyệt (cần location.origin).
export function previewTarget(href: string, label?: string): PreviewTarget | null {
  let u: URL;
  try {
    u = new URL(href, location.origin);
  } catch {
    return null;
  }
  if (u.origin === location.origin && STORED.test(u.pathname)) {
    const p = u.searchParams.get('p');
    if (!p || u.searchParams.get('tai') === '1') return null;
    const file = p.split('/').pop() || 'tep';
    const name = label && extOf(label) ? label : file;
    return { source: 'stored', href: u.pathname + u.search, name, kind: kindOf(file) };
  }
  const embed = googleEmbed(u.href);
  return embed ? { source: 'google', href: u.href, name: label || 'Google Drive', embed } : null;
}
