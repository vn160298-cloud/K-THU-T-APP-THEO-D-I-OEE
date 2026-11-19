// v1.13 — Sản lượng Đóng gói theo từng sản phẩm / lô / xe (cùng cột với phần Năng suất của báo cáo giao ca Đóng gói,
// bỏ các cột đã có ở thông tin chung: ca, ngày đóng gói, nhà máy). Dùng trong phiếu ghi nhận vận hành máy của Đóng gói.
// Tổng SKU = Thùng × số thành phẩm / thùng + Lẻ · Tổng số lượng = SKU × số BTP / thành phẩm (đơn vị = đơn vị sản lượng của phiếu).
import { S, cat } from '../api.js';
import { esc, icon, fmtNum, toInt } from '../lib.js';
import { $, $$, bindNum } from '../ui.js';

export const tpOf = (ma) => (S.cat.quy_cach_tp || []).find((q) => q.ma_tp === ma);
export const tpCuaSp = (maSp) => (S.cat.quy_cach_tp || []).filter((q) => q.hoat_dong && q.ma_btp === maSp);
// v1.14: Tổng SKU / Tổng số lượng tự tính theo công thức nhưng sửa tay được (sku_tay / sl_tay; để trống = theo công thức)
export const TAY = { tong_sku: 'sku_tay', tong_chai: 'sl_tay' };
/** Giá trị theo công thức (Tổng số lượng tính từ Tổng SKU đang dùng — kể cả SKU sửa tay) */
export function congThuc(r) {
  const q = tpOf(r.ma_tp);
  const sku = q && (r.thung != null || r.le != null) ? (+r.thung || 0) * (+q.sl_tp_thung || 0) + (+r.le || 0) : null;
  const skuDung = r.sku_tay ?? sku;
  return { tong_sku: sku, tong_chai: skuDung != null ? skuDung * (+q?.sl_btp_tp || 1) : null };
}
export function tinhDong(r) {
  const ct = congThuc(r);
  return { tong_sku: r.sku_tay ?? ct.tong_sku, tong_chai: r.sl_tay ?? ct.tong_chai };
}
export const tenSp = (ma) => (S.cat.san_pham.find((p) => p.ma === ma && p.nha_may_id === S.nm) || S.cat.san_pham.find((p) => p.ma === ma))?.ten || ma;
/** v1.14: tổng theo từng sản phẩm: [{ ma, ten, sku, chai }] */
export function tongTheoSp(rows) {
  const m = new Map();
  for (const r of rows || []) {
    if (!r.ma_sp) continue;
    const t = tinhDong(r); const x = m.get(r.ma_sp) || { ma: r.ma_sp, ten: tenSp(r.ma_sp), sku: 0, chai: 0 };
    x.sku += t.tong_sku || 0; x.chai += t.tong_chai || 0; m.set(r.ma_sp, x);
  }
  return [...m.values()];
}
export const tongChai = (rows) => (rows || []).reduce((a, r) => a + (tinhDong(r).tong_chai || 0), 0);

/**
 * Tốc độ hiệu dụng của 1 dây chuyền / máy chạy nhiều sản phẩm = Tổng SL / Σ(SL sản phẩm / tốc độ sản phẩm).
 * speed(spId) -> tốc độ (sp/phút) hoặc null. Trả về { v, thieu: [spId thiếu tốc độ] }.
 */
export function tocDoHieuDung(rows, speed) {
  const theoSp = new Map();
  for (const r of rows || []) { const sp = spIdOf(r.ma_sp); const c = tinhDong(r).tong_chai || 0; if (sp && c) theoSp.set(sp, (theoSp.get(sp) || 0) + c); }
  let tong = 0, lyTuong = 0; const thieu = [];
  for (const [sp, c] of theoSp) { const v = speed(sp); tong += c; if (v > 0) lyTuong += c / v; else thieu.push(sp); }
  return { v: !thieu.length && lyTuong > 0 ? tong / lyTuong : null, thieu };
}
export const spIdOf = (ma) => S.cat.san_pham.find((p) => p.ma === ma && p.nha_may_id === S.nm)?.id || S.cat.san_pham.find((p) => p.ma === ma)?.id || '';

/** Dòng lưu lên máy chủ: kèm giá trị tự tính + tốc độ của sản phẩm (chụp lại lúc ghi) */
export const dongLuu = (rows, speed) => (rows || []).filter((r) => r.ma_sp || r.thung != null || r.le != null || r.sku_tay != null || r.sl_tay != null)
  .map((r) => ({ ...r, san_pham_id: spIdOf(r.ma_sp) || null, ...tinhDong(r), toc_do: speed(spIdOf(r.ma_sp)) ?? null }));

const COLS = [['ngay_sx', 'Ngày SX', 130, 'date'], ['ma_sp', 'Tên sản phẩm', 190, 'sp'], ['ma_sp_hien', 'Mã SP', 90, 'auto'], ['ma_lo', 'Mã lô', 80, 'text'],
  ['stt_xe', 'STT xe SX', 70, 'stt'], ['kip_sx', 'Kíp SX', 90, 'kip'], ['ma_tp', 'Quy cách đóng gói', 200, 'tp'], ['thung', 'Thùng', 70, 'num'], ['le', 'Lẻ', 60, 'num'],
  ['tong_sku', 'Tổng SKU', 90, 'tay'], ['tong_chai', 'Tổng số lượng', 100, 'tay']];

/**
 * Vẽ bảng sản lượng vào box. o = { rows, spIds (sản phẩm chọn ở thông tin chung), ngay, onChange(), canEdit }
 */
export function slTable(box, o) {
  const { rows } = o;
  const sps = () => o.spIds().map((id) => S.cat.byId.san_pham[id]).filter(Boolean);
  const kips = () => cat.kip().map((k) => k.ten);
  const auto = (r, c) => (c === 'ma_sp_hien' ? r.ma_sp || '' : tinhDong(r)[c]);
  const tayTitle = (man) => (man ? 'Đã sửa tay — xóa trống ô để tính lại theo công thức' : 'Tự tính theo công thức — gõ số để sửa tay');
  const cell = (r, i, [c, , w, t]) => {
    const st = `style="min-width:${w}px;width:100%"`, dis = o.canEdit === false ? 'disabled' : '';
    if (t === 'tay') {
      const v = tinhDong(r)[c], man = r[TAY[c]] != null;
      return `<input class="nn-input${man ? ' sl-tay' : ''}" ${st} data-r="${i}" data-c="${c}" data-t="tay" inputmode="numeric" value="${v == null ? '' : esc(fmtNum(v))}" title="${tayTitle(man)}" ${dis}>`;
    }
    if (t === 'auto') { const v = auto(r, c); return `<span class="gc-auto" data-a="${i}:${c}">${v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : esc(v)}</span>`; }
    if (t === 'num') return `<input class="nn-input" ${st} data-r="${i}" data-c="${c}" data-t="num" inputmode="numeric" value="${esc(r[c] != null ? fmtNum(r[c]) : '')}" ${dis}>`;
    if (t === 'date') return `<input class="nn-input" type="date" ${st} data-r="${i}" data-c="${c}" value="${esc(r[c] || '')}" ${dis}>`;
    if (t === 'text') return `<input class="nn-input" ${st} data-r="${i}" data-c="${c}" value="${esc(r[c] || '')}" ${dis}>`;
    const opts = t === 'sp' ? sps().map((p) => [p.ma, p.ten]) : t === 'stt' ? Array.from({ length: 100 }, (_, k) => [String(k + 1), String(k + 1)])
      : t === 'kip' ? kips().map((k) => [k, k]) : tpCuaSp(r.ma_sp).map((q) => [q.ma_tp, q.ten_tp]);
    const cur = r[c] ?? '';
    return `<select class="nn-input" ${st} data-r="${i}" data-c="${c}" ${dis}><option value="">—</option>
      ${cur && !opts.some(([v]) => v === cur) ? `<option value="${esc(cur)}" selected>${esc(t === 'tp' ? tpOf(cur)?.ten_tp || cur : cur)}</option>` : ''}
      ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  };
  /** v1.14: dòng tổng của từng sản phẩm + tổng tất cả sản phẩm (cột Tổng SKU, Tổng số lượng) */
  function foot() {
    const ds = tongTheoSp(rows), n = COLS.length - 2, tail = o.canEdit === false ? '' : '<td></td>';
    const b = (v, on) => (on ? `<b>${v}</b>` : v);
    const dong = (l, sku, chai, on) => `<tr><td colspan="${n}" style="text-align:right">${b(esc(l), on)}</td><td class="num">${b(fmtNum(sku), on)}</td><td class="num">${b(fmtNum(chai), on)}</td>${tail}</tr>`;
    const tong = (k) => ds.reduce((a, x) => a + x[k], 0);
    return `${ds.length > 1 ? ds.map((x) => dong(`Tổng ${x.ten}`, x.sku, x.chai)).join('') : ''}${dong(ds.length === 1 ? `Tổng sản lượng — ${ds[0].ten}` : 'Tổng sản lượng tất cả sản phẩm', tong('sku'), tong('chai'), true)}`;
  }
  const draw = () => {
    box.innerHTML = `<div class="nn-table-wrap"><table class="nn-table gc-tb"><thead><tr>${COLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${o.canEdit === false ? '' : '<th></th>'}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${COLS.map((col) => `<td>${cell(r, i, col)}</td>`).join('')}${o.canEdit === false ? '' : `<td style="white-space:nowrap">
        <button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-dup="${i}" title="Chép dòng (STT xe +1)">${icon('copy', 14)}</button>
        <button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${i}" aria-label="Xóa dòng">${icon('x', 14)}</button></td>`}</tr>`).join('')
      || `<tr><td colspan="${COLS.length + 1}" class="muted">${sps().length ? 'Chưa có dòng — bấm Thêm dòng' : 'Chọn sản phẩm ở phần Thông tin chung trước'}</td></tr>`}</tbody>
      <tfoot data-foot>${foot()}</tfoot></table></div>
      ${o.canEdit === false ? '' : `<button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-add style="margin-top:6px">${icon('plus', 16)}Thêm dòng</button>`}`;
    $$('[data-t="num"], [data-t="tay"]', box).forEach((x) => bindNum(x, 'int'));
  };
  const paint = (i) => {
    const a = box.querySelector(`[data-a="${i}:ma_sp_hien"]`); if (a) a.textContent = rows[i].ma_sp || '—';
    for (const c of Object.keys(TAY)) {
      const x = box.querySelector(`[data-r="${i}"][data-c="${c}"]`); if (!x) continue;
      const man = rows[i][TAY[c]] != null; x.classList.toggle('sl-tay', man); x.title = tayTitle(man);
      if (document.activeElement !== x) { const v = tinhDong(rows[i])[c]; x.value = v == null ? '' : fmtNum(v); }
    }
    const f = box.querySelector('[data-foot]'); if (f) f.innerHTML = foot();
  };
  const upd = (x, change) => {
    const i = +x.dataset.r, c = x.dataset.c, r = rows[i];
    if (x.dataset.t === 'tay') {   // sửa tay: để trống hoặc trùng công thức -> bỏ sửa tay
      const n = toInt(x.value), k = TAY[c];
      r[k] = null; r[k] = n == null || n === congThuc(r)[c] ? null : n;
      if (change) { const v = tinhDong(r)[c]; x.value = v == null ? '' : fmtNum(v); }
      paint(i); o.onChange(); return;
    }
    r[c] = x.dataset.t === 'num' ? toInt(x.value) : x.value;
    if (change && (c === 'ma_sp' || c === 'ngay_sx')) {
      if (c === 'ma_sp') { if (r.ma_tp && tpOf(r.ma_tp)?.ma_btp !== r.ma_sp) r.ma_tp = ''; const ds = tpCuaSp(r.ma_sp); if (!r.ma_tp && ds.length === 1) r.ma_tp = ds[0].ma_tp; }
      if (!r.ma_lo) { const tr = rows.slice(0, i).reverse().find((y) => y.ma_sp === r.ma_sp && y.ngay_sx === r.ngay_sx && y.ma_lo); if (tr) r.ma_lo = tr.ma_lo; }
      draw(); o.onChange(); return;
    }
    paint(i); o.onChange();
  };
  box.oninput = (e) => { const x = e.target.closest('[data-r]'); if (x && x.tagName === 'INPUT' && x.type !== 'date') upd(x, false); };
  box.onchange = (e) => { const x = e.target.closest('[data-r]'); if (x) upd(x, true); };
  box.onclick = (e) => {
    if (e.target.closest('[data-add]')) { const sp = sps(); const truoc = rows.at(-1);
      const r = { ngay_sx: truoc?.ngay_sx || o.ngay(), ma_sp: truoc?.ma_sp || (sp.length === 1 ? sp[0].ma : ''), kip_sx: truoc?.kip_sx || '' };
      const ds = tpCuaSp(r.ma_sp); if (ds.length === 1) r.ma_tp = ds[0].ma_tp; else if (truoc?.ma_sp === r.ma_sp) r.ma_tp = truoc.ma_tp;
      rows.push(r); draw(); o.onChange(); return; }
    const d = e.target.closest('[data-dup]');
    if (d) { const r = rows[+d.dataset.dup]; rows.splice(+d.dataset.dup + 1, 0, { ...r, stt_xe: r.stt_xe ? String(Math.min(100, +r.stt_xe + 1)) : r.stt_xe }); draw(); o.onChange(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { rows.splice(+rm.dataset.rm, 1); draw(); o.onChange(); }
  };
  draw();
  return { draw };
}
