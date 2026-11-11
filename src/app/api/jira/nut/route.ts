import { collectMyJira } from '@/lib/jira/collect';
import { serverEnv } from '@/lib/env';

// Mã JavaScript mà nút "Đồng bộ Jira" (bookmarklet) nạp vào trang Jira.
// Chạy trong trình duyệt của chính người dùng, trên trang Jira đã đăng nhập: đọc dữ liệu của chính họ
// qua Jira REST API (cookie đăng nhập Jira không rời khỏi trình duyệt), rồi gửi về /api/jira/nhap kèm mã đồng bộ.
export const dynamic = 'force-dynamic';

export function GET() {
  const app = JSON.stringify(serverEnv.appUrl().replace(/\/+$/, ''));
  const js = `(function () {
  var cs = document.currentScript;
  var KEY = cs && cs.getAttribute('data-k');
  var APP = ${app};
  var box = document.getElementById('ueb-jira-sync') || document.createElement('div');
  box.id = 'ueb-jira-sync';
  box.setAttribute('style', 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:360px;padding:12px 14px;border-radius:12px;background:#8b1c24;color:#fff;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)');
  document.body.appendChild(box);
  function say(m, html) { if (html) box.innerHTML = m; else box.textContent = 'UEB · ' + m; }
  if (!KEY) { say('Thiếu mã đồng bộ. Hãy tạo lại nút trên trang Jira của tôi ở web UEB.'); return; }
  var collect = (${collectMyJira.toString()});
  var ctx = (window.AJS && typeof window.AJS.contextPath === 'function' && window.AJS.contextPath()) || '';
  collect(location.origin + ctx, { onProgress: say })
    .then(function (snap) {
      say('Đang gửi về web UEB…');
      return fetch(APP + '/api/jira/nhap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
        body: JSON.stringify(snap)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          say('UEB · Đã cập nhật ' + j.issues + ' mã việc, ' + j.worklogs + ' worklog, ' + j.mentions + ' comment nhắc tên bạn. <a href="' + APP + '/jira" target="_blank" style="color:#fde68a;text-decoration:underline">Mở trang Jira của tôi</a>', true);
        });
      });
    })
    .catch(function (e) {
      say('Lỗi: ' + (e && e.message ? e.message : e) + ' (Hãy mở trang Jira của trường, đăng nhập rồi bấm lại.)');
    });
})();
`;
  return new Response(js, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}
