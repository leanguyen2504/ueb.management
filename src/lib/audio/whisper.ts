// Whisper chạy ngay trên trình duyệt (transformers.js, WebGPU nếu có, không thì WebAssembly).
// Thư viện và mô hình tải từ CDN ở lần đầu rồi được trình duyệt lưu lại; audio không gửi đi đâu.
export const MODELS = [
  { id: 'onnx-community/whisper-base', label: 'Nhanh (tải khoảng 100 MB, kém chính xác hơn)' },
  { id: 'onnx-community/whisper-small', label: 'Cân bằng (tải khoảng 300 MB)' },
  { id: 'onnx-community/whisper-large-v3-turbo', label: 'Chính xác nhất (tải khoảng 1 GB, nên dùng máy mạnh)' },
] as const;
export type ModelId = (typeof MODELS)[number]['id'];

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

const WORKER = `
import { pipeline, env } from '${LIB}';
env.allowLocalModels = false;
let asr = null, cur = '';
const files = {};
async function hasGpu() {
  try { return !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { return false; }
}
self.onmessage = async ({ data }) => {
  try {
    if (!asr || cur !== data.model) {
      if (asr) { try { await asr.dispose(); } catch {} asr = null; }
      const gpu = await hasGpu();
      asr = await pipeline('automatic-speech-recognition', data.model, {
        device: gpu ? 'webgpu' : 'wasm',
        dtype: gpu ? { encoder_model: data.model.includes('turbo') ? 'q4' : 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p) => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = [p.loaded, p.total];
          let a = 0, b = 0;
          for (const [l, t] of Object.values(files)) { a += l; b += t; }
          self.postMessage({ type: 'download', loaded: a, total: b });
        },
      });
      cur = data.model;
      self.postMessage({ type: 'ready', device: gpu ? 'webgpu' : 'wasm' });
    }
    const opts = { task: 'transcribe' };
    if (data.lang) opts.language = data.lang;
    const out = await asr(data.pcm, opts);
    self.postMessage({ type: 'text', id: data.id, text: (out.text || '').trim() });
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: String((e && e.message) || e) });
  }
};`;

type Msg =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; id: number; message: string };

let worker: Worker | null = null;
let seq = 0;

export function makeWorker() {
  return new Worker(URL.createObjectURL(new Blob([WORKER], { type: 'text/javascript' })), { type: 'module' });
}

// Nhận dạng một đoạn audio 16 kHz mono (tối đa ~30 giây).
export function transcribe(
  pcm: Float32Array,
  opts: { model: ModelId; lang?: 'vietnamese' | 'english'; onStatus?: (m: Msg) => void },
): Promise<string> {
  worker ??= makeWorker();
  const w = worker;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const on = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === 'download' || m.type === 'ready') return opts.onStatus?.(m);
      if (m.id !== id) return;
      w.removeEventListener('message', on);
      if (m.type === 'text') resolve(m.text);
      else reject(new Error(m.message));
    };
    w.addEventListener('message', on);
    w.onerror = (e) => { w.removeEventListener('message', on); worker = null; reject(new Error(e.message || 'Không tải được bộ nhận dạng giọng nói.')); };
    const copy = pcm.slice();
    w.postMessage({ id, model: opts.model, lang: opts.lang, pcm: copy }, [copy.buffer]);
  });
}

// Dừng hẳn (giải phóng bộ nhớ của mô hình).
export function stopWhisper() {
  worker?.terminate();
  worker = null;
}
