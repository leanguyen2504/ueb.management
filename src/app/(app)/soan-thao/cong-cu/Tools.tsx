'use client';

// Công cụ soạn thảo chạy trên trình duyệt: tạo khung văn bản .docx và rà soát nhanh một đoạn chữ.
import { useEffect, useState } from 'react';
import { DOC_TYPES } from '@/lib/docx/review';
import { dongNgay, soKyHieu, type TemplateInput } from '@/lib/docx/template';
import { LEVEL_LABEL, checkText, fixText, wordCount } from '@/lib/docx/text-rules';
import { download } from '../ReviewBox';

const STORE = 'soan-thao:khung';
const DEFAULTS: TemplateInput = {
  chuQuan: 'ĐẠI HỌC QUỐC GIA HÀ NỘI', coQuan: 'TRƯỜNG ĐẠI HỌC KINH TẾ', loai: 'BÁO CÁO', so: '', kyHieu: 'ĐHKT',
  diaDanh: 'Hà Nội', ngay: '', trichYeu: '', kinhGui: '', noiDung: '', noiNhan: 'Như trên\nLưu: VT', quyenHan: '',
  capTren: 'HIỆU TRƯỞNG', chucVu: 'HIỆU TRƯỞNG', hoTen: '', duThao: false,
};
// Những ô giữ lại cho lần sau (thông tin cơ quan, người ký).
const KEEP: (keyof TemplateInput)[] = ['chuQuan', 'coQuan', 'kyHieu', 'diaDanh', 'quyenHan', 'capTren', 'chucVu', 'hoTen'];

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

export function TemplateForm() {
  const [v, setV] = useState<TemplateInput>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || '{}') as Partial<TemplateInput>;
      setV((cur) => ({ ...cur, ...Object.fromEntries(KEEP.filter((k) => typeof saved[k] === typeof cur[k]).map((k) => [k, saved[k]])) }));
    } catch {}
  }, []);
  const set = <K extends keyof TemplateInput>(k: K, val: TemplateInput[K]) => setV((cur) => ({ ...cur, [k]: val }));
  const cv = v.loai === 'CÔNG VĂN';

  async function make() {
    setBusy(true);
    try {
      localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(KEEP.map((k) => [k, v[k]]))));
      const { buildTemplateDocx } = await import('@/lib/docx/template');
      const bytes = await buildTemplateDocx(v);
      const abbr = DOC_TYPES.find(([n]) => n === v.loai)?.[1] || 'CV';
      download(bytes, `${abbr}_${slug(v.trichYeu) || 'khung_van_ban'}.docx`);
    } finally {
      setBusy(false);
    }
  }

  const txt = (k: keyof TemplateInput, label: string, ph = '', cls = '') => (
    <label className={cls}>
      <span className="label">{label}</span>
      <input className="input" value={String(v[k])} placeholder={ph} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Tạo khung văn bản đúng thể thức</h2>
        <p className="mt-1 text-sm muted">Điền thông tin, tải về file Word đã trình bày sẵn Quốc hiệu, tên cơ quan, số ký hiệu, ngày tháng, nơi nhận, chữ ký theo Nghị định 30/2020/NĐ-CP. Nội dung viết tiếp trong Word.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          <span className="label">Loại văn bản</span>
          <select className="input" value={v.loai} onChange={(e) => set('loai', e.target.value)}>
            <option value="CÔNG VĂN">Công văn</option>
            {DOC_TYPES.filter(([, a]) => a).map(([n]) => <option key={n} value={n}>{n.charAt(0) + n.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        {txt('so', 'Số', 'Để trống nếu văn thư cấp số')}
        {txt('kyHieu', cv ? 'Ký hiệu (cơ quan-đơn vị)' : 'Ký hiệu cơ quan', cv ? 'ĐHKT-VĐTQT' : 'ĐHKT')}
        <label>
          <span className="label">Ngày ban hành</span>
          <input type="date" className="input" value={v.ngay} onChange={(e) => set('ngay', e.target.value)} />
        </label>
        {txt('chuQuan', 'Cơ quan chủ quản')}
        {txt('coQuan', 'Cơ quan ban hành')}
        {txt('diaDanh', 'Địa danh')}
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={v.duThao} onChange={(e) => set('duThao', e.target.checked)} /> Có dấu &quot;DỰ THẢO&quot;</label>
        {txt('trichYeu', cv ? 'Trích yếu (sau chữ V/v)' : 'Trích yếu nội dung', cv ? 'đăng ký tham dự hội thảo' : 'Kết quả tổ chức Hội thảo khoa học quốc tế', 'sm:col-span-2')}
        {cv && (
          <label className="sm:col-span-2">
            <span className="label">Kính gửi (mỗi nơi một dòng)</span>
            <textarea className="input min-h-[42px]" value={v.kinhGui} onChange={(e) => set('kinhGui', e.target.value)} rows={2} />
          </label>
        )}
        <label className="sm:col-span-2 lg:col-span-4">
          <span className="label">Nội dung (không bắt buộc, mỗi đoạn một dòng)</span>
          <textarea className="input" rows={4} value={v.noiDung} onChange={(e) => set('noiDung', e.target.value)} placeholder={'I. MỤC ĐÍCH, YÊU CẦU\n1. Mục đích\n...'} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Nơi nhận (mỗi nơi một dòng, dòng cuối là Lưu)</span>
          <textarea className="input" rows={3} value={v.noiNhan} onChange={(e) => set('noiNhan', e.target.value)} />
        </label>
        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
          <label>
            <span className="label">Quyền hạn ký</span>
            <select className="input" value={v.quyenHan} onChange={(e) => set('quyenHan', e.target.value)}>
              <option value="">Ký trực tiếp</option>
              <option value="KT.">KT. (ký thay)</option>
              <option value="TL.">TL. (thừa lệnh)</option>
              <option value="TUQ.">TUQ. (thừa ủy quyền)</option>
              <option value="TM.">TM. (thay mặt tập thể)</option>
              <option value="Q.">Q. (quyền)</option>
            </select>
          </label>
          {v.quyenHan ? txt('capTren', 'Chức vụ người đứng đầu', 'HIỆU TRƯỞNG') : <span className="hidden sm:block" />}
          {txt('chucVu', 'Chức vụ người ký', 'PHÓ HIỆU TRƯỞNG')}
          {txt('hoTen', 'Họ tên người ký')}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
        <span><b>{soKyHieu(v)}</b><span className="mx-2 muted">·</span><i>{dongNgay(v.diaDanh, v.ngay)}</i></span>
        <button type="button" className="btn" disabled={busy} onClick={make}>Tải khung văn bản (.docx)</button>
      </div>
    </section>
  );
}

export function QuickCheck() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ReturnType<typeof fixText> & { notes: ReturnType<typeof checkText> } | null>(null);
  const [copied, setCopied] = useState(false);
  const check = () => { setResult({ ...fixText(text), notes: checkText(text) }); setCopied(false); };
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold">Rà soát nhanh đoạn chữ</h2>
        <p className="mt-1 text-sm muted">Dán một đoạn văn bản để soát dấu cách, dấu câu, kiểu dấu thanh (hòa/hoà), viết hoa khi viện dẫn và các lỗi chính tả hay gặp. Không kiểm tra định dạng (cần file Word).</p>
      </div>
      <textarea className="input min-h-36" value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder="Dán đoạn văn bản vào đây…" aria-label="Đoạn văn bản cần rà soát" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs muted">{wordCount(text)} chữ · {text.length} ký tự</p>
        <button type="button" className="btn" disabled={!text.trim()} onClick={check}>Rà soát</button>
      </div>
      {result && (
        <div className="space-y-3">
          {!result.findings.length && !result.notes.length ? (
            <p className="text-sm text-green-700 dark:text-green-400">Không thấy lỗi trong các điểm đã soát.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {result.findings.map((f) => (
                <li key={f.rule.label + f.rule.re.source}>
                  <span className="chip mr-2">{LEVEL_LABEL[f.rule.level]}</span>
                  <b>{f.rule.label}</b> ({f.count} chỗ): <span className="muted">&quot;{f.example.trim()}&quot; → &quot;{f.fixedExample.trim()}&quot;</span>
                </li>
              ))}
              {result.notes.map((n) => (
                <li key={n.label}><span className="chip mr-2">{LEVEL_LABEL[n.level]}</span><b>{n.label}</b>: <span className="muted">{n.detail}</span></li>
              ))}
            </ul>
          )}
          {result.text !== text && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="label mb-0">Bản đã sửa tự động</span>
                <button type="button" className="link text-sm" onClick={async () => { await navigator.clipboard.writeText(result.text); setCopied(true); }}>{copied ? 'Đã sao chép' : 'Sao chép'}</button>
              </div>
              <textarea readOnly className="input min-h-36 bg-slate-50 dark:bg-slate-900" value={result.text} aria-label="Bản đã sửa" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
