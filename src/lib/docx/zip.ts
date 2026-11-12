// Đọc và ghi file ZIP (vỏ của .docx) bằng API có sẵn trong trình duyệt và Node 20+
// (DecompressionStream/CompressionStream), không cần thư viện ngoài.

export type ZipEntry = {
  name: string;
  method: number; // 0: không nén, 8: deflate
  crc: number;
  size: number;
  comp: Uint8Array; // dữ liệu như trong file (đã nén nếu method = 8)
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const body = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export function readZip(buf: Uint8Array): ZipEntry[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Không phải file Word (.docx) hợp lệ.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('File Word bị hỏng (mục lục ZIP sai).');
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const compSize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const lName = v.getUint16(local + 26, true);
    const lExtra = v.getUint16(local + 28, true);
    const start = local + 30 + lName + lExtra;
    out.push({ name, method, crc, size, comp: buf.subarray(start, start + compSize) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function unzipText(e: ZipEntry): Promise<string> {
  const raw = e.method === 0 ? e.comp : await pipe(e.comp, new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(raw);
}

let CRC_TABLE: Uint32Array | null = null;
export function crc32(data: Uint8Array) {
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

export async function makeEntry(name: string, text: string | Uint8Array): Promise<ZipEntry> {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const comp = await pipe(data, new CompressionStream('deflate-raw'));
  return { name, method: 8, crc: crc32(data), size: data.length, comp };
}

export function writeZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nb = enc.encode(e.name);
    const local = new Uint8Array(30 + nb.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, e.method, true);
    lv.setUint32(14, e.crc, true);
    lv.setUint32(18, e.comp.length, true);
    lv.setUint32(22, e.size, true);
    lv.setUint16(26, nb.length, true);
    local.set(nb, 30);
    parts.push(local, e.comp);

    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, e.method, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.comp.length, true);
    cv.setUint32(24, e.size, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nb, 46);
    central.push(cd);
    offset += local.length + e.comp.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let q = 0;
  for (const c of all) { out.set(c, q); q += c.length; }
  return out;
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
