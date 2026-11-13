// Phiếu trình giải quyết công việc: điền thẳng vào file mẫu gốc của Trường (public/mau) để giữ nguyên
// bố cục bảng luân chuyển (ngày giờ nhận, ký, trả, chuyển cho). Ô để trống giữ dấu chấm để điền tay.
import { readZip, unzipText, makeEntry, writeZip } from './zip';
import type { Values } from './forms';

export const PHIEU_TRINH_URL = '/mau/Phieu_trinh_giai_quyet_cong_viec.docx';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = (v: Values, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.replace(/^[-–•]\s*/, '').trim()).filter(Boolean);

export function fillPhieuTrinhXml(xml: string, v: Values) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const kids = (el: Element, name: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const top = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const [head, main] = top.filter((n) => n.localName === 'tbl');
  const paras = top.filter((n) => n.localName === 'p');
  const cells = (tr: Element) => kids(tr, 'tc');
  const ps = (tc: Element) => kids(tc, 'p');

  // Giữ định dạng của run đầu tiên, thay toàn bộ chữ trong đoạn.
  const setText = (p: Element, text: string, keepBreaks = false) => {
    const runs = kids(p, 'r');
    const r = runs[0];
    for (const x of runs.slice(1)) p.removeChild(x);
    if (!r) return;
    for (const x of Array.from(r.childNodes)) if ((x as Element).localName !== 'rPr' && !keepBreaks) r.removeChild(x);
    const t = doc.createElementNS(W, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = text;
    if (keepBreaks) {
      const first = Array.from(r.childNodes).find((x) => (x as Element).localName === 't');
      if (first) r.replaceChild(t, first);
    } else r.appendChild(t);
  };
  // Mỗi dòng một đoạn, nhân bản đoạn mẫu.
  const fillLines = (p: Element, items: string[]) => {
    if (!items.length) return;
    let after = p;
    items.forEach((t, i) => {
      const q = i ? (p.cloneNode(true) as Element) : p;
      if (i) after.after(q);
      setText(q, t);
      after = q;
    });
  };

  const unit = S(v, 'boPhan');
  if (unit) setText(ps(cells(kids(head, 'tr')[0])[0])[1], unit.toUpperCase());
  const kg = paras.find((p) => (p.textContent ?? '').startsWith('Kính gửi'));
  if (kg && S(v, 'kinhGui')) setText(kg, `Kính gửi: ${S(v, 'kinhGui')}`);

  const R = kids(main, 'tr');
  fillLines(ps(cells(R[0])[0])[1], lines(S(v, 'tenCongViec')));
  if (S(v, 'deXuat')) setText(ps(cells(R[1])[0])[0], `ĐỀ XUẤT: ${S(v, 'deXuat')}`);
  fillLines(ps(cells(R[2])[0])[1], lines(S(v, 'hoSo')));
  const canBo = lines(S(v, 'canBo')).join(', ');
  if (canBo) setText(ps(cells(R[3])[1])[0], `Tên cán bộ: ${canBo}`, true);
  return new XMLSerializer().serializeToString(doc);
}

export async function buildPhieuTrinh(v: Values): Promise<Uint8Array> {
  const res = await fetch(PHIEU_TRINH_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu gốc.');
  const entries = readZip(new Uint8Array(await res.arrayBuffer()));
  const i = entries.findIndex((e) => e.name === 'word/document.xml');
  entries[i] = await makeEntry('word/document.xml', fillPhieuTrinhXml(await unzipText(entries[i]), v));
  return writeZip(entries);
}
