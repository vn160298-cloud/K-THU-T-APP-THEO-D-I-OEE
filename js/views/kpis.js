// Chỉ số: OEE, A, P, Q, TEEP, OPE (dây chuyền & nhà máy), MTBF, MTTR, 6 tổn thất lớn, Pareto lỗi
import { S, cat, errText } from '../api.js';
import { loadCalc } from '../data.js';
import { aggregate, teep, lineOEE, pareto } from '../kpi.js';
import { esc, icon, today, addDays, daysBetween, fmtDate, fmtNum, fmtPct, fmtMin, NHOM_TT, oeeBadge, parseISO, toISO } from '../lib.js';
import { el, $, rangeField, selectField, comboField, kpiCard, cssVar } from '../ui.js';
import { offlineNote } from './today.js';

let charts = [];
const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };

export async function render(main, { q }) {
  const st = { from: q.from || addDays(today(), -29), to: q.to || today(), bp: '', may: '', sp: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Chỉ số OEE</div><div class="muted">OEE · TEEP · OPE · MTBF · MTTR · 6 tổn thất lớn</div></div></div>
    <div class="filters" data-f></div><div data-body><div class="empty">Đang tải…</div></div>`;
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }),
    comboField({ label: 'Máy', size: 'md', placeholder: 'Tất cả máy', options: cat.may().map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { st.may = v; draw(); } }),
    comboField({ label: 'Sản phẩm', size: 'md', placeholder: 'Tất cả sản phẩm', options: cat.sanPham().map((s) => ({ value: s.id, label: s.ten })), onChange: (v) => { st.sp = v; draw(); } }),
  );

  let data = [];
  async function load() {
    const body = $('[data-body]', main);
    if (!S.online) { body.innerHTML = offlineNote(); return; }
    body.innerHTML = '<div class="empty">Đang tải…</div>';
    try { data = await loadCalc(st.from, st.to); draw(); } catch (e) { body.innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }

  function draw() {
    killCharts();
    const machines = cat.may().filter((m) => (!st.bp || m.bo_phan_id === st.bp) && (!st.may || m.id === st.may));
    const ids = new Set(machines.map((m) => m.id));
    const bySp = ({ p }) => !st.sp || p.san_pham_id === st.sp;
    const rows = data.filter((r) => ids.has(r.p.may_id) && bySp(r));
    const agg = aggregate(rows.map((r) => r.c));
    const days = daysBetween(st.from, st.to);
    const withData = new Set(rows.map((r) => r.p.may_id)).size; // TEEP tính trên các máy có số liệu trong kỳ
    const T = teep(agg, days, withData);
    const plant = aggregate(data.filter(bySp).map((r) => r.c)); // OPE toàn nhà máy
    const stops = rows.flatMap((r) => r.p.dung_may || []);
    const par = pareto(stops);
    const body = $('[data-body]', main);
    if (!rows.length) { body.innerHTML = '<div class="card empty">Không có phiếu trong khoảng đã chọn</div>'; return; }

    const L = agg.L;
    const lossTotal = L.slice(1).reduce((s, v) => s + v, 0);
    const mtbf = agg.MTBF, mttr = agg.MTTR;
    body.innerHTML = `
      ${agg.invalid ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">${agg.invalid} phiếu có thời gian chạy kế hoạch bằng 0 (dừng kế hoạch nhập sai giờ) — không tính vào OEE. Mở phiếu để sửa.</div></div></div>` : ''}
      ${agg.missingSpeed ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">${agg.missingSpeed} phiếu thiếu tốc độ định mức — không tính vào OEE, P, Q. Khai báo tốc độ trong Danh mục.</div></div></div>` : ''}
      <section class="grid-kpi section">
        ${kpiCard({ label: 'OEE', value: fmtNum((agg.OEE ?? 0) * 100, 1), unit: '%', status: oeeBadge(agg.OEE, 85, 60, true), foot: `<span>${rows.length} phiếu · ${machines.length} máy</span>` })}
        ${kpiCard({ label: 'Availability', value: fmtNum((agg.A ?? 0) * 100, 1), unit: '%', foot: `<span>Chạy <b>${fmtNum(agg.run / 60, 1)}</b> giờ</span>` })}
        ${kpiCard({ label: 'Performance', value: fmtNum((agg.P ?? 0) * 100, 1), unit: '%', foot: `<span>Tổng SL <b>${fmtNum(agg.tong)}</b></span>` })}
        ${kpiCard({ label: 'Quality', value: fmtNum((agg.Q ?? 0) * 100, 1), unit: '%', foot: `<span>Lỗi <b>${fmtNum(agg.kd + agg.qt)}</b> sp</span>` })}
        ${kpiCard({ label: 'TEEP', value: T == null ? '—' : fmtNum(T * 100, 1), unit: '%', foot: `<span>24h × ${days} ngày × ${withData} máy</span>` })}
        ${kpiCard({ label: 'OPE nhà máy', value: plant.OEE == null ? '—' : fmtNum(plant.OEE * 100, 1), unit: '%', foot: `<span>Toàn bộ ${cat.may().length} máy</span>` })}
        ${kpiCard({ label: 'MTBF', value: mtbf == null ? '—' : fmtNum(mtbf / 60, 1), unit: 'giờ', foot: `<span><b>${agg.bdCount}</b> lần hỏng hóc</span>` })}
        ${kpiCard({ label: 'MTTR', value: mttr == null ? '—' : fmtNum(mttr, 0), unit: 'phút', foot: `<span>Tổng <b>${fmtMin(agg.bdMin)}</b></span>` })}
      </section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">OEE theo ngày</div><div class="t-cap">Nét liền: OEE thực tế · nét đứt: mục tiêu 85%</div></div></div><div class="chart-box"><canvas data-c1 aria-label="Biểu đồ OEE theo ngày"></canvas></div></section>
      <div class="grid-2 section">
        <section class="card"><div class="card-head"><div><div class="t-h2">6 tổn thất lớn</div><div class="t-cap">Quy đổi ra phút · tổng ${fmtMin(lossTotal)}</div></div></div><div class="chart-box"><canvas data-c2 aria-label="Biểu đồ 6 tổn thất lớn"></canvas></div>
          <div class="nn-table-wrap" style="margin-top:12px"><table class="nn-table"><thead><tr><th>Nhóm tổn thất</th><th class="num">Phút</th><th class="num">Tỷ lệ</th></tr></thead><tbody>
          ${[1, 2, 3, 4, 5, 6].map((i) => `<tr><td>${i}. ${NHOM_TT[i]}</td><td class="num">${fmtNum(L[i])}</td><td class="num">${fmtPct(lossTotal ? L[i] / lossTotal : null)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><div class="card-head"><div><div class="t-h2">Pareto lỗi dừng máy</div><div class="t-cap">Top 10 theo thời gian dừng</div></div></div><div class="chart-box"><canvas data-c3 aria-label="Biểu đồ Pareto lỗi"></canvas></div>
          <div class="nn-table-wrap" style="margin-top:12px"><table class="nn-table"><thead><tr><th>Lỗi</th><th class="num">Lần</th><th class="num">Phút</th><th class="num">Lũy kế</th></tr></thead><tbody>
          ${par.slice(0, 10).map((r) => `<tr><td class="wrap"><span class="nn-mono">${esc(r.ma || '')}</span> ${esc(r.ten)}</td><td class="num">${r.lan}</td><td class="num">${fmtNum(r.phut)}</td><td class="num">${fmtPct(r.luyKe, 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Không có lần dừng</td></tr>'}</tbody></table></div></section>
      </div>
      <section class="card section"><div class="card-head"><div class="t-h2">Xếp hạng máy</div></div><div class="nn-table-wrap"><table class="nn-table"><thead><tr>
        <th>Máy</th><th class="num">OEE</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th class="num">MTBF (giờ)</th><th class="num">MTTR (phút)</th><th class="num">Dừng (phút)</th><th>Đánh giá</th></tr></thead><tbody>
        ${machines.map((m) => ({ m, a: aggregate(rows.filter((r) => r.p.may_id === m.id).map((r) => r.c)) })).filter((x) => x.a.n)
          .sort((x, y) => (y.a.OEE ?? -1) - (x.a.OEE ?? -1)).map(({ m, a }) => `<tr>
          <td class="wrap"><span class="nn-mono">${esc(m.ma)}</span> <span class="t-cap">${esc(m.ten)}</span></td><td class="num"><b>${fmtPct(a.OEE)}</b></td><td class="num">${fmtPct(a.A)}</td>
          <td class="num">${fmtPct(a.P)}</td><td class="num">${fmtPct(a.Q)}</td><td class="num">${a.MTBF == null ? '—' : fmtNum(a.MTBF / 60, 1)}</td><td class="num">${a.MTTR == null ? '—' : fmtNum(a.MTTR)}</td>
          <td class="num">${fmtNum(a.stopLoss)}</td><td>${oeeBadge(a.OEE, m.nguong_xanh, m.nguong_vang)}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">OEE dây chuyền sản phẩm (OPE)</div><div class="t-cap">SL đạt ở máy cuối × chu kỳ lý tưởng của máy nút cổ chai ÷ PPT · khai báo dây chuyền trong Danh mục</div></div></div>
        ${lineTable()}</section>`;

    // ---- Biểu đồ
    if (!window.Chart) return;
    const dept = cssVar('--dept'), muted = cssVar('--ink-muted'), line = cssVar('--line'), ink = cssVar('--ink');
    Chart.defaults.font.family = cssVar('--font-sans') || 'system-ui';
    Chart.defaults.color = muted;
    const grid = { color: line, drawTicks: false }, tip = { backgroundColor: cssVar('--surface-raised'), titleColor: ink, bodyColor: ink, borderColor: line, borderWidth: 1, padding: 10 };
    // 1. OEE theo ngày
    const dates = []; for (let d = st.from; d <= st.to; d = addDays(d, 1)) dates.push(d);
    const perDay = dates.map((d) => aggregate(rows.filter((r) => r.p.ngay === d).map((r) => r.c)).OEE);
    charts.push(new Chart($('[data-c1]', main), {
      type: 'line',
      data: { labels: dates.map((d) => fmtDate(d).slice(0, 5)), datasets: [
        { label: 'OEE', data: perDay.map((v) => (v == null ? null : +(v * 100).toFixed(1))), borderColor: dept, backgroundColor: dept, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, spanGaps: true, tension: 0.2 },
        { label: 'Mục tiêu', data: dates.map(() => 85), borderColor: muted, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0 },
      ] },
      options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14 } }, tooltip: { ...tip, callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '—' : fmtNum(c.parsed.y, 1) + '%'}` } } },
        scales: { y: { min: 0, suggestedMax: 100, grid, ticks: { callback: (v) => `${v}%` } }, x: { grid: { display: false } } } },
    }));
    // 2. Six big losses
    charts.push(new Chart($('[data-c2]', main), {
      type: 'bar',
      data: { labels: ['1. Hỏng hóc', '2. Chuẩn bị', '3. Dừng ngắn', '4. Giảm tốc', '5. Lỗi quá trình', '6. Lỗi khởi động'], datasets: [{ label: 'Phút', data: [1, 2, 3, 4, 5, 6].map((i) => Math.round(L[i])), backgroundColor: dept, borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { title: (c) => NHOM_TT[c[0].dataIndex + 1], label: (c) => `${fmtNum(c.parsed.x)} phút` } } },
        scales: { x: { grid, beginAtZero: true }, y: { grid: { display: false } } } },
    }));
    // 3. Pareto
    const top = par.slice(0, 10);
    charts.push(new Chart($('[data-c3]', main), {
      type: 'bar',
      data: { labels: top.map((r) => { const s = `${r.ma || ''} ${r.ten}`.trim(); return s.length > 24 ? s.slice(0, 23) + '…' : s; }), datasets: [{ label: 'Phút dừng', data: top.map((r) => r.phut), backgroundColor: dept, borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => `${fmtNum(c.parsed.x)} phút · ${top[c.dataIndex].lan} lần · lũy kế ${fmtPct(top[c.dataIndex].luyKe, 0)}` } } },
        scales: { x: { grid, beginAtZero: true }, y: { grid: { display: false } } } },
    }));

    function lineTable() {
      const lines = cat.dayChuyen();
      if (!lines.length) return '<div class="empty">Chưa khai báo dây chuyền</div>';
      const all = data.map((r) => r);
      return `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Dây chuyền</th><th>Sản phẩm</th><th>Máy cuối</th><th>Nút cổ chai</th><th class="num">SL đạt</th><th class="num">PPT (giờ)</th><th class="num">OEE dây chuyền</th></tr></thead><tbody>
        ${lines.map((ln) => {
          const mem = S.cat.day_chuyen_may.filter((x) => x.day_chuyen_id === ln.id).sort((a, b) => a.thu_tu - b.thu_tu);
          const r = lineOEE(ln, mem, all, cat.tocDo);
          if (!r) return `<tr><td>${esc(ln.ten)}</td><td colspan="6" class="muted">Chưa gán máy</td></tr>`;
          return `<tr><td>${esc(ln.ten)}</td><td>${esc(cat.name('san_pham', ln.san_pham_id) || 'Tất cả')}</td><td class="nn-mono">${esc(cat.name('may', r.lastId, 'ma'))}</td>
            <td class="nn-mono">${esc(cat.name('may', r.bottId, 'ma'))}</td><td class="num">${fmtNum(r.good)}</td><td class="num">${fmtNum(r.ppt / 60, 1)}</td><td>${r.oee == null ? '<span class="t-cap">Thiếu dữ liệu</span>' : oeeBadge(r.oee)}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }
  }

  load();
  return killCharts;
}
