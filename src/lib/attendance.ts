// Lịch cá nhân và chấm công: kiểu dữ liệu, nhãn và tổng hợp theo ngày (hàm thuần, không gọi mạng).
//
// Bảng chấm công ghép bốn nguồn cho mỗi ngày:
//   1. Điểm danh do chính mình bấm (attendance_checkins).
//   2. Lịch cá nhân: lịch dạy/giảng, sự kiện, việc tự tạo hoặc được phân công (personal_items).
//   3. Đơn nghỉ phép và đăng ký làm ngoài giờ trên Jira (jira_issues) — tự cập nhật mỗi lần đồng bộ Jira.
//   4. Worklog và sản phẩm hoàn thành trên Jira (jira_worklogs, jira_issues).
//   5. Giờ vào/ra từ máy chấm công của trường (attendance_punches), khi người dùng đã đồng bộ.
import { addDays, vnDay } from '@/lib/format';
import { isMine, numberOf } from '@/lib/jira/report';
import type { JiraIssueRow } from '@/lib/jira/types';
import { hasPunch, type PunchRow } from '@/lib/punch';

export type PersonalKind = 'giang_day' | 'su_kien' | 'cong_viec' | 'khac';
export type PersonalRole = 'giang_vien_chinh' | 'tro_giang' | 'bao_cao_vien' | 'to_chuc' | 'tham_du' | 'thuc_hien';
export type PersonalPlace = 'truong' | 'khoa' | 'ngoai_truong' | 'truc_tuyen';
export type PersonalStatus = 'pending' | 'accepted' | 'declined' | 'done';
export type CheckinPlace = 'truong' | 'khoa' | 'giang' | 'cong_tac' | 'tu_xa';

export type PersonalItem = {
  id: string;
  owner_id: string;
  assigned_by: string | null;
  kind: PersonalKind;
  role: PersonalRole | null;
  place: PersonalPlace | null;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  description: string | null;
  status: PersonalStatus;
  response_note: string | null;
};

export type Checkin = { day: string; place: CheckinPlace; note: string | null; checked_at: string };

export const KIND_LABEL: Record<PersonalKind, string> = {
  giang_day: 'Lịch dạy / giảng',
  su_kien: 'Sự kiện',
  cong_viec: 'Công việc',
  khac: 'Khác',
};
export const ROLE_LABEL: Record<PersonalRole, string> = {
  giang_vien_chinh: 'Giảng viên chính',
  tro_giang: 'Trợ giảng',
  bao_cao_vien: 'Báo cáo viên',
  to_chuc: 'Tổ chức / điều phối',
  tham_du: 'Tham dự',
  thuc_hien: 'Người thực hiện',
};
export const PLACE_LABEL: Record<PersonalPlace, string> = {
  truong: 'Ở trường',
  khoa: 'Ở khoa',
  ngoai_truong: 'Ngoài trường',
  truc_tuyen: 'Trực tuyến',
};
export const STATUS_LABEL: Record<PersonalStatus, string> = {
  pending: 'Chờ nhận',
  accepted: 'Đã nhận',
  declined: 'Từ chối',
  done: 'Đã xong',
};
export const CHECKIN_LABEL: Record<CheckinPlace, string> = {
  truong: 'Ở trường',
  khoa: 'Ở khoa',
  giang: 'Đi giảng',
  cong_tac: 'Công tác ngoài trường',
  tu_xa: 'Làm từ xa',
};

// Số giờ chuẩn của một ngày làm việc.
export const DAY_TARGET_HOURS = 8;

// ---- Đơn nghỉ phép và làm ngoài giờ trên Jira ----

const norm = (s: unknown) => (typeof s === 'string' ? s.normalize('NFC').toLowerCase() : '');
const LEAVE_RE = /nghỉ phép|nghỉ ốm|nghỉ việc riêng|xin nghỉ|đơn nghỉ|nghỉ không lương|nghỉ bù|\bleave\b/;
const OT_RE = /ngoài giờ|làm thêm|tăng ca|overtime|\bot\b/;
const REJECT_RE = /từ chối|không duyệt|hủy|huỷ|reject|cancel|declin/;

function field(i: JiraIssueRow, re: RegExp): unknown {
  for (const [k, v] of Object.entries(i.custom ?? {})) if (re.test(norm(k).trim())) return v;
  return undefined;
}

// Ngày dạng "2026-10-20", "2026-10-20T…", "20/10/2026".
export function parseDay(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Jira của trường gắn sẵn giá trị mặc định cho các trường của đơn nghỉ ("Loại nghỉ phép" = "Nghỉ phép năm",
// "Số ngày nghỉ" = 1.0, "Từ ngày"…) trên MỌI mã việc, kể cả việc thường. Vì vậy chỉ nhận đơn nghỉ theo loại mã việc
// (ví dụ "Chuyên viên/ Giảng viên nghỉ phép"), không dựa vào các trường đó.
export const isLeaveIssue = (i: JiraIssueRow) => LEAVE_RE.test(norm(i.issue_type));
export const isOvertimeIssue = (i: JiraIssueRow) => !isLeaveIssue(i) && (OT_RE.test(norm(i.issue_type)) || /^(đăng ký|đơn|xin) .*(ngoài giờ|làm thêm|tăng ca)/.test(norm(i.summary)));

// Đơn của chính mình: trường "Người viết đơn" có tên đăng nhập hoặc tên hiển thị của mình; không có trường đó thì xét người tạo.
export function isMyRequest(i: JiraIssueRow, me: { username: string | null; displayName: string | null }) {
  const writer = norm(field(i, /^người viết đơn$|^người đề nghị$|^người làm đơn$/));
  if (writer) {
    const u = norm(me.username);
    const d = norm(me.displayName);
    return Boolean((u && new RegExp(`(^|[^a-z0-9_.])${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9_.])`).test(writer)) || (d && writer.includes(d)));
  }
  return i.is_reporter;
}

export type RequestState = 'approved' | 'pending' | 'rejected';
export function requestState(i: JiraIssueRow): RequestState {
  if (REJECT_RE.test(norm(i.status))) return 'rejected';
  return i.status_category === 'done' ? 'approved' : 'pending';
}

export type JiraRequest = {
  key: string;
  kind: 'leave' | 'overtime';
  title: string;
  from: string;
  to: string;
  // Phần ngày nghỉ của mỗi ngày (1 = cả ngày, 0.5 = nửa ngày).
  fraction: number;
  // Số giờ làm ngoài giờ mỗi ngày (nếu đơn ghi rõ).
  hours: number | null;
  leaveType: string | null;
  status: string | null;
  state: RequestState;
};

// Các đơn nghỉ phép / làm ngoài giờ của chính mình trong dữ liệu Jira.
export function jiraRequests(issues: JiraIssueRow[], me: { username: string | null; displayName: string | null }): JiraRequest[] {
  const out: JiraRequest[] = [];
  for (const i of issues) {
    const leave = isLeaveIssue(i);
    if (!leave && !isOvertimeIssue(i)) continue;
    if (!isMyRequest(i, me)) continue;
    const from = parseDay(field(i, /^từ ngày$|^ngày bắt đầu nghỉ$|^ngày làm thêm$|^ngày làm$/)) ?? i.start_date ?? i.due_date ?? (i.updated_at_jira ? vnDay(i.updated_at_jira) : null);
    if (!from) continue;
    let to = parseDay(field(i, /^đến ngày$|^ngày kết thúc nghỉ$/)) ?? (leave ? i.due_date : null) ?? from;
    if (to < from || daysBetween(from, to) > 62) to = from;
    const days = numberOf(field(i, /^số ngày nghỉ$|^số ngày$/));
    const span = daysBetween(from, to) + 1;
    const fraction = leave && days != null && days > 0 && days < span ? Math.max(0.5, Math.min(1, days / span)) : 1;
    const hours = leave ? null : numberOf(field(i, /số giờ|giờ làm thêm|giờ ngoài giờ|^số lượng$/));
    const lt = field(i, /^loại nghỉ phép$|^loại nghỉ$/);
    out.push({
      key: i.issue_key, kind: leave ? 'leave' : 'overtime', title: i.summary, from, to, fraction,
      hours: hours != null && hours > 0 && hours <= 24 ? hours : null,
      leaveType: typeof lt === 'string' ? lt : null, status: i.status, state: requestState(i),
    });
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

// ---- Tổng hợp theo ngày ----

export type DayVerdict = 'dat' | 'mot-phan' | 'nghi-phep' | 'cho-duyet' | 'thieu' | 'cuoi-tuan' | 'lam-cuoi-tuan' | 'chua-den' | 'hom-nay';
export const VERDICT_LABEL: Record<DayVerdict, string> = {
  dat: 'Đạt',
  'mot-phan': 'Chưa đủ giờ',
  'nghi-phep': 'Nghỉ có phép',
  'cho-duyet': 'Nghỉ, chờ duyệt',
  thieu: 'Chưa log work',
  'cuoi-tuan': 'Cuối tuần',
  'chua-den': '',
  'hom-nay': 'Hôm nay',
  'lam-cuoi-tuan': 'Làm cuối tuần',
};

export type DayRow = {
  day: string;
  weekend: boolean;
  checkin: Checkin | null;
  items: PersonalItem[];
  leave: JiraRequest[];
  overtime: JiraRequest[];
  // Nơi làm việc trong ngày (nhãn).
  place: string | null;
  // mac-dinh: ngày làm việc không có đơn nghỉ thì coi là có mặt (web không nhận dữ liệu chấm công khuôn mặt).
  placeFrom: 'diem-danh' | 'lich' | 'jira' | 'may-cham-cong' | 'mac-dinh' | null;
  // Dòng máy chấm công của ngày (null: chưa đồng bộ ngày này).
  punch: PunchRow | null;
  worklogHours: number;
  teachHours: number;
  overtimeHours: number;
  products: { key: string; summary: string; converted: number | null }[];
  converted: number;
  leaveFraction: number;
  target: number;
  verdict: DayVerdict;
};

const hoursOf = (it: PersonalItem) => (it.all_day ? 0 : Math.max(0, (Date.parse(it.ends_at) - Date.parse(it.starts_at)) / 3600000));
const round2 = (n: number) => Math.round(n * 100) / 100;

// Các ngày mà một mục lịch đi qua (giờ Việt Nam).
function itemDays(it: PersonalItem): string[] {
  const first = vnDay(it.starts_at);
  const endMs = Date.parse(it.ends_at);
  const last = endMs > Date.parse(it.starts_at) ? vnDay(new Date(endMs - 1)) : first;
  const out: string[] = [];
  for (let d = first, n = 0; d <= last && n < 62; d = addDays(d, 1), n++) out.push(d);
  return out;
}

export function buildDays(input: {
  from: string;
  to: string; // không gồm ngày này
  today: string;
  checkins: Checkin[];
  items: PersonalItem[];
  requests: JiraRequest[];
  worklogs: { started_at: string; seconds: number }[];
  issues: JiraIssueRow[];
  convertedField: string | null;
  punches?: PunchRow[];
}): DayRow[] {
  const { from, to, today } = input;
  const checkin = new Map(input.checkins.map((c) => [c.day, c]));
  const punchBy = new Map((input.punches ?? []).map((p) => [p.day, p]));
  const itemsBy = new Map<string, PersonalItem[]>();
  for (const it of input.items) {
    if (it.status === 'declined') continue;
    for (const d of itemDays(it)) {
      if (d < from || d >= to) continue;
      itemsBy.set(d, [...(itemsBy.get(d) ?? []), it]);
    }
  }
  const wl = new Map<string, number>();
  for (const w of input.worklogs) {
    const d = vnDay(w.started_at);
    wl.set(d, (wl.get(d) ?? 0) + w.seconds);
  }
  const requestIssues = new Set(input.requests.map((r) => r.key));
  // Việc đi công tác / onsite trên Jira có ngày trong tiêu đề ("Đi onsite Thành ủy ngày 14.10.2026").
  const tripBy = new Map<string, { key: string; summary: string }>();
  for (const i of input.issues) {
    if (!isMine(i) && !i.is_reporter) continue;
    const t = norm(i.summary);
    if (!/onsite|công tác|đi công|khảo sát thực địa/.test(t)) continue;
    const m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (!m) continue;
    const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (!tripBy.has(d)) tripBy.set(d, { key: i.issue_key, summary: i.summary });
  }
  const prodBy = new Map<string, DayRow['products']>();
  for (const i of input.issues) {
    if (!isMine(i) || i.status_category !== 'done' || !i.resolved_at || requestIssues.has(i.issue_key) || isLeaveIssue(i)) continue;
    const d = vnDay(i.resolved_at);
    const converted = input.convertedField ? numberOf(i.custom?.[input.convertedField]) : null;
    prodBy.set(d, [...(prodBy.get(d) ?? []), { key: i.issue_key, summary: i.summary, converted }]);
  }

  const rows: DayRow[] = [];
  for (let day = from; day < to; day = addDays(day, 1)) {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    const items = (itemsBy.get(day) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const leave = input.requests.filter((r) => r.kind === 'leave' && r.state !== 'rejected' && r.from <= day && day <= r.to);
    const overtime = input.requests.filter((r) => r.kind === 'overtime' && r.state !== 'rejected' && r.from <= day && day <= r.to);
    const ci = checkin.get(day) ?? null;
    const teachHours = round2(items.filter((i) => i.kind === 'giang_day').reduce((s, i) => s + hoursOf(i), 0));
    const worklogHours = round2((wl.get(day) ?? 0) / 3600);
    const overtimeHours = round2(overtime.reduce((s, r) => s + (r.hours ?? 0), 0));
    const products = prodBy.get(day) ?? [];
    const converted = round2(products.reduce((s, p) => s + (p.converted ?? 0), 0));
    const approvedLeave = leave.filter((r) => r.state === 'approved');
    const leaveFraction = Math.min(1, leave.reduce((s, r) => s + r.fraction, 0));
    const target = weekend ? 0 : round2(DAY_TARGET_HOURS * (1 - leaveFraction));

    let place: string | null = null;
    let placeFrom: DayRow['placeFrom'] = null;
    if (leaveFraction >= 1) {
      place = leave[0].leaveType ? `Nghỉ: ${leave[0].leaveType}` : 'Nghỉ phép';
      placeFrom = 'jira';
    } else if (ci) {
      place = CHECKIN_LABEL[ci.place];
      placeFrom = 'diem-danh';
    } else if (tripBy.has(day)) {
      place = `Công tác: ${tripBy.get(day)!.summary}`;
      placeFrom = 'jira';
    } else if (items.some((i) => i.kind === 'giang_day')) {
      place = 'Đi giảng';
      placeFrom = 'lich';
    } else {
      const p = items.find((i) => i.place)?.place;
      if (p) {
        place = p === 'ngoai_truong' ? 'Công tác ngoài trường' : PLACE_LABEL[p];
        placeFrom = 'lich';
      }
    }
    const punch = punchBy.get(day) ?? null;
    if ((!place || placeFrom === 'lich') && hasPunch(punch)) {
      place = place ? `${place} · có chấm công` : 'Ở trường';
      placeFrom = place === 'Ở trường' ? 'may-cham-cong' : placeFrom;
    }
    if (!place && punch && !weekend && day <= today) {
      place = 'Không chấm công';
      placeFrom = 'may-cham-cong';
    }
    if (!place && !weekend && day <= today) {
      place = 'Có mặt';
      placeFrom = 'mac-dinh';
    }
    if (leaveFraction > 0 && leaveFraction < 1 && place) place = `${place} · nghỉ nửa ngày`;
    else if (leaveFraction > 0 && leaveFraction < 1) {
      place = 'Nghỉ nửa ngày';
      placeFrom = 'jira';
    }

    const worked = worklogHours + teachHours;
    let verdict: DayVerdict;
    if (day > today) verdict = 'chua-den';
    else if (leaveFraction >= 1) verdict = approvedLeave.length === leave.length ? 'nghi-phep' : 'cho-duyet';
    else if (weekend && !ci && !items.length && !worked && !overtime.length && !products.length && !hasPunch(punch)) verdict = 'cuoi-tuan';
    else if (worked >= target || converted >= target) verdict = weekend ? (worked || converted || products.length ? 'lam-cuoi-tuan' : 'cuoi-tuan') : 'dat';
    else if (day === today) verdict = 'hom-nay';
    else if (worked > 0 || converted > 0 || ci || items.length || products.length) verdict = 'mot-phan';
    else verdict = 'thieu';

    rows.push({
      day, weekend, checkin: ci, items, leave, overtime, place, placeFrom, punch, worklogHours, teachHours, overtimeHours,
      products, converted, leaveFraction, target, verdict,
    });
  }
  return rows;
}
