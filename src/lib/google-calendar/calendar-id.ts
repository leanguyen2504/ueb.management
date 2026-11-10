// Lấy mã lịch Google từ những gì người dùng dán: mã lịch, link nhúng (embed?src=),
// link chia sẻ (?cid=), hoặc địa chỉ iCal (/calendar/ical/<mã>/...).

const ID_RE = /^[A-Za-z0-9._%+#-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function fromCid(cid: string): string | null {
  if (ID_RE.test(cid)) return cid;
  try {
    const decoded = Buffer.from(cid.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return ID_RE.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function extractCalendarId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (ID_RE.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s.replace(/^webcal:\/\//, 'https://'));
  } catch {
    return null;
  }
  if (!/(^|\.)google\.com$/.test(u.hostname)) return null;
  const src = u.searchParams.get('src');
  if (src && ID_RE.test(src)) return src;
  const cid = u.searchParams.get('cid');
  if (cid) return fromCid(cid);
  const ical = u.pathname.match(/\/calendar\/ical\/([^/]+)\//);
  if (ical) {
    const id = decodeURIComponent(ical[1]);
    return ID_RE.test(id) ? id : null;
  }
  return null;
}
