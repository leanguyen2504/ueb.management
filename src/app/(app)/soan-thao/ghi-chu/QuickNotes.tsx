'use client';

// Ghi chú nhanh: lưu tự động trên trình duyệt này, tìm kiếm, ghim, đọc để máy gõ, chèn giờ,
// danh sách việc cần làm, mẫu biên bản họp, tải .txt hoặc Word.
import { useEffect, useMemo, useRef, useState } from 'react';
import { download } from '../ReviewBox';

export type Note = { id: string; title: string; body: string; pinned?: boolean; updated: number };
const KEY = 'ueb-ghi-chu-v1';

export function loadNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}
export const newNote = (title = '', body = ''): Note => ({ id: crypto.randomUUID(), title, body, updated: Date.now() });

const two = (n: number) => String(n).padStart(2, '0');
const now = () => { const d = new Date(); return `${two(d.getHours())}:${two(d.getMinutes())} ${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`; };
const when = (t: number) => { const d = new Date(t); const same = d.toDateString() === new Date().toDateString(); return same ? `${two(d.getHours())}:${two(d.getMinutes())}` : `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`; };
const titleOf = (n: Note) => n.title.trim() || n.body.trim().split('\n')[0].slice(0, 60) || 'Ghi chú trống';
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'ghi-chu';

const TEMPLATES: Record<string, (t: string) => string> = {
  'Biên bản họp': (t) => `Thời gian: ${t}\nĐịa điểm: \nChủ trì: \nThư ký: \nThành phần: \n\nNội dung:\n1. \n\nKết luận:\n- \n\nViệc cần làm:\n☐ \n`,
  'Ghi chú làm việc trong ngày': (t) => `Ngày: ${t.slice(6)}\n\nViệc cần làm:\n☐ \n☐ \n\nĐã xong:\n☑ \n\nGhi chú:\n`,
  'Cuộc gọi, tiếp khách': (t) => `Thời gian: ${t}\nNgười liên hệ: \nĐơn vị: \nĐiện thoại, email: \n\nNội dung trao đổi:\n- \n\nHẹn xử lý:\n☐ \n`,
};

type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const speechApi = () => (typeof window === 'undefined' ? null : ((window as unknown as Record<string, new () => SR>).SpeechRecognition ?? (window as unknown as Record<string, new () => SR>).webkitSpeechRecognition ?? null));

export function QuickNotes({ notes, setNotes, openId, setOpenId }: { notes: Note[]; setNotes: (f: (n: Note[]) => Note[]) => void; openId: string | null; setOpenId: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [dictLang, setDictLang] = useState('vi-VN');
  const [err, setErr] = useState('');
  const [hasSpeech, setHasSpeech] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const rec = useRef<SR | null>(null);
  const target = useRef(openId);
  target.current = openId;

  useEffect(() => setHasSpeech(!!speechApi()), []);
  useEffect(() => () => rec.current?.stop(), []);

  const cur = notes.find((n) => n.id === openId) ?? null;
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return notes
      .filter((n) => !k || `${n.title}\n${n.body}`.toLowerCase().includes(k))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated);
  }, [notes, q]);

  const patch = (p: Partial<Note>) => cur && setNotes((ns) => ns.map((n) => (n.id === cur.id ? { ...n, ...p, updated: Date.now() } : n)));

  function create(body = '') {
    const n = newNote('', body);
    setNotes((ns) => [n, ...ns]);
    setOpenId(n.id);
    target.current = n.id;
    setTimeout(() => area.current?.focus(), 0);
  }

  // Chèn văn bản tại con trỏ (hoặc cuối ghi chú) rồi đặt con trỏ sau đoạn vừa chèn.
  function insert(text: string, atLineStart = false) {
    if (!cur) return create(text);
    const el = area.current;
    const body = cur.body;
    let pos = el && document.activeElement === el ? el.selectionStart : body.length;
    if (atLineStart) pos = body.lastIndexOf('\n', pos - 1) + 1;
    const next = body.slice(0, pos) + text + body.slice(pos);
    patch({ body: next });
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(pos + text.length, pos + text.length); } });
  }

  // Bấm "Xong" khi con trỏ ở một dòng việc: ☐ thành ☑ và ngược lại; dòng thường thì thêm ☐.
  function toggleTask() {
    if (!cur) return create('☐ ');
    const el = area.current;
    const body = cur.body;
    const pos = el ? el.selectionStart : body.length;
    const s = body.lastIndexOf('\n', pos - 1) + 1;
    const ch = body[s];
    const next = ch === '☐' ? `${body.slice(0, s)}☑${body.slice(s + 1)}` : ch === '☑' ? `${body.slice(0, s)}☐${body.slice(s + 1)}` : `${body.slice(0, s)}☐ ${body.slice(s)}`;
    patch({ body: next });
    const p = pos + (next.length - body.length);
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(p, p); } });
  }

  function dictate() {
    if (listening) { rec.current?.stop(); return; }
    const Api = speechApi();
    if (!Api) return;
    setErr('');
    const r = new Api();
    r.lang = dictLang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = '', mid = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else mid += t;
      }
      setInterim(mid);
      if (fin.trim()) {
        const t = fin.trim();
        setNotes((ns) => ns.map((n) => (n.id === target.current ? { ...n, body: n.body + (n.body && !/\s$/.test(n.body) ? ' ' : '') + t, updated: Date.now() } : n)));
      }
    };
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? 'Chưa được phép dùng micro.' : e.error === 'no-speech' ? '' : 'Đọc để ghi bị gián đoạn, bấm lại để tiếp tục.');
    r.onend = () => { setListening(false); setInterim(''); };
    if (!cur) create();
    rec.current = r;
    r.start();
    setListening(true);
  }

  async function saveDocx() {
    if (!cur) return;
    const { P, buildFormDocx } = await import('@/lib/docx/forms');
    const name = safe(titleOf(cur));
    const body = () => P(titleOf(cur).toUpperCase(), { b: true, jc: 'center', after: 200 }) + cur.body.split('\n').map((l) => P(l)).join('');
    download(await buildFormDocx({ key: 'ghi-chu', label: '', group: 'Hành chính', note: '', fields: [], file: () => name, body }, {}), `${name}.docx`);
  }

  function remove() {
    if (!cur || (cur.body.trim() && !confirm(`Xóa ghi chú “${titleOf(cur)}”?`))) return;
    setNotes((ns) => ns.filter((n) => n.id !== cur.id));
    setOpenId(null);
  }

  const words = cur ? (cur.body.trim().match(/\S+/g) ?? []).length : 0;

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Ghi chú nhanh</h2>
          <p className="mt-1 text-sm muted">Gõ là tự lưu trên trình duyệt này. Có thể đọc để máy gõ, đánh dấu việc cần làm, dùng mẫu biên bản họp.</p>
        </div>
        <button type="button" className="btn" onClick={() => create()}>+ Ghi chú mới</button>
      </div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <input className="input py-1.5" placeholder="Tìm trong ghi chú…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm ghi chú" />
          <ul className="max-h-[440px] space-y-1 overflow-y-auto pr-1" aria-label="Danh sách ghi chú">
            {shown.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setOpenId(n.id)} aria-current={n.id === openId ? 'true' : undefined}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${n.id === openId ? 'border-brand-600 bg-brand-50 dark:border-brand-300 dark:bg-brand-900/30' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'}`}>
                  <div className="flex items-center gap-1.5"><span className="min-w-0 flex-1 truncate font-medium">{titleOf(n)}</span>{n.pinned && <span className="text-xs text-gold-600" title="Đã ghim">★</span>}</div>
                  <div className="truncate text-xs muted">{when(n.updated)} · {n.body.replace(/\s+/g, ' ').slice(0, 50) || 'Chưa có nội dung'}</div>
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-1 py-3 text-sm muted">{notes.length ? 'Không có ghi chú khớp.' : 'Chưa có ghi chú nào.'}</li>}
          </ul>
        </div>
        {cur ? (
          <div className="min-w-0 space-y-2">
            <input className="input font-semibold" placeholder="Tiêu đề" value={cur.title} onChange={(e) => patch({ title: e.target.value })} aria-label="Tiêu đề ghi chú" />
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {hasSpeech && (
                <span className="inline-flex items-center gap-1">
                  <button type="button" onClick={dictate} className={`${listening ? 'btn' : 'btn-secondary'} px-2.5 py-1 text-xs`}>{listening ? '■ Dừng đọc' : '🎤 Đọc để ghi'}</button>
                  <select className="input w-auto py-1 text-xs" value={dictLang} disabled={listening} onChange={(e) => setDictLang(e.target.value)} aria-label="Ngôn ngữ đọc">
                    <option value="vi-VN">Tiếng Việt</option>
                    <option value="en-US">Tiếng Anh</option>
                  </select>
                </span>
              )}
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => insert(`[${now()}] `)}>Chèn giờ</button>
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={toggleTask} title="Thêm ô việc cần làm ở dòng đang đứng, bấm lần nữa để đánh dấu xong">☐/☑ Việc cần làm</button>
              <select className="input w-auto py-1 text-xs" value="" onChange={(e) => { const f = TEMPLATES[e.target.value]; if (f) insert(f(now())); }} aria-label="Chèn mẫu">
                <option value="">Chèn mẫu…</option>
                {Object.keys(TEMPLATES).map((k) => <option key={k}>{k}</option>)}
              </select>
              <button type="button" className="btn-secondary px-2.5 py-1 text-xs" onClick={() => patch({ pinned: !cur.pinned })}>{cur.pinned ? '★ Bỏ ghim' : '☆ Ghim'}</button>
            </div>
            <textarea ref={area} className="input min-h-[320px] text-sm leading-relaxed" value={cur.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Nội dung ghi chú…" aria-label="Nội dung ghi chú" />
            {(interim || listening) && <p className="text-sm italic muted">{interim || 'Đang nghe…'}</p>}
            {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => navigator.clipboard.writeText(cur.title ? `${cur.title}\n\n${cur.body}` : cur.body)}>Sao chép</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => download(new TextEncoder().encode(cur.title ? `${cur.title}\n\n${cur.body}` : cur.body), `${safe(titleOf(cur))}.txt`, 'text/plain;charset=utf-8')}>Tải .txt</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={saveDocx}>Tải Word (.docx)</button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-sm text-red-600 dark:text-red-400" onClick={remove}>Xóa</button>
              <span className="ml-auto text-xs muted">{words} từ · {cur.body.length} ký tự · đã lưu {when(cur.updated)}</span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm muted dark:border-slate-700">Chọn một ghi chú bên trái hoặc bấm “Ghi chú mới”.</div>
        )}
      </div>
      <p className="text-xs muted">Ghi chú và bản ghi âm chỉ nằm trên trình duyệt của máy này. Xóa dữ liệu duyệt web hoặc đổi máy sẽ không còn, nên tải về những gì cần giữ.</p>
    </section>
  );
}
