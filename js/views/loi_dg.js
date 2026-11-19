// v1.14 — Lỗi trên phiếu ghi nhận vận hành máy của Đóng gói: chép các trường của báo cáo giao ca Đóng gói
// (QC đầu vào đóng gói + Lỗi trong quá trình đóng gói), bỏ các trường đã có ở thông tin chung (ngày đóng gói, ca, nhà máy).
// SL lỗi tính OEE (chất lượng Q) = tổng lỗi trong quá trình đóng gói; QC đầu vào là lỗi từ khâu sản xuất -> chỉ ghi nhận.
// Báo cáo giao ca bấm "Lấy số từ phiếu" để chép 2 bảng này sang.
import { S } from '../api.js';
import { esc, icon, fmtNum, toInt, toNum, isLoiKhac, LOI_KHAC } from '../lib.js';
import { $$, bindNum } from '../ui.js';
import { tenSp } from './sl_dg.js';

/** Loại bao bì của sản phẩm (mã): Danh mục → Sản phẩm; chưa khai thì đoán theo ĐVT / tên có chữ "lon" (giống báo cáo giao ca) */
export function loaiBB(ma) {
  if (!ma) return '';
  const sp = S.cat.san_pham.find((x) => x.ma === ma && x.nha_may_id === S.nm) || S.cat.san_pham.find((x) => x.ma === ma);
  if (sp?.loai_bao_bi) return sp.loai_bao_bi;
  const q = (S.cat.quy_cach_tp || []).find((x) => x.ma_btp === ma);
  return /^lon$/i.test(String(q?.dvt_btp || sp?.dvt || '').trim()) || /(^|\s)lon(\s|$)/i.test(tenSp(ma)) ? 'lon' : 'chai';
}
const tenDs = (ds) => [...new Set([...ds.sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0)).map((l) => l.ten), LOI_KHAC.ten])];
const spOf = (ma) => S.cat.san_pham.find((x) => x.ma === ma && x.nha_may_id === S.nm) || S.cat.san_pham.find((x) => x.ma === ma);
/** Lỗi theo giai đoạn của sản phẩm; sản phẩm chưa khai thì lấy bộ lỗi cùng giai đoạn của sản phẩm cùng loại lon / chai (QC) hoặc cả nhà máy */
function loiCua(ma, gd) {
  const all = (S.cat.loi_san_pham || []).filter((l) => l.hoat_dong && (l.giai_doan || 'san_xuat') === gd);
  const sp = spOf(ma);
  const rieng = sp ? all.filter((l) => l.san_pham_id === sp.id) : [];
  if (rieng.length) return tenDs(rieng);
  const nm = all.filter((l) => S.cat.byId.san_pham[l.san_pham_id]?.nha_may_id === S.nm);
  if (gd === 'qc_dau_vao') { const loai = loaiBB(ma) || 'chai'; return tenDs(nm.filter((l) => loaiBB(S.cat.byId.san_pham[l.san_pham_id]?.ma) === loai)); }
  return tenDs(nm);
}

export const tongLoi = (r) => { const ds = (r.loi_ds || []).filter((x) => x.sl != null); return ds.length ? ds.reduce((a, x) => a + (+x.sl || 0), 0) : null; };
const tyLe = (r) => { const t = tongLoi(r); return t != null && +r.tong_kiem > 0 ? `${fmtNum((t / r.tong_kiem) * 100, 2)}%` : ''; };
/** SL lỗi tính OEE = tổng lỗi trong quá trình đóng gói */
export const tongQT = (loi) => (loi?.qt || []).reduce((a, r) => a + (+r.sl || 0), 0);
export const tongQA = (loi) => (loi?.qa || []).reduce((a, r) => a + (tongLoi(r) || 0), 0);
export const moiLoi = () => ({ qa: [], qt: [] });
/** Chuẩn hóa dữ liệu đọc từ phiếu (phiếu cũ chỉ có 1 số lỗi -> 1 dòng "chưa phân loại") */
export function loiToDraft(x, slCu, maSp) {
  const l = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const qa = (l.qa || []).map(({ ten_sp, loai_bb, tong_loi, ty_le, ...r }) => ({ ...r, loi_ds: (r.loi_ds || []).map((y) => ({ loi: y.loi || '', sl: y.sl ?? null })) }));
  const qt = (l.qt || []).map(({ ten_sp, ...r }) => r);
  if (!qt.length && +slCu > 0) qt.push({ ma_sp: maSp || '', loi: 'Lỗi (chưa phân loại)', sl: +slCu, ghi_chu: 'Số liệu trước bản 1.14' });
  return { qa, qt };
}
const co = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
const sach = (loi) => ({
  qa: (loi?.qa || []).map((r) => ({ ...r, loi_ds: (r.loi_ds || []).filter((x) => co(x.loi) || co(x.sl)) })).filter((r) => Object.entries(r).some(([k, v]) => k !== 'ngay_sx' && co(v))),
  qt: (loi?.qt || []).filter((r) => Object.values(r).some(co)),
});
/** Dòng lưu lên máy chủ: bỏ dòng trống, kèm giá trị tự tính để in / xuất đúng như lúc ghi */
export function loiLuu(loi) {
  const s = sach(loi);
  return {
    qa: s.qa.map((r) => ({ ...r, ten_sp: r.ma_sp ? tenSp(r.ma_sp) : '', loai_bb: loaiBB(r.ma_sp), tong_loi: tongLoi(r), ty_le: tyLe(r) })),
    qt: s.qt.map((r) => ({ ...r, ten_sp: r.ma_sp ? tenSp(r.ma_sp) : '' })),
  };
}
/** Kiểm tra trước khi gửi */
export function kiemLoi(loi, ten, errs) {
  const s = sach(loi);
  s.qa.forEach((r, i) => {
    const t = `${ten} — QC đầu vào dòng ${i + 1}`;
    if (!r.ma_sp) errs.push(`${t}: chưa chọn sản phẩm`);
    if (!r.loi_ds.length && !(r.tong_kiem > 0)) errs.push(`${t}: chưa ghi lỗi`);
    r.loi_ds.forEach((x) => { if (!String(x.loi || '').trim()) errs.push(`${t}: có số lượng nhưng chưa chọn lỗi`); else if (!(x.sl > 0)) errs.push(`${t}: lỗi "${x.loi}" chưa nhập SL`); });
    if (r.loi_ds.some((x) => isLoiKhac(x.loi)) && !String(r.ghi_chu || '').trim()) errs.push(`${t}: có "lỗi khác" thì phải ghi chú`);
  });
  s.qt.forEach((r, i) => {
    const t = `${ten} — lỗi trong quá trình dòng ${i + 1}`;
    if (!r.ma_sp) errs.push(`${t}: chưa chọn sản phẩm`);
    if (!String(r.loi || '').trim()) errs.push(`${t}: chưa chọn lỗi`);
    if (!(r.sl > 0)) errs.push(`${t}: chưa nhập SL`);
    if (isLoiKhac(r.loi) && !String(r.ghi_chu || '').trim()) errs.push(`${t}: lỗi khác thì phải ghi chú`);
  });
}

const QA = [['ngay_sx', 'Ngày SX', 130, 'date'], ['ma_sp', 'Tên sản phẩm', 190, 'sp'], ['ma_sp_hien', 'Mã SP', 80, 'auto'], ['loai_bb', 'Loại', 60, 'auto'],
  ['ma_lo', 'Mã lô / Mẻ pha chế', 100, 'text'], ['stt_xe', 'STT xe SX', 70, 'stt'], ['kip_sx', 'Kíp SX', 90, 'kip'], ['so_lop', 'Số lớp trên xe', 70, 'dec'],
  ['tong_kiem', 'SL tổng kiểm', 90, 'num'], ['loi_ds', 'Lỗi · số lượng', 290, 'loids'], ['tong_loi', 'Tổng lỗi', 70, 'auto'], ['ty_le', 'Tỷ lệ lỗi', 70, 'auto'], ['ghi_chu', 'Ghi chú', 150, 'text']];
const QT = [['ma_sp', 'Sản phẩm', 190, 'sp'], ['loi', 'Lỗi', 220, 'list'], ['sl', 'SL lỗi', 80, 'num'], ['ghi_chu', 'Ghi chú (bắt buộc khi lỗi khác)', 200, 'text']];
const AUTO = { ma_sp_hien: (r) => r.ma_sp || '', loai_bb: (r) => ({ lon: 'Lon', chai: 'Chai' })[loaiBB(r.ma_sp)] || '', tong_loi: tongLoi, ty_le: tyLe };
let seq = 0;

/**
 * Vẽ 2 bảng lỗi vào box. o = { loi: {qa, qt}, spIds() (sản phẩm chọn ở thông tin chung), ngay(), slRows() (dòng sản lượng để tự điền lô / kíp),
 * kips() (tên kíp), onChange(), canEdit }
 */
export function loiTable(box, o) {
  const id = `ldg${++seq}`;
  const loi = o.loi;
  const sps = () => o.spIds().map((x) => S.cat.byId.san_pham[x]).filter(Boolean);
  const dis = o.canEdit === false ? 'disabled' : '';
  const dl = (k, ma) => `${id}-${k}-${String(ma || '').replace(/[^\w-]/g, '_')}`;
  const fmtA = (v) => (v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : esc(v));
  function cell(bang, r, i, [c, , w, t]) {
    const st = `style="min-width:${w}px;width:100%"`, at = `data-b="${bang}" data-r="${i}" data-c="${c}"`;
    if (t === 'auto') return `<span class="gc-auto" data-a="${bang}:${i}:${c}">${fmtA(AUTO[c](r))}</span>`;
    if (c === 'so_lop' && loaiBB(r.ma_sp) === 'lon') return '<span class="gc-auto">—</span>';
    if (t === 'num' || t === 'dec') return `<input class="nn-input" ${st} ${at} data-t="${t}" inputmode="${t === 'num' ? 'numeric' : 'decimal'}" value="${esc(r[c] != null ? fmtNum(r[c], t === 'dec' ? 1 : 0) : '')}" ${dis}>`;
    if (t === 'date') return `<input class="nn-input" type="date" ${st} ${at} value="${esc(r[c] || '')}" ${dis}>`;
    if (t === 'list') return `<input class="nn-input" ${st} ${at} list="${dl('qt', r.ma_sp)}" value="${esc(r[c] ?? '')}" placeholder="Chọn hoặc gõ lỗi" ${dis}>`;
    if (t === 'loids') {
      return `<div class="gc-loids" style="min-width:${w}px">${(r.loi_ds || []).map((x, j) => `<div class="nn-row" style="padding:0 0 4px;gap:4px;flex-wrap:nowrap">
        <input class="nn-input" style="flex:1;min-width:150px" list="${dl('qa', r.ma_sp)}" data-b="qa" data-r="${i}" data-li="${j}" data-lf="loi" value="${esc(x.loi ?? '')}" placeholder="Chọn hoặc gõ lỗi" ${dis}>
        <input class="nn-input" style="width:72px" inputmode="numeric" data-b="qa" data-r="${i}" data-li="${j}" data-lf="sl" data-t="num" value="${esc(x.sl != null ? fmtNum(x.sl) : '')}" placeholder="SL" ${dis}>
        ${dis ? '' : `<button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-lrm="${i}:${j}" aria-label="Bỏ lỗi này">${icon('x', 14)}</button>`}</div>`).join('')}
        ${dis ? ((r.loi_ds || []).length ? '' : '—') : `<button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-ladd="${i}">${icon('plus', 14)}lỗi</button>`}</div>`;
    }
    if (t === 'text') { const ph = c === 'ma_lo' ? (loaiBB(r.ma_sp) === 'lon' ? 'Mẻ pha chế' : 'Mã lô') : ''; return `<input class="nn-input" ${st} ${at} value="${esc(r[c] ?? '')}" placeholder="${ph}" ${dis}>`; }
    const opts = t === 'sp' ? sps().map((p) => [p.ma, p.ten]) : t === 'stt' ? Array.from({ length: 100 }, (_, k) => [String(k + 1), String(k + 1)]) : (o.kips() || []).map((k) => [k, k]);
    const cur = r[c] ?? '';
    return `<select class="nn-input" ${st} ${at} ${dis}><option value="">—</option>
      ${cur && !opts.some(([v]) => v === cur) ? `<option value="${esc(cur)}" selected>${esc(t === 'sp' ? tenSp(cur) : cur)}</option>` : ''}
      ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  }
  const bangHtml = (bang, cols, rows, tieuDe, goiY) => `<div class="t-cap" style="margin:4px 0"><b>${tieuDe}</b> — ${goiY}</div>
    <div class="nn-table-wrap"><table class="nn-table gc-tb"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${dis ? '' : '<th></th>'}</tr></thead><tbody>
    ${rows.map((r, i) => `<tr>${cols.map((col) => `<td>${cell(bang, r, i, col)}</td>`).join('')}${dis ? '' : `<td><button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${bang}:${i}" aria-label="Xóa dòng">${icon('x', 14)}</button></td>`}</tr>`).join('')
      || `<tr><td colspan="${cols.length + 1}" class="muted">Không có lỗi</td></tr>`}</tbody></table></div>
    ${dis ? '' : `<button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-add="${bang}" style="margin:6px 0 10px">${icon('plus', 16)}Thêm dòng</button>`}`;
  const tongHtml = () => `SL lỗi tính OEE (lỗi trong quá trình): <b>${fmtNum(tongQT(loi))}</b> · lỗi QC đầu vào (chỉ ghi nhận): <b>${fmtNum(tongQA(loi))}</b>`;
  function draw() {
    const mas = [...new Set([...sps().map((p) => p.ma), ...loi.qa.map((r) => r.ma_sp), ...loi.qt.map((r) => r.ma_sp)])];
    box.innerHTML = `${mas.map((m) => `<datalist id="${dl('qa', m)}">${loiCua(m, 'qc_dau_vao').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      <datalist id="${dl('qt', m)}">${loiCua(m, 'dong_goi').map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
      ${bangHtml('qa', QA, loi.qa, 'Lỗi QC đầu vào đóng gói', 'yến lon ghi mẻ pha chế, yến chai ghi mã lô + số lớp trên xe; 1 dòng nhiều lỗi')}
      ${bangHtml('qt', QT, loi.qt, 'Lỗi trong quá trình đóng gói', 'tính vào SL lỗi của OEE')}
      <div class="t-cap" data-tongloi>${tongHtml()}</div>`;
    $$('[data-t="num"]', box).forEach((x) => bindNum(x, 'int'));
  }
  const paint = (bang, i) => {
    for (const c of Object.keys(AUTO)) { const a = box.querySelector(`[data-a="${bang}:${i}:${c}"]`); if (a) a.innerHTML = fmtA(AUTO[c](loi[bang][i])); }
    const t = box.querySelector('[data-tongloi]'); if (t) t.innerHTML = tongHtml();
  };
  const upd = (x, change) => {
    const bang = x.dataset.b, i = +x.dataset.r, r = loi[bang][i];
    if (x.dataset.li != null) { const it = r.loi_ds[+x.dataset.li]; it[x.dataset.lf] = x.dataset.lf === 'sl' ? toInt(x.value) : x.value; paint(bang, i); o.onChange(); return; }
    const c = x.dataset.c, t = x.dataset.t;
    r[c] = t === 'num' ? toInt(x.value) : t === 'dec' ? toNum(x.value) : x.value;
    if (change && c === 'ma_sp') {
      // QC đầu vào: mã lô, kíp, ngày SX lấy theo dòng sản lượng cùng sản phẩm; đổi lon / chai thì đổi cột + danh sách lỗi
      if (bang === 'qa') { const ns = (o.slRows() || []).find((y) => y.ma_sp === r.ma_sp && (!r.ngay_sx || y.ngay_sx === r.ngay_sx)) || (o.slRows() || []).find((y) => y.ma_sp === r.ma_sp);
        if (ns) { r.ma_lo ||= ns.ma_lo || ''; r.kip_sx ||= ns.kip_sx || ''; r.stt_xe ||= ns.stt_xe || ''; r.ngay_sx ||= ns.ngay_sx || ''; }
        if (loaiBB(r.ma_sp) === 'lon') r.so_lop = null; }
      draw(); o.onChange(); return;
    }
    paint(bang, i); o.onChange();
  };
  box.oninput = (e) => { const x = e.target.closest('[data-b]'); if (x && x.tagName === 'INPUT' && x.type !== 'date') upd(x, false); };
  box.onchange = (e) => { const x = e.target.closest('[data-b]'); if (x) upd(x, true); };
  box.onclick = (e) => {
    const sp1 = () => { const s = sps(); return s.length === 1 ? s[0].ma : ''; };
    const add = e.target.closest('[data-add]');
    if (add) { const b = add.dataset.add; const truoc = loi[b].at(-1);
      loi[b].push(b === 'qa' ? { ngay_sx: truoc?.ngay_sx || o.ngay(), ma_sp: truoc?.ma_sp || sp1(), loi_ds: [{}] } : { ma_sp: truoc?.ma_sp || sp1() });
      if (b === 'qa' && !truoc) { const r = loi.qa.at(-1); const ns = (o.slRows() || []).find((y) => y.ma_sp === r.ma_sp); if (ns) Object.assign(r, { ma_lo: ns.ma_lo || '', kip_sx: ns.kip_sx || '', ngay_sx: ns.ngay_sx || r.ngay_sx }); }
      draw(); o.onChange(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { const [b, i] = rm.dataset.rm.split(':'); loi[b].splice(+i, 1); draw(); o.onChange(); return; }
    const la = e.target.closest('[data-ladd]');
    if (la) { (loi.qa[+la.dataset.ladd].loi_ds ||= []).push({}); draw(); return; }
    const lr = e.target.closest('[data-lrm]');
    if (lr) { const [i, j] = lr.dataset.lrm.split(':'); loi.qa[+i].loi_ds.splice(+j, 1); draw(); o.onChange(); }
  };
  draw();
  return { draw };
}

/** Bảng chỉ xem (trang chi tiết phiếu) */
export function loiHtml(l) {
  const qa = l?.qa || [], qt = l?.qt || [];
  if (!qa.length && !qt.length) return '';
  return `${qa.length ? `<div class="t-cap" style="margin-top:6px"><b>QC đầu vào đóng gói</b></div>${qa.map((r) => `${esc(r.ten_sp || tenSp(r.ma_sp))}${r.ma_lo ? ` · ${esc(r.ma_lo)}` : ''}${r.stt_xe ? ` · xe ${esc(r.stt_xe)}` : ''}${r.tong_kiem ? ` · kiểm ${fmtNum(r.tong_kiem)}` : ''}: ${(r.loi_ds || []).map((x) => `${esc(x.loi)} <b>${fmtNum(x.sl)}</b>`).join(', ') || '—'}${r.ty_le ? ` (${esc(r.ty_le)})` : ''}${r.ghi_chu ? ` <span class="t-cap">(${esc(r.ghi_chu)})</span>` : ''}`).join('<br>')}` : ''}
    ${qt.length ? `<div class="t-cap" style="margin-top:6px"><b>Lỗi trong quá trình đóng gói</b></div>${qt.map((r) => `${esc(r.ten_sp || tenSp(r.ma_sp))}: ${esc(r.loi)} <b>${fmtNum(r.sl)}</b>${r.ghi_chu ? ` <span class="t-cap">(${esc(r.ghi_chu)})</span>` : ''}`).join('<br>')}` : ''}`;
}
