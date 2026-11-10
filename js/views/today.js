// Dashboard hôm nay: phiếu đã ghi nhận trong ngày + trạng thái xử lý lỗi từng máy
import { S, cat, can, fetchOpenFaults, errText } from '../api.js';
import { loadCalc } from '../data.js';
import { aggregate } from '../kpi.js';
import { queue } from '../store.js';
import { esc, icon, today, fmtDate, fmtNum, fmtPct, fmtMin, hm, oeeLevel, oeeBadge, phieuBadge, TINH_TRANG, badge } from '../lib.js';
import { el, $, dateField, selectField, kpiCard } from '../ui.js';
import { go } from '../app.js';

export async function render(main, { q }) {
  const st = { ngay: q.d || today(), bp: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Hôm nay</div><div class="muted" data-sub></div></div>
    ${can.ghiPhieu() ? `<a class="nn-btn nn-btn-primary nn-btn-lg" href="#/ghi-phieu/moi">${icon('plus', 20)}Ghi phiếu mới</a>` : ''}</div>
    <div class="filters" data-f></div><div data-body><div class="empty">Đang tải…</div></div>`;
  $('[data-f]', main).append(
    dateField({ label: 'Ngày', value: st.ngay, size: 'md', onChange: (v) => { st.ngay = v; history.replaceState(null, '', `#/hom-nay?d=${v}`); load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả bộ phận', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }),
  );

  let data = [], faults = [];
  async function load() {
    $('[data-sub]', main).textContent = `${fmtDate(st.ngay)} · ${cat.name('nha_may', S.nm)}`;
    const body = $('[data-body]', main);
    if (!S.online) { body.innerHTML = offlineNote(); return; }
    body.innerHTML = '<div class="empty">Đang tải…</div>';
    try {
      [data, faults] = await Promise.all([loadCalc(st.ngay, st.ngay, { force: true }), fetchOpenFaults()]);
      draw();
    } catch (e) { body.innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }

  function draw() {
    const machines = cat.may().filter((m) => !st.bp || m.bo_phan_id === st.bp);
    const ids = new Set(machines.map((m) => m.id));
    const rows = data.filter(({ p }) => ids.has(p.may_id));
    const agg = aggregate(rows.map((r) => r.c));
    const openF = faults.filter((f) => ids.has(f.phieu.may_id));
    const expected = machines.reduce((s, m) => s + cat.ca(m.bo_phan_id).length, 0);
    const pending = queue.all().filter((x) => x.ngay === st.ngay);
    const body = $('[data-body]', main);
    body.innerHTML = `
      ${pending.length ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('sync', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">${pending.length} phiếu của ngày này đang chờ gửi lên máy chủ — chưa tính vào số liệu</div></div></div>` : ''}
      <section class="grid-kpi section">
        ${kpiCard({ label: 'OEE trong ngày', value: agg.OEE == null ? '—' : fmtNum(agg.OEE * 100, 1), unit: '%', status: agg.OEE == null ? '' : oeeBadge(agg.OEE, 85, 60, true), foot: '<span>Mục tiêu <b>85%</b></span>' })}
        ${kpiCard({ label: 'Availability', value: agg.A == null ? '—' : fmtNum(agg.A * 100, 1), unit: '%', foot: `<span>Dừng <b>${fmtMin(agg.stopLoss)}</b></span>` })}
        ${kpiCard({ label: 'Performance', value: agg.P == null ? '—' : fmtNum(agg.P * 100, 1), unit: '%', foot: agg.missingSpeed ? `<span>${agg.missingSpeed} phiếu thiếu tốc độ</span>` : '<span>&nbsp;</span>' })}
        ${kpiCard({ label: 'Quality', value: agg.Q == null ? '—' : fmtNum(agg.Q * 100, 1), unit: '%', foot: `<span>Lỗi <b>${fmtNum(agg.kd + agg.qt)}</b> sp</span>` })}
        ${kpiCard({ label: 'Phiếu đã ghi', value: `${rows.length}`, unit: `/ ${expected}`, foot: `<span>Chờ xác nhận <b>${rows.filter((r) => r.p.trang_thai === 'da_gui').length}</b></span>` })}
        ${kpiCard({ label: 'Lỗi đang mở', value: `${openF.length}`, status: openF.length ? badge('warning', 'hold', 'Cần xử lý') : badge('success', 'pass', 'Ổn'), foot: `<a href="#/loi">Xem danh sách</a>` })}
      </section>
      <section class="card section"><div class="card-head"><div class="t-h2">Trạng thái từng máy</div><span class="t-cap">Bấm vào ca để mở phiếu</span></div>
        <div class="machine-grid">${machines.map((m) => machineCard(m, rows, openF)).join('') || '<div class="empty">Chưa có máy</div>'}</div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">Phiếu đã ghi nhận trong ngày (${rows.length})</div></div>
        ${rows.length ? `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Máy</th><th>Ca</th><th>Sản phẩm</th><th>Vận hành</th><th class="num">Tổng SL</th><th class="num">Dừng</th><th class="num">OEE</th><th>Trạng thái</th></tr></thead><tbody>
        ${rows.sort((a, b) => (a.p.may_id + a.p.ca_id).localeCompare(b.p.may_id + b.p.ca_id)).map(({ p, c }) => `<tr class="clickable" data-p="${p.id}">
          <td class="nn-mono">${esc(cat.name('may', p.may_id, 'ma'))}</td><td>${esc(cat.name('ca', p.ca_id))}</td><td>${esc(cat.name('san_pham', p.san_pham_id))}</td>
          <td>${esc(cat.person(p.nguoi_van_hanh_id))}</td><td class="num">${fmtNum(p.tong_sl)}</td><td class="num">${fmtNum(c.stopLoss)} phút</td>
          <td class="num">${fmtPct(c.OEE)}</td><td>${phieuBadge(p.trang_thai)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có phiếu nào trong ngày</div>'}</section>`;
  }

  function machineCard(m, rows, openF) {
    const shifts = cat.ca(m.bo_phan_id);
    const mine = rows.filter((r) => r.p.may_id === m.id);
    const agg = aggregate(mine.map((r) => r.c));
    const lv = oeeLevel(agg.OEE, m.nguong_xanh, m.nguong_vang);
    const f = openF.filter((x) => x.phieu.may_id === m.id);
    const fc = Object.keys(TINH_TRANG).filter((k) => k !== 'da_xu_ly').map((k) => [k, f.filter((x) => x.tinh_trang === k).length]).filter(([, n]) => n);
    return `<div class="mc ${lv || ''}">
      <div class="lc-row"><b class="nn-mono">${esc(m.ma)}</b>${agg.OEE != null ? `<b>${fmtPct(agg.OEE)}</b>` : '<span class="t-cap">—</span>'}</div>
      <div class="t-cap">${esc(m.ten)}</div>
      <div class="nn-row" style="padding:0;gap:6px">${shifts.map((c) => {
        const r = mine.find((x) => x.p.ca_id === c.id);
        return r ? `<button class="nn-btn nn-btn-secondary nn-btn-sm" data-p="${r.p.id}">${icon(r.p.trang_thai === 'da_xac_nhan' ? 'lock' : 'hold', 14)}${esc(c.ten)}</button>`
          : `<span class="chip">${esc(c.ten)}: chưa có</span>`;
      }).join('')}</div>
      <div class="nn-row" style="padding:0;gap:6px">${fc.length ? fc.map(([k, n]) => badge(TINH_TRANG[k].tone, TINH_TRANG[k].icon, `${TINH_TRANG[k].label} ${n}`, 12)).join('') : badge('success', 'pass', 'Không có lỗi mở', 12)}</div>
    </div>`;
  }

  main.onclick = (e) => { const r = e.target.closest('[data-p]'); if (r) go(`#/phieu/${r.dataset.p}`); };
  load();
}

export const offlineNote = () => `<div class="nn-alert nn-alert-info"><span class="nn-alert-icon nn-tone-info">${icon('wifiOff', 20)}</span><div class="nn-alert-body">
  <div class="nn-alert-title">Đang ngoại tuyến</div><div class="nn-alert-text">Vẫn ghi phiếu được bình thường — phiếu tự gửi khi có mạng. Số liệu tổng hợp cần kết nối mạng.</div></div></div>`;
