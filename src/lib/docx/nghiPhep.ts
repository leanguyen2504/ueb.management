// Mẫu 01 - Đơn xin nghỉ phép năm (biểu mẫu gốc ĐHQGHN): điền thẳng vào file gốc trong public/mau,
// giữ nguyên bố cục, ô đánh dấu lý do nghỉ và chỗ ký. Ô để trống giữ dấu chấm để điền tay.
import { readZip, unzipText, makeEntry, writeZip } from './zip';
import type { Values } from './forms';

export const NGHI_PHEP_URL = '/mau/Mau_01_Don_xin_nghi_phep_nam.docx';
export const LOAI_NGHI = ['Nghỉ phép năm', 'Nghỉ việc riêng không lương', 'Nghỉ ốm', 'Nghỉ lý do khác'] as const;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const S = (v: Values, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso);

export function fillNghiPhepXml(xml: string, v: Values) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const top = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const paras = top.filter((n) => n.localName === 'p');
  const ts = (p: Element) => Array.from(p.getElementsByTagNameNS(W, 't'));
  const find = (start: string) => paras.find((p) => (p.textContent ?? '').trimStart().startsWith(start));
  const set = (t: Element | undefined, text: string) => {
    if (!t) return;
    t.textContent = text;
    t.setAttribute('xml:space', 'preserve');
  };

  // Dòng địa danh, ngày tháng.
  const iso = S(v, 'ngay');
  const [y, m, d] = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-') : ['20    ', '      ', '      '];
  set(ts(find('Hà Nội, ngày') ?? paras[0])[0], `${S(v, 'diaDanh') || 'Hà Nội'}, ngày ${d} tháng ${m} năm ${y}`);

  const kg = find('Kính gửi');
  if (kg && S(v, 'kinhGui')) set(ts(kg).at(-1), S(v, 'kinhGui'));

  const ten = find('Tên tôi là');
  if (ten) {
    const [a, b] = ts(ten);
    set(a, `Tên tôi là: ${S(v, 'hoTen') || '………………………'}`);
    set(b, `Đơn vị: ${S(v, 'donVi') || '………………………'}`);
  }

  const loai = S(v, 'loai');
  const xin = find('Tôi làm đơn');
  if (xin) {
    const viecRieng = !loai || loai === LOAI_NGHI[0] || loai === LOAI_NGHI[1];
    set(ts(xin)[0], `Tôi làm đơn này xin được nghỉ phép thời gian ${S(v, 'soNgay') || '….'} ngày (từ ${dmy(S(v, 'tuNgay')) || '….'} đến ${dmy(S(v, 'denNgay')) || '….'})${viecRieng ? ' để giải quyết việc riêng' : ''}.`);
  }
  const bg = find('Tôi xin cam kết');
  if (bg && S(v, 'banGiao')) set(ts(bg)[0], `Tôi xin cam kết sẽ bàn giao công việc đầy đủ, đảm bảo chất lượng và tiến độ công việc trong thời gian nghỉ phép cho ${S(v, 'banGiao')}.`);
  const khac = find('Nghỉ lý do khác');
  if (khac && loai === LOAI_NGHI[3] && S(v, 'lyDoKhac')) set(ts(khac).at(-1), `Nghỉ lý do khác (nêu rõ lý do): ${S(v, 'lyDoKhac')}`);

  // Ô đánh dấu theo thứ tự trong mẫu: phép năm, không lương, ốm, (giấy BS: có, không), lý do khác.
  const syms = Array.from(doc.getElementsByTagNameNS(W, 'sym'));
  const tick = (el: Element | undefined) => {
    if (!el) return;
    const w2 = el.getAttributeNS(W, 'font') === 'Wingdings 2' || el.getAttribute('w:font') === 'Wingdings 2';
    el.setAttributeNS(W, 'w:char', w2 ? 'F052' : 'F0FE'); // ô có dấu tích
  };
  const box = [0, 1, 2, 5][LOAI_NGHI.indexOf(loai as (typeof LOAI_NGHI)[number])];
  if (box !== undefined) tick(syms[box]);
  if (loai === LOAI_NGHI[2] && S(v, 'giayBs')) tick(syms[S(v, 'giayBs') === 'Có' ? 3 : 4]);

  // Họ tên dưới chữ "Người làm đơn" (để chừa chỗ ký).
  const name = S(v, 'hoTen');
  const sign = top.find((n) => n.localName === 'tbl' && (n.textContent ?? '').includes('Người làm đơn'));
  if (sign && name) {
    const cell = Array.from(sign.getElementsByTagNameNS(W, 'tc')).find((c) => (c.textContent ?? '').includes('Người làm đơn'))!;
    const ps = Array.from(cell.getElementsByTagNameNS(W, 'p'));
    const at = ps.findIndex((p) => (p.textContent ?? '').includes('Người làm đơn'));
    const target = ps[Math.min(ps.length - 1, at + 5)];
    let r = target.getElementsByTagNameNS(W, 'r')[0];
    if (!r) {
      r = doc.createElementNS(W, 'w:r');
      target.appendChild(r);
    }
    const t = doc.createElementNS(W, 'w:t');
    t.textContent = name;
    r.appendChild(t);
  }
  return new XMLSerializer().serializeToString(doc);
}

export async function buildNghiPhep(v: Values): Promise<Uint8Array> {
  const res = await fetch(NGHI_PHEP_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu gốc.');
  const entries = readZip(new Uint8Array(await res.arrayBuffer()));
  const i = entries.findIndex((e) => e.name === 'word/document.xml');
  entries[i] = await makeEntry('word/document.xml', fillNghiPhepXml(await unzipText(entries[i]), v));
  return writeZip(entries);
}
