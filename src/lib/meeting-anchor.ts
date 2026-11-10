// Mã neo (#m-...) của một buổi họp trên trang Hồ sơ cuộc họp, dùng chung cho trang Lịch và Dashboard.
export function meetingAnchor(sourceId: string, eventKey: string): string {
  let h = 0x811c9dc5;
  const s = `${sourceId}|${eventKey}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `m-${(h >>> 0).toString(36)}`;
}
