'use client';

import { useActionState, useState } from 'react';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import { CHECKIN_LABEL, KIND_LABEL, PLACE_LABEL, ROLE_LABEL, type CheckinPlace, type PersonalKind } from '@/lib/attendance';
import { checkIn, createPersonalItem } from './actions';

export type PersonOption = { id: string; label: string };

// Thêm lịch cho mình, hoặc phân công cho một đồng nghiệp cùng nhóm/đơn vị.
export function PersonalItemForm({ people, defaultDay, assign }: { people: PersonOption[]; defaultDay: string; assign?: boolean }) {
  const [state, action] = useActionState(createPersonalItem, null);
  const [allDay, setAllDay] = useState(false);
  const [kind, setKind] = useState<PersonalKind>(assign ? 'cong_viec' : 'giang_day');
  const [owner, setOwner] = useState('');
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pi-owner">Lịch của</label>
          <select id="pi-owner" name="owner_id" className="input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Tôi</option>
            {people.length > 0 && (
              <optgroup label="Phân công cho đồng nghiệp">
                {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pi-kind">Loại</label>
          <select id="pi-kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PersonalKind)}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="pi-title">Tiêu đề</label>
        <input id="pi-title" name="title" required maxLength={300} className="input"
          placeholder={kind === 'giang_day' ? 'Ví dụ: Kinh tế vĩ mô, lớp QH-2025-E KTPT' : kind === 'su_kien' ? 'Ví dụ: Hội thảo khoa học cấp khoa' : 'Ví dụ: Việc A: soạn biên bản họp'} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pi-role">Vai trò</label>
          <select id="pi-role" name="role" className="input" defaultValue="" key={kind}>
            <option value="">Không ghi</option>
            {Object.entries(ROLE_LABEL)
              .filter(([k]) => (kind === 'giang_day' ? ['giang_vien_chinh', 'tro_giang', 'bao_cao_vien'] : kind === 'su_kien' ? ['to_chuc', 'bao_cao_vien', 'tham_du'] : ['thuc_hien', 'to_chuc', 'tham_du']).includes(k))
              .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pi-place">Làm việc ở đâu</label>
          <select id="pi-place" name="place" className="input" defaultValue="">
            <option value="">Không ghi</option>
            {Object.entries(PLACE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="all_day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Cả ngày
      </label>
      {allDay ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="pi-d1">Từ ngày</label><input id="pi-d1" name="day_from" type="date" required defaultValue={defaultDay} className="input" /></div>
          <div><label className="label" htmlFor="pi-d2">Đến ngày</label><input id="pi-d2" name="day_to" type="date" defaultValue={defaultDay} className="input" /></div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="pi-start">Bắt đầu</label><input id="pi-start" name="starts_at" type="datetime-local" required defaultValue={`${defaultDay}T07:30`} className="input" /></div>
          <div><label className="label" htmlFor="pi-end">Kết thúc</label><input id="pi-end" name="ends_at" type="datetime-local" defaultValue={`${defaultDay}T09:30`} className="input" /></div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div><label className="label" htmlFor="pi-loc">Địa điểm</label><input id="pi-loc" name="location" maxLength={300} className="input" placeholder="Ví dụ: Phòng 801 nhà E4" /></div>
        <div>
          <label className="label" htmlFor="pi-rep">Lặp hằng tuần</label>
          <select id="pi-rep" name="repeat_weeks" className="input" defaultValue="1">
            <option value="1">Không lặp</option>
            {[2, 4, 6, 8, 10, 12, 15, 16, 20].map((n) => <option key={n} value={n}>{n} tuần</option>)}
          </select>
        </div>
      </div>
      <div><label className="label" htmlFor="pi-desc">Ghi chú</label><textarea id="pi-desc" name="description" rows={2} maxLength={4000} className="input" /></div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang lưu…">{owner ? 'Giao việc' : 'Thêm vào lịch của tôi'}</SubmitButton>
      <p className="text-xs muted">
        {owner
          ? 'Người được giao nhận thông báo, thấy ngay trên lịch cá nhân và bấm Nhận hoặc Từ chối. Chỉ giao được cho người cùng nhóm hoặc đơn vị.'
          : 'Lịch cá nhân chỉ bạn thấy (và người đã giao việc cho bạn thấy việc họ giao). Giờ theo giờ Việt Nam.'}
      </p>
    </form>
  );
}

export function CheckInForm({ day, current, note }: { day: string; current: CheckinPlace | null; note: string | null }) {
  const [state, action] = useActionState(checkIn, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="day" value={day} />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Nơi làm việc">
        {(Object.entries(CHECKIN_LABEL) as [CheckinPlace, string][]).map(([k, v]) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name="place" value={k} defaultChecked={current === k} className="peer sr-only" required />
            <span className="chip !px-3 !py-1.5 !text-sm peer-checked:!border-brand-600 peer-checked:!bg-brand-50 peer-checked:!text-brand-600 peer-focus-visible:ring-2 dark:peer-checked:!bg-brand-900 dark:peer-checked:!text-brand-100">{v}</span>
          </label>
        ))}
      </div>
      <input name="note" maxLength={500} defaultValue={note ?? ''} className="input" placeholder="Ghi chú (không bắt buộc), ví dụ: họp tại Văn phòng khoa buổi chiều" />
      <FormMessage state={state} />
      <SubmitButton pendingText="Đang lưu…">{current ? 'Cập nhật điểm danh' : 'Điểm danh'}</SubmitButton>
    </form>
  );
}
