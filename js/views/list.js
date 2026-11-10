// Danh sách phiếu theo khoảng ngày (phiếu dây chuyền gộp thành 1 dòng)
import { S, cat, errText } from '../api.js';
import { loadCalc, groupEntries, entryLabel } from '../data.js';
import { esc, today, addDays, fmtDate, fmtNum, fmtPct, phieuBadge, TRANG_THAI_PHIEU } from '../lib.js';
import { $, rangeField, selectField, comboField } from '../ui.js';
import { go } from '../app.js';
import { offlineNote } from './today.js';

export async function render(main) {
  const st = { from: addDays(today(), -6), to: today(), bp: '', target: '', tt: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Danh sách phiếu</div><div class="muted" data-sub></div></div></div>
    <div class="filters" data-f></div><div data-body></div>`;
  const targets = [
    ...cat.dayChuyen().map((l) => ({ value: `dc:${l.id}`, label: l.ten, group: 'Dây chuyền' })),
    ...cat.mayDon(true).map((m) => ({ value: `m:${m.id}`, label: `${m.ma} · ${m.ten}`, group: 'Máy đơn' })),
  ];
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }),
    comboField({ label: 'Dây chuyền / Máy', size: 'md', placeholder: 'Tất cả', options: targets, onChange: (v) => { st.target = v; draw(); } }),
    selectField({ label: 'Trạng thái', size: 'md', placeholder: 'Tất cả', options: ['da_gui', 'da_xac_nhan'].map((k) => ({ value: k, label: TRANG_THAI_PHIEU[k].label })), onChange: (v) => { st.tt = v; draw(); } }),
  );
  let data = [];
  async function load() {
    if (!S.online) { $('[data-body]', main).innerHTML = offlineNote(); return; }
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    try { data = await loadCalc(st.from, st.to, { force: true }); draw(); } catch (e) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }
  function draw() {
    const match = (e) => {
      if (st.target.startsWith('dc:') && e.line?.id !== st.target.slice(3)) return false;
      if (st.target.startsWith('m:') && !(e.kind === 'may' && e.rep.p.may_id === st.target.slice(2))) return false;
      return (!st.bp || e.children.some((x) => x.p.bo_phan_id === st.bp)) && (!st.tt || e.rep.p.trang_thai === st.tt);
    };
    const entries = groupEntries(data).filter(match)
      .sort((a, b) => b.rep.p.ngay.localeCompare(a.rep.p.ngay) || entryLabel(a).localeCompare(entryLabel(b), 'vi', { numeric: true }));
    $('[data-sub]', main).textContent = `${entries.length} phiếu · ${fmtDate(st.from)} – ${fmtDate(st.to)}`;
    $('[data-body]', main).innerHTML = entries.length ? `<div class="nn-table-wrap"><table class="nn-table"><thead><tr>
      <th>Ngày</th><th>Dây chuyền / Máy</th><th>Ca</th><th>Sản phẩm</th><th>Vận hành</th><th class="num">Tổng SL</th><th class="num">Lần dừng</th><th class="num">Dừng (phút)</th><th class="num">OEE</th><th>Trạng thái</th></tr></thead><tbody>
      ${entries.map((e) => { const { p, c } = e.rep; const lan = e.children.reduce((s, x) => s + x.c.stopCount, 0); return `<tr class="clickable" data-p="${e.key}"><td>${fmtDate(p.ngay)}</td>
        <td class="wrap">${e.kind === 'chuyen' ? `${esc(entryLabel(e))} <span class="chip dept">${e.children.length} máy</span>` : `<span class="nn-mono">${esc(cat.name('may', p.may_id, 'ma'))}</span>`}</td>
        <td>${esc(cat.name('ca', p.ca_id))}</td><td class="wrap">${esc(cat.name('san_pham', p.san_pham_id))}</td><td>${esc(cat.person(p.nguoi_van_hanh_id))}</td>
        <td class="num">${fmtNum(p.tong_sl)}</td><td class="num">${lan}</td><td class="num">${fmtNum(c.stopLoss)}</td><td class="num">${fmtPct(c.OEE)}</td><td>${phieuBadge(p.trang_thai)}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="card empty">Không có phiếu</div>';
  }
  main.onclick = (e) => { const r = e.target.closest('[data-p]'); if (r) go(`#/phieu/${r.dataset.p}`); };
  load();
}
