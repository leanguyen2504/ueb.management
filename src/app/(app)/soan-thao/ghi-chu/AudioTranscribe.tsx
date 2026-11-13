'use client';

// Chuyển ghi âm (tiếng Việt, tiếng Anh hoặc xen kẽ) thành văn bản bằng Whisper chạy ngay trên trình duyệt:
// audio không rời khỏi máy. File được cắt thành đoạn ~28 giây ở chỗ lặng, nhận dạng lần lượt, có mốc thời gian.
import { useEffect, useRef, useState } from 'react';
import { download } from '../ReviewBox';
import { MODELS, type ModelId } from '@/lib/audio/whisper';

type Lang = 'auto' | 'vi' | 'en';
export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const base = (n: string) => n.replace(/\.[^.]+$/, '');
const MB = (n: number) => `${Math.round(n / 1048576)} MB`;

export function AudioTranscribe({ incoming, onToNote }: { incoming?: File | null; onToNote: (title: string, text: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [lang, setLang] = useState<Lang>('auto');
  const [model, setModel] = useState<ModelId>('onnx-community/whisper-small');
  const [stamps, setStamps] = useState(true);
  const [text, setText] = useState('');
  const [stage, setStage] = useState('');
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = useRef(false);
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!incoming) return;
    setFile(incoming);
    setText('');
    setStage('');
    setErr('');
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [incoming]);

  async function run() {
    if (!file) return;
    setBusy(true);
    setErr('');
    setText('');
    stop.current = false;
    try {
      setStage('Đang đọc file…');
      const { decodeMono16k, splitAtSilence, isSilent, RATE } = await import('@/lib/audio/chunks');
      const { transcribe } = await import('@/lib/audio/whisper');
      let pcm: Float32Array;
      try {
        pcm = await decodeMono16k(file);
      } catch {
        throw new Error('Trình duyệt không đọc được file này. Hãy dùng MP3, M4A, WAV, OGG, WEBM hoặc MP4.');
      }
      const parts = splitAtSilence(pcm, 28, 6);
      const total = `${fmt(pcm.length / RATE)}`;
      setStage(`Độ dài ${total}. Đang chuẩn bị bộ nhận dạng (lần đầu cần tải về, các lần sau dùng lại)…`);
      let all = '';
      for (let i = 0; i < parts.length; i++) {
        if (stop.current) break;
        setProg([i, parts.length]);
        const seg = pcm.subarray(parts[i].start, parts[i].end);
        if (isSilent(seg)) continue;
        const t = await transcribe(seg, {
          model,
          lang: lang === 'vi' ? 'vietnamese' : lang === 'en' ? 'english' : undefined,
          onStatus: (m) => {
            if (m.type === 'download') setStage(`Đang tải bộ nhận dạng: ${MB(m.loaded)} / ${MB(m.total)}`);
            if (m.type === 'ready') setStage(`Độ dài ${total}. Đang nhận dạng${m.device === 'webgpu' ? ' (dùng card đồ họa)' : ''}…`);
          },
        });
        if (!t) continue;
        const line = stamps ? `[${fmt(parts[i].start / RATE)}] ${t}` : t;
        all = all ? `${all}${stamps ? '\n' : ' '}${line}` : line;
        setText(all);
      }
      setProg(null);
      setStage(stop.current ? 'Đã dừng. Phần đã chuyển vẫn giữ bên dưới.' : `Xong: ${total} audio.`);
    } catch (e) {
      setErr(e instanceof Error ? `Không chuyển được: ${e.message}` : 'Không chuyển được.');
      setProg(null);
      setStage('');
    } finally {
      setBusy(false);
    }
  }

  async function saveDocx() {
    const { P, buildFormDocx } = await import('@/lib/docx/forms');
    const name = file ? base(file.name) : 'transcript';
    const body = () => P(`TRANSCRIPT: ${name}`, { b: true, jc: 'center', after: 200 }) + text.split('\n').filter((l) => l.trim()).map((l) => P(l.trim(), { after: 80 })).join('');
    download(await buildFormDocx({ key: 'transcript', label: '', group: 'Hành chính', note: '', fields: [], file: () => name, body }, {}), `${name}_transcript.docx`);
  }

  return (
    <section ref={box} className="card scroll-mt-4 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Chuyển ghi âm thành văn bản</h2>
        <p className="mt-1 text-sm muted">Ghi âm cuộc họp, bài giảng, phỏng vấn bằng tiếng Việt, tiếng Anh hoặc xen kẽ. Nhận dạng chạy ngay trên máy này, audio không gửi lên mạng. Lần đầu cần tải bộ nhận dạng về trình duyệt, các lần sau dùng lại.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="btn-secondary cursor-pointer px-3 py-1.5">
          <input type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.mp4" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setText(''); setStage(''); setErr(''); } e.target.value = ''; }} />
          {file ? 'Chọn file khác' : 'Chọn file ghi âm'}
        </label>
        {file ? <span className="min-w-0 truncate"><b>{file.name}</b> <span className="muted">({(file.size / 1048576).toFixed(1)} MB)</span></span> : <span className="muted">hoặc bấm “Chuyển thành chữ” ở một bản ghi âm phía trên</span>}
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2 whitespace-nowrap">Ngôn ngữ
          <select className="input w-auto py-1" value={lang} disabled={busy} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="auto">Tiếng Việt xen tiếng Anh (tự nhận)</option>
            <option value="vi">Tiếng Việt</option>
            <option value="en">Tiếng Anh</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 whitespace-nowrap">Chế độ
          <select className="input w-auto py-1" value={model} disabled={busy} onChange={(e) => setModel(e.target.value as ModelId)}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={stamps} disabled={busy} onChange={(e) => setStamps(e.target.checked)} /> Mốc thời gian</label>
        <div className="ml-auto flex gap-2">
          {busy && <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => { stop.current = true; }}>Dừng</button>}
          <button type="button" className="btn" disabled={!file || busy} onClick={run}>{busy ? 'Đang chuyển…' : 'Chuyển thành văn bản'}</button>
        </div>
      </div>
      {(stage || prog) && (
        <div className="space-y-1 text-sm">
          <p className="muted">{stage}{prog && ` · đoạn ${prog[0] + 1}/${prog[1]}`}</p>
          {prog && <div className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-700"><div className="h-full bg-brand-600 transition-all" style={{ width: `${(prog[0] / prog[1]) * 100}%` }} /></div>}
        </div>
      )}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      {text && (
        <>
          <textarea className="input min-h-[280px] text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} aria-label="Transcript" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn px-3 py-1.5 text-sm" onClick={() => onToNote(file ? base(file.name) : 'Transcript', text)}>Lưu thành ghi chú</button>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => navigator.clipboard.writeText(text)}>Sao chép</button>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => download(new TextEncoder().encode(text), `${file ? base(file.name) : 'transcript'}_transcript.txt`, 'text/plain;charset=utf-8')}>Tải .txt</button>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={saveDocx}>Tải Word (.docx)</button>
          </div>
          <p className="text-xs muted">Kết quả do máy nhận dạng, nên đọc soát lại tên riêng, số liệu và thuật ngữ trước khi dùng.</p>
        </>
      )}
    </section>
  );
}
