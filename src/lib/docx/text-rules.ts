// Quy tắc chữ dùng chung cho rà soát file Word và rà soát nhanh đoạn văn bản dán vào.
// Căn cứ: Nghị định 30/2020/NĐ-CP (Phụ lục I, Phụ lục VI) và thói quen trình bày văn bản hành chính.

export type Level = 'nghiem-trong' | 'trung-binh' | 'nho' | 'goi-y';

export const LEVEL_LABEL: Record<Level, string> = {
  'nghiem-trong': 'Nghiêm trọng',
  'trung-binh': 'Trung bình',
  nho: 'Nhỏ',
  'goi-y': 'Gợi ý',
};

export type TextRule = {
  id: string;
  label: string;
  level: Level;
  reason: string;
  re: RegExp; // luôn có cờ g
  fix: (m: RegExpExecArray) => string;
};

// Kiểu đặt dấu thanh "hòa", "thủy" như Nghị định 30 (thay cho "hoà", "thuỷ").
function moveTone(m: RegExpExecArray) {
  const [, first, second] = m;
  const parts = second.normalize('NFD');
  const base = parts[0];
  const mark = parts.slice(1);
  return (first + mark).normalize('NFC') + base;
}

const keepCase = (src: string, to: string) => (src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to);

// Lỗi chính tả hay gặp trong văn bản hành chính (chỉ những cặp chắc chắn sai).
export const TYPOS: [string, string][] = [
  ['sử lý', 'xử lý'], ['xử dụng', 'sử dụng'], ['xắp xếp', 'sắp xếp'], ['chuẩn đoán', 'chẩn đoán'],
  ['sát nhập', 'sáp nhập'], ['năng xuất', 'năng suất'], ['sản suất', 'sản xuất'], ['xuất xắc', 'xuất sắc'],
  ['suất sắc', 'xuất sắc'], ['chia xẻ', 'chia sẻ'], ['chỉnh chu', 'chỉn chu'], ['chuyên nghành', 'chuyên ngành'],
  ['nghành', 'ngành'], ['ngiên cứu', 'nghiên cứu'], ['ngiêm túc', 'nghiêm túc'], ['sơ xuất', 'sơ suất'],
  ['đột suất', 'đột xuất'], ['kiểm xoát', 'kiểm soát'], ['bổ xung', 'bổ sung'], ['sắc xảo', 'sắc sảo'],
  ['xum họp', 'sum họp'], ['chau chuốt', 'trau chuốt'], ['dành mạch', 'rành mạch'], ['lãng mạng', 'lãng mạn'],
  ['sếp loại', 'xếp loại'], ['suất bản', 'xuất bản'], ['giành cho', 'dành cho'], ['tham dư', 'tham dự'],
  ['chuyền đạt', 'truyền đạt'], ['dải quyết', 'giải quyết'], ['bàng giao', 'bàn giao'], ['triễn khai', 'triển khai'],
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TYPO_MAP = new Map(TYPOS.map(([a, b]) => [a, b]));
const TYPO_RE = new RegExp(`(?<!\\p{L})(${TYPOS.map(([a]) => esc(a)).join('|')})(?!\\p{L})`, 'giu');

export const TEXT_RULES: TextRule[] = [
  { id: 'khoang-trang', label: 'Thừa dấu cách', level: 'nho', reason: 'Hai dấu cách liền nhau hoặc dấu cách thừa ở đầu, cuối đoạn.', re: / {2,}/g, fix: () => ' ' },
  { id: 'khoang-trang', label: 'Thừa dấu cách', level: 'nho', reason: 'Hai dấu cách liền nhau hoặc dấu cách thừa ở đầu, cuối đoạn.', re: /^ +| +$/g, fix: () => '' },
  { id: 'cach-truoc-dau', label: 'Dấu cách trước dấu câu', level: 'nho', reason: 'Dấu câu (, . ; : ! ? và ngoặc đóng) đứng sát chữ trước nó.', re: / +(?=[,;:!?)\]”»]|\.(?![.…]))/g, fix: () => '' },
  { id: 'cach-trong-ngoac', label: 'Dấu cách sau ngoặc mở', level: 'nho', reason: 'Ngoặc mở đứng sát chữ sau nó.', re: /(?<=[(\[“«]) +/g, fix: () => '' },
  { id: 'thieu-cach', label: 'Thiếu dấu cách sau dấu câu', level: 'nho', reason: 'Sau dấu phẩy, chấm phẩy, hai chấm phải có một dấu cách.', re: /([,;])(?=\p{L})|(?<!\d|https?|mailto|ftp|[Vv]\/[Vv]):(?=[\p{L}\d])/gu, fix: (m) => (m[1] ?? ':') + ' ' },
  { id: 'thieu-cach', label: 'Thiếu dấu cách sau dấu câu', level: 'nho', reason: 'Sau dấu chấm kết thúc câu phải có một dấu cách.', re: /(?<=[\p{Ll}\d])\.(?=\p{Lu}\p{Ll})/gu, fix: () => '. ' },
  { id: 'dau-lap', label: 'Lặp dấu câu', level: 'nho', reason: 'Văn bản hành chính không dùng "!!", "??".', re: /([!?])\1+/g, fix: (m) => m[1] },
  { id: 'dau-thanh', label: 'Vị trí dấu thanh (hoà → hòa)', level: 'nho', reason: 'Dùng thống nhất kiểu "hòa", "thủy" như Nghị định 30/2020/NĐ-CP.', re: /([oO])([àáảãạÀÁẢÃẠèéẻẽẹÈÉẺẼẸ])(?!\p{L})|(?<![qQ])([uU])([ỳýỷỹỵỲÝỶỸỴ])(?!\p{L})/gu, fix: (m) => moveTone([m[0], m[1] ?? m[3], m[2] ?? m[4]] as unknown as RegExpExecArray) },
  { id: 'khoan-diem', label: 'Viết hoa "khoản", "điểm" khi viện dẫn', level: 'trung-binh', reason: 'Viện dẫn viết "khoản 2 Điều 5", "điểm a khoản 2 Điều 5" (Phụ lục VI, Nghị định 30/2020/NĐ-CP).', re: /(?<![.!?:]\s*)(?<!^\s*)(?<!\p{L})(Khoản|Điểm)(?=\s+[\p{L}\d]{1,3}\s+(?:khoản\s+\d+\s+)?Điều\s+\d)/gu, fix: (m) => m[1].toLowerCase() },
  { id: 'chinh-ta', label: 'Lỗi chính tả thường gặp', level: 'trung-binh', reason: 'Viết sai phụ âm đầu hoặc vần.', re: TYPO_RE, fix: (m) => keepCase(m[1], TYPO_MAP.get(m[1].toLowerCase()) ?? m[1]) },
];

export type TextFinding = { rule: TextRule; count: number; example: string; fixedExample: string };

// Áp các quy tắc lên một chuỗi; trả chuỗi đã sửa và các lỗi tìm thấy.
export function fixText(src: string, rules = TEXT_RULES) {
  let text = src;
  const found = new Map<TextRule, TextFinding>();
  for (const rule of rules) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0] === '' ) { re.lastIndex++; continue; }
      const rep = rule.fix(m);
      if (rep === m[0]) continue;
      const f = found.get(rule) ?? { rule, count: 0, example: '', fixedExample: '' };
      f.count++;
      if (!f.example) {
        const a = Math.max(0, m.index - 18);
        f.example = text.slice(a, m.index + m[0].length + 18);
        f.fixedExample = text.slice(a, m.index) + rep + text.slice(m.index + m[0].length, m.index + m[0].length + 18);
      }
      found.set(rule, f);
      out += text.slice(last, m.index) + rep;
      last = m.index + m[0].length;
    }
    text = out + text.slice(last);
  }
  return { text, findings: [...found.values()] };
}

// Kiểm tra chỉ báo, không tự sửa.
export function checkText(src: string) {
  const notes: { label: string; level: Level; detail: string }[] = [];
  const open = (src.match(/\(/g) ?? []).length;
  const close = (src.match(/\)/g) ?? []).length;
  if (open !== close) notes.push({ label: 'Ngoặc đơn không đóng', level: 'nho', detail: `Có ${open} ngoặc mở và ${close} ngoặc đóng.` });
  const qo = (src.match(/“/g) ?? []).length;
  const qc = (src.match(/”/g) ?? []).length;
  const qs = (src.match(/"/g) ?? []).length;
  if (qo !== qc || qs % 2) notes.push({ label: 'Ngoặc kép không đóng', level: 'nho', detail: 'Số ngoặc kép mở và đóng không khớp.' });
  if (/\p{Extended_Pictographic}/u.test(src)) notes.push({ label: 'Có biểu tượng cảm xúc', level: 'trung-binh', detail: 'Văn bản hành chính không dùng biểu tượng cảm xúc.' });
  const long = src.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim().split(/\s+/).length > 40);
  if (long.length) notes.push({ label: 'Câu quá dài', level: 'goi-y', detail: `${long.length} câu trên 40 chữ, ví dụ: "${long[0].trim().slice(0, 90)}…". Nên tách câu cho dễ đọc.` });
  return notes;
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
