import type { Metadata } from 'next';
import { requireSession } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { clearReadNotifications, markAllRead, openNotification } from '@/lib/work';
import { fmtDateTime } from '@/lib/format';
import type { AppNotification } from '@/lib/types';

export const metadata: Metadata = { title: 'Thông báo' };

export default async function NotificationsPage() {
  const { supabase } = await requireSession();
  const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100).returns<AppNotification[]>();
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <>
      <PageHead
        title="Thông báo"
        sub={unread ? `${unread} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo.'}
        actions={<>
          {unread > 0 && <form action={markAllRead}><button className="btn-secondary">Đánh dấu đã đọc hết</button></form>}
          {list.length > unread && <form action={clearReadNotifications}><button className="btn-secondary">Xóa thông báo đã đọc</button></form>}
        </>}
      />
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
          <p className="p-4 text-sm muted">Chưa có thông báo nào. Bạn sẽ nhận thông báo khi được giao việc, có lịch mới trong nhóm hoặc có yêu cầu đặt lịch.</p>
        )}
      </section>
    </>
  );
}
