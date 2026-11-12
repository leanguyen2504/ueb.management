// Quy tắc hồ sơ họp dùng chung cho máy chủ và giao diện (không có 'server-only').
// Theo văn bản phân công: tài liệu trước họp muộn nhất 24 giờ trước họp, biên bản và
// tài liệu sau họp muộn nhất 24 giờ sau khi họp xong.

export const DEADLINE_HOURS = 24;
// Tệp kéo thả vào hồ sơ họp (khớp giới hạn bucket meeting-files).
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPT_FILES = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.jpg,.jpeg,.png,.webp,.zip';

export const DOC_TYPES = {
  giay_moi: 'Giấy mời / Thông báo',
  chuong_trinh: 'Chương trình',
  bao_cao: 'Báo cáo',
  to_trinh: 'Tờ trình',
  du_thao_van_ban: 'Dự thảo văn bản',
  du_thao_ket_luan: 'Dự thảo kết luận (6 rõ)',
  tai_lieu_kem: 'Tài liệu kèm theo',
  bien_ban: 'Biên bản',
  du_thao_hoan_chinh: 'Dự thảo hoàn chỉnh',
  ket_luan: 'Kết luận / Thông báo sau họp',
  tai_lieu_bo_sung: 'Tài liệu bổ sung',
  khac: 'Khác',
} as const;
export type DocType = keyof typeof DOC_TYPES;
export const PRE_DOC_TYPES: DocType[] = ['giay_moi', 'chuong_trinh', 'bao_cao', 'to_trinh', 'du_thao_van_ban', 'du_thao_ket_luan', 'tai_lieu_kem', 'khac'];
export const POST_DOC_TYPES: DocType[] = ['bien_ban', 'du_thao_hoan_chinh', 'ket_luan', 'tai_lieu_bo_sung', 'khac'];

export const STATUS_LABEL = {
  chuan_bi: 'Chưa chuẩn bị',
  dang_thu_thap: 'Đang thu thập tài liệu',
  du_tai_lieu: 'Đủ tài liệu trước họp',
  cho_bien_ban: 'Chờ biên bản',
  hoan_tat: 'Hoàn tất',
  khong_can: 'Không cần hồ sơ',
} as const;
export type MeetingStatus = keyof typeof STATUS_LABEL;

// Mã Jira trong tên hoặc mô tả sự kiện, ví dụ "(KHTC-6447)".
const JIRA_RE = /\b([A-Z][A-Z0-9]{0,19}-\d{1,9})\b/;
export function jiraKeyIn(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = (t ?? '').match(JIRA_RE);
    if (m) return m[1];
  }
  return null;
}
export const isJiraKey = (v: string) => /^[A-Z][A-Z0-9]{0,19}-\d{1,9}$/.test(v);

// Ô Jira trên dòng buổi họp: dán link Jira (…/browse/KHTC-6447, …?selectedIssue=KHTC-6447)
// hoặc gõ mã, hoặc cả hai. Trả về mã và link (nếu có), hoặc lỗi.
export function parseJiraInput(raw: string): { key: string | null; url: string | null } | { error: string } {
  const v = raw.trim();
  if (!v) return { key: null, url: null };
  const url = v.match(/https?:\/\/\S+/i)?.[0] ?? null;
  if (url && url.length > 1000) return { error: 'Link quá dài.' };
  const rest = (url ? v.replace(url, ' ') : v).toUpperCase();
  let decoded = url ?? '';
  try { decoded = decodeURIComponent(decoded); } catch { /* giữ nguyên */ }
  const key = jiraKeyIn(rest) ?? jiraKeyIn(decoded) ?? jiraKeyIn(decoded.toUpperCase());
  if (!key) return { error: url ? 'Không thấy mã Jira trong link. Gõ thêm mã, ví dụ KHTC-6447.' : 'Mã Jira có dạng CHỮ-SỐ, ví dụ KHTC-6447.' };
  return { key, url };
}

// Ghi chú tự sinh khi nhập hàng loạt (ví dụ "Nhập từ Lịch công tác tuần 45"): không hiện.
export const isSourceNote = (note: string | null | undefined) => /^\s*nhập từ\s/iu.test(note ?? '');

type ItemLike = { kind: 'pre' | 'minutes'; url: string | null };

// Tình trạng tự suy ra khi đầu mối chưa chọn.
export function autoStatus(items: ItemLike[], endsAt: string, now = Date.now()): MeetingStatus {
  const pre = items.filter((i) => i.kind === 'pre');
  const minutes = items.filter((i) => i.kind === 'minutes');
  const ended = new Date(endsAt).getTime() <= now;
  if (minutes.some((i) => i.url) && !items.some((i) => !i.url)) return 'hoan_tat';
  if (ended) return 'cho_bien_ban';
  if (!items.length) return 'chuan_bi';
  if (pre.length && pre.every((i) => i.url)) return 'du_tai_lieu';
  return 'dang_thu_thap';
}

export type Deadline = { label: string; due: string; state: 'ok' | 'soon' | 'late' | 'done' };

// Hạn −24h (tài liệu trước họp) và +24h (biên bản).
export function deadlines(items: ItemLike[], startsAt: string, endsAt: string, status: MeetingStatus, now = Date.now()): Deadline[] {
  if (status === 'khong_can') return [];
  const preDue = new Date(startsAt).getTime() - DEADLINE_HOURS * 3600e3;
  const postDue = new Date(endsAt).getTime() + DEADLINE_HOURS * 3600e3;
  const pre = items.filter((i) => i.kind === 'pre');
  const preDone = pre.length > 0 ? pre.every((i) => i.url) : status === 'du_tai_lieu' || status === 'cho_bien_ban' || status === 'hoan_tat';
  const postDone = items.some((i) => i.kind === 'minutes' && i.url) && !items.some((i) => i.kind === 'minutes' && !i.url) || status === 'hoan_tat';
  const state = (due: number, done: boolean): Deadline['state'] => (done ? 'done' : now > due ? 'late' : due - now < 24 * 3600e3 ? 'soon' : 'ok');
  const out: Deadline[] = [{ label: 'Tài liệu trước họp', due: new Date(preDue).toISOString(), state: state(preDue, preDone) }];
  // Hạn biên bản chỉ hiện khi đã gần hoặc đã qua buổi họp.
  if (now > preDue) out.push({ label: 'Biên bản sau họp', due: new Date(postDue).toISOString(), state: state(postDue, postDone) });
  return out;
}

export function jiraUrl(base: string | null | undefined, key: string): string | null {
  const b = (base ?? '').trim().replace(/\/+$/, '');
  return b && /^https?:\/\//i.test(b) ? `${b}/browse/${encodeURIComponent(key)}` : null;
}
