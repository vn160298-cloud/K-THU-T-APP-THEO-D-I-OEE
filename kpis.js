// Chỉ số: OEE, A, P, Q, TEEP, OPE, MTBF, MTTR, 6 tổn thất lớn, Pareto — có bộ lọc và xuất báo cáo theo bộ lọc
import { S, cat, can, errText } from '../api.js';
import { loadCalc, groupEntries } from '../data.js';
import { aggregate, teep, pareto } from '../kpi.js';
import { esc, icon, today, addDays, daysBetween, fmtDate, fmtNum, fmtPct, fmtMin, fmtDateTime, hm, NHOM_TT, TINH_TRANG, TRANG_THAI_PHIEU, oeeBadge, xlsxSheet } from '../lib.js';
import { $, rangeField, selectField, comboField, kpiCard, cssVar, toast } from '../ui.js';
import { offlineNote } from './today.js';

let charts = [];
const killCharts = () => { charts.forEach((c) => c.destroy()); charts = []; };
const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1000) / 10); // tỷ lệ -> % 1 số lẻ

export async function render(main, { q }) {
  const canAll = can.adminTong();
  const st = { from: q.from || addDays(today(), -29), to: q.to || today(), nm: canAll ? '' : S.nm, kv: '', bp: '', may: '', sp: '' };
  const multi = () => !st.nm;                       // đang xem nhiều nhà máy
  const inNm = (r) => !st.nm || r.nha_may_id === st.nm;
  const suffix = (r) => (multi() ? ` · ${S.cat.byId.nha_may[r.nha_may_id]?.ten || ''}` : '');

  const optsKv = () => S.cat.khu_vuc.filter((k) => k.hoat_dong && inNm(k)).map((k) => ({ value: k.id, label: k.ten + suffix(k) }));
  const optsBp = () => S.cat.bo_phan.filter((b) => b.hoat_dong && inNm(b)).map((b) => ({ value: b.id, label: b.ten + suffix(b) }));
  const machineList = (ignoreMay) => S.cat.may.filter((m) => m.hoat_dong && inNm(m) && (!st.kv || m.khu_vuc_id === st.kv) && (!st.bp || m.bo_phan_id === st.bp) && (ignoreMay || !st.may || m.id === st.may));
  const optsMay = () => machineList(true).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}${suffix(m)}` }));
  const optsSp = () => {
    const seen = new Map();
    for (const s of S.cat.san_pham) if (s.hoat_dong && inNm(s) && !seen.has(s.ma)) seen.set(s.ma, s);
    return [...seen.values()].map((s) => ({ value: s.ma, label: s.ten, sub: s.ma }));
  };

  main.innerHTML = `<div class="page-head"><div><div class="t-page">Chỉ số OEE</div><div class="muted">OEE · TEEP · OPE · MTBF · MTTR · 6 tổn thất lớn</div></div>
    <div class="nn-row no-print" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-lg" data-xlsx>${icon('download', 18)}Xuất Excel</button>
    <button class="nn-btn nn-btn-primary nn-btn-lg" data-print>${icon('print', 18)}In / Lưu PDF</button></div></div>
    <div class="filters no-print" data-f></div>
    <div class="print-only" data-ph></div>
    <div data-body><div class="empty">Đang tải…</div></div>`;

  const fNm = canAll ? selectField({ label: 'Nhà máy', size: 'md', placeholder: 'Tất cả nhà máy', value: st.nm, options: S.cat.nha_may.map((n) => ({ value: n.id, label: n.ten })),
    onChange: (v) => { st.nm = v; st.kv = st.bp = st.may = st.sp = ''; syncOpts(); load(); } }) : null;
  const fKv = selectField({ label: 'Khu vực', size: 'md', placeholder: 'Tất cả khu vực', options: optsKv(), onChange: (v) => { st.kv = v; syncOpts(); draw(); } });
  const fBp = selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả bộ phận', options: optsBp(), onChange: (v) => { st.bp = v; syncOpts(); draw(); } });
  const fMay = comboField({ label: 'Máy', size: 'md', placeholder: 'Tất cả máy', options: optsMay(), onChange: (v) => { st.may = v; draw(); } });
  const fSp = comboField({ label: 'Sản phẩm', size: 'md', placeholder: 'Tất cả sản phẩm', options: optsSp(), onChange: (v) => { st.sp = v; draw(); } });
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    ...(fNm ? [fNm] : []), fKv, fBp, fMay, fSp);

  function syncOpts() {
    fKv.setOptions(optsKv(), st.kv); st.kv = fKv.input.value;
    fBp.setOptions(optsBp(), st.bp); st.bp = fBp.input.value;
    const may = optsMay();
    if (st.may && !may.some((o) => o.value === st.may)) st.may = '';
    fMay.setOptions(may, st.may);
    const sp = optsSp();
    if (st.sp && !sp.some((o) => o.value === st.sp)) st.sp = '';
    fSp.setOptions(sp, st.sp);
  }

  let data = [], view = null;
  async function load() {
    const body = $('[data-body]', main);
    if (!S.online) { body.innerHTML = offlineNote(); return; }
    body.innerHTML = '<div class="empty">Đang tải…</div>';
    try { data = await loadCalc(st.from, st.to, { nm: st.nm }); draw(); } catch (e) { body.innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }

  const filterSummary = () => [
    ['Khoảng ngày', st.from === st.to ? fmtDate(st.from) : `${fmtDate(st.from)} – ${fmtDate(st.to)}`],
    ['Nhà máy', st.nm ? cat.name('nha_may', st.nm) : 'Tất cả nhà máy'],
    ['Khu vực', st.kv ? cat.name('khu_vuc', st.kv) : 'Tất cả'],
    ['Bộ phận', st.bp ? cat.name('bo_phan', st.bp) : 'Tất cả'],
    ['Máy', st.may ? cat.mayLabel(st.may) : 'Tất cả'],
    ['Sản phẩm', st.sp ? (optsSp().find((o) => o.value === st.sp)?.label || st.sp) : 'Tất cả'],
  ];

  function draw() {
    killCharts();
    const machines = machineList(false);
    const ids = new Set(machines.map((m) => m.id));
    const bySp = ({ p }) => !st.sp || S.cat.byId.san_pham[p.san_pham_id]?.ma === st.sp;
    const rows = data.filter((r) => ids.has(r.p.may_id) && bySp(r));
    const agg = aggregate(rows.map((r) => r.c));
    const days = daysBetween(st.from, st.to);
    const withData = new Set(rows.map((r) => r.p.may_id)).size; // TEEP tính trên các máy có số liệu trong kỳ
    const T = teep(agg, days, withData);
    const plant = aggregate(data.filter(bySp).map((r) => r.c)); // OPE toàn nhà máy (hoặc toàn hệ thống)
    const par = pareto(rows.flatMap((r) => r.p.dung_may || []));
    const nEntries = groupEntries(rows).length;
    $('[data-ph]', main).innerHTML = `<div class="pr-head"><img src="icons/logo.png" alt="NutriNest"><div class="pr-title">BÁO CÁO CHỈ SỐ OEE</div>
      <div class="t-cap" style="text-align:right">Lập lúc ${fmtDateTime(new Date())}<br>${esc(S.profile.ho_ten)}</div></div>
      <p>${filterSummary().map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`).join(' · ')}</p>`;
    const body = $('[data-body]', main);
    view = null;
    if (!rows.length) { body.innerHTML = '<div class="card empty">Không có phiếu trong khoảng và bộ lọc đã chọn</div>'; return; }

    const L = agg.L;
    const lossTotal = L.slice(1).reduce((s, v) => s + v, 0);
    const perMay = machines.map((m) => ({ m, a: aggregate(rows.filter((r) => r.p.may_id === m.id).map((r) => r.c)) })).filter((x) => x.a.n)
      .sort((x, y) => (y.a.OEE ?? -1) - (x.a.OEE ?? -1));
    // OEE dây chuyền = OEE của máy cuối chuyền (cùng tốc độ dây chuyền, đếm sản lượng đạt ở máy cuối)
    const lineRows = S.cat.day_chuyen.filter((l) => l.hoat_dong && inNm(l)).map((l) => {
      const last = cat.lastMay(l.id);
      const mine = rows.filter((r) => r.p.day_chuyen_id === l.id && r.p.may_id === last);
      return { l, last, a: aggregate(mine.map((r) => r.c)), n: mine.length };
    }).filter((x) => x.n);
    // Dây chuyền tổng (ghép công đoạn): OEE = OEE công đoạn cuối; hiện OEE từng công đoạn để thấy công đoạn nào kéo xuống
    const tongRows = (S.cat.day_chuyen_tong || []).filter((t) => t.hoat_dong && inNm(t)).map((t) => {
      const cds = S.cat.day_chuyen.filter((l) => l.tong_id === t.id && l.hoat_dong);
      const fin = cds.find((l) => l.la_cd_cuoi) || cds[cds.length - 1];
      const parts = cds.map((l) => ({ l, r: lineRows.find((x) => x.l.id === l.id) }));
      const fr = lineRows.find((x) => x.l.id === fin?.id);
      return { t, fin, parts, a: fr?.a || null, n: fr?.n || 0 };
    }).filter((x) => x.parts.some((p) => p.r));
    const dates = []; for (let d = st.from; d <= st.to; d = addDays(d, 1)) dates.push(d);
    const perDay = dates.map((d) => aggregate(rows.filter((r) => r.p.ngay === d).map((r) => r.c)).OEE);
    view = { rows, agg, T, plant, par, perMay, lineRows, tongRows, dates, perDay, machines, days, withData, nEntries };

    body.innerHTML = `
      ${agg.invalid ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">${agg.invalid} phiếu có thời gian chạy kế hoạch bằng 0 (dừng kế hoạch nhập sai giờ) — không tính vào OEE. Mở phiếu để sửa.</div></div></div>` : ''}
      ${agg.missingSpeed ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">${agg.missingSpeed} phiếu thiếu tốc độ định mức — không tính vào OEE, P, Q. Khai báo tốc độ trong Danh mục.</div></div></div>` : ''}
      <section class="grid-kpi section">
        ${kpiCard({ label: 'OEE', value: fmtNum((agg.OEE ?? 0) * 100, 1), unit: '%', status: oeeBadge(agg.OEE, 85, 60, true), foot: `<span>${nEntries} phiếu · ${withData} máy</span>` })}
        ${kpiCard({ label: 'Availability', value: fmtNum((agg.A ?? 0) * 100, 1), unit: '%', foot: `<span>Chạy <b>${fmtNum(agg.run / 60, 1)}</b> giờ</span>` })}
        ${kpiCard({ label: 'Performance', value: fmtNum((agg.P ?? 0) * 100, 1), unit: '%', foot: `<span>Tổng SL <b>${fmtNum(agg.tong)}</b></span>` })}
        ${kpiCard({ label: 'Quality', value: fmtNum((agg.Q ?? 0) * 100, 1), unit: '%', foot: `<span>Lỗi <b>${fmtNum(agg.kd + agg.qt)}</b> sp</span>` })}
        ${kpiCard({ label: 'TEEP', value: T == null ? '—' : fmtNum(T * 100, 1), unit: '%', foot: `<span>24h × ${days} ngày × ${withData} máy</span>` })}
        ${kpiCard({ label: multi() ? 'OPE hệ thống' : 'OPE nhà máy', value: plant.OEE == null ? '—' : fmtNum(plant.OEE * 100, 1), unit: '%', foot: `<span>Toàn bộ máy ${multi() ? 'các nhà máy' : 'trong nhà máy'}</span>` })}
        ${kpiCard({ label: 'MTBF', value: agg.MTBF == null ? '—' : fmtNum(agg.MTBF / 60, 1), unit: 'giờ', foot: `<span><b>${agg.bdCount}</b> lần hỏng hóc</span>` })}
        ${kpiCard({ label: 'MTTR', value: agg.MTTR == null ? '—' : fmtNum(agg.MTTR, 0), unit: 'phút', foot: `<span>Tổng <b>${fmtMin(agg.bdMin)}</b></span>` })}
      </section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">OEE theo ngày</div><div class="t-cap">Nét liền: OEE thực tế · nét đứt: mục tiêu 85%</div></div></div><div class="chart-box"><canvas data-c1 aria-label="Biểu đồ OEE theo ngày"></canvas></div></section>
      <div class="grid-2 section">
        <section class="card"><div class="card-head"><div><div class="t-h2">6 tổn thất lớn</div><div class="t-cap">Quy đổi ra phút-máy · tổng ${fmtMin(lossTotal)}</div></div></div><div class="chart-box"><canvas data-c2 aria-label="Biểu đồ 6 tổn thất lớn"></canvas></div>
          <div class="nn-table-wrap" style="margin-top:12px"><table class="nn-table"><thead><tr><th>Nhóm tổn thất</th><th class="num">Phút</th><th class="num">Tỷ lệ</th></tr></thead><tbody>
          ${[1, 2, 3, 4, 5, 6].map((i) => `<tr><td>${i}. ${NHOM_TT[i]}</td><td class="num">${fmtNum(L[i])}</td><td class="num">${fmtPct(lossTotal ? L[i] / lossTotal : null)}</td></tr>`).join('')}</tbody></table></div></section>
        <section class="card"><div class="card-head"><div><div class="t-h2">Pareto lỗi dừng máy</div><div class="t-cap">Top 10 theo thời gian dừng (chỉ tính lỗi gốc)</div></div></div><div class="chart-box"><canvas data-c3 aria-label="Biểu đồ Pareto lỗi"></canvas></div>
          <div class="nn-table-wrap" style="margin-top:12px"><table class="nn-table"><thead><tr><th>Lỗi</th><th class="num">Lần</th><th class="num">Phút</th><th class="num">Lũy kế</th></tr></thead><tbody>
          ${par.slice(0, 10).map((r) => `<tr><td class="wrap"><span class="nn-mono">${esc(r.ma || '')}</span> ${esc(r.ten)}</td><td class="num">${r.lan}</td><td class="num">${fmtNum(r.phut)}</td><td class="num">${fmtPct(r.luyKe, 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Không có lần dừng</td></tr>'}</tbody></table></div></section>
      </div>
      ${tongRows.length ? `<section class="card section"><div class="card-head"><div><div class="t-h2">OEE theo dây chuyền tổng</div><div class="t-cap">OEE dây chuyền tổng = OEE công đoạn cuối · bên cạnh là OEE từng công đoạn</div></div></div>
        <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Dây chuyền tổng</th><th>Các công đoạn</th><th class="num">OEE tổng</th><th>Đánh giá</th></tr></thead><tbody>
        ${tongRows.map(({ t, fin, parts, a }) => `<tr><td class="wrap"><b>${esc(t.ten)}</b>${suffix(t)}</td>
          <td class="wrap">${parts.map(({ l, r }) => `<span class="chip ${l.id === fin?.id ? 'dept' : ''}">${esc(l.ten)}: <b>${r ? fmtPct(r.a.OEE) : '—'}</b></span>`).join(' ')}</td>
          <td class="num"><b>${a ? fmtPct(a.OEE) : '—'}</b></td><td>${a ? oeeBadge(a.OEE, 85, 60) : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      <section class="card section"><div class="card-head"><div><div class="t-h2">OEE theo dây chuyền</div><div class="t-cap">OEE của máy cuối chuyền — dùng tốc độ định mức của dây chuyền</div></div></div>
        ${lineRows.length ? `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Dây chuyền</th><th>Máy cuối</th><th class="num">Số phiếu</th><th class="num">OEE</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th>Đánh giá</th></tr></thead><tbody>
        ${lineRows.map(({ l, last, a, n }) => `<tr><td class="wrap">${esc(l.ten)}${suffix(l)}</td><td class="nn-mono">${esc(cat.name('may', last, 'ma'))}</td><td class="num">${n}</td><td class="num"><b>${fmtPct(a.OEE)}</b></td>
          <td class="num">${fmtPct(a.A)}</td><td class="num">${fmtPct(a.P)}</td><td class="num">${fmtPct(a.Q)}</td><td>${oeeBadge(a.OEE, S.cat.byId.may[last]?.nguong_xanh, S.cat.byId.may[last]?.nguong_vang)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có phiếu dây chuyền trong bộ lọc</div>'}</section>
      <section class="card section"><div class="card-head"><div class="t-h2">Xếp hạng máy</div></div><div class="nn-table-wrap"><table class="nn-table"><thead><tr>
        <th>Máy</th><th>Dây chuyền</th><th class="num">OEE</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th class="num">MTBF (giờ)</th><th class="num">MTTR (phút)</th><th class="num">Dừng (phút)</th><th>Đánh giá</th></tr></thead><tbody>
        ${perMay.map(({ m, a }) => `<tr>
          <td class="wrap"><span class="nn-mono">${esc(m.ma)}</span> <span class="t-cap">${esc(m.ten)}${esc(suffix(m))}</span></td><td class="wrap">${esc(cat.lineNames(m.id) || '—')}</td>
          <td class="num"><b>${fmtPct(a.OEE)}</b></td><td class="num">${fmtPct(a.A)}</td><td class="num">${fmtPct(a.P)}</td><td class="num">${fmtPct(a.Q)}</td>
          <td class="num">${a.MTBF == null ? '—' : fmtNum(a.MTBF / 60, 1)}</td><td class="num">${a.MTTR == null ? '—' : fmtNum(a.MTTR)}</td>
          <td class="num">${fmtNum(a.stopLoss)}</td><td>${oeeBadge(a.OEE, m.nguong_xanh, m.nguong_vang)}</td></tr>`).join('')}</tbody></table></div></section>`;

    // ---- Biểu đồ
    if (!window.Chart) return;
    const dept = cssVar('--dept'), muted = cssVar('--ink-muted'), line = cssVar('--line'), ink = cssVar('--ink');
    Chart.defaults.font.family = cssVar('--font-sans') || 'system-ui';
    Chart.defaults.color = muted;
    Chart.defaults.animation = false;
    const grid = { color: line, drawTicks: false }, tip = { backgroundColor: cssVar('--surface-raised'), titleColor: ink, bodyColor: ink, borderColor: line, borderWidth: 1, padding: 10 };
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
    charts.push(new Chart($('[data-c2]', main), {
      type: 'bar',
      data: { labels: ['1. Hỏng hóc', '2. Chuẩn bị', '3. Dừng ngắn', '4. Giảm tốc', '5. Lỗi quá trình', '6. Lỗi khởi động'], datasets: [{ label: 'Phút', data: [1, 2, 3, 4, 5, 6].map((i) => Math.round(L[i])), backgroundColor: dept, borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { title: (c) => NHOM_TT[c[0].dataIndex + 1], label: (c) => `${fmtNum(c.parsed.x)} phút` } } },
        scales: { x: { grid, beginAtZero: true }, y: { grid: { display: false } } } },
    }));
    const top = par.slice(0, 10);
    charts.push(new Chart($('[data-c3]', main), {
      type: 'bar',
      data: { labels: top.map((r) => { const s = `${r.ma || ''} ${r.ten}`.trim(); return s.length > 24 ? `${s.slice(0, 23)}…` : s; }), datasets: [{ label: 'Phút dừng', data: top.map((r) => r.phut), backgroundColor: dept, borderRadius: 4, maxBarThickness: 22 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => `${fmtNum(c.parsed.x)} phút · ${top[c.dataIndex].lan} lần · lũy kế ${fmtPct(top[c.dataIndex].luyKe, 0)}` } } },
        scales: { x: { grid, beginAtZero: true }, y: { grid: { display: false } } } },
    }));
  }

  // ---- Xuất Excel đúng theo nội dung đang lọc
  function exportXlsx() {
    if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
    if (!view) return toast('Không có dữ liệu để xuất', 'warning');
    const { rows, agg, T, plant, par, perMay, lineRows, tongRows, dates, perDay, withData, nEntries, days } = view;
    const nmName = (r) => S.cat.byId.nha_may[r.nha_may_id]?.ten || '';
    const wb = XLSX.utils.book_new();
    const add = (name, arr) => XLSX.utils.book_append_sheet(wb, xlsxSheet(arr.length ? arr : [{ 'Ghi chú': 'Không có dữ liệu' }]), name);
    add('BoLoc', [...filterSummary().map(([k, v]) => ({ 'Mục': k, 'Giá trị': v })), { 'Mục': 'Lập lúc', 'Giá trị': fmtDateTime(new Date()) }, { 'Mục': 'Người lập', 'Giá trị': S.profile.ho_ten }]);
    add('ChiSo', [
      ['OEE (%)', r1(agg.OEE)], ['Availability (%)', r1(agg.A)], ['Performance (%)', r1(agg.P)], ['Quality (%)', r1(agg.Q)], ['TEEP (%)', r1(T)],
      [multi() ? 'OPE hệ thống (%)' : 'OPE nhà máy (%)', r1(plant.OEE)], ['MTBF (giờ)', agg.MTBF == null ? null : +(agg.MTBF / 60).toFixed(2)], ['MTTR (phút)', agg.MTTR == null ? null : +agg.MTTR.toFixed(1)],
      ['Số phiếu', nEntries], ['Số máy có số liệu', withData], ['Số ngày', days], ['Tổng sản lượng', agg.tong], ['Sản lượng đạt', agg.good], ['Lỗi khởi động', agg.kd], ['Lỗi quá trình', agg.qt],
      ['Thời gian chạy kế hoạch (phút-máy)', Math.round(agg.ppt)], ['Thời gian chạy (phút-máy)', Math.round(agg.run)], ['Thời gian dừng (phút-máy)', Math.round(agg.stopLoss)],
    ].map(([k, v]) => ({ 'Chỉ số': k, 'Giá trị': v })));
    add('TheoNgay', dates.map((d, i) => ({ 'Ngày': fmtDate(d), 'OEE (%)': r1(perDay[i]), 'Số phiếu': rows.filter((r) => r.p.ngay === d).length })));
    add('TheoMay', perMay.map(({ m, a }) => ({
      'Nhà máy': nmName(m), 'Mã máy': m.ma, 'Tên máy': m.ten, 'Khu vực': cat.name('khu_vuc', m.khu_vuc_id), 'Bộ phận': cat.name('bo_phan', m.bo_phan_id), 'Dây chuyền': cat.lineNames(m.id),
      'Số phiếu': a.n, 'PPT (phút)': Math.round(a.ppt), 'Chạy (phút)': Math.round(a.run), 'Dừng (phút)': Math.round(a.stopLoss), 'A (%)': r1(a.A), 'P (%)': r1(a.P), 'Q (%)': r1(a.Q), 'OEE (%)': r1(a.OEE),
      'MTBF (giờ)': a.MTBF == null ? null : +(a.MTBF / 60).toFixed(2), 'MTTR (phút)': a.MTTR == null ? null : +a.MTTR.toFixed(1), 'Tổng SL': a.tong, 'SL đạt': a.good, 'Mục tiêu OEE (%)': m.oee_muc_tieu,
    })));
    add('DayChuyen', lineRows.map(({ l, last, a, n }) => ({ 'Nhà máy': nmName(l), 'Dây chuyền': l.ten, 'Máy cuối': cat.name('may', last, 'ma'), 'Số phiếu': n, 'OEE (%)': r1(a.OEE), 'A (%)': r1(a.A), 'P (%)': r1(a.P), 'Q (%)': r1(a.Q) })));
    if (tongRows.length) add('DayChuyenTong', tongRows.flatMap(({ t, fin, parts, a }) => parts.map(({ l, r }) => ({
      'Nhà máy': nmName(t), 'Dây chuyền tổng': t.ten, 'OEE tổng (%)': a ? r1(a.OEE) : null, 'Công đoạn': l.ten, 'Công đoạn cuối': l.id === fin?.id ? 'Có' : '',
      'Số phiếu': r?.n || 0, 'OEE công đoạn (%)': r ? r1(r.a.OEE) : null, 'A (%)': r ? r1(r.a.A) : null, 'P (%)': r ? r1(r.a.P) : null, 'Q (%)': r ? r1(r.a.Q) : null }))));
    const lt = agg.L.slice(1).reduce((s, v) => s + v, 0);
    add('SixBigLosses', [1, 2, 3, 4, 5, 6].map((i) => ({ 'Nhóm': `${i}. ${NHOM_TT[i]}`, 'Phút': Math.round(agg.L[i]), 'Tỷ lệ (%)': lt ? r1(agg.L[i] / lt) : null })));
    add('Pareto', par.map((r) => ({ 'Mã lỗi': r.ma, 'Tên lỗi': r.ten, 'Số lần': r.lan, 'Phút': r.phut, 'Tỷ lệ (%)': r1(r.tyLe), 'Lũy kế (%)': r1(r.luyKe) })));
    add('Phieu', rows.map(({ p, c }) => ({
      'Nhà máy': nmName(p), 'Ngày': fmtDate(p.ngay), 'Mã máy': cat.name('may', p.may_id, 'ma'), 'Dây chuyền': cat.name('day_chuyen', p.day_chuyen_id), 'Ca': cat.name('ca', p.ca_id),
      'Sản phẩm': cat.name('san_pham', p.san_pham_id), 'Tốc độ ĐM (sp/phút)': p.toc_do_dm, 'Giờ BĐ': hm(p.gio_bd), 'Giờ KT': hm(p.gio_kt), 'Nghỉ (phút)': p.nghi_phut, 'Dừng KH (phút)': c.keHoach,
      'PPT (phút)': c.ppt, 'Dừng tổn thất (phút)': c.stopLoss, 'Chạy (phút)': c.run, 'Tổng SL': p.tong_sl, 'Lỗi KĐ': p.sl_loi_kd, 'Lỗi QT': p.sl_loi_qt, 'SL đạt': c.good,
      'A (%)': r1(c.A), 'P (%)': r1(c.P), 'Q (%)': r1(c.Q), 'OEE (%)': r1(c.OEE), 'Vận hành': cat.person(p.nguoi_van_hanh_id), 'Tổ trưởng': cat.person(p.to_truong_id),
      'Trạng thái': TRANG_THAI_PHIEU[p.trang_thai]?.label, 'Ghi chú': p.ghi_chu || '',
    })));
    add('DungMay', rows.flatMap(({ p }) => (p.dung_may || []).filter((s) => s.goc !== false).sort((a, b) => a.stt - b.stt).map((s) => ({
      'Nhà máy': nmName(p), 'Ngày': fmtDate(p.ngay), 'Mã máy': cat.name('may', p.may_id, 'ma'), 'Dây chuyền': cat.name('day_chuyen', p.day_chuyen_id), 'Ca': cat.name('ca', p.ca_id), 'Mã lỗi': s.ma_loi, 'Tên lỗi': s.ten_loi,
      'Nhóm tổn thất': NHOM_TT[s.dung_ngan ? 3 : s.nhom_ton_that], 'Loại lỗi': s.loai_loi, 'Từ': hm(s.gio_bd), 'Đến': hm(s.gio_kt), 'Phút': s.phut, 'Người xử lý': cat.person(s.nguoi_xu_ly_id),
      'Tình trạng': TINH_TRANG[s.tinh_trang]?.label, 'Ghi chú': s.ghi_chu || '', 'Ghi chú xử lý': s.ghi_chu_xu_ly || '',
    }))));
    XLSX.writeFile(wb, `OEE_${st.from}_${st.to}.xlsx`);
    toast('Đã xuất file Excel theo bộ lọc');
  }

  main.onclick = (e) => {
    if (e.target.closest('[data-print]')) window.print();
    if (e.target.closest('[data-xlsx]')) exportXlsx();
  };
  load();
  return killCharts;
}
