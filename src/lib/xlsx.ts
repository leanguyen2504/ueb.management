// Ghi file Excel (.xlsx) tối giản, không cần thư viện ngoài; chạy được cả trên máy chủ lẫn trình duyệt.
// Mỗi trang tính có dòng tiêu đề in đậm, cố định khi cuộn, có sẵn bộ lọc (AutoFilter) của Excel.

export type XCell =
  | string
  | number
  | boolean
  | null
  | undefined
  | { date: string } // "YYYY-MM-DD"
  | { datetime: string } // ISO; hiện theo giờ Việt Nam
  | { link: string; text: string };

export type XSheet = {
  name: string;
  // Các dòng mô tả phía trên bảng (tiêu đề báo cáo, kỳ, người xuất...).
  intro?: string[];
  columns: { header: string; width?: number }[];
  rows: XCell[][];
};

const esc = (s: string) =>
  s
    // Ký tự điều khiển không hợp lệ trong XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function colName(n: number) {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Số ngày kể từ 30/12/1899 (cách Excel lưu ngày).
const serialOfDay = (day: string) => Date.parse(`${day.slice(0, 10)}T00:00:00Z`) / 86400000 + 25569;
const serialOfIso = (iso: string) => (Date.parse(iso) + 7 * 3600000) / 86400000 + 25569;

// Kiểu ô: 0 thường, 1 tiêu đề cột, 2 ngày, 3 ngày giờ, 4 dòng giới thiệu (đậm), 5 liên kết.
function cellXml(ref: string, v: XCell): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"><v>${Math.round(v * 1e6) / 1e6}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${ref}" t="inlineStr"><is><t>${v ? 'Có' : ''}</t></is></c>`;
  if (typeof v === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v.slice(0, 32000))}</t></is></c>`;
  if ('date' in v) return /^\d{4}-\d{2}-\d{2}/.test(v.date) ? `<c r="${ref}" s="2"><v>${serialOfDay(v.date)}</v></c>` : '';
  if ('datetime' in v) return Number.isFinite(Date.parse(v.datetime)) ? `<c r="${ref}" s="3"><v>${serialOfIso(v.datetime)}</v></c>` : '';
  if ('link' in v) {
    const q = (s: string) => esc(s.replace(/"/g, '""'));
    return `<c r="${ref}" s="5" t="str"><f>HYPERLINK("${q(v.link)}","${q(v.text)}")</f><v>${esc(v.text)}</v></c>`;
  }
  return '';
}

function sheetXml(s: XSheet) {
  const intro = s.intro ?? [];
  const headRow = intro.length ? intro.length + 2 : 1;
  const lastCol = colName(Math.max(s.columns.length - 1, 0));
  const rows: string[] = [];
  intro.forEach((line, i) => rows.push(`<row r="${i + 1}"><c r="A${i + 1}" s="${i === 0 ? 4 : 0}" t="inlineStr"><is><t xml:space="preserve">${esc(line)}</t></is></c></row>`));
  rows.push(`<row r="${headRow}">${s.columns.map((c, i) => `<c r="${colName(i)}${headRow}" s="1" t="inlineStr"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`).join('')}</row>`);
  s.rows.forEach((r, n) => {
    const rn = headRow + 1 + n;
    rows.push(`<row r="${rn}">${r.map((v, i) => cellXml(`${colName(i)}${rn}`, v)).join('')}</row>`);
  });
  const lastRow = headRow + Math.max(s.rows.length, 1);
  const cols = s.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 14}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows.join('')}</sheetData>
${s.columns.length ? `<autoFilter ref="A${headRow}:${lastCol}${lastRow}"/>` : ''}
</worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF8B1C24"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF8B1C24"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Tên trang tính: tối đa 31 ký tự, không chứa []:*?/\ và không trùng.
function sheetNames(sheets: XSheet[]) {
  const used = new Set<string>();
  return sheets.map((s, i) => {
    const base = (s.name.replace(/[[\]:*?/\\]/g, ' ').trim() || `Trang ${i + 1}`).slice(0, 31);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function buildXlsx(sheets: XSheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${sheets.map((s, i) => {
      if (!s.columns.length) return '';
      const head = s.intro?.length ? s.intro.length + 2 : 1;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i].replace(/'/g, "''"))}'!$A$${head}:$${colName(s.columns.length - 1)}$${head + Math.max(s.rows.length, 1)}</definedName>`;
    }).join('')}</definedNames></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ];
  return zipStore(files.map(([name, text]) => [name, new TextEncoder().encode(text)]));
}

// ---- Nén ZIP kiểu "store" (không nén), đủ cho Excel đọc ----

let CRC_TABLE: Uint32Array | null = null;
function crc32(data: Uint8Array) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: [string, Uint8Array][]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // tên tệp UTF-8
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    chunks.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
