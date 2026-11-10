// Báo cáo ngày / tuần / tháng: xuất Excel và in PDF
import { S, cat, errText } from '../api.js';
import { loadCalc } from '../data.js';
import { aggregate, teep, pareto } from '../kpi.js';
import { esc, icon, today, addDays, monthStart, daysBetween, fmtDate, fmtNum, fmtPct, fmtMin, hm, NHOM_TT, TINH_TRANG, TRANG_THAI_PHIEU, fmtDateTime, oeeBadge } from '../lib.js';
import { $, rangeField, selectField, segmented, toast } from '../ui.js';
import { offlineNote } from './today.js';

const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1000) / 10); // tỷ lệ -> % 1 số lẻ

export async function render(main) {
  const st = { from: today(), to: today(), bp: '' };
  main.innerHTML = `<div class="page-head no-print"><div><div class="t-page">Báo cáo</div><div class="muted">Xuất Excel hoặc in / lưu PDF theo ngày, tuần, tháng</div></div>
    <div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-lg" data-xlsx>${icon('download', 18)}Xuất Excel</button>
    <button class="nn-btn nn-btn-primary nn-btn-lg" data-print>${icon('print', 18)}In / Lưu PDF</button></div></div>
    <div class="filters no-print" data-f></div><div data-body></div>`;
  const rng = rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } });
  const seg = segmented([{ value: 'd', label: 'Ngày' }, { value: 'w', label: 'Tuần' }, { value: 'm', label: 'Tháng' }], 'd', (v) => {
    const t = today();
    if (v === 'd') { st.from = t; st.to = t; }
    if (v === 'w') { const d = new Date(); const dow = (d.getDay() + 6) % 7; st.from = addDays(t, -dow); st.to = t; }
    if (v === 'm') { st.from = monthStart(t); st.to = t; }
    rng.set(st.from, st.to); load();
  });
  const sw = document.createElement('div'); sw.className = 'nn-field'; sw.style.cssText = 'flex:0 0 auto;min-width:0';
  sw.innerHTML = '<span class="nn-label">Kỳ báo cáo</span>'; sw.append(seg);
  $('[data-f]', main).append(sw, rng,
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; draw(); } }));

  let data = [], view = null;
  async function load() {
    if (!S.online) { $('[data-body]', main).innerHTML = offlineNote(); return; }
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    try { data = await loadCalc(st.from, st.to, { force: true }); draw(); } catch (e) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }
  function draw() {
    const machines = cat.may(true).filter((m) => !st.bp || m.bo_phan_id === st.bp);
    const ids = new Set(machines.map((m) => m.id));
    const rows = data.filter((r) => ids.has(r.p.may_id));
    const agg = aggregate(rows.map((r) => r.c));
    const T = teep(agg, daysBetween(st.from, st.to), new Set(rows.map((x) => x.p.may_id)).size);
    const perMay = machines.map((m) => ({ m, a: aggregate(rows.filter((r) => r.p.may_id === m.id).map((r) => r.c)) })).filter((x) => x.a.n);
    const par = pareto(rows.flatMap((r) => r.p.dung_may || []));
    const lossTotal = agg.L.slice(1).reduce((s, v) => s + v, 0);
    view = { rows, agg, T, perMay, par, machines };
    const bp = st.bp ? cat.name('bo_phan', st.bp) : 'Tất cả bộ phận';
    $('[data-body]', main).innerHTML = `<div class="card" style="padding:20px">
      <div class="pr-head"><img src="icons/logo.png" alt="NutriNest"><div class="pr-title">BÁO CÁO HIỆU SUẤT THIẾT BỊ (OEE)</div>
        <div class="t-cap" style="text-align:right">${esc(cat.name('nha_may', S.nm))}<br>${esc(bp)}</div></div>
      <p><b>Kỳ báo cáo:</b> ${fmtDate(st.from)} – ${fmtDate(st.to)} · ${rows.length} phiếu · ${perMay.length} máy có số liệu</p>
      ${rows.length ? `
      <div class="grid-kpi" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
        ${[['OEE', fmtPct(agg.OEE)], ['Availability', fmtPct(agg.A)], ['Performance', fmtPct(agg.P)], ['Quality', fmtPct(agg.Q)], ['TEEP', fmtPct(T)],
          ['MTBF', agg.MTBF == null ? '—' : `${fmtNum(agg.MTBF / 60, 1)} giờ`], ['MTTR', agg.MTTR == null ? '—' : `${fmtNum(agg.MTTR)} phút`], ['Tổng SL', fmtNum(agg.tong)]]
          .map(([l, v]) => `<div class="nn-kpi" style="padding:8px 12px"><span class="nn-label">${l}</span><div class="nn-kpi-value sm">${v}</div></div>`).join('')}
      </div>
      <div class="t-h3" style="margin:16px 0 8px">Chỉ số theo máy</div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Máy</th><th class="num">Phiếu</th><th class="num">PPT (giờ)</th><th class="num">Dừng (phút)</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th class="num">OEE</th><th class="num">MTBF (giờ)</th><th class="num">MTTR (phút)</th><th>Đánh giá</th></tr></thead><tbody>
        ${perMay.map(({ m, a }) => `<tr><td class="wrap"><span class="nn-mono">${esc(m.ma)}</span> ${esc(m.ten)}</td><td class="num">${a.n}</td><td class="num">${fmtNum(a.ppt / 60, 1)}</td><td class="num">${fmtNum(a.stopLoss)}</td>
          <td class="num">${fmtPct(a.A)}</td><td class="num">${fmtPct(a.P)}</td><td class="num">${fmtPct(a.Q)}</td><td class="num"><b>${fmtPct(a.OEE)}</b></td>
          <td class="num">${a.MTBF == null ? '—' : fmtNum(a.MTBF / 60, 1)}</td><td class="num">${a.MTTR == null ? '—' : fmtNum(a.MTTR)}</td><td>${oeeBadge(a.OEE, m.nguong_xanh, m.nguong_vang)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="grid-2" style="margin-top:16px">
        <div><div class="t-h3" style="margin-bottom:8px">6 tổn thất lớn</div><div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Nhóm</th><th class="num">Phút</th><th class="num">Tỷ lệ</th></tr></thead><tbody>
          ${[1, 2, 3, 4, 5, 6].map((i) => `<tr><td>${i}. ${NHOM_TT[i]}</td><td class="num">${fmtNum(agg.L[i])}</td><td class="num">${fmtPct(lossTotal ? agg.L[i] / lossTotal : null)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><div class="t-h3" style="margin-bottom:8px">Top 10 lỗi dừng máy</div><div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lỗi</th><th class="num">Lần</th><th class="num">Phút</th><th class="num">Lũy kế</th></tr></thead><tbody>
          ${par.slice(0, 10).map((r) => `<tr><td class="wrap"><span class="nn-mono">${esc(r.ma || '')}</span> ${esc(r.ten)}</td><td class="num">${r.lan}</td><td class="num">${fmtNum(r.phut)}</td><td class="num">${fmtPct(r.luyKe, 0)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Không có</td></tr>'}</tbody></table></div></div>
      </div>` : '<div class="empty">Không có phiếu trong kỳ</div>'}
      <div class="t-cap" style="margin-top:12px">Lập lúc ${fmtDateTime(new Date())} bởi ${esc(S.profile.ho_ten)} · KỸ THUẬT - THEO DÕI OEE</div></div>`;
  }

  main.onclick = (e) => {
    if (e.target.closest('[data-print]')) window.print();
    if (e.target.closest('[data-xlsx]')) exportXlsx();
  };

  function exportXlsx() {
    if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
    if (!view?.rows.length) return toast('Không có dữ liệu để xuất', 'warning');
    const { rows, perMay, agg, par } = view;
    const wb = XLSX.utils.book_new();
    const add = (name, arr) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(arr), name);
    add('TongHop_May', perMay.map(({ m, a }) => ({
      'Mã máy': m.ma, 'Tên máy': m.ten, 'Bộ phận': cat.name('bo_phan', m.bo_phan_id), 'Số phiếu': a.n, 'PPT (phút)': Math.round(a.ppt), 'Chạy (phút)': Math.round(a.run),
      'Dừng tổn thất (phút)': Math.round(a.stopLoss), 'A (%)': r1(a.A), 'P (%)': r1(a.P), 'Q (%)': r1(a.Q), 'OEE (%)': r1(a.OEE),
      'MTBF (giờ)': a.MTBF == null ? null : +(a.MTBF / 60).toFixed(2), 'MTTR (phút)': a.MTTR == null ? null : +a.MTTR.toFixed(1),
      'Tổng SL': a.tong, 'SL đạt': a.good, 'Lỗi khởi động': a.kd, 'Lỗi quá trình': a.qt, 'Mục tiêu OEE (%)': m.oee_muc_tieu,
    })));
    add('Phieu', rows.map(({ p, c }) => ({
      'Ngày': fmtDate(p.ngay), 'Mã máy': cat.name('may', p.may_id, 'ma'), 'Dây chuyền': cat.name('day_chuyen', p.day_chuyen_id), 'Bộ phận': cat.name('bo_phan', p.bo_phan_id), 'Ca': cat.name('ca', p.ca_id), 'Sản phẩm': cat.name('san_pham', p.san_pham_id),
      'Tốc độ ĐM (sp/phút)': p.toc_do_dm, 'Giờ BĐ': hm(p.gio_bd), 'Giờ KT': hm(p.gio_kt), 'Nghỉ (phút)': p.nghi_phut, 'Dừng KH (phút)': c.keHoach, 'PPT (phút)': c.ppt,
      'Dừng tổn thất (phút)': c.stopLoss, 'Chạy (phút)': c.run, 'Tổng SL': p.tong_sl, 'Lỗi KĐ': p.sl_loi_kd, 'Lỗi QT': p.sl_loi_qt, 'SL đạt': c.good,
      'A (%)': r1(c.A), 'P (%)': r1(c.P), 'Q (%)': r1(c.Q), 'OEE (%)': r1(c.OEE),
      'Vận hành': cat.person(p.nguoi_van_hanh_id), 'Tổ trưởng': cat.person(p.to_truong_id), 'Kỹ thuật': cat.person(p.ky_thuat_id),
      'Trạng thái': TRANG_THAI_PHIEU[p.trang_thai]?.label, 'Ghi chú': p.ghi_chu || '',
    })));
    add('DungMay', rows.flatMap(({ p }) => (p.dung_may || []).filter((s) => s.goc !== false).sort((a, b) => a.stt - b.stt).map((s) => ({
      'Ngày': fmtDate(p.ngay), 'Mã máy': cat.name('may', p.may_id, 'ma'), 'Ca': cat.name('ca', p.ca_id), 'Lần': s.stt, 'Mã lỗi': s.ma_loi, 'Tên lỗi': s.ten_loi,
      'Nhóm tổn thất': NHOM_TT[s.dung_ngan ? 3 : s.nhom_ton_that], 'Loại lỗi': s.loai_loi, 'Từ': hm(s.gio_bd), 'Đến': hm(s.gio_kt), 'Phút': s.phut, 'Dừng ngắn': s.dung_ngan ? 'Có' : '',
      'Vấn đề chất lượng': s.van_de_cl || '', 'Người xử lý': cat.person(s.nguoi_xu_ly_id), 'Tình trạng': TINH_TRANG[s.tinh_trang]?.label, 'Ghi chú': s.ghi_chu || '', 'Ghi chú xử lý': s.ghi_chu_xu_ly || '',
    }))));
    const lt = agg.L.slice(1).reduce((s, v) => s + v, 0);
    add('SixBigLosses', [1, 2, 3, 4, 5, 6].map((i) => ({ 'Nhóm': `${i}. ${NHOM_TT[i]}`, 'Phút': Math.round(agg.L[i]), 'Tỷ lệ (%)': lt ? r1(agg.L[i] / lt) : null })));
    add('Pareto', par.map((r) => ({ 'Mã lỗi': r.ma, 'Tên lỗi': r.ten, 'Số lần': r.lan, 'Phút': r.phut, 'Tỷ lệ (%)': r1(r.tyLe), 'Lũy kế (%)': r1(r.luyKe) })));
    XLSX.writeFile(wb, `BaoCao_OEE_${st.from}_${st.to}.xlsx`);
    toast('Đã xuất file Excel');
  }
  load();
}
