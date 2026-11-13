// Giải mã file audio/video trên trình duyệt, đưa về 16 kHz mono (định dạng Whisper cần) và cắt thành đoạn ngắn.
export const RATE = 16000;

export async function decodeMono16k(file: File): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf);
  } finally {
    ctx.close();
  }
  const len = Math.ceil(decoded.duration * RATE);
  const off = new OfflineAudioContext(1, Math.max(1, len), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination); // trộn các kênh về một kênh
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

// Cắt ở chỗ lặng gần nhất trước mốc `size` giây để không cắt ngang câu.
export function splitAtSilence(pcm: Float32Array, size = 110, search = 12) {
  const parts: { start: number; end: number }[] = [];
  const win = RATE / 10; // 100 ms
  let start = 0;
  while (start < pcm.length) {
    let end = Math.min(pcm.length, start + size * RATE);
    if (end < pcm.length) {
      let best = end, bestE = Infinity;
      for (let p = end; p > end - search * RATE && p > start + win; p -= win) {
        let e = 0;
        for (let i = p - win; i < p; i++) e += pcm[i] * pcm[i];
        if (e < bestE) { bestE = e; best = p; }
      }
      end = best;
    }
    parts.push({ start, end });
    start = end;
  }
  return parts;
}

// Đoạn gần như im lặng: bỏ qua để Whisper không "bịa" chữ.
export function isSilent(pcm: Float32Array) {
  let e = 0;
  for (let i = 0; i < pcm.length; i++) e += pcm[i] * pcm[i];
  return Math.sqrt(e / Math.max(1, pcm.length)) < 0.004;
}
