'use client';

import { useActionState } from 'react';
import { updateProfile } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';
import type { Profile } from '@/lib/types';

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="card max-w-xl space-y-3">
      <div><label className="label" htmlFor="p-name">Họ tên</label><input id="p-name" name="full_name" required maxLength={120} defaultValue={profile.full_name} className="input" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor="p-unit">Đơn vị</label><input id="p-unit" name="unit" maxLength={120} defaultValue={profile.unit ?? ''} className="input" /></div>
        <div><label className="label" htmlFor="p-pos">Chức vụ</label><input id="p-pos" name="position" maxLength={120} defaultValue={profile.position ?? ''} className="input" /></div>
      </div>
      <FormMessage state={state} />
      <SubmitButton>Lưu</SubmitButton>
    </form>
  );
}
