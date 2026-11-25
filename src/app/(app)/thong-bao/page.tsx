import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import Link from 'next/link';
import { clearReadNotifications, dismissAlert, dismissAllAlerts, markAllRead, openNotification } from '@/lib/work';
import { fmtDateTime } from '@/lib/format';
import { ALERT_LEVEL_LABEL, type AlertLevel, type AppAlert, type AppNotification } from '@/lib/types';

const LEVEL_CLASS: Record<AlertLevel, string> = {
  qua_han: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  gap: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  sap_den_han: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  can_xu_ly: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
};
const SOURCE_LABEL: Record<AppAlert['source'], string> = {
  viec: 'Việc',
  jira: 'Jira',
  lich: 'Lịch nhóm',
  ca_nhan: 'Lịch cá nhân',
  dat_lich: 'Đặt lịch',
  nhom: 'Nhóm',
};
const safeLink = (l: string | null) => (l && l.startsWith('/') && !l.startsWith('//') ? l : '/thong-bao');

export const metadata: Metadata = { title: 'Thông báo' };

export default async function NotificationsPage() {
  const { supabase } = await requireSession();
  const [{ data }, { data: alertRows }] = await Promise.all([
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).returns<AppNotification[]>(),
    supabase.rpc('my_alerts'),
  ]);
  const list = data ?? [];
  const alerts = (alertRows as AppAlert[] | null) ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHead
        title="Thông báo"
        sub={[alerts.length ? `${alerts.length} việc cần xử lý` : '', unread ? `${unread} thông báo chưa đọc` : ''].filter(Boolean).join(' · ') || 'Bạn đã đọc hết thông báo.'}
        actions={<>
          {unread > 0 && <form action={markAllRead}><button className="btn-secondary">Đánh dấu đã đọc hết</button></form>}
          {list.length > unread && <form action={clearReadNotifications}><button className="btn-secondary">Xóa thông báo đã đọc</button></form>}
        </>}
      />
      {alerts.length > 0 && (
        <section className="card mb-5 p-0" aria-labelledby="can-xu-ly">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div>
              <h2 id="can-xu-ly" className="font-semibold">Cần xử lý ngay</h2>
              <p className="text-xs muted">Việc gấp, quá hạn, đến hạn trong 24 giờ và yêu cầu chờ bạn. Mục tự mất khi đã xử lý xong, hoặc bấm Gỡ.</p>
            </div>
            <form action={dismissAllAlerts}>
              {alerts.map((a) => <input key={a.ref_key} type="hidden" name="key" value={a.ref_key} />)}
              <button className="btn-secondary">Gỡ tất cả</button>
            </form>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {alerts.map((a) => (
              <li key={a.ref_key} className="flex items-start gap-3 px-4 py-3">
                <Link href={safeLink(a.link)} className="flex min-w-0 flex-1 items-start gap-3 hover:underline">
                  <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_CLASS[a.level] ?? LEVEL_CLASS.can_xu_ly}`}>{ALERT_LEVEL_LABEL[a.level] ?? a.level}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.title}</span>
                    <span className="block text-sm muted">{[SOURCE_LABEL[a.source] ?? a.source, a.body].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
                <form action={dismissAlert}>
                  <input type="hidden" name="key" value={a.ref_key} />
                  <button className="rounded-lg px-2 py-1 text-xs muted hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Gỡ nhắc: ${a.title}`}>Gỡ</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-0">
        {list.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map((n) => (
              <li key={n.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${n.read_at ? '' : 'bg-brand-50/60 dark:bg-slate-800/60'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand-600'}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={`block ${n.read_at ? '' : 'font-semibold'}`}>{n.title}</span>
                      {n.body && <span className="block text-sm muted">{n.body}</span>}
                      <span className="block text-xs muted">{fmtDateTime(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="sr-only">Chưa đọc</span>}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm muted">Chưa có thông báo nào. Bạn sẽ nhận thông báo khi được giao việc, có lịch mới trong nhóm, có yêu cầu đặt lịch hoặc có người xin tham gia nhóm bạn phụ trách.</p>
        )}
      </section>
    </>
  );
}
