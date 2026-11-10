import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/session';
import { PageHead } from '@/components/PageHead';
import { SubmitButton } from '@/components/SubmitButton';
import { fmtDateTime } from '@/lib/format';
import { features } from '@/lib/env';
import { serviceAccountEmail } from '@/lib/google-calendar/service-account';
import { AddSourceForm } from './AddSourceForm';
import { deleteSource, syncNow, updateSource } from './actions';

export const metadata: Metadata = { title: 'Lịch Google' };

type Source = {
  id: string; calendar_id: string; label: string; visibility: 'office' | 'all'; is_enabled: boolean;
  last_synced_at: string | null; last_error: string | null; event_count: number; busy_user_ids: string[];
};

export default async function GoogleCalendarAdminPage() {
  const { supabase } = await requireAdmin();
  const enabled = features.googleCalendar();
  const saEmail = serviceAccountEmail();
  const hasApiKey = !!process.env.GOOGLE_CALENDAR_API_KEY;
  const { data } = await supabase.from('calendar_sources').select('*').order('created_at');
  const sources = (data ?? []) as Source[];
  const { data: people } = await supabase
    .from('profiles').select('id, full_name, email, system_role').eq('is_active', true).order('full_name');
  const rank: Record<string, number> = { principal: 0, secretary: 1, member: 2 };
  const persons = (people ?? []).sort((a, b) => (rank[a.system_role] ?? 3) - (rank[b.system_role] ?? 3));

  return (
    <>
      <PageHead
        title="Lịch Google dùng chung"
        sub="Hệ thống chỉ đọc lịch Google, không sửa gì bên Google. Buổi họp hiện trên trang Lịch."
        actions={enabled && sources.length > 0 && (
          <form action={syncNow}><SubmitButton className="btn-secondary" pendingText="Đang tải…">Tải lại ngay</SubmitButton></form>
        )}
      />

      <div className="card mb-4 space-y-1 text-sm">
        <p>Module: {enabled ? <strong className="text-green-700 dark:text-green-400">đang bật</strong> : <strong>đang tắt</strong>} <span className="muted">(biến FEATURE_GOOGLE_CALENDAR)</span></p>
        {saEmail ? (
          <p>Tài khoản dịch vụ: <code className="break-all">{saEmail}</code>. Chia sẻ lịch cho email này với quyền <em>Xem tất cả chi tiết sự kiện</em>.</p>
        ) : hasApiKey ? (
          <p>Đang dùng API key: chỉ đọc được lịch để ở chế độ công khai.</p>
        ) : (
          <p>Chưa có khóa Google: hệ thống đọc lịch qua địa chỉ iCal công khai, nên chỉ đọc được lịch để công khai. Lịch riêng tư cần GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_CALENDAR_API_KEY (xem docs/google-calendar.md).</p>
        )}
        <p className="muted">Lịch tự tải lại khi có người mở trang Lịch (nếu đã cũ hơn 10 phút) và mỗi sáng một lần.</p>
      </div>

      <div className="mb-4 space-y-3">
        {sources.length === 0 && <p className="text-sm muted">Chưa có lịch nào.</p>}
        {sources.map((s) => (
          <div key={s.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{s.label} {!s.is_enabled && <span className="text-xs font-normal muted">(đang tắt)</span>}</p>
                <p className="break-all text-xs muted">{s.calendar_id}</p>
              </div>
              <div className="flex gap-2">
                <form action={updateSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="is_enabled" value={s.is_enabled ? 'false' : 'true'} />
                  <button className="btn-secondary">{s.is_enabled ? 'Tắt' : 'Bật'}</button>
                </form>
                <form action={deleteSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-danger">Xóa</button>
                </form>
              </div>
            </div>
            <p className="text-sm">
              {s.last_error
                ? <span className="text-orange-700 dark:text-orange-400">Lỗi lần tải gần nhất: {s.last_error}</span>
                : s.last_synced_at
                  ? <>Đã tải {s.event_count} buổi họp lúc {fmtDateTime(s.last_synced_at)}.</>
                  : <span className="muted">Chưa tải lần nào.</span>}
            </p>
            {/* key: dựng lại form khi giá trị đã lưu đổi, để React không trả ô chọn về giá trị cũ sau khi gửi. */}
            <form key={`${s.label}|${s.visibility}`} action={updateSource} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={s.id} />
              <div><label className="label" htmlFor={`l-${s.id}`}>Tên hiển thị</label><input id={`l-${s.id}`} name="label" defaultValue={s.label} maxLength={80} className="input" /></div>
              <div>
                <label className="label" htmlFor={`v-${s.id}`}>Ai được xem</label>
                <select id={`v-${s.id}`} name="visibility" defaultValue={s.visibility} className="input">
                  <option value="office">Hiệu trưởng, thư ký và quản trị</option>
                  <option value="all">Mọi người dùng</option>
                </select>
              </div>
              <SubmitButton className="btn-secondary">Lưu</SubmitButton>
            </form>
            <details className="text-sm">
              <summary className="cursor-pointer select-none">
                Tính là giờ bận của: {s.busy_user_ids.length ? `${s.busy_user_ids.length} người` : <span className="muted">chưa ai</span>}
              </summary>
              <form key={s.busy_user_ids.join(',')} action={updateSource} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="busy_form" value="1" />
                <p className="text-xs muted">Trang đặt lịch của những người được chọn sẽ ẩn các giờ trùng với buổi họp trong lịch này.</p>
                <div className="grid max-h-60 gap-1 overflow-y-auto sm:grid-cols-2">
                  {persons.map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <input type="checkbox" name="busy_user_ids" value={p.id} defaultChecked={s.busy_user_ids.includes(p.id)} />
                      <span className="truncate">{p.full_name || p.email}</span>
                    </label>
                  ))}
                </div>
                <SubmitButton className="btn-secondary">Lưu người dùng lịch này</SubmitButton>
              </form>
            </details>
          </div>
        ))}
      </div>

      <AddSourceForm />
    </>
  );
}
