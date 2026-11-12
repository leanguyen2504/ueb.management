// Bộ đọc/ghi XML tối giản cho file Word (.docx). Giữ nguyên mọi phần không sửa
// (thuộc tính, không gian tên, chú thích) để Word mở lại được file sau khi chỉnh.

export type XEl = { t: 'el'; name: string; attrs: [string, string][]; kids: XNode[] };
export type XText = { t: 'text'; raw: string };
export type XRaw = { t: 'raw'; raw: string };
export type XNode = XEl | XText | XRaw;

export function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const n = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  });
}

export function encode(s: string, attr = false) {
  const out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attr ? out.replace(/"/g, '&quot;') : out;
}

export function parseXml(src: string): XNode[] {
  const root: XEl = { t: 'el', name: '#root', attrs: [], kids: [] };
  const stack: XEl[] = [root];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      stack[stack.length - 1].kids.push({ t: 'text', raw: src.slice(i) });
      break;
    }
    if (lt > i) stack[stack.length - 1].kids.push({ t: 'text', raw: src.slice(i, lt) });
    const top = stack[stack.length - 1];
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt);
      top.kids.push({ t: 'raw', raw: src.slice(lt, e + 2) });
      i = e + 2;
    } else if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt);
      top.kids.push({ t: 'raw', raw: src.slice(lt, e + 3) });
      i = e + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt);
      top.kids.push({ t: 'raw', raw: src.slice(lt, e + 3) });
      i = e + 3;
    } else if (src.startsWith('<!', lt)) {
      const e = src.indexOf('>', lt);
      top.kids.push({ t: 'raw', raw: src.slice(lt, e + 1) });
      i = e + 1;
    } else if (src.startsWith('</', lt)) {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e).trim();
      // Đóng thẻ gần nhất cùng tên (XML hợp lệ thì luôn là thẻ trên cùng).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      i = e + 1;
    } else {
      // Thẻ mở: đọc tên và thuộc tính, bỏ qua dấu > nằm trong dấu ngoặc kép.
      let j = lt + 1;
      while (j < n && !/[\s/>]/.test(src[j])) j++;
      const name = src.slice(lt + 1, j);
      const attrs: [string, string][] = [];
      let self = false;
      while (j < n) {
        const c = src[j];
        if (c === '>') { j++; break; }
        if (c === '/' && src[j + 1] === '>') { self = true; j += 2; break; }
        if (/\s/.test(c)) { j++; continue; }
        let k = j;
        while (k < n && !/[\s=/>]/.test(src[k])) k++;
        const an = src.slice(j, k);
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] === '=') {
          k++;
          while (k < n && /\s/.test(src[k])) k++;
          const q = src[k];
          const e = src.indexOf(q, k + 1);
          attrs.push([an, decode(src.slice(k + 1, e))]);
          j = e + 1;
        } else {
          attrs.push([an, '']);
          j = k;
        }
      }
      const el: XEl = { t: 'el', name, attrs, kids: [] };
      top.kids.push(el);
      if (!self) stack.push(el);
      i = j;
    }
  }
  return root.kids;
}

export function serialize(nodes: XNode[]): string {
  let out = '';
  const walk = (x: XNode) => {
    if (x.t === 'text') { out += x.raw; return; }
    if (x.t === 'raw') { out += x.raw; return; }
    out += '<' + x.name;
    for (const [k, v] of x.attrs) out += ` ${k}="${encode(v, true)}"`;
    if (!x.kids.length) { out += '/>'; return; }
    out += '>';
    x.kids.forEach(walk);
    out += `</${x.name}>`;
  };
  nodes.forEach(walk);
  return out;
}

// ---- Tiện ích thao tác cây ----

export const el = (name: string, attrs: Record<string, string> = {}, kids: XNode[] = []): XEl => ({ t: 'el', name, attrs: Object.entries(attrs), kids });
export const isEl = (x: XNode | undefined, name?: string): x is XEl => !!x && x.t === 'el' && (!name || x.name === name);
export const child = (p: XEl | undefined, name: string) => p?.kids.find((k): k is XEl => isEl(k, name));
export const children = (p: XEl | undefined, name: string) => (p ? p.kids.filter((k): k is XEl => isEl(k, name)) : []);
export const attr = (e: XEl | undefined, name: string) => e?.attrs.find(([k]) => k === name)?.[1];

export function setAttr(e: XEl, name: string, value: string | null) {
  const i = e.attrs.findIndex(([k]) => k === name);
  if (value === null) { if (i >= 0) e.attrs.splice(i, 1); return; }
  if (i >= 0) e.attrs[i][1] = value;
  else e.attrs.push([name, value]);
}

export function removeChild(p: XEl, name: string) {
  p.kids = p.kids.filter((k) => !isEl(k, name));
}

// Thêm hoặc lấy phần tử con theo đúng thứ tự lược đồ OOXML (Word báo lỗi nếu sai thứ tự).
export function ensure(p: XEl, name: string, order: string[], first = false): XEl {
  const found = child(p, name);
  if (found) return found;
  const made = el(name);
  const rank = order.indexOf(name);
  let at = first ? 0 : p.kids.length;
  if (rank >= 0) {
    at = p.kids.length;
    for (let i = 0; i < p.kids.length; i++) {
      const k = p.kids[i];
      if (k.t !== 'el') continue;
      const r = order.indexOf(k.name);
      if (r > rank) { at = i; break; }
    }
  }
  p.kids.splice(at, 0, made);
  return made;
}

export function findAll(nodes: XNode[], pred: (e: XEl) => boolean, skip?: (e: XEl) => boolean): XEl[] {
  const out: XEl[] = [];
  const walk = (x: XNode) => {
    if (x.t !== 'el') return;
    if (skip?.(x)) return;
    if (pred(x)) out.push(x);
    x.kids.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

// Thứ tự phần tử con theo lược đồ WordprocessingML.
export const PPR_ORDER = ['w:pStyle', 'w:keepNext', 'w:keepLines', 'w:pageBreakBefore', 'w:framePr', 'w:widowControl', 'w:numPr', 'w:suppressLineNumbers', 'w:pBdr', 'w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange'];
export const RPR_ORDER = ['w:rStyle', 'w:rFonts', 'w:b', 'w:bCs', 'w:i', 'w:iCs', 'w:caps', 'w:smallCaps', 'w:strike', 'w:dstrike', 'w:outline', 'w:shadow', 'w:emboss', 'w:imprint', 'w:noProof', 'w:snapToGrid', 'w:vanish', 'w:webHidden', 'w:color', 'w:spacing', 'w:w', 'w:kern', 'w:position', 'w:sz', 'w:szCs', 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath', 'w:rPrChange'];
export const SECT_ORDER = ['w:headerReference', 'w:footerReference', 'w:footnotePr', 'w:endnotePr', 'w:type', 'w:pgSz', 'w:pgMar', 'w:paperSrc', 'w:pgBorders', 'w:lnNumType', 'w:pgNumType', 'w:cols', 'w:formProt', 'w:vAlign', 'w:noEndnote', 'w:titlePg', 'w:textDirection', 'w:bidi', 'w:rtlGutter', 'w:docGrid', 'w:printerSettings', 'w:sectPrChange'];
