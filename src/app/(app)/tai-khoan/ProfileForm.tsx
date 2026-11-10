'use client';

import { useActionState } from 'react';
import { updateProfile } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import type { Profile } from '@/lib/types';

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">Sửa hồ sơ</h2>
      <div><label className="label" htmlFor="p-name">Họ tên</label><input id="p-name" name="full_name" required maxLength={120} defaultValue={profile.full_name} className="input" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="p-pos">Chức vụ</label><input id="p-pos" name="position" maxLength={120} defaultValue={profile.position ?? ''} className="input" /></div>
        <div><label className="label" htmlFor="p-unit">Đơn vị</label><input id="p-unit" name="unit" maxLength={120} defaultValue={profile.unit ?? ''} className="input" /></div>
        <div><label className="label" htmlFor="p-phone">Điện thoại</label><input id="p-phone" name="phone" type="tel" maxLength={30} defaultValue={profile.phone ?? ''} className="input" /></div>
        <div><label className="label" htmlFor="p-office">Phòng làm việc</label><input id="p-office" name="office" maxLength={120} defaultValue={profile.office ?? ''} className="input" placeholder="Ví dụ: P.301 nhà E4" /></div>
      </div>
      <div><label className="label" htmlFor="p-bio">Giới thiệu</label><textarea id="p-bio" name="bio" rows={4} maxLength={2000} defaultValue={profile.bio ?? ''} className="input" placeholder="Phụ trách mảng việc, lĩnh vực chuyên môn, cách liên hệ thuận tiện…" /></div>
      <p className="text-xs muted">Email lấy từ tài khoản trường, không đổi được ở đây.</p>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}
