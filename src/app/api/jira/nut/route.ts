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
  if (/chamcong/i.test(location.hostname + location.pathname)) { syncPunches(); return; }
  var collect = (${collectMyJira.toString()});
  var ctx = (window.AJS && typeof window.AJS.contextPath === 'function' && window.AJS.contextPath()) || '';
  // Bấm một lần: đọc ngay, rồi tự đọc lại mỗi 30 phút khi tab Jira còn mở (và đang hiện trên màn hình).
  var busy = false;
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function runJira(auto) {
    if (busy) return;
    busy = true;
    collect(location.origin + ctx, { onProgress: auto ? function () {} : say })
    .then(function (snap) {
      if (!auto) say('Đang gửi về web UEB…');
      return fetch(APP + '/api/jira/nhap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
        body: JSON.stringify(snap)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          var at = new Date();
          say('UEB · Đã cập nhật ' + j.issues + ' mã việc, ' + j.worklogs + ' worklog, ' + j.mentions + ' comment nhắc tên bạn. Lúc ' + pad2(at.getHours()) + ':' + pad2(at.getMinutes()) +
            ', tự cập nhật mỗi 30 phút khi tab này còn mở. <a href="' + APP + '/jira" target="_blank" style="color:#fde68a;text-decoration:underline">Mở trang Jira của tôi</a>' +
            ' <a href="#" onclick="this.parentNode.style.display=&quot;none&quot;;return false" style="color:#fff;opacity:.7;margin-left:6px">Ẩn</a>', true);
          if (!auto) box.style.display = '';
        });
      });
    })
    .catch(function (e) {
      box.style.display = '';
      say('Lỗi: ' + (e && e.message ? e.message : e) + ' (Hãy mở trang Jira của trường, đăng nhập rồi bấm lại.)');
    })
    .then(function () { busy = false; });
  }
  runJira(false);
  if (window.__uebJiraTimer) clearInterval(window.__uebJiraTimer);
  window.__uebJiraTimer = setInterval(function () { if (!document.hidden) runJira(true); }, 1800000);

  // Trang chấm công của trường: đọc báo cáo bằng phiên đăng nhập của chính bạn, chỉ giữ dòng của bạn, gửi về web.
  function syncPunches() {
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fold(s) { return String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[\\u0111\\u0110]/g, 'd').toLowerCase().replace(/\\s+/g, ' ').trim(); }
    function email() {
      var el = document.querySelector('#userEmailDisplay [data-cfemail]');
      if (el) {
        var h = el.getAttribute('data-cfemail'), k = parseInt(h.substr(0, 2), 16), out = '';
        for (var i = 2; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.substr(i, 2), 16) ^ k);
        return out;
      }
      var t = document.getElementById('userEmailDisplay');
      return t ? t.textContent.trim() : '';
    }
    var nameEl = document.getElementById('userNameDisplay');
    var me = { name: nameEl ? nameEl.textContent.trim() : '', email: email() };
    if (!me.name && !me.email) { say('Không thấy tên người đăng nhập trên trang. Hãy đăng nhập trang chấm công rồi bấm lại.'); return; }
    var local = me.email.split('@')[0].toLowerCase();
    function run(months) {
      var now = new Date();
      var start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
      var chunks = [];
      for (var d = new Date(start); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        var end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        chunks.push([ymd(d), ymd(end > now ? now : end)]);
      }
      var rows = [], synced = null, excuseError = false;
      var p = Promise.resolve();
      chunks.forEach(function (c, i) {
        p = p.then(function () {
          say('Đang đọc chấm công ' + c[0].slice(5, 7) + '/' + c[0].slice(0, 4) + ' (' + (i + 1) + '/' + chunks.length + ')…');
          return fetch('/api/chamcong/bao-cao?tu=' + c[0] + '&den=' + c[1], { credentials: 'same-origin' }).then(function (r) {
            if (!r.ok) throw new Error('Trang chấm công trả lỗi HTTP ' + r.status + '. Hãy đăng nhập lại trang chấm công.');
            return r.json();
          }).then(function (j) {
            (j.danhSach || []).forEach(function (x) {
              var u = String(x.username || '').toLowerCase();
              if ((local && u === local) || (me.name && fold(x.hoTen) === fold(me.name))) rows.push(x);
            });
            if (j.dongBoLanCuoi) { var t = new Date(j.dongBoLanCuoi); if (!isNaN(t)) synced = t.toISOString(); }
            if (j.giaiTrinhLoi) excuseError = true;
          });
        });
      });
      return p.then(function () {
        if (!rows.length) throw new Error('Không thấy dòng chấm công nào của ' + (me.name || me.email) + '.');
        say('Đang gửi ' + rows.length + ' ngày chấm công về web UEB…');
        return fetch(APP + '/api/jira/cham-cong', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
          body: JSON.stringify({ from: chunks[0][0], to: chunks[chunks.length - 1][1], sourceSyncedAt: synced, excuseError: excuseError, me: me, rows: rows })
        });
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          var at = new Date();
          say('UEB · Đã cập nhật ' + j.days + ' ngày chấm công' + (j.errorDays ? ', <b>' + j.errorDays + ' ngày có lỗi</b>' : ', không có lỗi') +
            (j.excuseError ? '. <b>Chú ý:</b> hệ thống chấm công đang không đọc được đơn nghỉ phép, số lỗi có thể chưa trừ nghỉ phép' : '') +
            '. Lúc ' + pad(at.getHours()) + ':' + pad(at.getMinutes()) + ', tự cập nhật mỗi 10 phút khi tab này còn mở. ' +
            '<a href="' + APP + '/lich/cham-cong" target="_blank" style="color:#fde68a;text-decoration:underline">Mở trang Chấm công</a>', true);
        });
      }).catch(function (e) {
        say('Lỗi: ' + (e && e.message ? e.message : e));
      });
    }
    run(3);
    if (window.__uebPunchTimer) clearInterval(window.__uebPunchTimer);
    window.__uebPunchTimer = setInterval(function () { if (!document.hidden) run(1); }, 600000);
  }
})();
`;
  return new Response(js, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}
