// Danh sách phiếu theo khoảng ngày
import { S, cat, errText } from '../api.js';
import { loadCalc } from '../data.js';
import { esc, today, addDays, fmtDate, fmtNum, fmtPct, phieuBadge, TRANG_THAI_PHIEU } from '../lib.js';
import { $, rangeField, selectField, comboField } from '../ui.js';
import { go } from '../app.js';
import { offlineNote } from './today.js';

export async function render(main) {
  const st = { from: addDays(today(), -6), to: today(), bp: '', may: '', tt: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Danh sách phiếu</div><div class="muted" data-sub></div></div></div>
    <div class="filters" data-f></div><div data-body></div>`;
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }),
    comboField({ label: 'Máy', size: 'md', placeholder: 'Tất cả máy', options: cat.may(true).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { st.may = v; draw(); } }),
    selectField({ label: 'Trạng thái', size: 'md', placeholder: 'Tất cả', options: ['da_gui', 'da_xac_nhan'].map((k) => ({ value: k, label: TRANG_THAI_PHIEU[k].label })), onChange: (v) => { st.tt = v; draw(); } }),
  );
  let data = [];
  async function load() {
    if (!S.online) { $('[data-body]', main).innerHTML = offlineNote(); return; }
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    try { data = await loadCalc(st.from, st.to, { force: true }); draw(); } catch (e) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }
  function draw() {
    const rows = data.filter(({ p }) => (!st.bp || p.bo_phan_id === st.bp) && (!st.may || p.may_id === st.may) && (!st.tt || p.trang_thai === st.tt))
      .sort((a, b) => b.p.ngay.localeCompare(a.p.ngay) || cat.name('may', a.p.may_id, 'ma').localeCompare(cat.name('may', b.p.may_id, 'ma'), 'vi', { numeric: true }));
    $('[data-sub]', main).textContent = `${rows.length} phiếu · ${fmtDate(st.from)} – ${fmtDate(st.to)}`;
    $('[data-body]', main).innerHTML = rows.length ? `<div class="nn-table-wrap"><table class="nn-table"><thead><tr>
      <th>Ngày</th><th>Máy</th><th>Ca</th><th>Sản phẩm</th><th>Vận hành</th><th class="num">Tổng SL</th><th class="num">Lần dừng</th><th class="num">Dừng (phút)</th><th class="num">OEE</th><th>Trạng thái</th></tr></thead><tbody>
      ${rows.map(({ p, c }) => `<tr class="clickable" data-p="${p.id}"><td>${fmtDate(p.ngay)}</td><td class="nn-mono">${esc(cat.name('may', p.may_id, 'ma'))}</td>
        <td>${esc(cat.name('ca', p.ca_id))}</td><td>${esc(cat.name('san_pham', p.san_pham_id))}</td><td>${esc(cat.person(p.nguoi_van_hanh_id))}</td>
        <td class="num">${fmtNum(p.tong_sl)}</td><td class="num">${c.stopCount}</td><td class="num">${fmtNum(c.stopLoss)}</td><td class="num">${fmtPct(c.OEE)}</td><td>${phieuBadge(p.trang_thai)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty">Không có phiếu</div>';
  }
  main.onclick = (e) => { const r = e.target.closest('[data-p]'); if (r) go(`#/phieu/${r.dataset.p}`); };
  load();
}
