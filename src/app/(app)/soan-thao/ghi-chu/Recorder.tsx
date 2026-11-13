'use client';

// Ghi âm bằng micro của máy: tạm dừng, tiếp tục, lưu ngay trong trình duyệt, nghe lại, tải về, chuyển thành chữ.
import { useEffect, useRef, useState } from 'react';
import { delRec, listRecs, putRec, type Rec } from '@/lib/audio/recordings';
import { fmt } from './AudioTranscribe';

const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' };
const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
const stamp = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;

export function recFile(r: Rec) {
  const ext = EXT[r.blob.type.split(';')[0]] ?? 'webm';
  return new File([r.blob], `${r.name}.${ext}`, { type: r.blob.type });
}

export function Recorder({ onTranscribe }: { onTranscribe: (f: File) => void }) {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [state, setState] = useState<'idle' | 'rec' | 'paused'>('idle');
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const mr = useRef<MediaRecorder | null>(null);
  const parts = useRef<Blob[]>([]);
  const clock = useRef<{ acc: number; from: number }>({ acc: 0, from: 0 });
  const raf = useRef(0);

  const refresh = () => listRecs().then(setRecs).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const u: Record<string, string> = {};
    for (const r of recs) u[r.id] = URL.createObjectURL(r.blob);
    setUrls(u);
    return () => Object.values(u).forEach((x) => URL.revokeObjectURL(x));
  }, [recs]);
  useEffect(() => {
    if (state !== 'rec') return;
    const t = setInterval(() => setSecs(Math.floor((clock.current.acc + Date.now() - clock.current.from) / 1000)), 250);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => { cancelAnimationFrame(raf.current); mr.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  async function start() {
    setErr('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setErr('Không mở được micro. Hãy cho phép trang dùng micro (biểu tượng ổ khóa cạnh địa chỉ trang) rồi thử lại.');
      return;
    }
    const mime = pickMime();
    const m = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    parts.current = [];
    m.ondataavailable = (e) => { if (e.data.size) parts.current.push(e.data); };
    m.onstop = async () => {
      cancelAnimationFrame(raf.current);
      stream.getTracks().forEach((t) => t.stop());
      const duration = Math.round(clock.current.acc / 1000);
      const blob = new Blob(parts.current, { type: m.mimeType || 'audio/webm' });
      const now = new Date();
      await putRec({ id: crypto.randomUUID(), name: `Ghi âm ${stamp(now)}`, created: now.getTime(), duration, blob }).catch(() => setErr('Không lưu được bản ghi âm trên trình duyệt này.'));
      setLevel(0);
      refresh();
    };
    m.start(1000);
    mr.current = m;
    clock.current = { acc: 0, from: Date.now() };
    setSecs(0);
    setState('rec');
    // Thanh mức âm để biết micro đang thu.
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let p = 0;
      for (const v of buf) p = Math.max(p, Math.abs(v - 128));
      setLevel(p / 128);
      if (stream.active) raf.current = requestAnimationFrame(tick);
      else ctx.close();
    };
    tick();
  }

  function pause() {
    const m = mr.current;
    if (!m) return;
    if (m.state === 'recording') {
      m.pause();
      clock.current = { acc: clock.current.acc + Date.now() - clock.current.from, from: 0 };
      setState('paused');
    } else if (m.state === 'paused') {
      m.resume();
      clock.current.from = Date.now();
      setState('rec');
    }
  }

  function finish() {
    const m = mr.current;
    if (!m) return;
    if (m.state === 'recording') clock.current = { acc: clock.current.acc + Date.now() - clock.current.from, from: 0 };
    m.stop();
    mr.current = null;
    setState('idle');
  }

  async function rename(r: Rec) {
    const name = prompt('Tên bản ghi âm', r.name)?.trim();
    if (name && name !== r.name) { await putRec({ ...r, name }); refresh(); }
  }

  async function remove(r: Rec) {
    if (!confirm(`Xóa “${r.name}”?`)) return;
    await delRec(r.id);
    refresh();
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Ghi âm</h2>
        <p className="mt-1 text-sm muted">Ghi âm cuộc họp, buổi làm việc bằng micro của máy. Bản ghi lưu ngay trên trình duyệt này (không tải lên máy chủ), có thể nghe lại, tải về hoặc chuyển thành chữ.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {state === 'idle' ? (
          <button type="button" className="btn" onClick={start}><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden />Bắt đầu ghi âm</button>
        ) : (
          <>
            <button type="button" className="btn-secondary px-3 py-1.5" onClick={pause}>{state === 'rec' ? 'Tạm dừng' : 'Tiếp tục'}</button>
            <button type="button" className="btn" onClick={finish}>Dừng và lưu</button>
            <span className={`inline-flex items-center gap-2 font-mono text-lg tabular-nums ${state === 'rec' ? 'text-red-600 dark:text-red-400' : 'muted'}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${state === 'rec' ? 'animate-pulse bg-red-500' : 'bg-slate-400'}`} aria-hidden />
              {fmt(secs)}
            </span>
            <div className="h-2 w-32 overflow-hidden rounded bg-slate-200 dark:bg-slate-700" aria-label="Mức âm"><div className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.min(100, level * 160)}%` }} /></div>
            {state === 'paused' && <span className="text-sm muted">Đang tạm dừng</span>}
          </>
        )}
      </div>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      {recs.length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
          {recs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="text-xs muted">{fmt(r.duration)} · {(r.blob.size / 1048576).toFixed(1)} MB</div>
              </div>
              {urls[r.id] && <audio controls preload="none" src={urls[r.id]} className="h-9 max-w-full" />}
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="btn px-2.5 py-1 text-xs" onClick={() => onTranscribe(recFile(r))}>Chuyển thành chữ</button>
                <a className="btn-secondary px-2.5 py-1 text-xs" href={urls[r.id]} download={recFile(r).name}>Tải về</a>
                <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => rename(r)}>Đổi tên</button>
                <button type="button" className="btn-secondary px-2.5 py-1 text-xs text-red-600 dark:text-red-400" onClick={() => remove(r)}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
