import 'server-only';
import { serverEnv } from '@/lib/env';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, dayStartIso, vnDay } from '@/lib/format';
import { areaOfItem, areasOf, loadAreas, loadMeetings, type Meeting, type WorkArea } from '@/lib/meetings';
import { DOC_TYPES, STATUS_LABEL } from '@/lib/meeting-rules';

// Bảng tổng hợp hồ sơ họp theo văn bản phân công (7 cột), dùng cho trang và file xuất.

export type SummaryParams = { ngay?: string; pham_vi?: string; mang?: string; dau_moi?: string };
export type SummaryLink = { label: string; url: string };
export type SummaryRow = {
  meeting: Meeting;
  units: string[];
  pre: SummaryLink[];
  post: SummaryLink[];
  updaters: string[];
  status: string;
};

export function summaryRange(sp: SummaryParams) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? '') ? sp.ngay! : vnDay();
  if (sp.pham_vi === 'thang') {
    const from = `${day.slice(0, 7)}-01`;
    const [y, m] = from.split('-').map(Number);
    const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    return { scope: 'thang' as const, from, to };
  }
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  const from = addDays(day, wd === 0 ? -6 : 1 - wd);
  return { scope: 'tuan' as const, from, to: addDays(from, 7) };
}

function meetingAreas(m: Meeting, areas: WorkArea[]): Set<string> {
  const ids = new Set<string>();
  for (const it of m.items) { const a = areaOfItem(areas, it); if (a) ids.add(a.id); }
  const text = `${m.title}\n${m.description ?? ''}`.toLowerCase();
  for (const a of areas) if (a.name.trim().length >= 4 && text.includes(a.name.trim().toLowerCase())) ids.add(a.id);
  return ids;
}

export async function buildSummary(supabase: SupabaseClient, userId: string, sp: SummaryParams) {
  const range = summaryRange(sp);
  const [meetings, areas, { data: people }] = await Promise.all([
    loadMeetings(supabase, userId, dayStartIso(range.from), dayStartIso(range.to)),
    loadAreas(supabase),
    supabase.from('profiles').select('id, full_name, email').limit(2000),
  ]);
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email) as string]));
  const focalEmails = [...new Set(areas.flatMap((a) => [a.primary_email, ...a.coordinator_emails]).filter(Boolean) as string[])].sort();
  const byEmail = new Map((people ?? []).map((p) => [String(p.email).toLowerCase(), (p.full_name || p.email) as string]));

  let wanted: Set<string> | null = null;
  if (sp.mang) wanted = new Set([sp.mang]);
  if (sp.dau_moi) {
    const mine = areasOf(areas, sp.dau_moi).map((a) => a.id);
    wanted = new Set(wanted ? mine.filter((id) => wanted!.has(id)) : mine);
  }

  const rows: SummaryRow[] = [];
  for (const m of meetings) {
    const ma = meetingAreas(m, areas);
    if (wanted && ![...ma].some((id) => wanted!.has(id))) continue;
    const units = [...new Set([
      ...m.items.map((i) => i.party || areaOfItem(areas, i)?.name || '').filter(Boolean),
      ...areas.filter((a) => ma.has(a.id)).map((a) => a.name),
    ])];
    const link = (i: Meeting['items'][number]): SummaryLink => ({
      label: [i.party, i.title || (i.doc_type ? DOC_TYPES[i.doc_type] : null)].filter(Boolean).join(': ') || 'Tài liệu',
      // Tệp tải lên có link trong ứng dụng: thêm địa chỉ web để mở được từ file Excel.
      url: i.url!.startsWith('/') ? `${serverEnv.appUrl()}${i.url}` : i.url!,
    });
    const pre = [...m.attachments.map((a) => ({ label: a.title, url: a.url })), ...m.items.filter((i) => i.kind === 'pre' && i.url).map(link)];
    const post = m.items.filter((i) => i.kind === 'minutes' && i.url).map(link);
    if (m.record?.drive_folder_url) post.unshift({ label: 'Thư mục Drive', url: m.record.drive_folder_url });
    const updaters = [...new Set([...m.items.filter((i) => i.url).map((i) => i.updated_by), m.record?.updated_by].filter(Boolean).map((id) => nameOf.get(id!) ?? ''))].filter(Boolean);
    const missing = m.items.filter((i) => !i.url).length;
    rows.push({
      meeting: m, units, pre, post, updaters,
      status: STATUS_LABEL[m.status] + (missing ? ` · thiếu ${missing} mục` : '') + (m.record?.follow_up ? ` · Theo dõi: ${m.record.follow_up}` : ''),
    });
  }
  return { range, rows, areas, focalEmails, emailName: (e: string) => byEmail.get(e) ?? e };
}
