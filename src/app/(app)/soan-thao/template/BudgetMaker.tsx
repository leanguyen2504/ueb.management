'use client';

// Template dự toán kinh phí: chọn mẫu, sửa từng khoản chi, xem tổng và số tiền bằng chữ, tải Excel có công thức.
import { useEffect, useState } from 'react';
import { PRESETS, XLSX_MIME, amount, buildBudgetXlsx, grandTotal, groupTotal, newBudget, numberToWords, vnd, type BudgetInput, type BudgetItem, type PresetKey } from '@/lib/xlsx/budget';
import { download } from '../ReviewBox';

const STORE = 'soan-thao:du-toan';
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 50);
const blankItem = (): BudgetItem => ({ noiDung: '', dvt: '', sl: 1, lan: 1, donGia: 0, ghiChu: '' });
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function Money({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <input
      className="input px-2 py-1 text-right tabular-nums"
      inputMode="numeric"
      aria-label={label}
      value={value ? vnd(value) : ''}
      placeholder="0"
      onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
    />
  );
}

export function BudgetMaker() {
  const [preset, setPreset] = useState<PresetKey>('hoi-thao');
  const [b, setB] = useState<BudgetInput>(() => newBudget('hoi-thao'));
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null') as { preset?: PresetKey; b?: BudgetInput } | null;
      if (saved?.b?.groups) { setB(saved.b); if (saved.preset) setPreset(saved.preset); }
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify({ preset, b })); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [b, preset, loaded]);

  const set = <K extends keyof BudgetInput>(k: K, v: BudgetInput[K]) => setB((cur) => ({ ...cur, [k]: v }));
  const setItem = (gi: number, ii: number, patch: Partial<BudgetItem>) =>
    setB((cur) => ({ ...cur, groups: cur.groups.map((g, x) => (x !== gi ? g : { ...g, items: g.items.map((it, y) => (y !== ii ? it : { ...it, ...patch })) })) }));
  const setGroups = (fn: (g: BudgetInput['groups']) => BudgetInput['groups']) => setB((cur) => ({ ...cur, groups: fn(cur.groups) }));

  function choose(k: PresetKey) {
    if (!confirm('Thay các khoản chi hiện tại bằng mẫu mới? Thông tin đơn vị và người ký được giữ lại.')) return;
    setPreset(k);
    setB((cur) => newBudget(k, { chuQuan: cur.chuQuan, donVi: cur.donVi, boPhan: cur.boPhan, diaDanh: cur.diaDanh, soNguoi: cur.soNguoi, soNgay: cur.soNgay, signers: cur.signers, thoiGian: cur.thoiGian, diaDiem: cur.diaDiem }));
  }

  async function make() {
    setBusy(true);
    try {
      download(await buildBudgetXlsx(b), `Du_toan_${slug(b.tieuDe) || 'kinh_phi'}.xlsx`, XLSX_MIME);
    } finally {
      setBusy(false);
    }
  }

  const total = grandTotal(b);
  const txt = (k: 'chuQuan' | 'donVi' | 'boPhan' | 'tieuDe' | 'thoiGian' | 'diaDiem' | 'diaDanh', label: string, ph = '', cls = '') => (
    <label className={cls}>
      <span className="label">{label}</span>
      <input className="input" value={b[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </label>
  );

  return (
    <div className="space-y-5">
      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Thông tin dự toán</h2>
            <p className="mt-1 text-sm muted">Chọn mẫu theo loại việc; các mức chi mẫu chỉ để tham khảo, hãy đối chiếu Quy chế chi tiêu nội bộ hiện hành của Trường.</p>
          </div>
          <label>
            <span className="label">Mẫu</span>
            <select className="input" value={preset} onChange={(e) => choose(e.target.value as PresetKey)}>
              {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {txt('tieuDe', 'Nội dung dự toán', 'Tổ chức Hội thảo khoa học "..."', 'sm:col-span-2')}
          {txt('thoiGian', 'Thời gian', '12/12/2026')}
          {txt('diaDiem', 'Địa điểm', 'Hội trường tầng 8')}
          {txt('chuQuan', 'Cơ quan chủ quản')}
          {txt('donVi', 'Đơn vị')}
          {txt('boPhan', 'Bộ phận lập', 'Khoa Kinh tế phát triển')}
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Số người</span><input type="number" min={0} className="input" value={b.soNguoi} onChange={(e) => set('soNguoi', Number(e.target.value) || 0)} /></label>
            <label><span className="label">Số ngày</span><input type="number" min={0} className="input" value={b.soNgay} onChange={(e) => set('soNgay', Number(e.target.value) || 0)} /></label>
          </div>
          {txt('diaDanh', 'Địa danh')}
          <label>
            <span className="label">Ngày lập</span>
            <input type="date" className="input" value={b.ngay} onChange={(e) => set('ngay', e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Căn cứ (mỗi dòng một căn cứ)</span>
            <textarea className="input" rows={3} value={b.canCu} onChange={(e) => set('canCu', e.target.value)} />
          </label>
        </div>
        <p className="text-xs muted">Đổi số người, số ngày rồi chọn lại mẫu để số lượng tự điền theo.</p>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Các khoản chi</h2>
          <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setGroups((g) => [...g, { ten: 'Nhóm chi mới', items: [blankItem()] }])}>Thêm nhóm chi</button>
        </div>
        <div className="-mx-4 overflow-x-auto md:-mx-5">
          <table className="table min-w-[980px] text-sm">
            <thead>
              <tr><th className="w-10">STT</th><th>Nội dung chi</th><th className="w-20">ĐVT</th><th className="w-20">Số lượng</th><th className="w-20">Số ngày/lần</th><th className="w-32">Đơn giá</th><th className="w-32 text-right">Thành tiền</th><th>Ghi chú</th><th className="w-8" /></tr>
            </thead>
            <tbody>
              {b.groups.map((g, gi) => (
                <FragmentGroup key={gi}>
                  <tr className="bg-slate-50 dark:bg-slate-800/50">
                    <td className="font-semibold">{ROMAN[gi] ?? gi + 1}</td>
                    <td colSpan={5}><input className="input px-2 py-1 font-semibold" aria-label="Tên nhóm chi" value={g.ten} onChange={(e) => setGroups((gs) => gs.map((x, k) => (k === gi ? { ...x, ten: e.target.value } : x)))} /></td>
                    <td className="text-right font-semibold tabular-nums">{vnd(groupTotal(g))}</td>
                    <td><button type="button" className="link text-xs" onClick={() => setGroups((gs) => gs.map((x, k) => (k === gi ? { ...x, items: [...x.items, blankItem()] } : x)))}>+ Thêm khoản</button></td>
                    <td><button type="button" className="link text-xs" aria-label="Xóa nhóm" onClick={() => { if (confirm(`Xóa nhóm "${g.ten}"?`)) setGroups((gs) => gs.filter((_, k) => k !== gi)); }}>✕</button></td>
                  </tr>
                  {g.items.map((it, ii) => (
                    <tr key={ii}>
                      <td className="text-center">{ii + 1}</td>
                      <td><input className="input px-2 py-1" aria-label="Nội dung chi" value={it.noiDung} onChange={(e) => setItem(gi, ii, { noiDung: e.target.value })} /></td>
                      <td><input className="input px-2 py-1" aria-label="Đơn vị tính" value={it.dvt} onChange={(e) => setItem(gi, ii, { dvt: e.target.value })} /></td>
                      <td><input type="number" min={0} className="input px-2 py-1 text-right" aria-label="Số lượng" value={it.sl} onChange={(e) => setItem(gi, ii, { sl: Number(e.target.value) || 0 })} /></td>
                      <td><input type="number" min={0} className="input px-2 py-1 text-right" aria-label="Số ngày hoặc số lần" value={it.lan} onChange={(e) => setItem(gi, ii, { lan: Number(e.target.value) || 0 })} /></td>
                      <td><Money label="Đơn giá" value={it.donGia} onChange={(n) => setItem(gi, ii, { donGia: n })} /></td>
                      <td className="text-right tabular-nums">{vnd(amount(it))}</td>
                      <td><input className="input px-2 py-1 text-xs" aria-label="Ghi chú" value={it.ghiChu} onChange={(e) => setItem(gi, ii, { ghiChu: e.target.value })} /></td>
                      <td><button type="button" className="link text-xs" aria-label="Xóa khoản" onClick={() => setGroups((gs) => gs.map((x, k) => (k === gi ? { ...x, items: x.items.filter((_, y) => y !== ii) } : x)))}>✕</button></td>
                    </tr>
                  ))}
                </FragmentGroup>
              ))}
              <tr className="font-semibold">
                <td colSpan={6} className="text-center">TỔNG CỘNG</td>
                <td className="text-right tabular-nums">{vnd(total)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm"><i>Bằng chữ: {numberToWords(total)}./.</i></p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Người ký</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {b.signers.map((s, i) => (
            <div key={i} className="space-y-2">
              <input className="input font-semibold" aria-label={`Chức danh người ký ${i + 1}`} value={s.chucDanh} onChange={(e) => set('signers', b.signers.map((x, k) => (k === i ? { ...x, chucDanh: e.target.value } : x)))} />
              <input className="input" aria-label={`Họ tên người ký ${i + 1}`} placeholder="Họ và tên" value={s.hoTen} onChange={(e) => set('signers', b.signers.map((x, k) => (k === i ? { ...x, hoTen: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <span>Tổng: <b className="tabular-nums">{vnd(total)} đồng</b></span>
          <button type="button" className="btn" disabled={busy} onClick={make}>Tải dự toán (.xlsx)</button>
        </div>
        <p className="text-xs muted">File Excel có sẵn công thức Thành tiền = Số lượng x Số ngày x Đơn giá, cộng nhóm và tổng; sửa số trong Excel thì tổng tự tính lại. Dòng &quot;Bằng chữ&quot; cần sửa tay nếu đổi số trong Excel.</p>
      </section>
    </div>
  );
}

function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
