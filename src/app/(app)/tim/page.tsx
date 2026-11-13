import type { Metadata } from 'next';
import { groupDirectory } from '@/lib/directory';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { fmtDate, fmtDateTime, vnDay } from '@/lib/format';
import { meetingAnchor } from '@/lib/meeting-anchor';
import { SEARCH_SCOPES } from '@/lib/search-scopes';
import { groupTypeLabel, TASK_STATUS_LABEL, type Group, type Task } from '@/lib/types';

export const metadata: Metadata = { title: 'Tìm kiếm' };

// Tìm theo từ khóa trên mọi dữ liệu người dùng được xem (RLS lọc theo quyền):
// cuộc họp trên lịch Google, mã Jira, tài liệu họp, nhóm, việc, lịch nhóm và người.
const TIMES = [
  { key: '', label: 'Mọi lúc' },
  { key: 'sap-toi', label: 'Sắp tới' },
  { key: '7', label: '7 ngày qua' },
  { key: '30', label: '30 ngày qua' },
  { key: 'nam', label: 'Năm nay' },
] as const;

// Khoảng thời gian [from, to) theo bộ lọc; null = không giới hạn.
function timeRange(tg: string): { from?: string; to?: string } | null {
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();
  if (tg === 'sap-toi') return { from: now.toISOString() };
  if (tg === '7') return { from: ago(7), to: now.toISOString() };
  if (tg === '30') return { from: ago(30), to: now.toISOString() };
  if (tg === 'nam') return { from: `${vnDay(now).slice(0, 4)}-01-01T00:00:00+07:00` };
  return null;
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; loai?: string; tg?: string }> }) {
  const sp = await searchParams;
  const loai = SEARCH_SCOPES.some((f) => f.key === sp.loai) ? sp.loai! : '';
  const tg = TIMES.some((t) => t.key === sp.tg) ? sp.tg! : '';
  const range = timeRange(tg);
  const raw = (sp.q ?? '').trim().slice(0, 100);
  // Bỏ ký tự có nghĩa đặc biệt trong bộ lọc của PostgREST (, ( ) % * \) để từ khóa không phá câu lọc.
  const q = raw.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const { supabase } = await requireSession();

  if (q.length < 2) {
    return (
      <>
        <PageHead title="Tìm kiếm" sub="Gõ ít nhất 2 ký tự: tên cuộc họp, mã Jira, tên tài liệu, nhóm, việc hoặc tên người." />
        <SearchBox q={raw} loai={loai} tg={tg} />
        <ScopeBar q={raw} loai={loai} tg={tg} />
      </>
    );
  }

  const like = `%${q}%`;
  const or = (...cols: string[]) => cols.map((c) => `${c}.ilike.${like}`).join(',');
  // Áp bộ lọc thời gian lên cột ngày giờ của từng bảng (hạn việc là cột ngày, so theo ngày VN).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const within = <T extends { gte: any; lt: any }>(qb: T, col: string, dateOnly = false): T => {
    if (!range) return qb;
    const v = (iso: string) => (dateOnly ? vnDay(iso) : iso);
    let r = qb;
    if (range.from) r = r.gte(col, v(range.from));
    if (range.to) r = r.lt(col, dateOnly ? vnDay(new Date(new Date(range.to).getTime() + 864e5)) : range.to);
    return r;
  };
  const [meetings, records, items, groupsRls, tasks, events, people, sources, dir] = await Promise.all([
    within(supabase.from('calendar_events').select('source_id, google_event_id, title, starts_at, location').or(or('title', 'description', 'location')), 'starts_at').order('starts_at', { ascending: false }).limit(25),
    within(supabase.from('meeting_records').select('source_id, event_key, meeting_title, meeting_starts_at, jira_key').or(or('jira_key', 'meeting_title', 'follow_up')), 'meeting_starts_at').order('meeting_starts_at', { ascending: false }).limit(25),
    within(supabase.from('meeting_items').select('id, source_id, event_key, meeting_title, meeting_starts_at, party, title, url, kind').or(or('title', 'party', 'note', 'meeting_title', 'file_name')), 'meeting_starts_at').order('meeting_starts_at', { ascending: false }).limit(40),
    supabase.from('groups').select('id, name, description, kind, unit_category, archived_at').or(or('name', 'description')).order('name').limit(20).returns<Pick<Group, 'id' | 'name' | 'description' | 'kind' | 'unit_category' | 'archived_at'>[]>(),
    within(supabase.from('tasks').select('id, group_id, title, status, due_date').or(or('title', 'description')), 'due_date', true).order('due_date', { ascending: true, nullsFirst: false }).limit(25).returns<Pick<Task, 'id' | 'group_id' | 'title' | 'status' | 'due_date'>[]>(),
    within(supabase.from('events').select('id, group_id, title, starts_at, location').or(or('title', 'description', 'location')), 'starts_at').order('starts_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('id, full_name, email, position').eq('is_active', true).or(or('full_name', 'email', 'position')).order('full_name').limit(20),
    supabase.from('calendar_sources').select('id, label'),
    // Danh bạ nhóm: cả nhóm chưa tham gia, để xin tham gia.
    groupDirectory(supabase),
  ]);
  const fold = (x: string) => x.normalize('NFC').toLowerCase();
  const seen = new Set((groupsRls.data ?? []).map((g) => g.id));
  const extra = ((dir.data ?? []) as { id: string; name: string; description: string | null; kind: Group['kind']; unit_category: Group['unit_category']; can_view: boolean }[])
    .filter((g) => !seen.has(g.id) && (fold(g.name).includes(fold(q)) || fold(g.description ?? '').includes(fold(q))))
    .map((g) => ({ id: g.id, name: g.name, description: g.description, kind: g.kind, unit_category: g.unit_category, archived_at: null, outside: true }));
  const groups = { data: [...(groupsRls.data ?? []).map((g) => ({ ...g, outside: false })), ...extra].slice(0, 30) };
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
  // Tài liệu: mỗi tài liệu một dòng, mở về đúng buổi họp.
  const docList = (items.data ?? []).map((it) => ({
    id: it.id as string,
    title: [it.party, it.title].filter(Boolean).join(': ') || (it.kind === 'minutes' ? 'Biên bản' : 'Tài liệu'),
    kind: it.kind as string,
    meeting: it.meeting_title as string,
    starts: it.meeting_starts_at as string,
    href: hits.get(`${it.source_id}|${it.event_key}`)?.href ?? '/hop',
  }));
  // Jira: các buổi họp có mã Jira (khớp mã, hoặc khớp tên cuộc họp).
  const jiraList = meetingList.filter((m) => m.jira);
  // Bộ lọc thời gian không áp cho nhóm và người (không có ngày), nên khi lọc thời gian thì ẩn hai mảng này.
  const timeless = !tg;
  const nGroups = timeless ? groups.data?.length ?? 0 : 0;
  const nPeople = timeless ? people.data?.length ?? 0 : 0;
  const counts: Record<string, number> = {
    hop: meetingList.length, 'tai-lieu': docList.length, jira: jiraList.length,
    viec: tasks.data?.length ?? 0, nhom: nGroups, lich: events.data?.length ?? 0, nguoi: nPeople,
  };
  // "Tất cả" đếm mỗi kết quả một lần: tài liệu và Jira đã nằm trong danh sách cuộc họp.
  const total = counts.hop + counts.viec + counts.nhom + counts.lich + counts.nguoi;

  // "Tất cả" hiện 5 kết quả đầu mỗi mảng, kèm link xem hết mảng đó.
  const filterHref = (k: string) => searchHref(raw, k, tg);
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
      <SearchBox q={raw} loai={loai} tg={tg} />
      <ScopeBar q={raw} loai={loai} tg={tg} total={total} counts={counts} />
      {loai && !counts[loai] && total > 0 && (
        <p className="mt-5 text-sm muted">Không có kết quả trong mảng này. <Link href={filterHref('')} className="link">Xem tất cả {total} kết quả</Link></p>
      )}
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <Section id="hop" title="Cuộc họp" n={meetingList.length}>
          {pick('hop', meetingList).map((m) => (
            <Row key={m.key} href={m.href}
              title={<>{m.jira && <span className="mr-2 rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-100">{m.jira}</span>}{m.title}</>}
              sub={<>{fmtDateTime(m.starts)}{m.sub ? ` · ${m.sub}` : ''}{m.docs.length ? <><br />Tài liệu: {m.docs.slice(0, 3).join('; ')}{m.docs.length > 3 ? ` và ${m.docs.length - 3} mục khác` : ''}</> : null}</>} />
          ))}
        </Section>
        {loai === 'tai-lieu' && (
          <Section id="tai-lieu" title="Tài liệu" n={docList.length}>
            {docList.map((d) => (
              <Row key={d.id} href={d.href} title={d.title}
                sub={`${fmtDateTime(d.starts)} · ${d.meeting}`}
                right={<span className="chip">{d.kind === 'minutes' ? 'Biên bản' : 'Tài liệu'}</span>} />
            ))}
          </Section>
        )}
        {loai === 'jira' && (
          <Section id="jira" title="Jira" n={jiraList.length}>
            {jiraList.map((m) => (
              <Row key={m.key} href={m.href}
                title={<><span className="mr-2 rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-100">{m.jira}</span>{m.title}</>}
                sub={`${fmtDateTime(m.starts)}${m.sub ? ` · ${m.sub}` : ''}`} />
            ))}
          </Section>
        )}
        <Section id="viec" title="Việc" n={tasks.data?.length ?? 0}>
          {pick('viec', tasks.data ?? []).map((t) => (
            <Row key={t.id} href={`/nhom/${t.group_id}?tab=viec`} title={t.title}
              sub={`${gName.get(t.group_id) ?? 'Nhóm'}${t.due_date ? ` · hạn ${fmtDate(t.due_date)}` : ''}`}
              right={<span className="chip">{TASK_STATUS_LABEL[t.status]}</span>} />
          ))}
        </Section>
        <Section id="nhom" title="Dự án và nhóm" n={nGroups}>
          {pick('nhom', groups.data ?? []).map((g) => (
            <Row key={g.id} href={`/nhom/${g.id}`} title={g.name} sub={g.description ?? undefined}
              right={<span className="chip">{g.archived_at ? 'Đã lưu trữ' : g.outside ? `${groupTypeLabel(g)} · chưa tham gia` : groupTypeLabel(g)}</span>} />
          ))}
        </Section>
        <Section id="lich" title="Lịch nhóm" n={events.data?.length ?? 0}>
          {pick('lich', events.data ?? []).map((e) => (
            <Row key={e.id} href={`/lich?xem=ngay&ngay=${vnDay(e.starts_at)}`} title={e.title}
              sub={`${fmtDateTime(e.starts_at)} · ${gName.get(e.group_id) ?? 'Nhóm'}${e.location ? ` · ${e.location}` : ''}`} />
          ))}
        </Section>
        <Section id="nguoi" title="Người" n={nPeople}>
          {pick('nguoi', people.data ?? []).map((p) => (
            <Row key={p.id} href={`/nguoi/${p.id}`} title={p.full_name || p.email} sub={[p.position, p.email].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      </div>
    </>
  );
}

const searchHref = (q: string, loai: string, tg: string) =>
  `/tim?${new URLSearchParams({ ...(q ? { q } : {}), ...(loai ? { loai } : {}), ...(tg ? { tg } : {}) })}`;

function SearchBox({ q, loai, tg }: { q: string; loai?: string; tg?: string }) {
  return (
    <form action="/tim" method="get" role="search" className="flex max-w-2xl gap-2">
      <label htmlFor="tim-q" className="sr-only">Từ khóa</label>
      {loai && <input type="hidden" name="loai" value={loai} />}
      {tg && <input type="hidden" name="tg" value={tg} />}
      <input id="tim-q" name="q" defaultValue={q} autoFocus={!q} placeholder="Tên cuộc họp, mã Jira, tài liệu, nhóm, việc, người…" className="input" />
      <button className="btn">Tìm</button>
    </form>
  );
}

// Hai hàng chip lọc nhanh: theo mảng và theo thời gian. Luôn hiện, kể cả trước khi gõ từ khóa,
// để chọn mảng trước rồi mới tìm. Mảng không có kết quả vẫn hiện (mờ) để biết là đã tìm ở đó.
function ScopeBar({ q, loai, tg, total, counts }: { q: string; loai: string; tg: string; total?: number; counts?: Record<string, number> }) {
  const n = (k: string) => (counts ? <span className="tabular-nums opacity-70"> {counts[k] ?? 0}</span> : null);
  return (
    <div className="mt-4 flex flex-col items-start gap-2">
      <nav className="seg" aria-label="Lọc theo mảng">
        <Link href={searchHref(q, '', tg)} aria-current={!loai ? 'true' : undefined}>Tất cả{counts && <span className="tabular-nums opacity-70"> {total}</span>}</Link>
        {SEARCH_SCOPES.map((f) => (
          <Link key={f.key} href={searchHref(q, f.key, tg)} aria-current={loai === f.key ? 'true' : undefined}
            className={counts && !counts[f.key] && loai !== f.key ? 'opacity-50' : undefined}>
            {f.label}{n(f.key)}
          </Link>
        ))}
      </nav>
      <nav className="seg" aria-label="Lọc theo thời gian">
        {TIMES.map((t) => (
          <Link key={t.key || 'all'} href={searchHref(q, loai, t.key)} aria-current={tg === t.key ? 'true' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {tg && !loai && <p className="text-xs muted">Khi lọc theo thời gian, nhóm và người được ẩn vì không gắn với ngày.</p>}
    </div>
  );
}
