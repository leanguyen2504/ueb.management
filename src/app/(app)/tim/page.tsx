import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { KIND_LABEL, TASK_STATUS_LABEL, type Group, type Task } from '@/lib/types';

export const metadata: Metadata = { title: 'Tìm kiếm' };

// Tìm theo từ khóa trên mọi dữ liệu người dùng được xem (RLS lọc theo quyền):
// cuộc họp trên lịch Google, mã Jira, tài liệu họp, nhóm, việc, lịch nhóm và người.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; loai?: string }> }) {
  const sp = await searchParams;
  const raw = (sp.q ?? '').trim().slice(0, 100);
  // Bỏ ký tự có nghĩa đặc biệt trong bộ lọc của PostgREST (, ( ) % * \) để từ khóa không phá câu lọc.
  const q = raw.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const { supabase } = await requireSession();

  if (q.length < 2) {
    return (
      <>
        <PageHead title="Tìm kiếm" sub="Gõ ít nhất 2 ký tự: tên cuộc họp, mã Jira, tên tài liệu, nhóm, việc hoặc tên người." />
        <SearchBox q={raw} />
      </>
    );
  }

  const like = `%${q}%`;
  const or = (...cols: string[]) => cols.map((c) => `${c}.ilike.${like}`).join(',');
  const [meetings, records, items, groups, tasks, events, people, sources] = await Promise.all([
    supabase.from('calendar_events').select('source_id, google_event_id, title, starts_at, location').or(or('title', 'description', 'location')).order('starts_at', { ascending: false }).limit(25),
    supabase.from('meeting_records').select('source_id, event_key, meeting_title, meeting_starts_at, jira_key').or(or('jira_key', 'meeting_title', 'follow_up')).order('meeting_starts_at', { ascending: false }).limit(25),
    supabase.from('meeting_items').select('id, source_id, event_key, meeting_title, meeting_starts_at, party, title, url, kind').or(or('title', 'party', 'note', 'meeting_title')).order('meeting_starts_at', { ascending: false }).limit(25),
    supabase.from('groups').select('id, name, description, kind, archived_at').or(or('name', 'description')).order('name').limit(20).returns<Pick<Group, 'id' | 'name' | 'description' | 'kind' | 'archived_at'>[]>(),
    supabase.from('tasks').select('id, group_id, title, status, due_date').or(or('title', 'description')).order('due_date', { ascending: true, nullsFirst: false }).limit(25).returns<Pick<Task, 'id' | 'group_id' | 'title' | 'status' | 'due_date'>[]>(),
    supabase.from('events').select('id, group_id, title, starts_at, location').or(or('title', 'description', 'location')).order('starts_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('id, full_name, email, position').eq('is_active', true).or(or('full_name', 'email', 'position')).order('full_name').limit(20),
    supabase.from('calendar_sources').select('id, label'),
  ]);
  const srcLabel = new Map((sources.data ?? []).map((s) => [s.id as string, s.label as string]));
  const groupIds = [...new Set([...(tasks.data ?? []).map((t) => t.group_id), ...(events.data ?? []).map((e) => e.group_id as string)])];
  const { data: groupNames } = groupIds.length ? await supabase.from('groups').select('id, name').in('id', groupIds) : { data: [] as { id: string; name: string }[] };
  const gName = new Map((groupNames ?? []).map((g) => [g.id, g.name]));

  // Gộp cuộc họp tìm thấy theo tên/mô tả, mã Jira và tài liệu thành một danh sách, mỗi buổi một dòng.
  type Hit = { key: string; title: string; starts: string; sub: string; jira?: string; docs: string[]; href: string };
  const hits = new Map<string, Hit>();
  const hit = (source: string, eventKey: string, title: string, starts: string) => {
    const k = `${source}|${eventKey}`;
    if (!hits.has(k)) hits.set(k, { key: k, title, starts, sub: srcLabel.get(source) ?? '', docs: [], href: `/hop?ngay=${vnDay(starts)}#${meetingAnchor(source, eventKey)}` });
    return hits.get(k)!;
  };
  for (const e of meetings.data ?? []) { const h = hit(e.source_id, e.google_event_id, e.title, e.starts_at); if (e.location) h.sub = [e.location, h.sub].filter(Boolean).join(' · '); }
  for (const r of records.data ?? []) { const h = hit(r.source_id, r.event_key, r.meeting_title, r.meeting_starts_at); if (r.jira_key) h.jira = r.jira_key; }
  for (const it of items.data ?? []) {
    const h = hit(it.source_id, it.event_key, it.meeting_title, it.meeting_starts_at);
    h.docs.push([it.party, it.title].filter(Boolean).join(': ') || (it.kind === 'minutes' ? 'Biên bản' : 'Tài liệu'));
  }
  const meetingList = [...hits.values()].sort((a, b) => b.starts.localeCompare(a.starts));
  const total = meetingList.length + (groups.data?.length ?? 0) + (tasks.data?.length ?? 0) + (events.data?.length ?? 0) + (people.data?.length ?? 0);

  // Bộ lọc theo nhóm kết quả. "Tất cả" hiện 5 kết quả đầu mỗi nhóm, kèm link xem hết nhóm đó.
  const FILTERS = [
    { key: 'hop', label: 'Cuộc họp và tài liệu', n: meetingList.length },
    { key: 'viec', label: 'Việc', n: tasks.data?.length ?? 0 },
    { key: 'nhom', label: 'Dự án và nhóm', n: groups.data?.length ?? 0 },
    { key: 'lich', label: 'Lịch nhóm', n: events.data?.length ?? 0 },
    { key: 'nguoi', label: 'Người', n: people.data?.length ?? 0 },
  ];
  const loai = FILTERS.some((f) => f.key === sp.loai) ? sp.loai! : '';
  const filterHref = (k: string) => `/tim?${new URLSearchParams({ q: raw, ...(k ? { loai: k } : {}) })}`;
  const PREVIEW = 5;
  const pick = <T,>(key: string, list: T[]) => (loai === key ? list : loai ? [] : list.slice(0, PREVIEW));
  const Section = ({ id, title, n, children }: { id: string; title: string; n: number; children: React.ReactNode }) =>
    n && (!loai || loai === id) ? (
      <section className={`card ${loai ? 'lg:col-span-2' : ''}`}>
        <h2 className="mb-2 text-lg font-semibold">{title} <span className="chip ml-1 align-middle">{n}</span></h2>
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">{children}</ul>
        {!loai && n > PREVIEW && <Link href={filterHref(id)} className="link mt-2 inline-block text-sm">Xem tất cả {n} kết quả</Link>}
      </section>
    ) : null;
  const Row = ({ href, title, sub, right }: { href: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) => (
    <li>
      <Link href={href} className="group flex items-center gap-3 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block font-medium group-hover:text-brand-600 dark:group-hover:text-brand-300">{title}</span>
          {sub && <span className="block text-xs muted">{sub}</span>}
        </span>
        {right}
      </Link>
    </li>
  );

  return (
    <>
      <PageHead title="Tìm kiếm" sub={total ? `${total} kết quả cho “${q}”` : `Không tìm thấy kết quả cho “${q}”. Thử từ khóa ngắn hơn hoặc có dấu tiếng Việt đầy đủ.`} />
      <SearchBox q={raw} loai={loai} />
      {total > 0 && (
        <nav className="seg mt-4" aria-label="Lọc kết quả">
          <Link href={filterHref('')} aria-current={!loai ? 'true' : undefined}>Tất cả <span className="tabular-nums opacity-70">{total}</span></Link>
          {FILTERS.filter((f) => f.n).map((f) => (
            <Link key={f.key} href={filterHref(f.key)} aria-current={loai === f.key ? 'true' : undefined}>{f.label} <span className="tabular-nums opacity-70">{f.n}</span></Link>
          ))}
        </nav>
      )}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Section id="hop" title="Cuộc họp và tài liệu" n={meetingList.length}>
          {pick('hop', meetingList).map((m) => (
            <Row key={m.key} href={m.href}
              title={<>{m.jira && <span className="mr-2 rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-100">{m.jira}</span>}{m.title}</>}
              sub={<>{fmtDateTime(m.starts)}{m.sub ? ` · ${m.sub}` : ''}{m.docs.length ? <><br />Tài liệu: {m.docs.slice(0, 3).join('; ')}{m.docs.length > 3 ? ` và ${m.docs.length - 3} mục khác` : ''}</> : null}</>} />
          ))}
        </Section>
        <Section id="viec" title="Việc" n={tasks.data?.length ?? 0}>
          {pick('viec', tasks.data ?? []).map((t) => (
            <Row key={t.id} href={`/nhom/${t.group_id}?tab=viec`} title={t.title}
              sub={`${gName.get(t.group_id) ?? 'Nhóm'}${t.due_date ? ` · hạn ${fmtDate(t.due_date)}` : ''}`}
              right={<span className="chip">{TASK_STATUS_LABEL[t.status]}</span>} />
          ))}
        </Section>
        <Section id="nhom" title="Dự án và nhóm" n={groups.data?.length ?? 0}>
          {pick('nhom', groups.data ?? []).map((g) => (
            <Row key={g.id} href={`/nhom/${g.id}`} title={g.name} sub={g.description ?? undefined}
              right={<span className="chip">{g.archived_at ? 'Đã lưu trữ' : KIND_LABEL[g.kind]}</span>} />
          ))}
        </Section>
        <Section id="lich" title="Lịch nhóm" n={events.data?.length ?? 0}>
          {pick('lich', events.data ?? []).map((e) => (
            <Row key={e.id} href={`/lich?xem=ngay&ngay=${vnDay(e.starts_at)}`} title={e.title}
              sub={`${fmtDateTime(e.starts_at)} · ${gName.get(e.group_id) ?? 'Nhóm'}${e.location ? ` · ${e.location}` : ''}`} />
          ))}
        </Section>
        <Section id="nguoi" title="Người" n={people.data?.length ?? 0}>
          {pick('nguoi', people.data ?? []).map((p) => (
            <Row key={p.id} href={`/nguoi/${p.id}`} title={p.full_name || p.email} sub={[p.position, p.email].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      </div>
    </>
  );
}

function SearchBox({ q, loai }: { q: string; loai?: string }) {
  return (
    <form action="/tim" method="get" role="search" className="flex max-w-2xl gap-2">
      <label htmlFor="tim-q" className="sr-only">Từ khóa</label>
      {loai && <input type="hidden" name="loai" value={loai} />}
      <input id="tim-q" name="q" defaultValue={q} autoFocus={!q} placeholder="Tên cuộc họp, mã Jira, tài liệu, nhóm, việc, người…" className="input" />
      <button className="btn">Tìm</button>
    </form>
  );
}
