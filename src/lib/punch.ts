// Dữ liệu máy chấm công của trường (chamcong4lan.ueb.edu.vn): chuẩn hóa dữ liệu nút đồng bộ gửi lên,
// chọn đúng dòng của người đang dùng, và đối chiếu với đơn nghỉ trên Jira. Hàm thuần, không gọi mạng.
import type { JiraRequest } from '@/lib/attendance';

// "2026-11-03", "2026-11-03T00:00:00", "03/11/2026" → "2026-11-03".
// Có múi giờ (Z, +07:00) thì đổi sang ngày giờ Việt Nam.
function parseDay(v: string): string | null {
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(v) && !Number.isNaN(Date.parse(v))) return new Date(Date.parse(v) + 7 * 3600000).toISOString().slice(0, 10);
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Một dòng báo cáo chấm công như hệ thống của trường trả về (GET /api/chamcong/bao-cao).
export type RawPunchRow = {
  hoTen?: unknown; username?: unknown; ngay?: unknown; donViTen?: unknown; chucDanh?: unknown;
  vaoSang?: unknown; raSang?: unknown; vaoChieu?: unknown; raChieu?: unknown;
  viPhamSang?: unknown; viPhamChieu?: unknown; giaiTrinhSang?: unknown; giaiTrinhChieu?: unknown;
  phutViPham?: unknown; phutQuyDoi?: unknown; soLoi?: unknown; lamBu?: unknown;
};

export type PunchRow = {
  day: string;
  in_am: string | null;
  out_am: string | null;
  in_pm: string | null;
  out_pm: string | null;
  violation_am: string | null;
  violation_pm: string | null;
  excuse_am: string | null;
  excuse_pm: string | null;
  minutes_late: number;
  minutes_converted: number;
  error_count: number;
  makeup_day: boolean;
};

export type PunchSync = {
  punch_username: string | null;
  full_name: string | null;
  unit_name: string | null;
  title: string | null;
  range_from: string;
  range_to: string;
  row_count: number;
  source_synced_at: string | null;
  excuse_error: boolean;
  synced_at: string;
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : 0;
};
// "07:58", "7:58:12", "2026-11-03T07:58:00" → "07:58".
export function hhmmOf(v: unknown): string | null {
  const m = str(v).match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?/) ?? str(v).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// Bỏ dấu, chữ thường, gộp khoảng trắng: để so tên người.
export const foldName = (s: unknown) =>
  str(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

export function normalizePunch(r: RawPunchRow): PunchRow | null {
  const day = parseDay(str(r.ngay));
  if (!day) return null;
  const text = (v: unknown) => str(v).slice(0, 500) || null;
  return {
    day,
    in_am: hhmmOf(r.vaoSang), out_am: hhmmOf(r.raSang), in_pm: hhmmOf(r.vaoChieu), out_pm: hhmmOf(r.raChieu),
    violation_am: text(r.viPhamSang), violation_pm: text(r.viPhamChieu),
    excuse_am: text(r.giaiTrinhSang), excuse_pm: text(r.giaiTrinhChieu),
    minutes_late: Math.max(0, num(r.phutViPham)), minutes_converted: Math.max(0, num(r.phutQuyDoi)),
    error_count: Math.max(0, Math.min(100, Math.round(num(r.soLoi)))),
    makeup_day: r.lamBu === true,
  };
}

export type PunchUpload = {
  from: string;
  to: string;
  sourceSyncedAt: string | null;
  excuseError: boolean;
  me: { name: string; email: string };
  rows: RawPunchRow[];
};

export function parsePunchUpload(body: unknown): PunchUpload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const from = parseDay(str(b.from));
  const to = parseDay(str(b.to));
  if (!from || !to || to < from || !Array.isArray(b.rows) || b.rows.length > 5000) return null;
  const me = (b.me && typeof b.me === 'object' ? b.me : {}) as Record<string, unknown>;
  const synced = str(b.sourceSyncedAt);
  return {
    from, to,
    sourceSyncedAt: synced && !Number.isNaN(Date.parse(synced)) ? new Date(synced).toISOString() : null,
    excuseError: b.excuseError === true,
    me: { name: str(me.name).slice(0, 200), email: str(me.email).toLowerCase().slice(0, 200) },
    rows: b.rows.filter((r): r is RawPunchRow => !!r && typeof r === 'object'),
  };
}

// Chọn tài khoản chấm công của người dùng trong các dòng gửi lên. Ưu tiên tên đăng nhập Jira (hệ thống chấm công
// dùng chung tài khoản Jira), sau đó phần trước @ của email, cuối cùng là họ tên nếu chỉ khớp một tài khoản.
export function pickOwnRows(
  rows: RawPunchRow[],
  who: { jiraUsername: string | null; emails: string[]; names: string[] },
): { username: string; rows: RawPunchRow[] } | { error: string } {
  const byUser = new Map<string, RawPunchRow[]>();
  for (const r of rows) {
    const u = str(r.username).toLowerCase();
    if (u) byUser.set(u, [...(byUser.get(u) ?? []), r]);
  }
  const ju = who.jiraUsername?.trim().toLowerCase();
  if (ju && byUser.has(ju)) return { username: ju, rows: byUser.get(ju)! };
  for (const e of who.emails) {
    const local = e.split('@')[0]?.toLowerCase();
    if (local && byUser.has(local)) return { username: local, rows: byUser.get(local)! };
  }
  const names = new Set(who.names.map(foldName).filter(Boolean));
  const hits = [...byUser.entries()].filter(([, rs]) => rs.some((r) => names.has(foldName(r.hoTen))));
  if (hits.length === 1 && !ju) return { username: hits[0][0], rows: hits[0][1] };
  if (hits.length === 1 && ju)
    return { error: `Tài khoản chấm công "${hits[0][0]}" không trùng tài khoản Jira "${ju}" của bạn. Hãy đăng nhập đúng tài khoản ở trang chấm công.` };
  if (hits.length > 1) return { error: 'Có nhiều người trùng họ tên trong báo cáo chấm công. Hãy đồng bộ Jira trước để web biết tên đăng nhập của bạn.' };
  return { error: 'Không thấy dòng chấm công nào của bạn trong khoảng ngày này.' };
}

// ---- Đối chiếu theo ngày ----

export type PunchIssue = { kind: 'late' | 'early' | 'missing'; label: string; heavy: boolean };

// "Đi muộn 12'; Về sớm 5'" → các vi phạm.
export function violationsOf(p: PunchRow | null): PunchIssue[] {
  if (!p) return [];
  const out: PunchIssue[] = [];
  for (const [shift, v] of [['sáng', p.violation_am], ['chiều', p.violation_pm]] as const) {
    for (const part of (v ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
      const kind = /không chấm/i.test(part) ? 'missing' : /về sớm/i.test(part) ? 'early' : 'late';
      out.push({ kind, label: `${part} (${shift})`, heavy: kind === 'missing' });
    }
  }
  return out;
}

// Mã đơn trong cột giải trình ("NP-12 · Nghỉ phép năm; NP-13 · …").
export const excuseKeys = (p: PunchRow | null) =>
  [p?.excuse_am, p?.excuse_pm].flatMap((e) => (e ?? '').split(';')).map((s) => s.split('·')[0].trim()).filter(Boolean);

export const hasPunch = (p: PunchRow | null) => !!p && !!(p.in_am || p.out_am || p.in_pm || p.out_pm);

export const punchSpan = (p: PunchRow | null) => {
  if (!p) return '';
  const part = (a: string | null, b: string | null) => (a || b ? `${a ?? '--:--'}–${b ?? '--:--'}` : '');
  return [part(p.in_am, p.out_am), part(p.in_pm, p.out_pm)].filter(Boolean).join(' · ');
};

// Điều cần rà soát của một ngày khi ghép máy chấm công với đơn trên Jira.
export function punchFindings(p: PunchRow | null, leave: JiraRequest[]): string[] {
  const out: string[] = [];
  if (!p) return out;
  const excused = new Set(excuseKeys(p));
  const unexcused = p.error_count > 0 && excused.size === 0;
  if (unexcused) {
    const approved = leave.filter((r) => r.state === 'approved');
    const pending = leave.filter((r) => r.state === 'pending');
    if (approved.length) out.push(`Có đơn ${approved.map((r) => r.key).join(', ')} đã duyệt trên Jira nhưng máy chấm công chưa ghi nhận giải trình`);
    else if (pending.length) out.push(`Đơn ${pending.map((r) => r.key).join(', ')} trên Jira chưa được duyệt nên chưa trừ lỗi`);
    else out.push('Chưa có đơn giải trình');
  }
  return out;
}
