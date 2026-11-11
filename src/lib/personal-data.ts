import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jiraRequests, type Checkin, type PersonalItem } from '@/lib/attendance';
import { pickConvertedField } from '@/lib/jira/report';
import type { JiraAccount, JiraIssueRow } from '@/lib/jira/types';
import { loadPeople } from '@/lib/people';

// Dữ liệu dùng chung cho Lịch cá nhân và Chấm công, trong khoảng [fromIso, toIso).
// RLS: mỗi người chỉ đọc được lịch cá nhân, điểm danh và dữ liệu Jira của chính mình.
export async function loadPersonal(supabase: SupabaseClient, userId: string, fromIso: string, toIso: string, opts: { worklogs?: boolean } = {}) {
  const [{ data: items }, { data: checkins }, { data: acc }, { data: issues }, { data: worklogs }] = await Promise.all([
    supabase.from('personal_items').select('*').eq('owner_id', userId).lt('starts_at', toIso).gte('ends_at', fromIso).order('starts_at').returns<PersonalItem[]>(),
    supabase.from('attendance_checkins').select('day, place, note, checked_at').gte('day', fromIso.slice(0, 10)).lte('day', toIso.slice(0, 10)).returns<Checkin[]>(),
    supabase.from('jira_accounts').select('*').maybeSingle<JiraAccount>(),
    supabase.from('jira_issues').select('*').limit(3000).returns<JiraIssueRow[]>(),
    opts.worklogs
      ? supabase.from('jira_worklogs').select('started_at, seconds, issue_key').gte('started_at', fromIso).lt('started_at', toIso).limit(20000).returns<{ started_at: string; seconds: number; issue_key: string }[]>()
      : Promise.resolve({ data: [] as { started_at: string; seconds: number; issue_key: string }[] }),
  ]);
  const allIssues = issues ?? [];
  const requests = jiraRequests(allIssues, { username: acc?.jira_username ?? null, displayName: acc?.jira_display_name ?? null });
  const { name } = await loadPeople(supabase, (items ?? []).map((i) => i.assigned_by));
  return {
    items: items ?? [],
    checkins: checkins ?? [],
    account: acc ?? null,
    issues: allIssues,
    requests,
    worklogs: worklogs ?? [],
    convertedField: pickConvertedField(acc?.custom_field_names ?? [], process.env.JIRA_CONVERTED_HOURS_FIELD),
    assignerName: name,
  };
}

// Đồng nghiệp cùng nhóm/đơn vị (để phân công việc).
export async function loadColleagues(supabase: SupabaseClient, userId: string) {
  const { data: mine } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
  const gids = (mine ?? []).map((m) => m.group_id);
  if (!gids.length) return [];
  const { data: members } = await supabase.from('group_members').select('user_id, group_id').in('group_id', gids).neq('user_id', userId).limit(2000);
  const ids = [...new Set((members ?? []).map((m) => m.user_id as string))];
  if (!ids.length) return [];
  const { data } = await supabase.from('profiles').select('id, full_name, email, unit, is_active').in('id', ids).eq('is_active', true);
  return (data ?? [])
    .map((p) => ({ id: p.id as string, label: `${p.full_name || p.email}${p.unit ? ` · ${p.unit}` : ''}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}
