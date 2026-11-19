import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { KEY_DEADLINES, PROCEDURES, SOURCES, type FormRef } from './quy-trinh';

export const metadata: Metadata = { title: 'Hành chính' };

export default async function HanhChinhPage({ searchParams }: { searchParams: Promise<{ quy_trinh?: string }> }) {
  await requireSession();
  const { quy_trinh } = await searchParams;
  const cur = PROCEDURES.find((p) => p.key === quy_trinh) ?? PROCEDURES[0];
  const groups = [...new Set(PROCEDURES.map((p) => p.group))];
  const sources = SOURCES.filter((s) => cur.sources?.includes(s.key));

  return (
    <>
      <PageHead title="Hành chính" sub="Quy trình các thủ tục hành chính, tài chính của Trường (dự trù, tạm ứng, thanh toán…): làm gì, ai làm, hạn bao lâu và dùng biểu mẫu nào." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {KEY_DEADLINES.map((d) => (
          <div key={d.label} className="card !py-3">
            <div className="text-xs muted">{d.label}</div>
            <div className="mt-0.5 font-semibold text-brand-600 dark:text-brand-300">{d.value}</div>
          </div>
        ))}
      </div>

      <div className="card mb-5 grid gap-3 md:grid-cols-3" aria-label="Chọn thủ tục">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide muted">{g}</div>
            <div className="flex flex-wrap gap-1.5">
              {PROCEDURES.filter((p) => p.group === g).map((p) => (
                <Link
                  key={p.key}
                  href={`/hanh-chinh?quy_trinh=${p.key}`}
                  aria-current={p.key === cur.key ? 'page' : undefined}
                  className={`rounded-full border px-3 py-1 text-sm transition ${p.key === cur.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'}`}
                >
                  {p.title}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {cur.title}
                {cur.draft && <span className="ml-2 rounded-full bg-gold-100 px-2 py-0.5 align-middle text-xs font-medium text-gold-600 dark:bg-gold-600/20 dark:text-gold-500">Đang bổ sung</span>}
              </h2>
              <p className="mt-1 text-sm muted">{cur.summary}</p>
            </div>
            {cur.deadline && <span className="chip shrink-0">{cur.deadline}</span>}
          </div>

          <ol className="relative space-y-5 border-l-2 border-slate-200 pl-6 dark:border-slate-700">
            {cur.steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white ring-4 ring-white dark:ring-slate-900">{i + 1}</span>
                <div className="font-semibold">{s.title}</div>
                {(s.who || s.when) && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs muted">
                    {s.who && <span>Người làm: <b className="font-medium text-slate-700 dark:text-slate-300">{s.who}</b></span>}
                    {s.when && <span>Thời hạn: <b className="font-medium text-orange-700 dark:text-orange-400">{s.when}</b></span>}
                  </div>
                )}
                {s.detail && s.detail.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {s.detail.map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                )}
                {s.forms && s.forms.length > 0 && <FormLinks forms={s.forms} />}
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-5">
          {cur.rules && cur.rules.length > 0 && (
            <section className="card">
              <h3 className="mb-2 font-semibold">Lưu ý, quy định</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {cur.rules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </section>
          )}
          {cur.forms && cur.forms.length > 0 && (
            <section className="card">
              <h3 className="mb-1 font-semibold">Biểu mẫu</h3>
              <FormLinks forms={cur.forms} />
            </section>
          )}
          {sources.length > 0 && (
            <section className="card">
              <h3 className="mb-2 font-semibold">Văn bản căn cứ</h3>
              <ul className="space-y-2.5 text-sm">
                {sources.map((s) => (
                  <li key={s.key}>
                    {s.href ? <a href={s.href} target="_blank" rel="noreferrer" className="link font-medium">{s.so}</a> : <span className="font-medium">{s.so}</span>}
                    {s.date && <span className="muted"> ngày {s.date}</span>}
                    <div className="muted">{s.title}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function FormLinks({ forms }: { forms: FormRef[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {forms.map((f) => {
        const inside = f.href.startsWith('/');
        const cls = 'inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs hover:border-brand-300 hover:text-brand-600 dark:border-slate-700';
        const body = <>{f.label}{f.note && <span className="muted">({f.note})</span>}{!inside && <span aria-hidden="true">↗</span>}</>;
        return inside
          ? <Link key={f.href + f.label} href={f.href} className={cls}>{body}</Link>
          : <a key={f.href + f.label} href={f.href} target="_blank" rel="noreferrer" className={cls}>{body}</a>;
      })}
    </div>
  );
}
