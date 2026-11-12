import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pickConvertedField } from './report';
import { normalizeIssue, periodIso, type Period, type SharePerson, type TeamIssue, type TeamWorklog } from './team';
import type { JiraAccount, JiraIssueRow } from './types';

// Những người mình xem được báo cáo Jira (kể cả mình). Trả null nếu cơ sở dữ liệu chưa có
// tính năng chia sẻ (migration chưa chạy) để giao diện ẩn phần này thay vì báo lỗi.
export async function loadSharePeople(supabase: SupabaseClient): Promise<SharePerson[] | null> {
  const { data, error } = await supabase.rpc('jira_related_people');
  if (error) return null;
  return ((data ?? []) as SharePerson[]).sort((a, b) => Number(b.is_me) - Number(a.is_me) || (a.full_name || a.email).localeCompare(b.full_name || b.email, 'vi'));
}

export type Scope = { kind: 'toi' } | { kind: 'nhom'; id: string } | { kind: 'tat-ca' } | { kind: 'chon'; ids: string[] };

export function parseScope(p: URLSearchParams): Scope {
  const ai = p.get('ai');
  const uuid = /^[0-9a-f-]{36}$/i;
  if (ai === 'nhom' && uuid.test(p.get('nhom') ?? '')) return { kind: 'nhom', id: p.get('nhom')! };
  if (ai === 'tat-ca') return { kind: 'tat-ca' };
  if (ai === 'chon') return { kind: 'chon', ids: p.getAll('nguoi').flatMap((x) => x.split(',')).filter((x) => uuid.test(x)).slice(0, 500) };
  return { kind: 'toi' };
}

export type ReportData = {
  people: (SharePerson & { field: string | null })[];
  issues: TeamIssue[];
  worklogs: TeamWorklog[];
  scopeLabel: string;
};

export async function loadReport(supabase: SupabaseClient, userId: string, scope: Scope, period: Period): Promise<ReportData | { error: string }> {
  const { fromIso, toIso } = periodIso(period);
  const envField = process.env.JIRA_CONVERTED_HOURS_FIELD;

  if (scope.kind === 'toi') {
    // Dữ liệu của chính mình: đọc thẳng bảng (RLS chỉ chủ), không cần tính năng chia sẻ.
    const [{ data: acc }, { data: prof }, { data: issues }, { data: wl }] = await Promise.all([
      supabase.from('jira_accounts').select('*').maybeSingle<JiraAccount>(),
      supabase.from('profiles').select('full_name, email, unit, position').eq('id', userId).maybeSingle(),
      supabase.from('jira_issues').select('*').limit(5000).returns<(JiraIssueRow & { user_id: string })[]>(),
      supabase.from('jira_worklogs').select('user_id, worklog_id, issue_key, started_at, seconds, comment').gte('started_at', fromIso).lt('started_at', toIso).limit(50000).returns<TeamWorklog[]>(),
    ]);
    if (!acc?.last_synced_at) return { error: 'Bạn chưa có dữ liệu Jira. Kết nối Jira trước khi xuất báo cáo.' };
    return {
      people: [{
        user_id: userId, full_name: prof?.full_name ?? '', email: prof?.email ?? '', unit: prof?.unit ?? null, position: prof?.position ?? null,
        is_me: true, share_scope: 'none', last_synced_at: acc.last_synced_at, jira_display_name: acc.jira_display_name,
        custom_field_names: acc.custom_field_names, groups: [], field: pickConvertedField(acc.custom_field_names, envField),
      }],
      issues: (issues ?? []).map((i) => normalizeIssue(i)),
      worklogs: wl ?? [],
      scopeLabel: 'Cá nhân',
    };
  }

  const all = await loadSharePeople(supabase);
  if (!all) return { error: 'Tính năng báo cáo người liên quan chưa được bật trên cơ sở dữ liệu.' };
  let people = all;
  let scopeLabel = 'Tất cả người liên quan';
  if (scope.kind === 'nhom') {
    people = all.filter((p) => p.groups.some((g) => g.id === scope.id));
    scopeLabel = all.flatMap((p) => p.groups).find((g) => g.id === scope.id)?.name ?? 'Nhóm';
  } else if (scope.kind === 'chon') {
    people = all.filter((p) => scope.ids.includes(p.user_id));
    scopeLabel = `${people.length} người được chọn`;
  }
  if (!people.length) return { error: 'Không có ai trong phạm vi này chia sẻ dữ liệu Jira với bạn.' };
  const ids = people.map((p) => p.user_id);
  const [{ data: issues, error: e1 }, { data: wl, error: e2 }] = await Promise.all([
    supabase.rpc('jira_related_issues', { p_users: ids }),
    supabase.rpc('jira_related_worklogs', { p_users: ids, p_from: fromIso, p_to: toIso }),
  ]);
  if (e1 || e2) return { error: 'Không đọc được dữ liệu Jira của người liên quan.' };
  return {
    people: people.map((p) => ({ ...p, field: pickConvertedField(p.custom_field_names ?? [], envField) })),
    issues: ((issues ?? []) as TeamIssue[]).map((i) => normalizeIssue(i)),
    worklogs: (wl ?? []) as TeamWorklog[],
    scopeLabel,
  };
}
