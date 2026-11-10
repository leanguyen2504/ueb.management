'use client';

import { useActionState } from 'react';
import { requestCode, verifyCode, type LoginState } from './actions';
import { SubmitButton } from '@/components/SubmitButton';

export function LoginForm() {
  const [reqState, requestAction] = useActionState(requestCode, { step: 'email' } as LoginState);
  const [verState, verifyAction] = useActionState(verifyCode, { step: 'code' } as LoginState);
  const onCode = reqState.step === 'code';

  if (!onCode) {
    return (
      <form action={requestAction} className="space-y-3">
        <div>
          <label htmlFor="email" className="label">Email trường</label>
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={reqState.email} placeholder="ten@vnu.edu.vn" className="input" />
        </div>
        {reqState.error && <p role="alert" className="text-sm text-orange-600 dark:text-orange-400">{reqState.error}</p>}
        <SubmitButton className="btn w-full" pendingText="Đang gửi mã…">Gửi mã đăng nhập</SubmitButton>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-3">
      <input type="hidden" name="email" value={reqState.email} />
      <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{reqState.info}</p>
      <div>
        <label htmlFor="code" className="label">Mã đăng nhập (nếu thư có mã)</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={10} className="input tracking-widest" autoFocus />
      </div>
      {verState.error && <p role="alert" className="text-sm text-orange-600 dark:text-orange-400">{verState.error}</p>}
      <SubmitButton className="btn w-full" pendingText="Đang kiểm tra…">Đăng nhập</SubmitButton>
      <p className="text-xs muted">Email cũng có liên kết đăng nhập; bấm liên kết đó trên thiết bị này cũng được.</p>
    </form>
  );
}
