import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { addDays, dayStartIso, fmtDate, fmtDateTime, fmtTime, vnDay, weekdayShort } from '@/lib/format';
import { isGoogleCalendarEnabled } from '@/lib/google-calendar';
import { areaOfItem, areasOf, isMyMeeting, loadAreas, loadMeetings, meetingProgress, type Meeting, type MeetingItem, type WorkArea } from '@/lib/meetings';
import { DOC_TYPES, STATUS_LABEL, autoStatus, deadlines, jiraKeyIn, jiraUrl, type Deadline } from '@/lib/meeting-rules';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { loadPeople } from '@/lib/people';
import { serverEnv } from '@/lib/env';
import { AddItemForm, EditItemForm, RecordForm, type PersonOption } from './MeetingForms';
import { deleteMeetingItem } from './actions';

export const metadata: Metadata = { title: 'Hồ sơ cuộc họp' };

type SP = { ngay?: string; xem?: string; loc?: string; thieu?: string };

const weekMonday = (day: string) => {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
};

function href(sp: SP, patch: Partial<SP>) {
  const q = new URLSearchParams();
  const next = { ...sp, ...patch };
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/hop?${s}` : '/hop';
}

function Toggle({ on, to, children }: { on: boolean; to: string; children: React.ReactNode }) {
  return (
    <Link href={to} aria-current={on ? 'true' : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm ${on ? 'bg-brand-600 font-medium text-white' : 'border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
      {children}
    </Link>
  );
}

// Dữ liệu dùng chung cho các thẻ buổi họp.
type View = {
  canFile: boolean;
  userId: string;
  name: (id: string | null) => string;
  people: PersonOption[];
  areas: WorkArea[];
  // Tên hiển thị của một email đầu mối (người đã đăng nhập thì hiện tên).
  emailName: (email: string) => string;
  jiraBase: string | null;
};

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, userId, ctx, profile } = await requireSession();
  const today = vnDay();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? '') ? sp.ngay! : today;
  const week = sp.xem === 'tuan';
  const from = week ? weekMonday(day) : day;
  const to = addDays(from, week ? 7 : 1);
  const mineOnly = sp.loc === 'cua-toi';
  const missingOnly = Boolean(sp.thieu);

  if (!isGoogleCalendarEnabled()) {
    return (
      <>
        <PageHead title="Hồ sơ cuộc họp" />
        <p className="card text-sm muted">Chưa bật module lịch Google dùng chung nên chưa có buổi họp. Quản trị bật tại Cấu hình lịch Google.</p>
      </>
    );
  }

  const [meetings, { data: myMemberships }, { data: groups }, { data: clerkRows }, { data: people }, areas] = await Promise.all([
    loadMeetings(supabase, userId, dayStartIso(from), dayStartIso(to)),
    supabase.from('group_members').select('group_id').eq('user_id', userId),
    supabase.from('groups').select('id, name').is('archived_at', null).order('name'),
    supabase.from('group_members').select('group_id').eq('user_id', userId).eq('is_clerk', true).limit(1),
    supabase.from('profiles').select('id, full_name, email').eq('is_active', true).order('full_name').limit(1000),
    loadAreas(supabase),
  ]);
  // Chỉ để ẩn/hiện nút; cơ sở dữ liệu kiểm tra lại bằng RLS.
  const canFile = ctx.is_admin || ctx.role === 'principal' || ctx.role === 'secretary' || (clerkRows ?? []).length > 0;
  const mine = new Set((myMemberships ?? []).map((m) => m.group_id));
  const myGroups = (groups ?? []).filter((g) => mine.has(g.id));

  let shown = meetings;
  const myAreas = areasOf(areas, profile.email);
  if (mineOnly) shown = shown.filter((m) => isMyMeeting(m, userId, myGroups, myAreas));
  if (missingOnly) shown = shown.filter((m) => meetingProgress(m).missing > 0);

  const { name } = await loadPeople(supabase, meetings.flatMap((m) => m.items.map((i) => i.assignee_id)));
  const personOptions: PersonOption[] = (people ?? []).filter((p) => p.id !== userId).map((p) => ({ id: p.id, label: p.full_name || p.email }));
  const partyNames = [...new Set([...areas.map((a) => a.name), ...(groups ?? []).map((g) => g.name as string), ...meetings.flatMap((m) => m.items.map((i) => i.party ?? ''))].filter(Boolean))];
  const byEmail = new Map((people ?? []).map((p) => [String(p.email).toLowerCase(), p.full_name || p.email]));
  const view: View = {
    canFile, userId, name, people: personOptions, areas,
    emailName: (e) => byEmail.get(e) ?? e,
    jiraBase: serverEnv.jiraBaseUrl(),
  };

  const days = new Map<string, Meeting[]>();
  for (const m of shown) {
    const d = vnDay(m.starts_at);
    days.set(d, [...(days.get(d) ?? []), m]);
  }
  const step = week ? 7 : 1;
  const rangeLabel = week ? `Tuần ${fmtDate(from)} – ${fmtDate(addDays(from, 6))}` : `${weekdayShort(day)}, ${fmtDate(day)}${day === today ? ' (hôm nay)' : ''}`;
  const missingTotal = meetings.reduce((n, m) => n + meetingProgress(m).missing, 0);

  return (
    <>
      <PageHead
        title="Hồ sơ cuộc họp"
        sub={<>Tài liệu trước họp (muộn nhất 24 giờ trước họp) và biên bản sau họp (muộn nhất 24 giờ sau họp), gắn bằng link Google Drive. {missingTotal > 0 && <span className="font-medium text-amber-700 dark:text-amber-300">{missingTotal} mục đang chờ gửi.</span>}</>}
        actions={<><Link href={`/hop/tong-hop?ngay=${from}`} className="btn-secondary">Bảng tổng hợp</Link>{ctx.is_admin || ctx.role === 'principal' || ctx.role === 'secretary' ? <Link href="/quan-tri/mang-cong-tac" className="btn-secondary">Mảng và đầu mối</Link> : null}</>}
      />
      <datalist id="ds-ben">{partyNames.map((p) => <option key={p} value={p} />)}</datalist>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(sp, { ngay: addDays(day, -step) })} className="btn-secondary" aria-label="Trước">‹</Link>
        <Link href={href(sp, { ngay: undefined })} className="btn-secondary">Hôm nay</Link>
        <Link href={href(sp, { ngay: addDays(day, step) })} className="btn-secondary" aria-label="Sau">›</Link>
        <span className="mx-1 font-semibold">{rangeLabel}</span>
        <span className="flex-1" />
        <Toggle on={!week} to={href(sp, { xem: undefined })}>Ngày</Toggle>
        <Toggle on={week} to={href(sp, { xem: 'tuan' })}>Tuần</Toggle>
        <span className="w-2" />
        <Toggle on={!mineOnly} to={href(sp, { loc: undefined })}>Tất cả</Toggle>
        <Toggle on={mineOnly} to={href(sp, { loc: 'cua-toi' })}>Của tôi</Toggle>
        <Toggle on={missingOnly} to={href(sp, { thieu: missingOnly ? undefined : '1' })}>Còn thiếu</Toggle>
      </div>
      {mineOnly && <p className="mb-3 text-xs muted">"Của tôi": buổi họp có bên thuộc mảng tôi là đầu mối{myAreas.length ? ` (${myAreas.map((a) => a.name).join(', ')})` : ''}, tôi được giao đôn đốc, hoặc có nhóm tôi tham gia.</p>}

      {shown.length === 0 ? (
        <p className="card text-sm muted">{meetings.length ? 'Không có buổi họp nào khớp bộ lọc.' : 'Không có buổi họp nào trong khoảng này.'}</p>
      ) : (
        <div className="space-y-6">
          {[...days.entries()].map(([d, list]) => (
            <section key={d}>
              {week && <h2 className="mb-2 text-sm font-semibold muted">{weekdayShort(d)}, {fmtDate(d)}{d === today ? ' · hôm nay' : ''}</h2>}
              <div className="space-y-3">
                {list.map((m) => (
                  <MeetingCard key={`${m.source_id}|${m.event_key}`} m={m} v={view} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

const DL_CLASS: Record<Deadline['state'], string> = {
  ok: '',
  soon: 'border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300',
  late: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  done: 'border-green-300 text-green-800 dark:border-green-700 dark:text-green-300',
};

function StatusChips({ m }: { m: Meeting }) {
  const p = meetingProgress(m);
  const dls = deadlines(m.items, m.starts_at, m.ends_at, m.status);
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`chip ${m.status === 'hoan_tat' ? DL_CLASS.done : ''}`}>{STATUS_LABEL[m.status]}{m.record?.status ? '' : ' (tự động)'}</span>
      {p.preTotal > 0 && <span className={`chip ${p.preDone < p.preTotal ? DL_CLASS.soon : DL_CLASS.done}`}>Tài liệu {p.preDone}/{p.preTotal} bên</span>}
      {dls.map((d) => (
        <span key={d.label} className={`chip ${DL_CLASS[d.state]}`} title={`Hạn: ${fmtDateTime(d.due)}`}>
          {d.label}: {d.state === 'done' ? 'đủ' : d.state === 'late' ? `quá hạn (${fmtDateTime(d.due)})` : `hạn ${fmtDateTime(d.due)}`}
        </span>
      ))}
    </div>
  );
}

function Focals({ area, v }: { area: WorkArea | null; v: View }) {
  if (!area || (!area.primary_email && !area.coordinator_emails.length)) return null;
  return (
    <>
      {area.primary_email && <>Đầu mối: {v.emailName(area.primary_email)}</>}
      {area.coordinator_emails.length > 0 && <> · Phối hợp: {area.coordinator_emails.map(v.emailName).join(', ')}</>}
    </>
  );
}

function ItemRow({ it, v }: { it: MeetingItem; v: View }) {
  const area = areaOfItem(v.areas, it);
  const meta = [
    it.doc_type ? DOC_TYPES[it.doc_type] : null,
    it.assignee_id ? `Đôn đốc: ${it.assignee_id === v.userId ? 'tôi' : v.name(it.assignee_id)}` : null,
    it.url && it.updated_by ? `Cập nhật: ${it.updated_by === v.userId ? 'tôi' : v.name(it.updated_by)}, ${fmtDateTime(it.updated_at)}` : null,
    it.note,
  ].filter(Boolean);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {(it.party || area) && <span className="font-medium">{it.party || area?.name}</span>}
            {it.url ? (
              <a href={it.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">
                {it.title || (it.doc_type ? DOC_TYPES[it.doc_type] : 'Mở tài liệu')} ↗
              </a>
            ) : (
              <span className="chip border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300">Chờ gửi</span>
            )}
          </div>
          <div className="text-xs muted">
            {meta.join(' · ')}
            {area && (area.primary_email || area.coordinator_emails.length > 0) && <div><Focals area={area} v={v} /></div>}
          </div>
        </div>
        {v.canFile && (
          <div className="flex items-center gap-2">
            <details className="relative">
              <summary className="cursor-pointer text-sm text-brand-600 dark:text-brand-300">{it.url ? 'Sửa' : 'Dán link'}</summary>
              <div className="mt-2 w-[min(36rem,85vw)] rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <EditItemForm item={it} people={v.people} partiesListId="ds-ben" />
              </div>
            </details>
            <form action={deleteMeetingItem}>
              <input type="hidden" name="id" value={it.id} />
              <button type="submit" className="text-sm text-red-600 hover:underline dark:text-red-400">Gỡ</button>
            </form>
          </div>
        )}
      </div>
    </li>
  );
}

function MeetingCard({ m, v }: { m: Meeting; v: View }) {
  const anchor = meetingAnchor(m.source_id, m.event_key);
  const pre = m.items.filter((i) => i.kind === 'pre');
  const minutes = m.items.filter((i) => i.kind === 'minutes');
  const time = m.all_day ? 'Cả ngày' : m.gone ? fmtTime(m.starts_at) : `${fmtTime(m.starts_at)}–${fmtTime(m.ends_at)}`;
  const row = (it: MeetingItem) => <ItemRow key={it.id} it={it} v={v} />;
  const jUrl = m.jira_key ? jiraUrl(v.jiraBase, m.jira_key) : null;
  const ref = { source_id: m.source_id, event_key: m.event_key, title: m.title, starts_at: m.starts_at };
  return (
    <article id={anchor} className="card scroll-mt-20">
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-24 shrink-0 text-sm font-semibold">{time}</div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">
            {m.jira_key && (jUrl
              ? <a href={jUrl} target="_blank" rel="noopener noreferrer" className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-brand-700 hover:underline dark:bg-slate-800 dark:text-brand-300">{m.jira_key}</a>
              : <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">{m.jira_key}</span>)}
            {m.title}
          </h3>
          <div className="text-xs muted">
            {[m.location, m.source_label].filter(Boolean).join(' · ')}
            {m.gone && 'Buổi họp không còn trên lịch Google (đã xóa hoặc dời ngày); hồ sơ vẫn được giữ.'}
          </div>
          <div className="mt-1.5"><StatusChips m={m} /></div>
          {m.record?.follow_up && <p className="mt-1.5 text-sm"><span className="font-medium">Cần theo dõi:</span> {m.record.follow_up}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {m.record?.drive_folder_url && <a href={m.record.drive_folder_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Thư mục Drive</a>}
          {m.meet_url && <a href={m.meet_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">Họp trực tuyến</a>}
          {m.html_link && <a href={m.html_link} target="_blank" rel="noopener noreferrer" className="btn-secondary">Google Calendar</a>}
        </div>
      </div>

      {m.description && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer muted">Thành phần, chi tiết</summary>
          <p className="mt-1 whitespace-pre-line">{m.description}</p>
        </details>
      )}

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <section>
          <h4 className="text-sm font-semibold">A. Tài liệu trước họp</h4>
          {m.attachments.length > 0 && (
            <ul className="mt-1 space-y-1 text-sm">
              {m.attachments.map((a) => (
                <li key={a.url}>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">{a.title} ↗</a>
                  <span className="text-xs muted"> · đính kèm trên lịch</span>
                </li>
              ))}
            </ul>
          )}
          {pre.length ? <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{pre.map(row)}</ul>
            : !m.attachments.length && <p className="mt-1 text-sm muted">Chưa có tài liệu.</p>}
        </section>
        <section>
          <h4 className="text-sm font-semibold">B. Biên bản và tài liệu sau họp</h4>
          {minutes.length ? <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">{minutes.map(row)}</ul>
            : <p className="mt-1 text-sm muted">Chưa có biên bản.</p>}
        </section>
      </div>

      {v.canFile && (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-600 dark:text-brand-300">+ Thêm bên cần gửi, tài liệu hoặc biên bản</summary>
            <div className="mt-3"><AddItemForm meeting={ref} people={v.people} partiesListId="ds-ben" uid={anchor} /></div>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-600 dark:text-brand-300">Mã Jira, thư mục Drive, tình trạng xử lý</summary>
            <div className="mt-3">
              <RecordForm meeting={ref} values={m.record} autoJira={jiraKeyIn(m.title, m.description)} autoStatusLabel={STATUS_LABEL[autoStatus(m.items, m.ends_at)]} uid={`${anchor}-r`} />
            </div>
          </details>
        </div>
      )}
    </article>
  );
}
