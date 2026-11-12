// Tạo khung văn bản hành chính (.docx) đúng thể thức Nghị định 30/2020/NĐ-CP:
// khổ A4, lề 20-20-30-15 mm, Times New Roman, bố cục 2 cột phần đầu và phần chữ ký.
import { encode } from './xml';
import { makeEntry, writeZip } from './zip';
import { DOC_TYPES, TNR } from './review';

export type TemplateInput = {
  chuQuan: string;
  coQuan: string;
  loai: string; // tên loại in hoa (DOC_TYPES) hoặc 'CÔNG VĂN'
  so: string;
  kyHieu: string; // phần sau chữ viết tắt tên loại, ví dụ ĐHKT hoặc ĐHKT-VĐTQT (công văn)
  diaDanh: string;
  ngay: string; // YYYY-MM-DD hoặc rỗng
  trichYeu: string;
  kinhGui: string;
  noiDung: string;
  noiNhan: string;
  quyenHan: string; // '', 'TM.', 'KT.', 'TL.', 'TUQ.', 'Q.'
  capTren: string; // chức vụ người đứng đầu khi ký thay, ví dụ HIỆU TRƯỞNG
  chucVu: string;
  hoTen: string;
  duThao: boolean;
};

export function soKyHieu(i: Pick<TemplateInput, 'loai' | 'so' | 'kyHieu'>) {
  const abbr = DOC_TYPES.find(([n]) => n === i.loai)?.[1] ?? '';
  const num = i.so.trim() ? (/^\d$/.test(i.so.trim()) ? '0' + i.so.trim() : i.so.trim()) : '       ';
  const tail = i.kyHieu.trim().toUpperCase().replace(/\s*-\s*/g, '-');
  return `Số: ${num}/${abbr ? `${abbr}${tail ? '-' : ''}` : ''}${tail}`;
}

export function dongNgay(diaDanh: string, ngay: string) {
  const place = diaDanh.trim() || 'Hà Nội';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return `${place}, ngày      tháng      năm ${new Date().getFullYear()}`;
  const [y, m, d] = ngay.split('-').map(Number);
  return `${place}, ngày ${String(d).padStart(2, '0')} tháng ${m <= 2 ? String(m).padStart(2, '0') : m} năm ${y}`;
}

type RunOpt = { size?: number; b?: boolean; i?: boolean };
const run = (text: string, o: RunOpt = {}) =>
  `<w:r><w:rPr><w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}" w:cs="${TNR}" w:eastAsia="${TNR}"/>${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${o.size ?? 28}"/><w:szCs w:val="${o.size ?? 28}"/></w:rPr><w:t xml:space="preserve">${encode(text)}</w:t></w:r>`;
type ParaOpt = RunOpt & { jc?: string; first?: number; after?: number; before?: number; line?: number; left?: number; keep?: boolean };
const para = (text: string, o: ParaOpt = {}) =>
  `<w:p><w:pPr>${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="${o.line ?? 240}" w:lineRule="auto"/>${o.first || o.left ? `<w:ind${o.left ? ` w:left="${o.left}"` : ''}${o.first ? ` w:firstLine="${o.first}"` : ''}/>` : ''}<w:jc w:val="${o.jc ?? 'center'}"/></w:pPr>${text ? run(text, o) : ''}</w:p>`;
// Đường kẻ ngắn canh giữa: đoạn trống có viền dưới, thu hẹp bằng thụt lề hai bên.
const rule = (indent: number) =>
  `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="120" w:line="120" w:lineRule="exact"/><w:ind w:left="${indent}" w:right="${indent}"/><w:jc w:val="center"/></w:pPr></w:p>`;

const cell = (w: number, inner: string) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${inner}</w:tc>`;
const table = (cols: [number, string][]) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${cols.reduce((s, c) => s + c[0], 0)}" w:type="dxa"/><w:tblInd w:w="-108" w:type="dxa"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid>${cols.map((c) => `<w:gridCol w:w="${c[0]}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cols.map(([w, inner]) => cell(w, inner)).join('')}</w:tr></w:tbl>`;

const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function templateDocumentXml(i: TemplateInput) {
  const cv = i.loai === 'CÔNG VĂN';
  const left = 3900;
  const right = 5454;
  const head = table([
    [left, [
      i.chuQuan.trim() ? para(i.chuQuan.trim().toUpperCase(), { size: 26 }) : '',
      para(i.coQuan.trim().toUpperCase() || 'TÊN CƠ QUAN BAN HÀNH', { size: 26, b: true }),
      rule(1150),
      para(soKyHieu(i), { size: 26 }),
      cv ? para(`V/v ${i.trichYeu.trim() || '...'}`, { size: 24, before: 60 }) : '',
    ].join('')],
    [right, [
      para('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { size: 24, b: true }),
      para('Độc lập - Tự do - Hạnh phúc', { size: 26, b: true }),
      rule(950),
      para(dongNgay(i.diaDanh, i.ngay), { size: 28, i: true, before: 60 }),
    ].join('')],
  ]);
  const draft = i.duThao
    ? `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="000000"/><w:left w:val="single" w:sz="6" w:space="4" w:color="000000"/><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/><w:right w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr><w:spacing w:after="120"/><w:ind w:left="7400"/><w:jc w:val="center"/></w:pPr>${run('DỰ THẢO', { size: 26, b: true })}</w:p>`
    : '';
  const title = cv
    ? para('', { after: 240 })
    : para('', { after: 120 }) + para(i.loai, { b: true, size: 28, before: 240 }) + para(i.trichYeu.trim() || 'Trích yếu nội dung văn bản', { b: true, size: 28 }) + rule(3200);
  const kinhGui = cv
    ? lines(i.kinhGui).map((k, n, all) => para(n === 0 ? `Kính gửi: ${k}` : k, { size: 28, jc: all.length > 1 ? 'left' : 'center', left: all.length > 1 ? (n === 0 ? 1985 : 3110) : 0, after: n === all.length - 1 ? 240 : 0 })).join('') || para('Kính gửi: ...', { size: 28, after: 240 })
    : '';
  const bodyLines = lines(i.noiDung);
  // Hai đoạn cuối giữ liền với phần ký để trang chữ ký luôn có nội dung phía trên.
  const bl = bodyLines.length ? bodyLines : ['Nội dung văn bản.'];
  const body = bl.map((t, k) => ({ t, keep: k >= bl.length - 2 })).map(({ t, keep }) =>
    /^(QUYẾT ĐỊNH|QUYẾT NGHỊ)\s*:?$/.test(t) ? para(t.replace(/\s*:?$/, ':'), { b: true, size: 28, before: 120, after: 120, keep })
      : /^(Căn cứ|Theo đề nghị|Xét đề nghị)/i.test(t) ? para(t, { i: true, jc: 'both', first: 567, after: 120, line: 276, keep })
        : para(t, { jc: 'both', first: 567, after: 120, line: 276, b: /^(Điều \d+\.|[IVX]+\.\s)/.test(t), keep }),
  ).join('');
  const recips = lines(i.noiNhan);
  const nn = recips.length ? recips : ['Như trên', 'Lưu: VT'];
  const noiNhan = para('Nơi nhận:', { size: 24, b: true, i: true, jc: 'left' }) + nn.map((r, n) => {
    const t = r.replace(/^[-–+•]\s*/, '').replace(/[;.,]+$/, '');
    return para(`- ${t}${n === nn.length - 1 ? '.' : ';'}`, { size: 22, jc: 'left' });
  }).join('');
  const role = (i.quyenHan ? [`${i.quyenHan} ${(i.capTren || 'THỦ TRƯỞNG CƠ QUAN').toUpperCase()}`] : []).concat((i.chucVu || 'CHỨC VỤ NGƯỜI KÝ').toUpperCase());
  const sign = role.map((r) => para(r, { size: 28, b: true })).join('') + para('', {}) + para('', {}) + para('', {}) + para('', {}) + para(i.hoTen.trim() || 'Họ và tên', { size: 28, b: true });
  const signTable = table([[4300, noiNhan], [5054, sign]]);
  const sect = `<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="720"/><w:titlePg/><w:docGrid w:linePitch="381"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${draft}${head}${title}${kinhGui}${body}${para('', { after: 120, keep: true })}${signTable}${sect}</w:body></w:document>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}" w:cs="${TNR}" w:eastAsia="${TNR}"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="vi-VN" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;

const HEADER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>2</w:t></w:r></w:fldSimple></w:p></w:hdr>`;

export async function buildTemplateDocx(i: TemplateInput): Promise<Uint8Array> {
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`],
    ['word/document.xml', templateDocumentXml(i)],
    ['word/styles.xml', STYLES],
    ['word/header1.xml', HEADER],
  ];
  return writeZip(await Promise.all(files.map(([n, t]) => makeEntry(n, t))));
}
