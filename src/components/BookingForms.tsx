'use client';

import { useActionState, useState } from 'react';
import { bookPublic, saveBookingPage } from '@/lib/work';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { ALL_DURATIONS, DAY_NAMES, durationLabel } from '@/lib/booking-slots';
import type { BookingPage } from '@/lib/types';

export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <input readOnly value={url} className="input min-w-0 flex-1" aria-label="Link đặt lịch" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}>
        {done ? 'Đã chép' : 'Sao chép'}
      </button>
      <a href={url} target="_blank" rel="noopener" className="btn-secondary">Xem trang ↗</a>
    </div>
  );
}

const NOTICE = [[0, 'Không giới hạn'], [60, '1 giờ'], [120, '2 giờ'], [240, '4 giờ'], [720, '12 giờ'], [1440, '1 ngày'], [2880, '2 ngày'], [10080, '1 tuần']] as const;
const HORIZON = [[7, '7 ngày tới'], [14, '14 ngày tới'], [30, '30 ngày tới'], [60, '60 ngày tới'], [90, '90 ngày tới'], [180, '180 ngày tới']] as const;
const BUFFER = [[0, 'Không'], [5, '5 phút'], [10, '10 phút'], [15, '15 phút'], [30, '30 phút'], [60, '1 giờ']] as const;

export function BookingSettingsForm({ page, defaultSlug, defaultTitle }: { page: BookingPage | null; defaultSlug: string; defaultTitle: string }) {
  const [state, action] = useActionState(saveBookingPage, null);
  const durations = page?.durations ?? [15, 30, 45, 60, 90, 120];
  const weekly = page?.weekly_hours ?? { '1': ['08:00', '17:00'], '2': ['08:00', '17:00'], '3': ['08:00', '17:00'], '4': ['08:00', '17:00'], '5': ['08:00', '17:00'] };
  return (
    <form action={action} className="space-y-4">
      <div><label className="label" htmlFor="bp-title">Tiêu đề trang</label><input id="bp-title" name="title" defaultValue={page?.title ?? defaultTitle} maxLength={200} className="input" /></div>
      <div><label className="label" htmlFor="bp-intro">Lời giới thiệu (không bắt buộc)</label><textarea id="bp-intro" name="intro" rows={3} defaultValue={page?.intro ?? ''} className="input" /></div>
      <div>
        <label className="label" htmlFor="bp-loc">Địa điểm hoặc link họp</label>
        <p className="mb-1 text-xs muted">Chỉ gửi cho người đặt sau khi bạn xác nhận. Ví dụ link Google Meet hoặc phòng làm việc.</p>
        <input id="bp-loc" name="location" defaultValue={page?.location ?? ''} maxLength={500} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="bp-slug">Đuôi link</label>
        <p className="mb-1 text-xs muted">Chữ thường không dấu, số và dấu gạch ngang. Đổi đuôi thì link cũ ngừng hoạt động.</p>
        <input id="bp-slug" name="slug" required defaultValue={page?.slug ?? defaultSlug} pattern="[a-z0-9][a-z0-9\-]{1,58}[a-z0-9]" className="input" />
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-sm font-medium">Thời lượng cho phép chọn</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ALL_DURATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`d_${d}`} defaultChecked={durations.includes(d)} /> {durationLabel(d)}</label>
          ))}
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <legend className="px-1 text-sm font-medium">Giờ nhận lịch</legend>
        <div className="space-y-2">
          {Object.entries(DAY_NAMES).map(([k, name]) => {
            const h = weekly[k as keyof typeof weekly];
            return (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <label className="flex w-28 items-center gap-2 text-sm"><input type="checkbox" name={`day_${k}`} defaultChecked={Boolean(h)} /> {name}</label>
                <input type="time" name={`from_${k}`} defaultValue={h?.[0] ?? '08:00'} step={900} className="input w-auto py-1" aria-label={`${name} từ`} />
                <span className="muted">–</span>
                <input type="time" name={`to_${k}`} defaultValue={h?.[1] ?? '17:00'} step={60} className="input w-auto py-1" aria-label={`${name} đến`} />
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="bp-notice">Đặt trước ít nhất</label>
          <select id="bp-notice" name="min_notice_minutes" defaultValue={page?.min_notice_minutes ?? 0} className="input">
            {NOTICE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bp-horizon">Nhận lịch trong vòng</label>
          <select id="bp-horizon" name="horizon_days" defaultValue={page?.horizon_days ?? 30} className="input">
            {HORIZON.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="bp-buffer">Khoảng nghỉ giữa các lịch</label>
          <select id="bp-buffer" name="buffer_minutes" defaultValue={page?.buffer_minutes ?? 0} className="input">
            {BUFFER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>{page ? 'Lưu cài đặt' : 'Tạo trang đặt lịch'}</SubmitButton>
    </form>
  );
}

export function PublicBookingForm({ slug, startsAt, minutes, name, email }: { slug: string; startsAt: string; minutes: number; name?: string; email?: string }) {
  const [state, action] = useActionState(bookPublic, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="starts_at" value={startsAt} />
      <input type="hidden" name="minutes" value={minutes} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="g-name">Họ tên</label><input id="g-name" name="name" required maxLength={200} defaultValue={name} className="input" autoComplete="name" /></div>
        <div><label className="label" htmlFor="g-email">Email</label><input id="g-email" name="email" type="email" required maxLength={320} defaultValue={email} className="input" autoComplete="email" /></div>
      </div>
      <div><label className="label" htmlFor="g-topic">Nội dung cần gặp</label><input id="g-topic" name="topic" required maxLength={300} className="input" /></div>
      <div><label className="label" htmlFor="g-note">Ghi chú thêm</label><textarea id="g-note" name="note" rows={3} maxLength={2000} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang gửi…">Gửi yêu cầu</SubmitButton>
    </form>
  );
}
