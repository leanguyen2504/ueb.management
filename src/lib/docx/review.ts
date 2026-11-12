// Rà soát thể thức văn bản hành chính trong file Word (.docx) và tạo bản đã chỉnh.
// Làm theo quy tắc rà soát của tổ thư ký (Nghị định 30/2020/NĐ-CP, Phụ lục I, III, VI).
// Chạy hoàn toàn trong trình duyệt: file không gửi lên máy chủ, không gọi dịch vụ AI.
import {
  PPR_ORDER, RPR_ORDER, SECT_ORDER, attr, child, children, decode, el, encode, ensure, findAll, isEl,
  parseXml, removeChild, serialize, setAttr, type XEl, type XNode,
} from './xml';
import { makeEntry, readZip, unzipText, writeZip, type ZipEntry } from './zip';
import { TEXT_RULES, checkText, type Level, type TextRule } from './text-rules';

export type Issue = { level: Level; where: string; current: string; fix: string; reason: string; fixed: boolean };
export type ReviewResult = {
  docType: string;
  verdict: string;
  issues: Issue[];
  notChecked: string[];
  output: Uint8Array;
  fixedCount: number;
};

export const TNR = 'Times New Roman';
const ND30 = 'Phụ lục I, Nghị định 30/2020/NĐ-CP';

// Tên loại văn bản hành chính và chữ viết tắt (Phụ lục III).
export const DOC_TYPES: [string, string][] = [
  ['NGHỊ QUYẾT', 'NQ'], ['QUYẾT ĐỊNH', 'QĐ'], ['CHỈ THỊ', 'CT'], ['QUY CHẾ', 'QC'], ['QUY ĐỊNH', 'QyĐ'],
  ['THÔNG CÁO', 'TC'], ['THÔNG BÁO', 'TB'], ['HƯỚNG DẪN', 'HD'], ['CHƯƠNG TRÌNH', 'CTr'], ['KẾ HOẠCH', 'KH'],
  ['PHƯƠNG ÁN', 'PA'], ['ĐỀ ÁN', 'ĐA'], ['DỰ ÁN', 'DA'], ['BÁO CÁO', 'BC'], ['BIÊN BẢN', 'BB'], ['TỜ TRÌNH', 'TTr'],
  ['HỢP ĐỒNG', 'HĐ'], ['CÔNG ĐIỆN', 'CĐ'], ['BẢN GHI NHỚ', 'BGN'], ['BẢN THỎA THUẬN', 'BTT'], ['GIẤY ỦY QUYỀN', 'GUQ'],
  ['GIẤY MỜI', 'GM'], ['GIẤY GIỚI THIỆU', 'GGT'], ['GIẤY NGHỈ PHÉP', 'GNP'], ['PHIẾU GỬI', 'PG'], ['PHIẾU CHUYỂN', 'PC'],
  ['PHIẾU BÁO', 'PB'], ['THƯ CÔNG', ''],
];
const TYPE_ABBR = new Map(DOC_TYPES);

// ---------------------------------------------------------------- tiện ích chữ
const nfc = (s: string) => s.normalize('NFC');
const toneFix = (s: string) => s.replace(/OÀ/g, 'ÒA').replace(/oà/g, 'òa').replace(/UỶ/g, 'ỦY').replace(/uỷ/g, 'ủy').replace(/OẢ/g, 'ỎA').replace(/oả/g, 'ỏa');
const norm = (s: string) => toneFix(nfc(s)).replace(/\s+/g, ' ').trim();
const isUpper = (s: string) => /\p{L}/u.test(s) && s === s.toUpperCase();
const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const pt = (half: number | undefined) => (half === undefined ? '?' : String(half / 2).replace('.', ','));
const mm = (tw: number) => String(Math.round((tw / 1440) * 254) / 10).replace('.', ',');

// ---------------------------------------------------------------- kiểu (styles.xml)
type Style = { id: string; type: string; basedOn?: string; pPr?: XEl; rPr?: XEl; isDefault: boolean };

class Styles {
  map = new Map<string, Style>();
  defR?: XEl;
  defP?: XEl;
  defaultPara?: string;
  defaultChar?: string;
  constructor(public root: XNode[] | null) {
    const styles = root?.find((n): n is XEl => isEl(n, 'w:styles'));
    if (!styles) return;
    const dd = child(styles, 'w:docDefaults');
    this.defR = child(child(dd, 'w:rPrDefault'), 'w:rPr');
    this.defP = child(child(dd, 'w:pPrDefault'), 'w:pPr');
    for (const s of children(styles, 'w:style')) {
      const st: Style = {
        id: attr(s, 'w:styleId') ?? '', type: attr(s, 'w:type') ?? '', basedOn: attr(child(s, 'w:basedOn'), 'w:val'),
        pPr: child(s, 'w:pPr'), rPr: child(s, 'w:rPr'), isDefault: ['1', 'true', 'on'].includes(attr(s, 'w:default') ?? ''),
      };
      this.map.set(st.id, st);
      if (st.isDefault && st.type === 'paragraph') this.defaultPara = st.id;
      if (st.isDefault && st.type === 'character') this.defaultChar = st.id;
    }
  }
  chain(id: string | undefined): Style[] {
    const out: Style[] = [];
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const s = this.map.get(id);
      if (!s) break;
      out.push(s);
      id = s.basedOn;
    }
    return out;
  }
}

// ---------------------------------------------------------------- đoạn văn
type Seg = { node: XEl | null; text: string; run: XEl }; // node null: ký tự cố định (tab, xuống dòng)
type Para = {
  el: XEl;
  idx: number;
  container: string; // 'body' hoặc 't<bảng>r<dòng>c<cột>'
  table: number; // -1 nếu không nằm trong bảng
  runs: XEl[];
  text: string; // đã chuẩn hóa
};

const SKIP_IN_P = new Set(['w:pPr', 'w:rPr', 'w:del', 'w:drawing', 'w:pict', 'mc:AlternateContent', 'w:object', 'w:moveFrom', 'w:txbxContent']);

function runsOf(p: XEl): XEl[] {
  return findAll(p.kids, (e) => e.name === 'w:r', (e) => SKIP_IN_P.has(e.name));
}

function segsOf(p: XEl): Seg[] {
  const out: Seg[] = [];
  for (const r of runsOf(p)) {
    for (const k of r.kids) {
      if (!isEl(k)) continue;
      if (k.name === 'w:t') out.push({ node: k, text: decode(k.kids.map((x) => (x.t === 'text' ? x.raw : '')).join('')), run: r });
      else if (k.name === 'w:tab' || k.name === 'w:ptab') out.push({ node: null, text: '\t', run: r });
      else if (k.name === 'w:br' || k.name === 'w:cr') out.push({ node: null, text: '\n', run: r });
      else if (k.name === 'w:noBreakHyphen') out.push({ node: null, text: '-', run: r });
    }
  }
  return out;
}

const paraText = (p: XEl) => segsOf(p).map((s) => s.text).join('');

function setT(node: XEl, text: string) {
  node.kids = text ? [{ t: 'text', raw: encode(text) }] : [];
  setAttr(node, 'xml:space', /^\s|\s$/.test(text) ? 'preserve' : null);
}

// Thay đoạn [start, end) trong chữ của đoạn văn, giữ định dạng của run chứa vị trí bắt đầu.
function editPara(p: XEl, start: number, end: number, rep: string): boolean {
  const segs = segsOf(p);
  let pos = 0;
  let placed = false;
  for (const s of segs) {
    const a = pos;
    const b = pos + s.text.length;
    pos = b;
    const overlaps = b > start && a < end;
    const holds = !placed && start >= a && (start < b || (start === b && end === start && s.node));
    if (!overlaps && !holds) continue;
    if (!s.node) {
      if (overlaps) return false; // không xóa tab, xuống dòng
      continue;
    }
    const from = Math.max(start, a) - a;
    const to = Math.min(end, b) - a;
    let t = s.text.slice(0, from) + (placed ? '' : rep) + s.text.slice(to);
    if (!placed && from === 0 && to === 0 && start === b) t = s.text + rep; // chèn cuối run
    placed = true;
    setT(s.node, t);
  }
  if (!placed && rep && segs.length) {
    const lastText = [...segs].reverse().find((s) => s.node);
    if (!lastText?.node) return false;
    setT(lastText.node, lastText.text + rep);
    placed = true;
  }
  return placed;
}

// Đặt lại toàn bộ chữ của đoạn: chỉ sửa phần khác nhau ở giữa.
function replaceParaText(p: XEl, next: string) {
  const cur = paraText(p);
  if (cur === next) return false;
  let a = 0;
  while (a < cur.length && a < next.length && cur[a] === next[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < next.length - a && cur[cur.length - 1 - b] === next[next.length - 1 - b]) b++;
  return editPara(p, a, cur.length - b, next.slice(a, next.length - b));
}

// Áp một quy tắc chữ lên đoạn văn, sửa từng chỗ một để giữ định dạng xung quanh.
function applyRule(p: XEl, rule: TextRule, hits: { count: number; example?: string; fixed?: string }) {
  let guard = 0;
  let from = 0;
  while (guard++ < 500) {
    const text = paraText(p);
    const re = new RegExp(rule.re.source, rule.re.flags);
    re.lastIndex = from;
    const m = re.exec(text);
    if (!m) break;
    if (m[0] === '') { from = m.index + 1; continue; }
    const rep = rule.fix(m);
    if (rep === m[0]) { from = m.index + m[0].length; continue; }
    if (!editPara(p, m.index, m.index + m[0].length, rep)) { from = m.index + m[0].length; continue; }
    hits.count++;
    if (!hits.example) {
      const a = Math.max(0, m.index - 20);
      hits.example = text.slice(a, m.index + m[0].length + 20);
      hits.fixed = text.slice(a, m.index) + rep + text.slice(m.index + m[0].length, m.index + m[0].length + 20);
    }
    from = m.index + rep.length;
  }
}

// ---------------------------------------------------------------- định dạng
const on = (e: XEl | undefined) => !!e && !['0', 'false', 'off'].includes(attr(e, 'w:val') ?? '');

class Fmt {
  constructor(private st: Styles) {}
  private runChain(r: XEl, p: XEl): (XEl | undefined)[] {
    const rPr = child(r, 'w:rPr');
    const pPr = child(p, 'w:pPr');
    const rs = this.st.chain(attr(child(rPr, 'w:rStyle'), 'w:val') ?? this.st.defaultChar).map((s) => s.rPr);
    const ps = this.st.chain(attr(child(pPr, 'w:pStyle'), 'w:val') ?? this.st.defaultPara).map((s) => s.rPr);
    return [rPr, ...rs, ...ps, this.st.defR];
  }
  private paraChain(p: XEl): (XEl | undefined)[] {
    const pPr = child(p, 'w:pPr');
    const ps = this.st.chain(attr(child(pPr, 'w:pStyle'), 'w:val') ?? this.st.defaultPara).map((s) => s.pPr);
    return [pPr, ...ps, this.st.defP];
  }
  size(r: XEl, p: XEl): number {
    for (const rp of this.runChain(r, p)) {
      const v = attr(child(rp, 'w:sz'), 'w:val');
      if (v) return Number(v);
    }
    return 20;
  }
  bool(r: XEl, p: XEl, name: 'w:b' | 'w:i' | 'w:caps'): boolean {
    for (const rp of this.runChain(r, p)) {
      const e = child(rp, name);
      if (e) return on(e);
    }
    return false;
  }
  font(r: XEl, p: XEl): string {
    for (const rp of this.runChain(r, p)) {
      const f = child(rp, 'w:rFonts');
      if (!f) continue;
      const v = attr(f, 'w:ascii') ?? attr(f, 'w:hAnsi');
      if (v) return v;
      if (attr(f, 'w:asciiTheme') || attr(f, 'w:hAnsiTheme')) return '(phông theo chủ đề)';
    }
    return '(mặc định)';
  }
  color(r: XEl): string | null {
    const c = child(child(r, 'w:rPr'), 'w:color');
    const v = attr(c, 'w:val');
    if (!c || !v || /^(auto|000000)$/i.test(v)) return null;
    return v;
  }
  jc(p: XEl): string {
    for (const pp of this.paraChain(p)) {
      const v = attr(child(pp, 'w:jc'), 'w:val');
      if (v) return v;
    }
    return 'left';
  }
  ind(p: XEl, a: string): number | undefined {
    for (const pp of this.paraChain(p)) {
      const v = attr(child(pp, 'w:ind'), a);
      if (v !== undefined) return Number(v);
    }
    return undefined;
  }
  spacing(p: XEl, a: string): string | undefined {
    for (const pp of this.paraChain(p)) {
      const v = attr(child(pp, 'w:spacing'), a);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  hasNum(p: XEl): boolean {
    return this.paraChain(p).some((pp) => !!child(pp, 'w:numPr'));
  }
}

const rPrOf = (r: XEl) => ensure(r, 'w:rPr', [], true);
const pPrOf = (p: XEl) => ensure(p, 'w:pPr', [], true);

function setFonts(rPr: XEl) {
  const f = ensure(rPr, 'w:rFonts', RPR_ORDER);
  for (const a of ['w:asciiTheme', 'w:hAnsiTheme', 'w:cstheme', 'w:eastAsiaTheme']) setAttr(f, a, null);
  for (const a of ['w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia']) setAttr(f, a, TNR);
}

function setBool(rPr: XEl, name: string, v: boolean) {
  const e = ensure(rPr, name, RPR_ORDER);
  setAttr(e, 'w:val', v ? null : '0');
  const cs = name === 'w:b' ? 'w:bCs' : name === 'w:i' ? 'w:iCs' : null;
  if (cs) setAttr(ensure(rPr, cs, RPR_ORDER), 'w:val', v ? null : '0');
}

function setSize(rPr: XEl, half: number) {
  setAttr(ensure(rPr, 'w:sz', RPR_ORDER), 'w:val', String(half));
  setAttr(ensure(rPr, 'w:szCs', RPR_ORDER), 'w:val', String(half));
}

function setJc(p: XEl, v: string) {
  setAttr(ensure(pPrOf(p), 'w:jc', PPR_ORDER), 'w:val', v);
}

// ---------------------------------------------------------------- phân tích bố cục
function collectParas(body: XEl): Para[] {
  const out: Para[] = [];
  let tables = 0;
  const walk = (nodes: XNode[], container: string, table: number) => {
    for (const n of nodes) {
      if (!isEl(n)) continue;
      if (n.name === 'w:p') {
        out.push({ el: n, idx: out.length, container, table, runs: runsOf(n), text: norm(paraText(n)) });
      } else if (n.name === 'w:tbl') {
        const t = tables++;
        children(n, 'w:tr').forEach((tr, ri) => {
          children(tr, 'w:tc').forEach((tc, ci) => walk(tc.kids, `t${t}r${ri}c${ci}`, table >= 0 ? table : t));
        });
      } else if (n.name === 'w:sdt') {
        walk(child(n, 'w:sdtContent')?.kids ?? [], container, table);
      } else if (['w:customXml', 'w:smartTag', 'w:ins'].includes(n.name)) {
        walk(n.kids, container, table);
      }
    }
  };
  walk(body.kids, 'body', -1);
  return out;
}

const QH_RE = /^CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM$/i;
const TN_RE = /^Độc lập\s*[-–—]\s*Tự do\s*[-–—]\s*Hạnh phúc$/i;
const SO_RE = /^Số\s*[:.]?/;
const DATE_RE = /^(.*?)\s*,?\s*ngày\s*(\S*?)\s*tháng\s*(\S*?)\s*năm\s*(\d{4}|\S*)\s*(.*)$/i;
const SIGN_RE = /^(TM|KT|TL|TUQ|Q)\.\s*\S/;
const ROLE_WORDS = /(TRƯỞNG|GIÁM ĐỐC|CHỦ TỊCH|THƯ KÝ|CHỦ TỌA|CHỦ TRÌ|NGƯỜI LẬP|NGƯỜI VIẾT|BÍ THƯ|ĐẠI DIỆN|NGƯỜI BÁO CÁO|NGƯỜI ĐỀ NGHỊ|XÁC NHẬN|CHUYÊN VIÊN|NGƯỜI NHẬN|NGƯỜI GIAO|TỔNG BIÊN TẬP)/;
const isRoleLine = (t: string) => (SIGN_RE.test(t) || (isUpper(t) && ROLE_WORDS.test(t))) && t.split(' ').length <= 12 && !/[:;]$/.test(t) && !/^([IVXLC]+|\d+)[.)]/.test(t);
const isNameLine = (t: string) => {
  const w = t.replace(/^((GS|PGS|TS|ThS|CN|KS|BS|NCS)\.\s*)+/, '').split(' ');
  return w.length >= 2 && w.length <= 6 && w.every((x) => /^\p{Lu}[\p{Ll}]*$/u.test(x));
};
const upSym = (s: string) => s.toUpperCase().replace(/QYĐ/g, 'QyĐ').replace(/TTR/g, 'TTr').replace(/CTR/g, 'CTr');
const DASH_LINE = /^\s*[-–—+•]/;

// ---------------------------------------------------------------- giữ phần ký liền nội dung
const TRPR_ORDER = ['w:cnfStyle', 'w:divId', 'w:gridBefore', 'w:gridAfter', 'w:wBefore', 'w:wAfter', 'w:cantSplit', 'w:trHeight', 'w:tblHeader', 'w:tblCellSpacing', 'w:jc', 'w:hidden', 'w:ins', 'w:del', 'w:trPrChange'];
const isBlankPara = (p: XEl) => !norm(paraText(p)) && !findAll([p], (e) => e.name === 'w:drawing' || e.name === 'w:pict' || e.name === 'w:object').length;
function dropPageBreaks(p: XEl): number {
  let n = 0;
  const pPr = child(p, 'w:pPr');
  const pb = child(pPr, 'w:pageBreakBefore');
  if (pPr && pb && !['0', 'false', 'off'].includes(attr(pb, 'w:val') ?? '')) { removeChild(pPr, 'w:pageBreakBefore'); n++; }
  for (const r of findAll([p], (e) => e.name === 'w:r')) {
    const before = r.kids.length;
    r.kids = r.kids.filter((k) => !(isEl(k, 'w:br') && attr(k, 'w:type') === 'page'));
    n += before - r.kids.length;
  }
  return n;
}
function setKeep(p: XEl, lines = true): boolean {
  const pPr = pPrOf(p);
  const had = !!child(pPr, 'w:keepNext') && !['0', 'false', 'off'].includes(attr(child(pPr, 'w:keepNext'), 'w:val') ?? '');
  setAttr(ensure(pPr, 'w:keepNext', PPR_ORDER), 'w:val', '1');
  if (lines) setAttr(ensure(pPr, 'w:keepLines', PPR_ORDER), 'w:val', '1');
  return !had;
}
// Đánh dấu "giữ với đoạn sau" cho 2 đoạn nội dung cuối và mọi dòng trống trước phần ký, bỏ ngắt trang,
// bớt dòng trống thừa và không cho bảng chữ ký tách qua hai trang.
function keepSignWithBody(body: XEl, signEls: XEl[]) {
  const res = { breaks: 0, empties: 0, kept: false };
  const tops = body.kids.filter((k): k is XEl => isEl(k) && k.name !== 'w:sectPr');
  const holds = (t: XEl, e: XEl) => t === e || findAll([t], (x) => x === e).length > 0;
  const signTops = tops.filter((t) => signEls.some((e) => holds(t, e)));
  if (!signTops.length) return res;
  const first = tops.indexOf(signTops[0]);
  const last = tops.indexOf(signTops[signTops.length - 1]);
  // Khối ký: không ngắt trang, bảng không tách dòng, các đoạn rời giữ liền nhau.
  for (let i = first; i <= last; i++) {
    const t = tops[i];
    res.breaks += t.name === 'w:p' ? dropPageBreaks(t) : findAll([t], (e) => e.name === 'w:p').reduce((a, p) => a + dropPageBreaks(p), 0);
    if (t.name === 'w:tbl') {
      for (const tr of children(t, 'w:tr')) {
        const trPr = ensure(tr, 'w:trPr', ['w:tblPrEx', 'w:trPr', 'w:tc'], true);
        if (!child(trPr, 'w:cantSplit')) { ensure(trPr, 'w:cantSplit', TRPR_ORDER); res.kept = true; }
      }
    } else if (t.name === 'w:p' && i < last) {
      if (setKeep(t, false)) res.kept = true;
    }
  }
  // Ngược lên trên: các dòng trống và 2 đoạn có chữ gần nhất.
  let content = 0;
  let blanks: XEl[] = [];
  for (let i = first - 1; i >= 0 && content < 2; i--) {
    const t = tops[i];
    if (t.name === 'w:tbl') {
      const rows = children(t, 'w:tr');
      const lastRow = rows[rows.length - 1];
      if (lastRow) for (const p of findAll([lastRow], (e) => e.name === 'w:p')) if (setKeep(p, false)) res.kept = true;
      break;
    }
    if (t.name !== 'w:p') continue;
    if (child(child(t, 'w:pPr'), 'w:sectPr')) break; // ngắt phần: không đụng tới
    res.breaks += dropPageBreaks(t);
    if (isBlankPara(t)) { blanks.push(t); continue; }
    if (content === 0 && blanks.length > 1) {
      // Giữ lại 1 dòng trống (dòng sát phần ký), xóa các dòng còn lại.
      const extra = blanks.slice(1);
      body.kids = body.kids.filter((k) => !extra.includes(k as XEl));
      res.empties += extra.length;
      blanks = blanks.slice(0, 1);
    }
    for (const b of blanks) setKeep(b, false);
    blanks = [];
    if (setKeep(t, content > 0)) res.kept = true;
    content++;
  }
  return res;
}

// ---------------------------------------------------------------- rà soát
export async function reviewDocx(input: Uint8Array): Promise<ReviewResult> {
  let entries: ZipEntry[];
  try {
    entries = readZip(input);
  } catch {
    throw new Error('Không đọc được file. Hãy lưu lại thành Word (.docx) rồi thử lại; file .doc cũ hoặc PDF chưa đọc được.');
  }
  const byName = new Map(entries.map((e) => [e.name, e]));
  const docEntry = byName.get('word/document.xml');
  if (!docEntry) throw new Error('File không có nội dung Word (thiếu word/document.xml). Hãy lưu lại thành .docx.');
  const doc = parseXml(await unzipText(docEntry));
  const stylesEntry = byName.get('word/styles.xml');
  const stylesXml = stylesEntry ? parseXml(await unzipText(stylesEntry)) : null;
  const st = new Styles(stylesXml);
  const fmt = new Fmt(st);
  const root = doc.find((n): n is XEl => isEl(n, 'w:document'));
  const body = child(root, 'w:body');
  if (!root || !body) throw new Error('File Word không có phần nội dung.');

  const issues: Issue[] = [];
  const add = (level: Level, where: string, current: string, fix: string, reason: string, fixed: boolean) =>
    issues.push({ level, where, current: short(current, 110), fix: short(fix, 110), reason, fixed });

  const paras = collectParas(body);
  const nonEmpty = paras.filter((p) => p.text);
  const first = (pred: (p: Para) => boolean, from = 0, to = 40) => nonEmpty.filter((p) => p.idx >= from).slice(0, to).find(pred);

  // ---- Nhận diện các thành phần
  const qh = first((p) => QH_RE.test(p.text.replace(/\t.*$/, '')) || /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/i.test(p.text));
  const tn = first((p) => TN_RE.test(p.text) || /Độc lập\s*[-–—]\s*Tự do/i.test(p.text));
  const so = first((p) => SO_RE.test(p.text) && /\//.test(p.text), 0, 25);
  const date = first((p) => DATE_RE.test(p.text) && p.text.length < 90 && !/^(Hôm nay|Vào|Từ)/i.test(p.text), 0, 25);
  const vv = first((p) => /^V\s*\/\s*v\b/i.test(p.text), 0, 25);
  const draft = nonEmpty.slice(0, 15).some((p) => /DỰ THẢO|Dự thảo lần/i.test(p.text));
  const headerEnd = Math.max(-1, ...[qh, tn, so, date, vv].filter(Boolean).map((p) => p!.idx));
  const tenLoai = first((p) => TYPE_ABBR.has(p.text.toUpperCase()) && isUpper(p.text), headerEnd + 1, 6);
  let docType = tenLoai ? tenLoai.text.toUpperCase() : vv ? 'CÔNG VĂN' : '';
  // Trích yếu: một hoặc hai dòng ngay dưới tên loại.
  const trichYeu: Para[] = [];
  if (tenLoai) {
    const after = nonEmpty.filter((p) => p.idx > tenLoai.idx && p.container === tenLoai.container);
    for (const p of after.slice(0, 3)) {
      if (/^(Căn cứ|Kính gửi|Theo|Hôm nay|Thực hiện|Vào hồi|[IVX]+\.|\d+\.)/i.test(p.text) || p.text.length > 200) break;
      if (trichYeu.length && fmt.jc(p.el) !== 'center') break;
      trichYeu.push(p);
      if (/[.:;]$/.test(p.text)) break;
    }
  }
  const noiNhan = nonEmpty.find((p) => /^Nơi nhận\s*:?$/i.test(p.text) || /^Nơi nhận\s*:/i.test(p.text));
  const noiNhanList: Para[] = [];
  if (noiNhan) {
    for (const p of paras.filter((x) => x.idx > noiNhan.idx && x.container === noiNhan.container)) {
      if (!p.text) { if (noiNhanList.length) break; continue; }
      if (!DASH_LINE.test(p.text)) break;
      noiNhanList.push(p);
    }
  }
  // Dòng thẩm quyền ban hành ngay dưới trích yếu (ví dụ "HIỆU TRƯỞNG TRƯỜNG ĐẠI HỌC KINH TẾ").
  const lastTy = trichYeu[trichYeu.length - 1];
  const thamQuyen = lastTy ? nonEmpty.find((p) => p.idx > lastTy.idx && p.container === lastTy.container && isUpper(p.text) && !/:$/.test(p.text) && !TYPE_ABBR.has(p.text) && !/^(QUYẾT ĐỊNH|[IVX]+\.)/.test(p.text)) : undefined;
  const thamQuyenOk = thamQuyen && nonEmpty.filter((p) => p.idx > lastTy!.idx && p.container === lastTy!.container)[0] === thamQuyen ? thamQuyen : undefined;
  const startBody = Math.max(thamQuyenOk?.idx ?? -1, headerEnd, tenLoai?.idx ?? -1, ...trichYeu.map((p) => p.idx));
  // Chữ ký: bảng hoặc phần cuối có dòng chức vụ in hoa.
  const tailFrom = nonEmpty[Math.max(0, nonEmpty.length - 15)]?.idx ?? 0;
  const roleParas = nonEmpty.filter((p) => p.idx > startBody && isRoleLine(p.text) && p !== noiNhan && (p.table >= 0 || p.idx >= tailFrom));
  const signContainers = new Set(roleParas.map((p) => (p.table >= 0 ? p.container : 'body')));
  const signParas: Para[] = [];
  for (const c of signContainers) {
    if (c === 'body') {
      // Khối chữ ký ở cuối: dòng chức vụ cuối cùng và các dòng chức vụ liền trước nó.
      const bodyRoles = roleParas.filter((p) => p.container === 'body');
      const ne = nonEmpty.filter((p) => p.container === 'body' && p !== noiNhan && !noiNhanList.includes(p));
      let k = ne.indexOf(bodyRoles[bodyRoles.length - 1]);
      while (k > 0 && isRoleLine(ne[k - 1].text)) k--;
      const firstRole = ne[k];
      signParas.push(...nonEmpty.filter((p) => p.container === 'body' && p.idx >= firstRole.idx && p !== noiNhan && !noiNhanList.includes(p) && p.text.length < 80));
    } else {
      signParas.push(...nonEmpty.filter((p) => p.container === c && p !== noiNhan && !noiNhanList.includes(p)));
    }
  }
  const bodyEnd = Math.min(noiNhan?.idx ?? Infinity, ...signParas.filter((p) => p.container === 'body').map((p) => p.idx), ...signParas.map((p) => (p.table >= 0 ? p.idx : Infinity)));
  // Bảng chứa chữ ký: bỏ các đoạn trong cùng bảng khỏi phần nội dung.
  const headerTable = [qh, so, date].find((p) => p && p.table >= 0)?.table ?? -2;
  const bodyParas = nonEmpty.filter((p) => p.idx > startBody && p.idx < bodyEnd && p.table < 0 && p !== vv);
  const isCongVan = docType === 'CÔNG VĂN';

  if (!docType) {
    const guess = nonEmpty.slice(0, 12).find((p) => [...TYPE_ABBR.keys()].some((k) => p.text.toUpperCase().startsWith(k)));
    docType = guess ? guess.text.toUpperCase().split(' ').slice(0, 2).join(' ') : 'văn bản chưa rõ loại';
  }
  const abbr = TYPE_ABBR.get(docType);
  const loose = !qh && !tn && !so; // văn bản nội bộ không chính thức: chỉ soát chữ

  // ---- 1. Trang: khổ giấy, lề
  const sects = findAll([body], (e) => e.name === 'w:sectPr');
  const firstSect = sects[0];
  sects.forEach((s, i) => {
    const pg = child(s, 'w:pgSz');
    const w = Number(attr(pg, 'w:w') ?? 0);
    const h = Number(attr(pg, 'w:h') ?? 0);
    const land = attr(pg, 'w:orient') === 'landscape' || w > h;
    const where = sects.length > 1 ? `Trang (phần ${i + 1})` : 'Trang';
    const [a, b] = land ? [h, w] : [w, h];
    if (pg && (Math.abs(a - 11906) > 30 || Math.abs(b - 16838) > 30)) {
      setAttr(pg, 'w:w', land ? '16838' : '11906');
      setAttr(pg, 'w:h', land ? '11906' : '16838');
      add('trung-binh', where, `Khổ ${mm(w)} x ${mm(h)} mm`, 'Khổ A4 (210 x 297 mm)', `Văn bản trình bày trên khổ A4 (${ND30}).`, true);
    }
    if (land && i === sects.length - 1 && sects.length === 1) add('trung-binh', where, 'Trang xoay ngang', 'Trang dọc', `Văn bản trình bày theo chiều dài khổ A4; chỉ phụ lục, bảng biểu mới xoay ngang (${ND30}).`, false);
    const mg = child(s, 'w:pgMar');
    if (!mg) return;
    const ranges: [string, string, number, number][] = [['w:top', 'trên', 1134, 1418], ['w:bottom', 'dưới', 1134, 1418], ['w:left', 'trái', 1701, 1985], ['w:right', 'phải', 851, 1134]];
    // Trang ngang: lề trái/phải theo cạnh dài.
    const wrong: string[] = [];
    const fixed: string[] = [];
    for (const [k, label, lo, hi] of ranges) {
      const v = Math.abs(Number(attr(mg, k) ?? 0));
      if (v >= lo - 6 && v <= hi + 6) continue;
      const to = v < lo ? lo : hi;
      wrong.push(`lề ${label} ${mm(v)} mm`);
      fixed.push(`lề ${label} ${mm(to)} mm`);
      setAttr(mg, k, String(to));
    }
    if (wrong.length) add('trung-binh', where, wrong.join(', '), fixed.join(', '), `Lề trên, dưới 20-25 mm; lề trái 30-35 mm; lề phải 15-20 mm (${ND30}).`, true);
  });

  // ---- 2. Phông chữ và màu chữ toàn văn bản
  const badFonts = new Map<string, number>();
  let colored = 0;
  for (const p of paras) {
    for (const r of p.runs) {
      if (!segsOf({ ...p.el, kids: [r] } as XEl).some((s) => s.text.trim())) { setFonts(rPrOf(r)); continue; }
      const f = fmt.font(r, p.el);
      if (f !== TNR) badFonts.set(f, (badFonts.get(f) ?? 0) + 1);
      setFonts(rPrOf(r));
      if (fmt.color(r)) {
        colored++;
        removeChild(rPrOf(r), 'w:color');
      }
    }
    const markRpr = child(child(p.el, 'w:pPr'), 'w:rPr');
    if (markRpr) setFonts(markRpr);
  }
  if (badFonts.size) {
    const list = [...badFonts.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} (${n} đoạn chữ)`).join(', ');
    add('trung-binh', 'Toàn văn bản', `Phông ${list}`, TNR, `Phông Times New Roman, bộ mã Unicode (${ND30}).`, true);
  }
  if (colored) add('trung-binh', 'Toàn văn bản', `${colored} đoạn chữ có màu`, 'Chữ màu đen', `Chữ trình bày màu đen (${ND30}).`, true);
  // Phông mặc định trong styles.xml để chữ gõ thêm cũng đúng phông.
  if (stylesXml) {
    const styles = stylesXml.find((n): n is XEl => isEl(n, 'w:styles'))!;
    const dd = ensure(styles, 'w:docDefaults', ['w:docDefaults', 'w:latentStyles', 'w:style'], true);
    const rd = ensure(dd, 'w:rPrDefault', ['w:rPrDefault', 'w:pPrDefault'], true);
    setFonts(ensure(rd, 'w:rPr', []));
    for (const s of children(styles, 'w:style')) {
      const rp = child(s, 'w:rPr');
      const f = child(rp, 'w:rFonts');
      if (rp && f) setFonts(rp);
    }
  }

  // ---- Hàm kiểm tra định dạng một thành phần
  type Want = { sizes: [number, number]; to: number; bold?: boolean; italic?: boolean; jc?: string; upper?: boolean };
  const checkPart = (p: Para | undefined, where: string, want: Want, reason: string) => {
    if (!p) return;
    const real = p.runs.filter((r) => segsOf({ ...p.el, kids: [r] } as XEl).some((s) => s.text.trim()));
    if (!real.length) return;
    const probs: string[] = [];
    const fixes: string[] = [];
    const sizes = [...new Set(real.map((r) => fmt.size(r, p.el)))];
    if (sizes.some((s) => s < want.sizes[0] || s > want.sizes[1])) {
      probs.push(`cỡ ${sizes.map(pt).join('/')}`);
      fixes.push(`cỡ ${pt(want.to)}`);
      real.forEach((r) => setSize(rPrOf(r), want.to));
    }
    if (want.bold !== undefined && real.some((r) => fmt.bool(r, p.el, 'w:b') !== want.bold)) {
      probs.push(want.bold ? 'chưa đậm' : 'đang đậm');
      fixes.push(want.bold ? 'đậm' : 'không đậm');
      real.forEach((r) => setBool(rPrOf(r), 'w:b', want.bold!));
    }
    if (want.italic !== undefined && real.some((r) => fmt.bool(r, p.el, 'w:i') !== want.italic)) {
      probs.push(want.italic ? 'chưa nghiêng' : 'đang nghiêng');
      fixes.push(want.italic ? 'nghiêng' : 'đứng');
      real.forEach((r) => setBool(rPrOf(r), 'w:i', want.italic!));
    }
    if (want.jc && fmt.jc(p.el) !== want.jc && !(want.jc === 'center' && p.table >= 0 && fmt.jc(p.el) === 'center')) {
      probs.push('chưa canh giữa');
      fixes.push('canh giữa');
      setJc(p.el, want.jc);
    }
    if (want.upper && !isUpper(p.text)) {
      probs.push('chưa in hoa');
      fixes.push('in hoa');
      for (const s of segsOf(p.el)) if (s.node) setT(s.node, s.text.toUpperCase());
    }
    if (probs.length) add('trung-binh', where, `"${short(p.text, 50)}": ${probs.join(', ')}`, fixes.join(', '), reason, true);
  };

  let agencyLines: Para[] = [];
  if (!loose) {
    // ---- 3. Quốc hiệu, tiêu ngữ
    if (!qh) add('nghiem-trong', 'Quốc hiệu', '(không có)', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', `Văn bản hành chính phải có Quốc hiệu (${ND30}).`, false);
    else if (/\t/.test(paraText(qh.el)) && qh.text.length > 40) add('goi-y', 'Quốc hiệu', 'Quốc hiệu và tên cơ quan nằm chung một dòng, cách bằng tab', 'Dùng bảng 2 cột không viền', 'Trình bày bằng bảng giúp hai khối luôn thẳng hàng khi sửa.', false);
    else {
      const cur = paraText(qh.el);
      if (!QH_RE.test(norm(cur)) || cur !== cur.toUpperCase() || /HOÀ/.test(nfc(cur))) {
        if (replaceParaText(qh.el, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM')) add('trung-binh', 'Quốc hiệu', cur, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', `Quốc hiệu in hoa, viết "HÒA" (${ND30}).`, true);
      }
      checkPart(qh, 'Quốc hiệu', { sizes: [24, 26], to: 24, bold: true, italic: false, jc: 'center' }, `Quốc hiệu in hoa, cỡ 12-13, đứng, đậm (${ND30}).`);
    }
    if (!tn) add('nghiem-trong', 'Tiêu ngữ', '(không có)', 'Độc lập - Tự do - Hạnh phúc', `Văn bản hành chính phải có Tiêu ngữ (${ND30}).`, false);
    else {
      const cur = paraText(tn.el);
      const want = 'Độc lập - Tự do - Hạnh phúc';
      if (TN_RE.test(norm(cur)) && nfc(cur).trim() !== want) {
        if (replaceParaText(tn.el, want)) add('trung-binh', 'Tiêu ngữ', cur, want, `Viết hoa chữ đầu mỗi cụm, giữa các cụm có gạch nối (-) và cách chữ hai bên (${ND30}).`, true);
      }
      checkPart(tn, 'Tiêu ngữ', { sizes: [26, 28], to: 26, bold: true, italic: false, jc: 'center' }, `Tiêu ngữ in thường, cỡ 13-14, đứng, đậm (${ND30}).`);
    }

    // ---- 4. Tên cơ quan ban hành
    const agency = nonEmpty.filter((p) => p.idx < (so?.idx ?? headerEnd + 1) && p !== qh && p !== tn && p !== date && p !== vv && !/DỰ THẢO|Dự thảo/i.test(p.text)
      && (headerTable >= 0 ? p.table === headerTable && p.container.endsWith('c0') : p.table < 0) && p.text.length < 90);
    agencyLines = agency.filter((p) => isUpper(p.text));
    if (!agencyLines.length) add('nghiem-trong', 'Tên cơ quan ban hành', agency[0]?.text ?? '(không thấy)', 'Tên cơ quan in hoa ở góc trái trên', `Tên cơ quan, tổ chức ban hành in hoa, cỡ 12-13, đứng, đậm (${ND30}).`, false);
    agency.filter((p) => !isUpper(p.text)).forEach((p) => add('trung-binh', 'Tên cơ quan ban hành', p.text, p.text.toUpperCase(), `Tên cơ quan in hoa (${ND30}).`, false));
    agencyLines.forEach((p, i) => {
      const parent = agencyLines.length >= 2 && i === 0;
      checkPart(p, parent ? 'Tên cơ quan chủ quản' : 'Tên cơ quan ban hành', { sizes: [24, 26], to: 26, bold: !parent, italic: false, jc: 'center' },
        parent ? `Tên cơ quan chủ quản in hoa, cỡ 12-13, đứng, không đậm (${ND30}).` : `Tên cơ quan ban hành in hoa, cỡ 12-13, đứng, đậm (${ND30}).`);
    });

    // ---- 5. Số, ký hiệu
    if (!so) {
      if (!draft) add('nghiem-trong', 'Số, ký hiệu', '(không có)', `Số: 01/${abbr || '...'}-...`, `Văn bản phải có số, ký hiệu (${ND30}).`, false);
    } else {
      const cur = nfc(paraText(so.el));
      // Số để trống (văn thư điền sau): giữ nguyên dấu cách giữ chỗ.
      let next = /^\s*Số\s*[:.]?\s*\d/.test(cur) ? cur.replace(/^(\s*)Số\s*[:.]?\s*/, '$1Số: ') : cur.replace(/^(\s*)Số\s*[.:]?(?=\s)/, '$1Số:');
      const m = /^(\s*Số: )(\d+)(\s*)\/(.*)$/.exec(next);
      if (m) {
        const num = m[2].length === 1 ? '0' + m[2] : m[2];
        const sym = upSym(m[4].replace(/\s*-\s*/g, '-').replace(/\s*\/\s*/g, '/').trim());
        next = `${m[1]}${num}/${sym}`;
      }
      if (next !== cur && replaceParaText(so.el, next)) add('trung-binh', 'Số, ký hiệu', cur.trim(), next.trim(), `Viết "Số:"; số nhỏ hơn 10 thêm số 0; giữa số và ký hiệu là "/", giữa các nhóm chữ là "-" không cách (${ND30}).`, true);
      const sym = /\/\s*(\S.*)$/.exec(next)?.[1]?.trim() ?? '';
      if (sym && sym !== upSym(sym)) add('trung-binh', 'Số, ký hiệu', sym, upSym(sym), `Ký hiệu viết in hoa (trừ QyĐ, TTr, CTr) (${ND30}).`, false);
      if (abbr && sym && !sym.startsWith(abbr + '-') && !sym.startsWith(abbr + '/')) add('nghiem-trong', 'Số, ký hiệu', sym, `${abbr}-${sym.split('-').slice(1).join('-') || '...'}`, `Ký hiệu của ${docType.toLowerCase()} bắt đầu bằng chữ viết tắt "${abbr}" (Phụ lục III, Nghị định 30/2020/NĐ-CP).`, false);
      if (isCongVan && sym && DOC_TYPES.some(([, a]) => a && sym.startsWith(a + '-'))) add('goi-y', 'Số, ký hiệu', sym, 'Viết tắt cơ quan - viết tắt đơn vị soạn thảo', 'Công văn không có chữ viết tắt tên loại trong ký hiệu.', false);
      checkPart(so, 'Số, ký hiệu', { sizes: [26, 26], to: 26, bold: false, italic: false, jc: 'center' }, `Số, ký hiệu cỡ 13, đứng (${ND30}).`);
    }

    // ---- 6. Địa danh, ngày tháng
    if (!date) add('nghiem-trong', 'Địa danh, thời gian', '(không có)', 'Hà Nội, ngày ... tháng ... năm ...', `Văn bản phải ghi địa danh và thời gian ban hành (${ND30}).`, false);
    else {
      const cur = nfc(paraText(date.el)).trim();
      const m = DATE_RE.exec(cur);
      if (m) {
        const [, place, d, mo, y, rest] = m;
        const numeric = /^\d{1,2}$/.test(d) && /^\d{1,2}$/.test(mo);
        const dd = d.length === 1 ? '0' + d : d;
        const n = Number(mo);
        const mm2 = n <= 2 ? String(n).padStart(2, '0') : String(n);
        const next = `${place.replace(/[,\s]+$/, '')}, ngày ${dd} tháng ${mm2} năm ${y}${rest ? ' ' + rest : ''}`;
        if (!place.trim()) add('nghiem-trong', 'Địa danh, thời gian', cur, 'Hà Nội, ngày ...', 'Thiếu địa danh trước ngày tháng.', false);
        else if (numeric && next !== cur.replace(/\s+/g, ' ') && replaceParaText(date.el, (paraText(date.el).match(/^\s*/)?.[0] ?? '') + next)) {
          add('trung-binh', 'Địa danh, thời gian', cur, next, `Sau địa danh có dấu phẩy; ngày nhỏ hơn 10 và tháng 1, 2 thêm số 0 phía trước (${ND30}).`, true);
        }
        if (/^\d+$/.test(d) && /^\d+$/.test(mo) && /^\d{4}$/.test(y)) {
          const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
          if (dt.getUTCDate() !== Number(d) || dt.getUTCMonth() !== Number(mo) - 1) add('nghiem-trong', 'Địa danh, thời gian', cur, 'Ngày có thật trên lịch', 'Ngày tháng không tồn tại.', false);
        }
      }
      checkPart(date, 'Địa danh, thời gian', { sizes: [26, 28], to: 28, italic: true, bold: false, jc: 'center' }, `Địa danh và thời gian in thường, cỡ 13-14, nghiêng (${ND30}).`);
    }

    // ---- 7. Tên loại, trích yếu
    if (isCongVan) {
      const cur = nfc(paraText(vv!.el));
      const next = cur.replace(/^(\s*)V\s*\/\s*v\s*[:.]?\s*/i, '$1V/v ');
      if (next !== cur && replaceParaText(vv!.el, next)) add('nho', 'Trích yếu công văn', cur, next, `Trích yếu công văn bắt đầu bằng "V/v" (${ND30}).`, true);
      checkPart(vv, 'Trích yếu công văn', { sizes: [24, 26], to: 26, bold: false, italic: false, jc: 'center' }, `Trích yếu công văn in thường, cỡ 12-13, đứng (${ND30}).`);
      if (!nonEmpty.some((p) => /^Kính gửi/i.test(p.text))) add('trung-binh', 'Kính gửi', '(không có)', 'Kính gửi: ...', 'Công văn cần ghi nơi nhận ở phần "Kính gửi".', false);
    } else if (!tenLoai) {
      add('nghiem-trong', 'Tên loại văn bản', '(không thấy)', 'Tên loại in hoa, đậm, canh giữa (ví dụ BÁO CÁO)', `Văn bản có tên loại phải ghi tên loại (${ND30}).`, false);
    } else {
      checkPart(tenLoai, 'Tên loại văn bản', { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Tên loại in hoa, cỡ 13-14, đứng, đậm, canh giữa (${ND30}).`);
      if (!trichYeu.length) add('trung-binh', 'Trích yếu', '(không thấy)', 'Trích yếu nội dung ngay dưới tên loại', `Trích yếu in thường, cỡ 13-14, đứng, đậm (${ND30}).`, false);
      if (thamQuyenOk) checkPart(thamQuyenOk, 'Thẩm quyền ban hành', { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Thẩm quyền ban hành in hoa, cỡ 13-14, đứng, đậm, canh giữa (${ND30}).`);
      trichYeu.forEach((p) => {
        checkPart(p, 'Trích yếu', { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Trích yếu in thường, cỡ 13-14, đứng, đậm, canh giữa (${ND30}).`);
        if (isUpper(p.text) && p.text.split(' ').length > 2) add('trung-binh', 'Trích yếu', p.text, 'Viết thường, chỉ hoa chữ đầu và tên riêng', `Trích yếu in thường (${ND30}). Chưa tự sửa để giữ đúng tên riêng.`, false);
      });
    }

    // ---- 8. Nơi nhận
    const needsNoiNhan = !['BIÊN BẢN', 'HỢP ĐỒNG', 'BẢN GHI NHỚ', 'BẢN THỎA THUẬN', 'GIẤY NGHỈ PHÉP'].includes(docType);
    if (!noiNhan) {
      if (needsNoiNhan) add('nghiem-trong', 'Nơi nhận', '(không có)', 'Nơi nhận: - ...; - Lưu: VT, ...', `Văn bản hành chính phải có nơi nhận (${ND30}).`, false);
    } else {
      const cur = paraText(noiNhan.el);
      if (!/^\s*Nơi nhận:\s*$/.test(nfc(cur)) && /^\s*Nơi nhận\s*:?\s*$/i.test(nfc(cur))) {
        replaceParaText(noiNhan.el, 'Nơi nhận:');
        add('nho', 'Nơi nhận', cur, 'Nơi nhận:', 'Chữ "Nơi nhận" có dấu hai chấm.', true);
      }
      checkPart(noiNhan, 'Nơi nhận', { sizes: [24, 24], to: 24, bold: true, italic: true }, `Chữ "Nơi nhận" in thường, cỡ 12, nghiêng, đậm (${ND30}).`);
      noiNhanList.forEach((p, i) => {
        const last = i === noiNhanList.length - 1;
        const raw = nfc(paraText(p.el));
        let next = raw.replace(/^\s*[-–—+•]\s*/, '- ').replace(/\s+$/, '');
        next = next.replace(/[;,.]*$/, last ? '.' : ';').replace(/^- Lưu\s*[:.]?\s*/i, '- Lưu: ');
        if (next !== raw && replaceParaText(p.el, next)) {
          add('nho', 'Nơi nhận', raw, next, `Mỗi nơi nhận một dòng, đầu dòng gạch ngang, cuối dòng chấm phẩy; dòng cuối kết thúc bằng dấu chấm (${ND30}).`, true);
        }
        checkPart(p, 'Nơi nhận (danh sách)', { sizes: [22, 22], to: 22, bold: false, italic: false }, `Danh sách nơi nhận cỡ 11, đứng (${ND30}).`);
      });
      const lastLine = noiNhanList[noiNhanList.length - 1]?.text ?? '';
      if (!/^-\s*Lưu\b/i.test(lastLine)) add('trung-binh', 'Nơi nhận', lastLine || '(trống)', '- Lưu: VT, <đơn vị soạn thảo>, <số bản>.', `Dòng cuối nơi nhận là "Lưu: VT, ..." (${ND30}).`, false);
    }

    // ---- 9. Chữ ký
    if (!roleParas.length) add('nghiem-trong', 'Chức vụ, họ tên người ký', '(không thấy)', 'Quyền hạn, chức vụ in hoa; họ tên in thường; đều đậm', `Văn bản phải có chức vụ, họ tên người có thẩm quyền ký (${ND30}).`, false);
    for (const p of signParas) {
      if (isRoleLine(p.text)) checkPart(p, 'Chức vụ người ký', { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Quyền hạn, chức vụ người ký in hoa, cỡ 13-14, đứng, đậm (${ND30}).`);
      else if (isNameLine(p.text)) checkPart(p, 'Họ tên người ký', { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Họ tên người ký in thường, cỡ 13-14, đứng, đậm (${ND30}).`);
    }
  }

  // ---- 10. Phần nội dung
  const sizeBad: Para[] = [];
  const indentBad: Para[] = [];
  const alignBad: Para[] = [];
  const spaceBad: Para[] = [];
  const lineBad: Para[] = [];
  const isCanCu = (p: Para) => /^(Căn cứ|Theo đề nghị|Xét đề nghị)/i.test(p.text);
  const qdLine = bodyParas.find((p) => /^(QUYẾT ĐỊNH|QUYẾT NGHỊ|CHỈ THỊ)\s*:?$/.test(p.text));
  for (const p of bodyParas) {
    const real = p.runs.filter((r) => segsOf({ ...p.el, kids: [r] } as XEl).some((s) => s.text.trim()));
    if (!real.length) continue;
    if (real.some((r) => { const s = fmt.size(r, p.el); return s < 26 || s > 28; })) {
      sizeBad.push(p);
      real.forEach((r) => setSize(rPrOf(r), 28));
    }
    if (p === qdLine) continue;
    const jc = fmt.jc(p.el);
    if (loose) continue;
    if (jc === 'center' || jc === 'right' || jc === 'end') continue;
    if (jc !== 'both' && jc !== 'distribute') { alignBad.push(p); setJc(p.el, 'both'); }
    const hanging = fmt.ind(p.el, 'w:hanging') ?? 0;
    const left = fmt.ind(p.el, 'w:left') ?? fmt.ind(p.el, 'w:start') ?? 0;
    const firstLine = fmt.ind(p.el, 'w:firstLine') ?? 0;
    if (!hanging && !left && !fmt.hasNum(p.el) && !/^\t/.test(paraText(p.el)) && (firstLine < 560 || firstLine > 725)) {
      indentBad.push(p);
      const ind = ensure(pPrOf(p.el), 'w:ind', PPR_ORDER);
      setAttr(ind, 'w:firstLine', '567');
      setAttr(ind, 'w:firstLineChars', null);
    }
    const before = Number(fmt.spacing(p.el, 'w:before') ?? 0);
    const after = Number(fmt.spacing(p.el, 'w:after') ?? 0);
    const sp = () => ensure(pPrOf(p.el), 'w:spacing', PPR_ORDER);
    if (before < 120 && after < 120) {
      spaceBad.push(p);
      setAttr(sp(), 'w:after', '120');
      setAttr(sp(), 'w:afterAutospacing', null);
      if (child(child(p.el, 'w:pPr'), 'w:contextualSpacing')) removeChild(child(p.el, 'w:pPr')!, 'w:contextualSpacing');
    }
    const rule = fmt.spacing(p.el, 'w:lineRule') ?? 'auto';
    const line = Number(fmt.spacing(p.el, 'w:line') ?? 240);
    if (rule === 'auto' && (line < 236 || line > 364)) {
      lineBad.push(p);
      setAttr(sp(), 'w:line', String(line < 240 ? 240 : 360));
      setAttr(sp(), 'w:lineRule', 'auto');
    }
  }
  const sample = (ps: Para[]) => `${ps.length} đoạn, ví dụ: "${short(ps[0].text, 50)}"`;
  if (sizeBad.length) add('trung-binh', 'Nội dung', `Cỡ chữ ngoài 13-14 ở ${sample(sizeBad)}`, 'Cỡ 14', `Phần nội dung cỡ 13-14 (${ND30}).`, true);
  if (alignBad.length) add('trung-binh', 'Nội dung', `Chưa căn đều hai lề ở ${sample(alignBad)}`, 'Căn đều hai lề', `Nội dung căn đều hai lề (${ND30}).`, true);
  if (indentBad.length) add('nho', 'Nội dung', `Thụt đầu dòng chưa đúng ở ${sample(indentBad)}`, 'Thụt đầu dòng 1 cm', `Đầu dòng lùi vào 1-1,27 cm (${ND30}).`, true);
  if (spaceBad.length) add('nho', 'Nội dung', `Khoảng cách đoạn dưới 6pt ở ${sample(spaceBad)}`, 'Cách đoạn 6pt', `Khoảng cách giữa các đoạn tối thiểu 6pt (${ND30}).`, true);
  if (lineBad.length) add('nho', 'Nội dung', `Giãn dòng ngoài khoảng 1-1,5 ở ${sample(lineBad)}`, 'Giãn dòng trong khoảng 1-1,5 dòng', `Khoảng cách giữa các dòng từ một dòng đơn đến 1,5 dòng (${ND30}).`, true);

  if (!loose) {
    // Căn cứ ban hành: nghiêng, cuối mỗi căn cứ dấu chấm phẩy.
    const canCu = bodyParas.filter((p) => isCanCu(p) && (!qdLine || p.idx < qdLine.idx));
    const canCuItalic = canCu.filter((p) => p.runs.some((r) => !fmt.bool(r, p.el, 'w:i') && segsOf({ ...p.el, kids: [r] } as XEl).some((s) => s.text.trim())));
    canCuItalic.forEach((p) => p.runs.forEach((r) => setBool(rPrOf(r), 'w:i', true)));
    if (canCuItalic.length) add('trung-binh', 'Căn cứ ban hành', `${canCuItalic.length} dòng căn cứ chưa nghiêng`, 'In nghiêng', `Căn cứ ban hành trình bày in nghiêng (${ND30}).`, true);
    canCu.slice(0, -1).forEach((p) => {
      const raw = paraText(p.el);
      if (/;\s*$/.test(raw)) return;
      const next = raw.replace(/[.,:]?\s*$/, ';');
      if (replaceParaText(p.el, next)) add('nho', 'Căn cứ ban hành', short(raw.trim(), 60), '… kết thúc bằng dấu ;', `Cuối mỗi căn cứ có dấu chấm phẩy (${ND30}).`, true);
    });
    if (qdLine) {
      const cur = paraText(qdLine.el).trim();
      const want = cur.replace(/\s*:?$/, ':');
      if (want !== cur) replaceParaText(qdLine.el, want);
      checkPart(qdLine, `Chữ "${want}"`, { sizes: [26, 28], to: 28, bold: true, italic: false, jc: 'center' }, `Từ "${want}" in hoa, đậm, canh giữa (${ND30}).`);
    }
    // Đánh số mục La Mã liên tục.
    const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
    const romans = bodyParas.map((p) => /^([IVX]+)[.)]\s/.exec(p.text)?.[1]).filter((x): x is string => !!x && ROMAN.includes(x));
    romans.forEach((r, i) => {
      if (r !== ROMAN[i]) add('trung-binh', 'Đánh số mục', `Mục ${r} (sau mục ${romans[i - 1] ?? 'đầu'})`, `Mục ${ROMAN[i]}`, 'Đánh số mục liên tục, không nhảy số.', false);
    });
    const dieu = bodyParas.map((p) => /^Điều (\d+)\./.exec(p.text)).filter(Boolean).map((m) => Number(m![1]));
    dieu.forEach((n, i) => { if (n !== i + 1) add('trung-binh', 'Đánh số điều', `Điều ${n}`, `Điều ${i + 1}`, 'Các điều đánh số liên tục.', false); });
    for (const p of bodyParas.filter((x) => /^Điều \d+\./.test(x.text))) {
      const r0 = p.runs.find((r) => segsOf({ ...p.el, kids: [r] } as XEl).some((s) => s.text.trim()));
      if (r0 && !fmt.bool(r0, p.el, 'w:b')) { add('nho', 'Điều', short(p.text, 40), 'Chữ "Điều", số thứ tự và tên điều in đậm', `Theo ${ND30}.`, false); break; }
    }
    // Bố cục bắt buộc theo loại văn bản (Mục 4 của quy tắc rà soát).
    const all = nonEmpty.map((p) => norm(paraText(p.el)).toLowerCase()).join('\n');
    const need: Record<string, [string, RegExp][]> = {
      'QUYẾT ĐỊNH': [['căn cứ ban hành', /căn cứ/], ['dòng "QUYẾT ĐỊNH:"', /^quyết định\s*:/m], ['các Điều', /^điều 1\./m], ['điều khoản thi hành', /chịu trách nhiệm thi hành|có hiệu lực/]],
      'KẾ HOẠCH': [['mục đích, yêu cầu', /mục đích/], ['nội dung, nhiệm vụ', /nội dung|nhiệm vụ/], ['thời gian, tiến độ', /thời gian|tiến độ/], ['kinh phí', /kinh phí/], ['tổ chức thực hiện', /tổ chức thực hiện/]],
      'BÁO CÁO': [['kết quả thực hiện', /kết quả/], ['đánh giá (ưu điểm, hạn chế)', /đánh giá|hạn chế|tồn tại/], ['đề xuất, kiến nghị', /đề xuất|kiến nghị/]],
      'TỜ TRÌNH': [['lý do, sự cần thiết', /sự cần thiết|lý do|căn cứ/], ['nội dung đề xuất', /đề xuất|nội dung/], ['kiến nghị', /kiến nghị|kính trình|đề nghị/]],
      'BIÊN BẢN': [['thời gian bắt đầu', /thời gian|vào hồi|hôm nay/], ['địa điểm', /địa điểm|tại/], ['thành phần', /thành phần|có mặt/], ['chủ trì/chủ tọa', /chủ trì|chủ tọa/], ['thư ký', /thư ký/], ['thời gian kết thúc', /kết thúc/]],
      'THÔNG BÁO': [['nội dung', /./], ['thời gian', /thời gian|ngày/]],
      'GIẤY MỜI': [['thời gian', /thời gian|vào lúc|ngày/], ['địa điểm', /địa điểm|tại/], ['thành phần', /thành phần|kính mời/]],
    };
    const missing = (need[docType] ?? []).filter(([, re]) => !re.test(all)).map(([n]) => n);
    if (missing.length) add('trung-binh', 'Bố cục', `Chưa thấy: ${missing.join(', ')}`, 'Bổ sung các phần còn thiếu', `Bố cục thông dụng của ${docType.toLowerCase()} theo quy tắc rà soát của tổ thư ký.`, false);
  }

  // ---- 11. Chữ: dấu cách, dấu câu, dấu thanh, chính tả
  const textParas = [...bodyParas, ...trichYeu, ...noiNhanList];
  const hits = new Map<string, { rule: TextRule; count: number; example?: string; fixed?: string }>();
  for (const rule of TEXT_RULES) {
    const h = hits.get(rule.id) ?? { rule, count: 0 };
    for (const p of textParas) applyRule(p.el, rule, h);
    hits.set(rule.id, h);
  }
  for (const h of hits.values()) {
    if (!h.count) continue;
    add(h.rule.level, `Chữ (${h.count} chỗ)`, h.example ?? '', h.fixed ?? '', `${h.rule.label}. ${h.rule.reason}`, true);
  }
  const fullBody = bodyParas.map((p) => paraText(p.el)).join('\n');
  for (const n of checkText(fullBody)) add(n.level, 'Nội dung', n.label, '', n.detail, false);

  // ---- 11b. Bố cục hai cột: phần đầu và phần chữ ký đang là các đoạn rời -> đưa vào bảng không viền.
  if (!loose) {
    const pg = child(firstSect, 'w:pgSz');
    const mg = child(firstSect, 'w:pgMar');
    const textW = Math.max(6000, Number(attr(pg, 'w:w') ?? 11906) - Number(attr(mg, 'w:left') ?? 1701) - Number(attr(mg, 'w:right') ?? 851));
    const agencyParas = nonEmpty.filter((p) => p.table < 0 && p.idx < (so?.idx ?? -1) && p !== qh && p !== tn && p !== date && isUpper(p.text) && p.text.length < 90);
    const leftHead = [...agencyParas, so, vv].filter((p): p is Para => !!p && p.table < 0);
    const rightHead = [qh, tn, date].filter((p): p is Para => !!p && p.table < 0);
    if (qh && so && leftHead.length >= 2 && rightHead.length >= 2 && !/\t/.test(paraText(qh.el))) {
      // Bảng rộng hơn vùng chữ một chút (lấn ra lề) để Quốc hiệu cỡ 12 nằm trên một dòng.
      const total = textW + 500;
      const rightW = Math.max(5700, Math.round(total * 0.58));
      if (toTwoColumns(body, paras, leftHead, rightHead, [total - rightW, rightW], [agencyParas[agencyParas.length - 1], tn], -300)) {
        add('trung-binh', 'Phần đầu văn bản', 'Tên cơ quan, số ký hiệu và Quốc hiệu nằm thành các dòng nối tiếp', 'Bảng 2 cột không viền: trái là cơ quan, số ký hiệu; phải là Quốc hiệu, Tiêu ngữ, ngày tháng', `Tên cơ quan ở góc trái trên, Quốc hiệu - Tiêu ngữ ở góc phải trên, địa danh và ngày tháng dưới Tiêu ngữ (${ND30}).`, true);
      }
    } else if (headerTable >= 0) {
      // Bảng có sẵn: thêm đường kẻ nếu chưa có.
      const lineAfter = (p: Para | undefined) => {
        if (!p || p.table < 0) return;
        const cell = findAll([body], (e) => e.name === 'w:tc' && e.kids.includes(p.el))[0];
        if (!cell || hasLine(cell)) return;
        const at = cell.kids.indexOf(p.el);
        cell.kids.splice(at + 1, 0, rulePara(Math.round(textW * 0.12)));
        return true;
      };
      const a = lineAfter(agencyLines[agencyLines.length - 1]);
      const b = lineAfter(tn);
      if (a || b) add('nho', 'Đường kẻ', 'Chưa có đường kẻ dưới tên cơ quan hoặc Tiêu ngữ', 'Thêm đường kẻ liền, canh giữa', `Dưới tên cơ quan và dưới Tiêu ngữ có đường kẻ ngang, nét liền (${ND30}).`, true);
    }
    if (lastTy && lastTy.table < 0) {
      const sib = body.kids.filter((k): k is XEl => isEl(k, 'w:p'));
      const at = sib.indexOf(lastTy.el);
      const near = [lastTy.el, sib[at + 1], sib[at + 2]].filter(Boolean);
      if (at >= 0 && !near.some((e) => hasLine(e))) {
        body.kids.splice(body.kids.indexOf(lastTy.el) + 1, 0, rulePara(Math.round(textW / 3)));
        add('nho', 'Trích yếu', 'Chưa có đường kẻ dưới trích yếu', 'Thêm đường kẻ liền, dài khoảng 1/3 dòng', `Dưới trích yếu có đường kẻ ngang, nét liền, dài 1/3 đến 1/2 độ dài dòng chữ (${ND30}).`, true);
      }
    }
    if (tenLoai && Number(fmt.spacing(tenLoai.el, 'w:before') ?? 0) < 120) setAttr(ensure(pPrOf(tenLoai.el), 'w:spacing', PPR_ORDER), 'w:before', '240');
    const bodySign = signParas.filter((p) => p.table < 0);
    const leftSign = noiNhan && noiNhan.table < 0 ? [noiNhan, ...noiNhanList] : [];
    if (bodySign.length && leftSign.length) {
      // Giữ các dòng trống giữa chức vụ và họ tên để có chỗ ký.
      const lo = Math.min(...bodySign.map((p) => p.idx));
      const hi = Math.max(...bodySign.map((p) => p.idx));
      const right = paras.filter((p) => p.container === 'body' && p.idx >= lo && p.idx <= hi && !leftSign.includes(p));
      if (toTwoColumns(body, paras, leftSign, right, [Math.round(textW * 0.46), textW - Math.round(textW * 0.46)], [], -108)) {
        add('trung-binh', 'Phần ký', 'Nơi nhận và chữ ký nằm thành các dòng nối tiếp', 'Bảng 2 cột không viền: trái là Nơi nhận, phải là chức vụ, họ tên người ký', `Nơi nhận ở góc trái, chức vụ và họ tên người ký ở bên phải (${ND30}).`, true);
      }
    }
  }

  // Chỗ ký: giữa dòng chức vụ cuối và họ tên cần vài dòng trống.
  if (!loose) {
    const name = [...signParas].reverse().find((p) => isNameLine(p.text));
    const holder = name && findAll([body], (e) => (e.name === 'w:tc' || e.name === 'w:body') && e.kids.includes(name.el))[0];
    if (holder) {
      const at = holder.kids.indexOf(name.el);
      const prev = holder.kids.slice(0, at).reverse().find((k): k is XEl => isEl(k, 'w:p'));
      if (prev && isRoleLine(norm(paraText(prev)))) {
        holder.kids.splice(at, 0, ...[0, 1, 2, 3].map(() => el('w:p')));
        add('nho', 'Chữ ký', 'Họ tên đặt ngay dưới chức vụ, không có chỗ ký', 'Để trống 4 dòng giữa chức vụ và họ tên', 'Cần chỗ để chữ ký và đóng dấu.', true);
      }
    }
  }

  // ---- 11c. Phần ký không bị tách riêng sang trang: giữ liền với các đoạn nội dung cuối.
  if (!loose && (signParas.length || noiNhan)) {
    const r = keepSignWithBody(body, [...signParas, ...(noiNhan ? [noiNhan] : [])].map((p) => p.el));
    if (r.breaks) add('nghiem-trong', 'Phần ký', `Có ${r.breaks} chỗ ngắt trang ngay trước phần ký`, 'Bỏ ngắt trang để phần ký nằm dưới nội dung', 'Ngắt trang trước phần ký làm trang chữ ký không có nội dung, dễ bị thay trang.', true);
    if (r.empties) add('trung-binh', 'Phần ký', `${r.empties + 1} dòng trống liền nhau trước phần ký`, 'Giữ 1 dòng trống', 'Nhiều dòng trống dễ đẩy phần ký sang trang riêng.', true);
    if (r.kept) add('trung-binh', 'Phần ký', 'Phần ký có thể bị đẩy sang trang mới mà không kèm nội dung', 'Giữ phần ký liền với 2 đoạn nội dung cuối (Keep with next), không tách bảng chữ ký', 'Trang có chữ ký phải có một phần nội dung văn bản phía trên, tránh trang chỉ có chữ ký.', true);
  }

  // ---- 12. Số trang
  let pageNumberAdded = false;
  const newEntries: ZipEntry[] = [];
  if (!loose && firstSect) {
    const relsEntry = byName.get('word/_rels/document.xml.rels');
    const rels = relsEntry ? parseXml(await unzipText(relsEntry)) : null;
    const relRoot = rels?.find((n): n is XEl => isEl(n, 'Relationships'));
    const targetOf = (id: string | undefined) => attr(children(relRoot, 'Relationship').find((r) => attr(r, 'Id') === id), 'Target');
    const partText = async (target: string | undefined) => {
      if (!target) return '';
      const e = byName.get('word/' + target.replace(/^\/?word\//, '').replace(/^\.\//, ''));
      return e ? unzipText(e) : '';
    };
    const hasPage = (xml: string) => /PAGE(?!S)\b/.test(xml.replace(/NUMPAGES/g, ''));
    const headerRefs = sects.flatMap((s) => children(s, 'w:headerReference'));
    const footerRefs = sects.flatMap((s) => children(s, 'w:footerReference'));
    const inHeader = (await Promise.all(headerRefs.map((r) => partText(targetOf(attr(r, 'r:id')))))).some(hasPage);
    const inFooter = (await Promise.all(footerRefs.map((r) => partText(targetOf(attr(r, 'r:id')))))).some(hasPage);
    if (inHeader) {
      if (!child(firstSect, 'w:titlePg')) {
        ensure(firstSect, 'w:titlePg', SECT_ORDER);
        add('nho', 'Số trang', 'Trang đầu có đánh số', 'Không đánh số trang đầu', `Số trang không hiển thị ở trang thứ nhất (${ND30}).`, true);
      }
    } else if (inFooter) {
      add('trung-binh', 'Số trang', 'Số trang ở chân trang', 'Số trang giữa lề trên', `Số trang đặt canh giữa theo chiều ngang trong phần lề trên, không đánh số trang đầu (${ND30}). Chưa tự chuyển vì sẽ trùng số trang; hãy xóa số ở chân trang và chèn ở đầu trang.`, false);
    } else if (relRoot && !headerRefs.some((r) => attr(r, 'w:type') === 'default')) {
      const used = new Set(children(relRoot, 'Relationship').map((r) => attr(r, 'Id')));
      let id = 'rIdUebPage';
      for (let k = 2; used.has(id); k++) id = `rIdUebPage${k}`;
      relRoot.kids.push(el('Relationship', { Id: id, Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', Target: 'header-so-trang.xml' }));
      newEntries.push(await makeEntry('word/_rels/document.xml.rels', serialize(rels!)));
      newEntries.push(await makeEntry('word/header-so-trang.xml', PAGE_HEADER_XML));
      const ctEntry = byName.get('[Content_Types].xml');
      if (ctEntry) {
        const ct = parseXml(await unzipText(ctEntry));
        const types = ct.find((n): n is XEl => isEl(n, 'Types'))!;
        types.kids.push(el('Override', { PartName: '/word/header-so-trang.xml', ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml' }));
        newEntries.push(await makeEntry('[Content_Types].xml', serialize(ct)));
      }
      if (!root.attrs.some(([k]) => k === 'xmlns:r')) root.attrs.push(['xmlns:r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships']);
      firstSect.kids.unshift(el('w:headerReference', { 'w:type': 'default', 'r:id': id }));
      ensure(firstSect, 'w:titlePg', SECT_ORDER);
      pageNumberAdded = true;
      add('nho', 'Số trang', 'Chưa đánh số trang', 'Số trang giữa lề trên, bỏ trang đầu', `Số trang bằng chữ số Ả Rập, cỡ 13-14, đặt giữa lề trên, không hiển thị ở trang thứ nhất (${ND30}).`, true);
    }
  }

  // ---- Kết luận
  const order: Level[] = ['nghiem-trong', 'trung-binh', 'nho', 'goi-y'];
  issues.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const n = (l: Level) => issues.filter((i) => i.level === l).length;
  const verdict = loose
    ? `Văn bản không có Quốc hiệu, số, ký hiệu nên được coi là văn bản nội bộ không chính thức: chỉ rà soát chữ và định dạng nội dung (${n('nho') + n('trung-binh')} lỗi).`
    : n('nghiem-trong')
      ? `Chưa đạt: ${n('nghiem-trong')} lỗi nghiêm trọng, ${n('trung-binh')} lỗi trung bình, ${n('nho')} lỗi nhỏ.`
      : n('trung-binh') + n('nho')
        ? `Đạt, cần sửa nhỏ: ${n('trung-binh')} lỗi trung bình, ${n('nho')} lỗi nhỏ.`
        : 'Đạt: không thấy lỗi thể thức trong các điểm đã rà soát.';

  // ---- Ghi file mới
  const changed = new Map<string, ZipEntry>();
  changed.set('word/document.xml', await makeEntry('word/document.xml', serialize(doc)));
  if (stylesXml) changed.set('word/styles.xml', await makeEntry('word/styles.xml', serialize(stylesXml)));
  for (const e of newEntries) changed.set(e.name, e);
  const out = entries.map((e) => changed.get(e.name) ?? e);
  for (const e of newEntries) if (!entries.some((x) => x.name === e.name)) out.push(e);

  const notChecked = [
    'Độ dài và vị trí đường kẻ dưới tên cơ quan, tiêu ngữ, trích yếu khi đường kẻ là hình vẽ có sẵn (cần xem bằng mắt).',
    'Vị trí các khối (Quốc hiệu, tên cơ quan, chữ ký) so với lề; chữ ký, con dấu.',
    'Viết hoa tên riêng, tên cơ quan, chức vụ; chữ viết tắt đã được giải thích ở lần đầu chưa.',
    'Lỗi chính tả ngoài danh sách lỗi thường gặp, câu tối nghĩa và nội dung nghiệp vụ.',
    ...(pageNumberAdded ? [] : ['Số trang trong phần đầu trang có cỡ chữ 13-14 chưa.']),
  ];
  return { docType: docType.toLowerCase(), verdict, issues, notChecked, output: writeZip(out), fixedCount: issues.filter((i) => i.fixed).length };
}

// Có đường kẻ chưa: hình vẽ, đường viền đoạn.
function hasLine(e: XEl): boolean {
  return findAll([e], (x) => ['w:drawing', 'w:pict', 'mc:AlternateContent'].includes(x.name) || (x.name === 'w:pBdr' && !!child(x, 'w:bottom'))).length > 0;
}

function rulePara(indent: number): XEl {
  return parseXml(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="120" w:line="120" w:lineRule="exact"/><w:ind w:left="${indent}" w:right="${indent}"/><w:jc w:val="center"/></w:pPr></w:p>`)[0] as XEl;
}

// Chuyển hai nhóm đoạn văn liền nhau ở thân văn bản thành bảng 2 cột không viền.
// Chỉ làm khi mọi đoạn trong khoảng đó thuộc một trong hai nhóm hoặc là đoạn trống.
function toTwoColumns(body: XEl, paras: Para[], left: Para[], right: Para[], widths: [number, number], lineAfter: (Para | undefined)[], indent: number): boolean {
  const group = [...left, ...right];
  if (group.some((p) => p.container !== 'body' || !body.kids.includes(p.el))) return false;
  const lo = Math.min(...group.map((p) => p.idx));
  const hi = Math.max(...group.map((p) => p.idx));
  const inRange = paras.filter((p) => p.container === 'body' && p.idx >= lo && p.idx <= hi);
  if (inRange.some((p) => !group.includes(p) && (p.text || !body.kids.includes(p.el) || hasLine(p.el)))) return false;
  const at = body.kids.indexOf(inRange[0].el);
  const cellOf = (ps: Para[], w: number) => {
    const kids: XNode[] = [];
    for (const p of ps.sort((a, b) => a.idx - b.idx)) {
      const pPr = pPrOf(p.el);
      // Bỏ thụt lề cũ để khối canh giữa trong ô.
      removeChild(pPr, 'w:ind');
      const sp = ensure(pPr, 'w:spacing', PPR_ORDER);
      for (const [k, v] of [['w:before', '0'], ['w:after', '0'], ['w:line', '240'], ['w:lineRule', 'auto']]) setAttr(sp, k, v);
      for (const k of ['w:beforeAutospacing', 'w:afterAutospacing', 'w:beforeLines', 'w:afterLines']) setAttr(sp, k, null);
      kids.push(p.el);
      if (lineAfter.includes(p)) kids.push(rulePara(Math.round(w * 0.3)));
    }
    if (!kids.length) kids.push(el('w:p'));
    return el('w:tc', {}, [el('w:tcPr', {}, [el('w:tcW', { 'w:w': String(w), 'w:type': 'dxa' })]), ...kids]);
  };
  const nil = (n: string) => el(n, { 'w:val': 'nil' });
  const tbl = el('w:tbl', {}, [
    el('w:tblPr', {}, [
      el('w:tblW', { 'w:w': String(widths[0] + widths[1]), 'w:type': 'dxa' }),
      el('w:tblInd', { 'w:w': String(indent), 'w:type': 'dxa' }),
      el('w:tblBorders', {}, ['w:top', 'w:left', 'w:bottom', 'w:right', 'w:insideH', 'w:insideV'].map(nil)),
      el('w:tblLayout', { 'w:type': 'fixed' }),
      el('w:tblLook', { 'w:val': '0000' }),
    ]),
    el('w:tblGrid', {}, widths.map((w) => el('w:gridCol', { 'w:w': String(w) }))),
    el('w:tr', {}, [cellOf(left, widths[0]), cellOf(right, widths[1])]),
  ]);
  const drop = new Set(inRange.map((p) => p.el));
  body.kids = body.kids.filter((k) => !(isEl(k) && drop.has(k)));
  body.kids.splice(at, 0, tbl);
  return true;
}

const PAGE_HEADER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}" w:cs="${TNR}" w:eastAsia="${TNR}"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>2</w:t></w:r></w:fldSimple></w:p></w:hdr>`;
