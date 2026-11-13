// Lý lịch khoa học: điền thẳng vào file Mẫu 04/KHCN gốc (public/mau) để giữ nguyên phông, cỡ chữ và bố cục của mẫu.
// Ô nào để trống thì giữ nguyên dấu chấm của mẫu để điền tay.
import { readZip, unzipText, makeEntry, writeZip } from './zip';
import { dateLine, type Values } from './forms';

export const MAU04_URL = '/mau/Mau_04_KHCN_Ly_lich_khoa_hoc.docx';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const S = (v: Values, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const RW = (v: Values, k: string) => (Array.isArray(v[k]) ? (v[k] as string[][]).filter((r) => r.some((c) => c?.trim())) : []);
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function fillMau04Xml(xml: string, v: Values) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const kids = (el: Element, name: string) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).localName === name);
  const all = (el: Element, name: string) => Array.from(el.getElementsByTagNameNS(W, name));
  const el = (name: string) => doc.createElementNS(W, `w:${name}`);
  const body = all(doc.documentElement, 'body')[0];
  const top = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const tables = top.filter((n) => n.localName === 'tbl');
  const [, tInfo, tMain, tSign] = tables;
  const rowsOf = (t: Element) => kids(t, 'tr');
  const cellsOf = (tr: Element) => kids(tr, 'tc');
  const parasOf = (c: Element) => kids(c, 'p');
  const text = (p: Element) => all(p, 't').map((t) => t.textContent ?? '').join('');

  const rPrOf = (r: Element | undefined, plain: boolean) => {
    const rp = r && kids(r, 'rPr')[0];
    const c = (rp ? rp.cloneNode(true) : el('rPr')) as Element;
    if (plain) for (const k of [...kids(c, 'b'), ...kids(c, 'bCs'), ...kids(c, 'i'), ...kids(c, 'iCs')]) c.removeChild(k);
    return c;
  };
  const mkRun = (t: string, rPr: Element) => {
    const r = el('r');
    r.appendChild(rPr.cloneNode(true));
    const tt = el('t');
    tt.setAttribute('xml:space', 'preserve');
    tt.textContent = t;
    r.appendChild(tt);
    return r;
  };
  const markRPr = (p: Element) => {
    const pp = kids(p, 'pPr')[0];
    const m = pp && kids(pp, 'rPr')[0];
    return m ? (m.cloneNode(true) as Element) : el('rPr');
  };
  // Viết lại cả đoạn: các phần [chữ, đậm như nhãn gốc?].
  const rewrite = (p: Element, parts: [string, boolean][]) => {
    const runs = kids(p, 'r');
    const bold = rPrOf(runs[0], false);
    const plain = rPrOf(runs[runs.length - 1] ?? runs[0], true);
    for (const r of kids(p, 'r')) p.removeChild(r);
    for (const [t, b] of parts) if (t) p.appendChild(mkRun(t, b ? bold : plain));
  };
  // "Nhãn: giá trị" với nhãn lấy từ chữ gốc đến dấu hai chấm đầu tiên.
  const kv = (p: Element, value: string) => {
    if (!value) return;
    const label = text(p).split(':')[0].replace(/[.…\s]+$/, '').trim();
    rewrite(p, [[label, true], [`: ${value}`, false]]);
  };
  // Dòng số liệu "9.1. Số bài ...: 5".
  const count = (p: Element, value: string) => {
    if (!value) return;
    rewrite(p, [[text(p).replace(/[.…\s]+$/, '').trim().replace(/:?$/, ':'), false], [` ${value}`, false]]);
  };
  const setCell = (tc: Element, value: string) => {
    const p = parasOf(tc)[0];
    for (const extra of parasOf(tc).slice(1)) tc.removeChild(extra);
    const rp = kids(p, 'r')[0] ? rPrOf(kids(p, 'r')[0], true) : markRPr(p);
    for (const k of [...kids(rp, 'b'), ...kids(rp, 'bCs'), ...kids(rp, 'i'), ...kids(rp, 'iCs')]) rp.removeChild(k);
    for (const r of kids(p, 'r')) p.removeChild(r);
    lines(value).forEach((ln, i) => {
      if (i) p.appendChild(el('r')).appendChild(el('br'));
      p.appendChild(mkRun(ln, rp));
    });
  };
  // Điền các dòng dữ liệu vào bảng: dùng các dòng trống có sẵn, thiếu thì nhân bản dòng cuối, thừa dòng "…" thì bỏ.
  const fillRows = (slots: Element[], data: string[][], o: { tt?: boolean; keepFirst?: boolean } = {}) => {
    if (!data.length) return;
    const last = slots[slots.length - 1];
    const tmpl = (text(last).trim() === '…' ? slots[slots.length - 2] ?? last : last).cloneNode(true) as Element;
    const used: Element[] = [];
    data.forEach((r, i) => {
      let tr = slots[i];
      if (!tr || text(tr).trim() === '…') {
        tr = tmpl.cloneNode(true) as Element;
        (used[used.length - 1] ?? slots[0]).after(tr);
      }
      used.push(tr);
      const cs = cellsOf(tr);
      const off = o.tt ? 1 : 0;
      if (o.tt) setCell(cs[0], String(i + 1));
      r.forEach((c, j) => {
        if (cs[j + off] && !(o.keepFirst && j === 0 && !c?.trim())) setCell(cs[j + off], c ?? '');
      });
    });
    for (const s of slots) if (!used.includes(s)) s.parentNode?.removeChild(s);
  };
  // Danh sách [1] … [n] thay cho các dòng chấm của mẫu.
  const fillList = (ps: Element[], items: string[]) => {
    if (!items.length) return;
    const tmpl = ps[0];
    let after = tmpl;
    items.forEach((t, i) => {
      const p = i < ps.length ? ps[i] : (tmpl.cloneNode(true) as Element);
      if (i >= ps.length) { after.after(p); }
      rewrite(p, [[`[${i + 1}] ${t}`, false]]);
      after = p;
    });
    for (const p of ps.slice(items.length)) p.parentNode?.removeChild(p);
  };

  // ---- Bảng thông tin chung ----
  const R6 = rowsOf(tInfo);
  kv(parasOf(cellsOf(R6[0])[0])[0], S(v, 'hoTen'));
  {
    const p = parasOf(cellsOf(R6[1])[0])[0];
    if (S(v, 'namSinh') || S(v, 'gioiTinh')) rewrite(p, [['2. Năm sinh', true], [`: ${S(v, 'namSinh') || '…………'}`, false], ['            Giới tính', true], [`: ${S(v, 'gioiTinh') || '……'}`, false]]);
  }
  {
    const [p0, p1, p2] = parasOf(cellsOf(R6[2])[0]);
    kv(p0, S(v, 'diaChi'));
    if (S(v, 'dienThoai')) rewrite(p1, [[`Điện thoại: ${S(v, 'dienThoai')}`, false]]);
    kv(p2, S(v, 'email'));
  }
  {
    const [, p1, p2, p3, p4] = parasOf(cellsOf(R6[3])[0]);
    kv(p1, S(v, 'hocVi'));
    kv(p2, S(v, 'hocHam'));
    if (S(v, 'pgsNam') || S(v, 'pgsNoi')) rewrite(p3, [[`Năm được bổ nhiệm chức danh Phó Giáo sư: ${S(v, 'pgsNam') || '………'}     Tổ chức bổ nhiệm: ${S(v, 'pgsNoi') || '……………………'}`, false]]);
    if (S(v, 'gsNam') || S(v, 'gsNoi')) rewrite(p4, [[`Năm được bổ nhiệm chức danh Giáo sư: ${S(v, 'gsNam') || '………'}     Tổ chức bổ nhiệm: ${S(v, 'gsNoi') || '……………………'}`, false]]);
  }
  {
    const [, p1, p2, p3, p4, p5] = parasOf(cellsOf(R6[4])[0]);
    kv(p1, S(v, 'coQuanCt'));
    kv(p2, S(v, 'boMon'));
    kv(p3, S(v, 'diaChiCq'));
    if (S(v, 'dtCq')) rewrite(p4, [[`Điện thoại: ${S(v, 'dtCq')}`, false]]);
    kv(p5, S(v, 'emailCq'));
  }
  fillRows(R6.slice(7, 11), RW(v, 'daoTao'), { keepFirst: true });
  fillRows(R6.slice(13, 15), RW(v, 'khoaKhac'));

  // ---- Bảng công trình, nhiệm vụ, đào tạo ----
  const R8 = rowsOf(tMain);
  fillList(parasOf(cellsOf(R8[0])[0]).slice(2, 4), lines(S(v, 'sach')));
  {
    const ps = parasOf(cellsOf(R8[1])[0]);
    count(ps[1], S(v, 'wos'));
    count(ps[2], S(v, 'qtKhac'));
    count(ps[3], S(v, 'trongNuoc'));
    count(ps[4], S(v, 'hoiNghi'));
    fillList(ps.slice(6, 9), lines(S(v, 'congBo')));
  }
  fillRows(R8.slice(4, 7), RW(v, 'shtt'), { tt: true });
  {
    const ps = parasOf(cellsOf(R8[7])[0]);
    count(ps[1], S(v, 'spNuocNgoai'));
    count(ps[2], S(v, 'spTrongNuoc'));
  }
  fillRows(R8.slice(9, 12), RW(v, 'sanPham'), { tt: true });
  fillRows(R8.slice(14, 17), RW(v, 'chuNhiem'));
  fillRows(R8.slice(19, 22), RW(v, 'thamGia'));
  {
    const ps = parasOf(cellsOf(R8[22])[0]);
    count(ps[1], S(v, 'tsDaDt'));
    count(ps[2], S(v, 'ncsDang'));
    count(ps[3], S(v, 'thsDaDt'));
  }
  fillRows(R8.slice(25, 27), RW(v, 'ncs'), { tt: true });
  fillRows(R8.slice(28, 30), RW(v, 'ths'), { tt: true });
  {
    const c = cellsOf(R8[31])[0];
    const ps = parasOf(c);
    const rp = rPrOf(kids(ps[0], 'r')[0], true);
    lines(S(v, 'khac')).forEach((t, i) => {
      let p = ps[i + 1];
      if (!p) { p = ps[ps.length - 1].cloneNode(true) as Element; c.appendChild(p); ps.push(p); }
      for (const r of kids(p, 'r')) p.removeChild(r);
      p.appendChild(mkRun(t, rp));
    });
  }

  // ---- Ngày khai, người khai ----
  const dateP = top[top.indexOf(tSign) - 1];
  if (dateP && /ngày/.test(text(dateP))) {
    const r = kids(dateP, 'r')[0];
    const rp = rPrOf(r, false);
    for (const x of kids(dateP, 'r')) dateP.removeChild(x);
    dateP.appendChild(mkRun(dateLine(S(v, 'diaDanh'), S(v, 'ngay')), rp));
  }
  if (S(v, 'hoTen')) {
    const c = cellsOf(rowsOf(tSign)[0])[1];
    const ps = parasOf(c);
    const head = ps[0];
    const blank = ps[ps.length - 1];
    for (let i = 0; i < 3; i++) c.appendChild(blank.cloneNode(true));
    const name = head.cloneNode(true) as Element;
    const rp = rPrOf(kids(head, 'r')[0], false);
    for (const x of kids(name, 'r')) name.removeChild(x);
    name.appendChild(mkRun(S(v, 'hoTen'), rp));
    c.appendChild(name);
  }
  return new XMLSerializer().serializeToString(doc);
}

export async function buildMau04(v: Values): Promise<Uint8Array> {
  const res = await fetch(MAU04_URL);
  if (!res.ok) throw new Error('Không tải được file mẫu gốc.');
  const entries = readZip(new Uint8Array(await res.arrayBuffer()));
  const i = entries.findIndex((e) => e.name === 'word/document.xml');
  entries[i] = await makeEntry('word/document.xml', fillMau04Xml(await unzipText(entries[i]), v));
  return writeZip(entries);
}
