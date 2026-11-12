import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { requireSession } from '@/lib/session';
import { serverEnv } from '@/lib/env';
import { fmtDate } from '@/lib/format';
import { loadPeople } from '@/lib/people';
import { loadColleagues, loadPersonal } from '@/lib/personal-data';
import { CHECKIN_LABEL, KIND_LABEL, PLACE_LABEL, ROLE_LABEL, STATUS_LABEL, type PersonalItem } from '@/lib/attendance';
import { isMine } from '@/lib/jira/report';
import { CalendarView } from '@/components/calendar/CalendarView';
import { VIEW_LABEL, type CalItem, type CalSource, type CalView } from '@/components/calendar/types';
import { addDay, dayStart, hhmm, vnDayOf } from '@/components/calendar/time';
import { rangeOf } from '@/components/calendar/range';
import { LichTabs } from '../tabs';
import { PersonalItemForm } from './PersonalForms';
import { deletePersonalItem, respondPersonalItem } from './actions';

export const metadata: Metadata = { title: 'Lịch cá nhân' };

const VIEWS = Object.keys(VIEW_LABEL) as CalView[];

const SOURCES: CalSource[] = [
  { key: 'giang_day', label: 'Lịch dạy / giảng', color: '#8e24aa' },
  { key: 'su_kien', label: 'Sự kiện', color: '#f4511e' },
  { key: 'cong_viec', label: 'Việc của tôi', color: '#039be5' },
  { key: 'duoc_giao', label: 'Việc được phân công', color: '#e67c73' },
  { key: 'diem_danh', label: 'Điểm danh', color: '#33b679' },
  { key: 'nghi_phep', label: 'Nghỉ phép (Jira)', color: '#616161' },
  { key: 'ngoai_gio', label: 'Làm ngoài giờ (Jira)', color: '#f6bf26' },
  { key: 'han_jira', label: 'Hạn việc Jira', color: '#0b8043' },
];

export default async function PersonalCalendarPage({ searchParams }: { searchParams: Promise<{ xem?: string; ngay?: string }> }) {
  const sp = await searchParams;
  const today = vnDayOf(new Date().toISOString());
  const saved = (await cookies()).get('lich_xem')?.value;
  const view: CalView = VIEWS.includes(sp.xem as CalView) ? (sp.xem as CalView) : VIEWS.includes(saved as CalView) ? (saved as CalView) : 'tuan';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.ngay ?? '') ? sp.ngay! : today;
  const { from, to, title } = rangeOf(view, anchor);
  const fromIso = new Date(dayStart(from)).toISOString();
  const toIso = new Date(dayStart(to)).toISOString();

  const { supabase, userId } = await requireSession();
  const [data, colleagues, { data: incoming }, { data: given }] = await Promise.all([
    loadPersonal(supabase, userId, fromIso, toIso),
    loadColleagues(supabase, userId),
    // Việc được giao cho tôi chưa xong (mọi thời điểm), để nhận / từ chối / báo xong.
    supabase.from('personal_items').select('*').eq('owner_id', userId).not('assigned_by', 'is', null).in('status', ['pending', 'accepted'])
      .gte('ends_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at').limit(100).returns<PersonalItem[]>(),
    // Việc tôi giao cho người khác.
    supabase.from('personal_items').select('*').eq('assigned_by', userId).gte('ends_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('starts_at').limit(100).returns<PersonalItem[]>(),
  ]);
  const { name } = await loadPeople(supabase, [...(incoming ?? []).map((i) => i.assigned_by), ...(given ?? []).map((i) => i.owner_id)]);
  const jiraUrl = serverEnv.jiraBaseUrl();
  const browse = (key: string) => (jiraUrl ? [{ href: `${jiraUrl}/browse/${encodeURIComponent(key)}`, label: `Mở ${key} trên Jira`, external: true }] : []);
  const dayIso = (d: string) => new Date(dayStart(d)).toISOString();

  const items: CalItem[] = [
    ...data.items
      .filter((i) => i.status !== 'declined')
      .map((i): CalItem => ({
        key: `p-${i.id}`,
        source: i.assigned_by ? 'duoc_giao' : i.kind === 'khac' ? 'cong_viec' : i.kind,
        title: `${i.status === 'pending' ? '[Chờ nhận] ' : i.status === 'done' ? '✓ ' : ''}${i.title}`,
        starts_at: i.starts_at, ends_at: i.ends_at, all_day: i.all_day,
        sub: [
          KIND_LABEL[i.kind], i.role && ROLE_LABEL[i.role], i.place && PLACE_LABEL[i.place],
          i.assigned_by && `Giao bởi ${data.assignerName(i.assigned_by)} · ${STATUS_LABEL[i.status]}`,
        ].filter(Boolean).join(' · '),
        location: i.location, description: i.description,
        links: i.assigned_by && i.status === 'pending' ? [{ href: '#duoc-giao', label: 'Nhận hoặc từ chối việc này' }] : [],
        deleteId: i.assigned_by ? undefined : i.id,
      })),
    ...data.checkins.map((c): CalItem => ({
      key: `c-${c.day}`, source: 'diem_danh', title: `Điểm danh: ${CHECKIN_LABEL[c.place]}`,
      starts_at: dayIso(c.day), ends_at: dayIso(addDay(c.day, 1)), all_day: true,
      sub: `Lúc ${hhmm(c.checked_at)}`, description: c.note,
      links: [{ href: `/lich/cham-cong?thang=${c.day.slice(0, 7)}`, label: 'Xem bảng chấm công' }],
    })),
    ...data.requests
      .filter((r) => r.state !== 'rejected' && r.to >= from && r.from < to)
      .map((r): CalItem => ({
        key: `r-${r.key}`, source: r.kind === 'leave' ? 'nghi_phep' : 'ngoai_gio',
        title: `${r.kind === 'leave' ? 'Nghỉ' : 'Ngoài giờ'}: ${r.title}${r.state === 'pending' ? ' (chờ duyệt)' : ''}`,
        starts_at: dayIso(r.from), ends_at: dayIso(addDay(r.to, 1)), all_day: true,
        sub: [r.key, r.leaveType, r.fraction < 1 ? 'nửa ngày' : null, r.hours ? `${r.hours} giờ` : null, r.status].filter(Boolean).join(' · '),
        links: [...browse(r.key), { href: `/lich/cham-cong?thang=${r.from.slice(0, 7)}`, label: 'Xem bảng chấm công' }],
      })),
    ...data.issues
      .filter((i) => isMine(i) && i.status_category !== 'done' && i.due_date && i.due_date >= from && i.due_date < to)
      .map((i): CalItem => ({
        key: `j-${i.issue_key}`, source: 'han_jira', title: `Hạn: ${i.summary}`,
        starts_at: dayIso(i.due_date!), ends_at: dayIso(addDay(i.due_date!, 1)), all_day: true,
        sub: [i.issue_key, i.status, i.project_name].filter(Boolean).join(' · '),
        links: [...browse(i.issue_key), { href: '/jira', label: 'Jira của tôi' }],
      })),
  ];

  const pending = (incoming ?? []).filter((i) => i.status === 'pending');
  const todayCheckin = data.checkins.find((c) => c.day === today);

  return (
    <>
      <LichTabs current="ca-nhan" pendingAssigned={pending.length} />
      <CalendarView
        view={view}
        anchor={anchor}
        today={today}
        title={title}
        items={items}
        sources={SOURCES}
        basePath="/lich/ca-nhan"
        createTitle="Thêm lịch cá nhân hoặc giao việc"
        deleteAction={deletePersonalItem}
        createForm={<PersonalItemForm people={colleagues} defaultDay={anchor < today ? today : anchor} />}
        sideExtra={
          <div className="space-y-2 text-sm">
            <Link href="/lich/cham-cong" className="block font-medium text-brand-600 hover:underline dark:text-brand-300">
              {todayCheckin ? `Hôm nay: ${CHECKIN_LABEL[todayCheckin.place]}` : 'Điểm danh hôm nay'}
            </Link>
            {pending.length > 0 && <a href="#duoc-giao" className="block text-orange-700 hover:underline dark:text-orange-300">{pending.length} việc được giao chờ bạn nhận</a>}
            {!data.account?.last_synced_at && <Link href="/jira#ket-noi" className="block text-brand-600 hover:underline dark:text-brand-300">Kết nối Jira để hiện nghỉ phép, ngoài giờ</Link>}
          </div>
        }
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <details id="duoc-giao" open={pending.length > 0 || (incoming ?? []).length <= 5} className="group card scroll-mt-20">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <Chevron />
            <h2 className="font-semibold">Việc được phân công cho tôi</h2>
            <span className="text-sm muted">{(incoming ?? []).length}</span>
            {pending.length > 0 && <span className="chip !bg-gold-100 !text-gold-600 dark:!bg-gold-600/20 dark:!text-gold-500">{pending.length} chờ nhận</span>}
          </summary>
          <p className="mb-3 mt-1 text-sm muted">Đồng nghiệp cùng nhóm, đơn vị giao cho bạn. Bấm Nhận để xác nhận; việc hiện trên lịch và bảng chấm công.</p>
          {(incoming ?? []).length === 0 ? <p className="text-sm muted">Chưa có việc nào.</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(incoming ?? []).map((i) => (
                <li key={i.id} className="py-3">
                  <AssignedRow item={i} who={`Giao bởi ${name(i.assigned_by)}`} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i.status === 'pending' && (
                      <form action={respondPersonalItem} className="flex flex-wrap gap-2">
                        <input type="hidden" name="id" value={i.id} />
                        <input name="note" maxLength={1000} placeholder="Trả lời (không bắt buộc)" className="input !w-56 !py-1.5" />
                        <button name="status" value="accepted" className="btn !py-1.5">Nhận</button>
                        <button name="status" value="declined" className="btn-secondary !py-1.5">Từ chối</button>
                      </form>
                    )}
                    {i.status === 'accepted' && (
                      <form action={respondPersonalItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <button name="status" value="done" className="btn-secondary !py-1.5">Báo đã xong</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>

        <details open={(given ?? []).length > 0 && (given ?? []).length <= 5} className="group card">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <Chevron />
            <h2 className="font-semibold">Việc tôi đã giao</h2>
            <span className="text-sm muted">{(given ?? []).length}</span>
            {(given ?? []).some((i) => i.status === 'declined') && <span className="chip !bg-orange-100 !text-orange-700 dark:!bg-orange-950 dark:!text-orange-300">có việc bị từ chối</span>}
          </summary>
          <p className="mb-3 mt-1 text-sm muted">Bấm Tạo, chọn tên đồng nghiệp ở ô &quot;Lịch của&quot; để giao việc A, B, C cho họ.</p>
          {(given ?? []).length === 0 ? <p className="text-sm muted">Bạn chưa giao việc nào.</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {(given ?? []).map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                  <AssignedRow item={i} who={`Giao cho ${name(i.owner_id)}`} />
                  <form action={deletePersonalItem}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs text-orange-700 hover:underline dark:text-orange-300">Thu hồi</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </details>
      </div>
    </>
  );
}

function Chevron() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function AssignedRow({ item: i, who }: { item: PersonalItem; who: string }) {
  const d1 = vnDayOf(i.starts_at);
  const when = i.all_day ? fmtDate(d1) : `${hhmm(i.starts_at)}–${hhmm(i.ends_at)} ${fmtDate(d1)}`;
  const tone = i.status === 'pending' ? 'bg-gold-100 text-gold-600 dark:bg-gold-600/20 dark:text-gold-500'
    : i.status === 'declined' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
    : i.status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : '';
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/lich/ca-nhan?xem=ngay&ngay=${d1}`} className="font-medium hover:underline">{i.title}</Link>
        <span className={`chip ${tone}`}>{STATUS_LABEL[i.status]}</span>
      </div>
      <div className="mt-0.5 text-sm muted">
        {[when, KIND_LABEL[i.kind], i.place && PLACE_LABEL[i.place], i.location, who].filter(Boolean).join(' · ')}
      </div>
      {i.response_note && <div className="mt-1 text-sm">Trả lời: {i.response_note}</div>}
      {i.description && <div className="mt-1 whitespace-pre-line text-sm muted">{i.description}</div>}
    </div>
  );
}
