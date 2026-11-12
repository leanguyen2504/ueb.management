'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { createSyncKey, saveToken, syncNow } from './actions';
import { FormMessage } from '@/components/FormMessage';
import { SubmitButton } from '@/components/SubmitButton';

// Nút "Đồng bộ Jira" (bookmarklet): kéo lên thanh dấu trang, mở Jira của trường rồi bấm.
export function BookmarkletSetup({ appUrl, hasKey, jiraUrl }: { appUrl: string; hasKey: boolean; jiraUrl: string | null }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const code = key
    ? `javascript:(function(){var s=document.createElement('script');s.src=${JSON.stringify(appUrl + '/api/jira/nut')}+'?t='+Date.now();s.setAttribute('data-k',${JSON.stringify(key)});document.body.appendChild(s);})();`
    : '';
  // React không cho đặt href "javascript:" qua thuộc tính, nên gán trực tiếp.
  useEffect(() => {
    if (link.current && code) link.current.setAttribute('href', code);
  }, [code]);

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
        <li>Bấm <b>{hasKey ? 'Tạo lại nút' : 'Tạo nút'}</b> bên dưới.</li>
        <li>Kéo nút đỏ <b>Đồng bộ Jira → UEB</b> thả lên thanh dấu trang (bookmark) của trình duyệt. Nếu không thấy thanh dấu trang: Chrome bấm Ctrl+Shift+B (Mac: ⌘+Shift+B).</li>
        <li>Mở {jiraUrl ? <a className="link" href={jiraUrl} target="_blank" rel="noreferrer">Jira của trường</a> : 'Jira của trường'}, đăng nhập như bình thường, rồi bấm nút vừa lưu. Dữ liệu của bạn được đọc ngay trong trình duyệt và gửi về đây; mật khẩu Jira không đi đâu cả.</li>
        <li>Cũng nút đó, bấm khi đang mở <a className="link" href="https://chamcong4lan.ueb.edu.vn/ChamCong/BaoCao" target="_blank" rel="noreferrer">trang Báo cáo chấm công</a> của trường: web lấy giờ vào/ra, vi phạm và giải trình 3 tháng gần nhất của riêng bạn để hiện ở Lịch → Chấm công, và tự cập nhật mỗi 10 phút khi tab đó còn mở.</li>
      </ol>
      {key ? (
        <div className="space-y-2 rounded-xl border border-gold-500/40 bg-gold-100/40 p-3 dark:bg-gold-600/10">
          <a ref={link} href="#" onClick={(e) => { e.preventDefault(); alert('Hãy kéo nút này lên thanh dấu trang, rồi bấm nó khi đang mở trang Jira.'); }}
            className="inline-flex cursor-grab items-center gap-2 rounded-lg bg-[#8b1c24] px-3 py-2 text-sm font-semibold text-white">
            Đồng bộ Jira → UEB
          </a>
          <p className="text-xs muted">Nút chứa mã đồng bộ riêng của bạn, đừng chia sẻ. Mã chỉ hiện một lần; nếu mất, bấm Tạo lại nút (nút cũ sẽ hết hiệu lực).</p>
          <button type="button" className="btn-secondary text-xs" onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true))}>
            {copied ? 'Đã chép' : 'Chép mã nút (để tự tạo dấu trang trên máy khác)'}
          </button>
        </div>
      ) : (
        <button type="button" className="btn" disabled={pending}
          onClick={() => start(async () => {
            if (hasKey && !confirm('Tạo nút mới sẽ làm nút cũ hết hiệu lực. Tiếp tục?')) return;
            const r = await createSyncKey();
            if (r.key) setKey(r.key);
            else setError(r.error ?? 'Lỗi');
          })}>
          {pending ? 'Đang tạo…' : hasKey ? 'Tạo lại nút' : 'Tạo nút'}
        </button>
      )}
      {error && <FormMessage state={{ error }} />}
    </div>
  );
}

export function TokenForm({ hasToken }: { hasToken: boolean }) {
  const [state, action] = useActionState(saveToken, null);
  const [syncState, syncAction] = useActionState(syncNow, null);
  return (
    <div className="space-y-3">
      <form action={action} className="space-y-2">
        <label className="label" htmlFor="jira-token">{hasToken ? 'Thay Personal Access Token' : 'Personal Access Token'}</label>
        <input id="jira-token" name="token" type="password" autoComplete="off" className="input" placeholder="Dán token tạo trong Jira: Profile → Personal Access Tokens" />
        <p className="text-xs muted">Token được mã hóa trước khi lưu, chỉ máy chủ dùng để đọc dữ liệu của bạn. Có thể thu hồi bất cứ lúc nào trong Jira.</p>
        <FormMessage state={state} />
        <SubmitButton>Lưu và đồng bộ</SubmitButton>
      </form>
      {hasToken && (
        <form action={syncAction} className="space-y-2">
          <FormMessage state={syncState} />
          <SubmitButton className="btn-secondary" pendingText="Đang đồng bộ…">Đồng bộ ngay</SubmitButton>
        </form>
      )}
    </div>
  );
}
