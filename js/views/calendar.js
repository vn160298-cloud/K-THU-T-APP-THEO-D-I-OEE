// Lịch tháng: mỗi ngày tô màu theo OEE, kèm số lỗi chưa xử lý — bấm ngày để xem phiếu
import { S, cat, fetchFaults, errText } from '../api.js';
import { loadCalc } from '../data.js';
import { aggregate } from '../kpi.js';
import { esc, icon, today, monthStart, monthEnd, parseISO, toISO, MONTHS, fmtPct, oeeLevel, badge } from '../lib.js';
import { $, calendarGrid, selectField, comboField } from '../ui.js';
import { go } from '../app.js';
import { offlineNote } from './today.js';

export async function render(main, { q }) {
  const st = { month: monthStart(q.m || today()), bp: '', may: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Lịch tháng</div><div class="muted">Màu theo OEE ngày · số lỗi còn mở · bấm vào ngày để xem phiếu</div></div></div>
    <div class="filters" data-f></div>
    <div class="nn-row" style="padding:0 0 12px">${badge('success', 'pass', 'OEE ≥ 85%')}${badge('warning', 'warn', '60–85%')}${badge('danger', 'fail', 'Dưới 60%')}</div>
    <section class="card"><div class="cal-head">
      <button class="nn-btn nn-btn-secondary nn-btn-md" data-nav="-1" aria-label="Tháng trước">${icon('chevL', 18)}</button>
      <div class="t-h2" style="flex:1;text-align:center" data-title></div>
      <button class="nn-btn nn-btn-secondary nn-btn-md" data-nav="1" aria-label="Tháng sau">${icon('chevR', 18)}</button></div>
      <div data-cal><div class="empty">Đang tải…</div></div></section>`;
  $('[data-f]', main).append(
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }),
    comboField({ label: 'Máy', size: 'md', placeholder: 'Tất cả máy', options: cat.may().map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { st.may = v; draw(); } }),
  );
  let data = [], faults = [];
  async function load() {
    const d = parseISO(st.month);
    $('[data-title]', main).textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (!S.online) { $('[data-cal]', main).innerHTML = offlineNote(); return; }
    $('[data-cal]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    try {
      [data, faults] = await Promise.all([loadCalc(st.month, monthEnd(st.month)), fetchFaults({ from: st.month, to: monthEnd(st.month) })]);
      draw();
    } catch (e) { $('[data-cal]', main).innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }
  function draw() {
    const ok = (mayId) => { const m = S.cat.byId.may[mayId]; return m && (!st.bp || m.bo_phan_id === st.bp) && (!st.may || m.id === st.may); };
    const rows = data.filter((r) => ok(r.p.may_id));
    const fl = faults.filter((f) => ok(f.phieu.may_id) && f.tinh_trang !== 'da_xu_ly');
    $('[data-cal]', main).innerHTML = calendarGrid({
      month: st.month, big: true,
      decorate: (iso) => {
        const day = rows.filter((r) => r.p.ngay === iso);
        if (!day.length) return {};
        const a = aggregate(day.map((r) => r.c));
        const lv = oeeLevel(a.OEE);
        const nf = fl.filter((f) => f.phieu.ngay === iso).length;
        return { cls: lv || '', html: `<span class="cd-v">${a.OEE == null ? '—' : fmtPct(a.OEE, 0)}</span><span class="cd-v muted">${day.length} phiếu</span>${nf ? `<span class="cd-v nn-tone-danger">${nf} lỗi mở</span>` : ''}` };
      },
    });
  }
  main.onclick = (e) => {
    const n = e.target.closest('[data-nav]');
    if (n) { const d = parseISO(st.month); d.setMonth(d.getMonth() + +n.dataset.nav); st.month = toISO(d).slice(0, 8) + '01'; load(); return; }
    const d = e.target.closest('[data-d]'); if (d) go(`#/hom-nay?d=${d.dataset.d}`);
  };
  load();
}
