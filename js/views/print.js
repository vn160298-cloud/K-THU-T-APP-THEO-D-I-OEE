// Mẫu phiếu mới để in / lưu PDF
import { S, cat, getPhieu } from '../api.js';
import { calcPhieu } from '../kpi.js';
import { esc, icon, fmtDate, fmtNum, fmtPct, fmtMin, hm, NHOM_TT, TINH_TRANG, fmtDateTime, phieuBadge } from '../lib.js';

export async function render(main, { params }) {
  const p = await getPhieu(params[0]);
  if (!p) { main.innerHTML = '<div class="empty">Không tìm thấy phiếu</div>'; return; }
  const c = calcPhieu(p, cat.caiDat().nguong_dung_ngan || 5);
  const m = S.cat.byId.may[p.may_id];
  const stops = (p.dung_may || []).sort((a, b) => a.stt - b.stt);
  const pad = Math.max(0, 5 - stops.length);
  main.innerHTML = `<div class="nn-row no-print" style="padding:0 0 16px">
      <a class="nn-btn nn-btn-secondary nn-btn-lg" href="#/phieu/${p.id}">${icon('chevL', 18)}Quay lại</a>
      <button class="nn-btn nn-btn-primary nn-btn-lg" data-print>${icon('print', 18)}In / Lưu PDF</button>
      <span class="t-cap">Chọn máy in "Lưu thành PDF" để xuất file PDF</span></div>
    <div class="card" style="padding:20px">
      <div class="pr-head"><img src="icons/logo.png" alt="NutriNest"><div class="pr-title">PHIẾU GHI NHẬN VẬN HÀNH THIẾT BỊ HẰNG NGÀY</div>
        <div class="t-cap" style="text-align:right">${esc(cat.name('nha_may', p.nha_may_id))}<br>Bộ phận Kỹ thuật</div></div>
      <div class="nn-table-wrap"><table class="nn-table"><tbody>
        <tr><th>Mã máy</th><td class="nn-mono">${esc(m?.ma || '')}</td><th>Tên máy</th><td colspan="3">${esc(m?.ten || '')}</td></tr>
        <tr><th>Ngày</th><td>${fmtDate(p.ngay)}</td><th>Ca</th><td>${esc(cat.name('ca', p.ca_id))} (${hm(p.gio_bd)}–${hm(p.gio_kt)})</td><th>Bộ phận</th><td>${esc(cat.name('bo_phan', p.bo_phan_id))}</td></tr>
        <tr><th>Sản phẩm</th><td>${esc(cat.name('san_pham', p.san_pham_id))}</td><th>Tốc độ định mức</th><td>${fmtNum(p.toc_do_dm, 1)} sp/phút</td><th>Nghỉ giữa ca</th><td>${p.nghi_phut} phút</td></tr>
        <tr><th>Tổng sản lượng</th><td class="num">${fmtNum(p.tong_sl)}</td><th>Lỗi khởi động</th><td class="num">${fmtNum(p.sl_loi_kd)}</td><th>Lỗi quá trình</th><td class="num">${fmtNum(p.sl_loi_qt)}</td></tr>
        <tr><th>SL đạt</th><td class="num"><b>${fmtNum(c.good)}</b></td><th>Thời gian chạy KH</th><td>${fmtMin(c.ppt)}</td><th>Trạng thái</th><td>${phieuBadge(p.trang_thai)}</td></tr>
      </tbody></table></div>
      <div class="grid-kpi" style="margin:12px 0;grid-template-columns:repeat(4,1fr)">
        ${[['Availability', c.A], ['Performance', c.P], ['Quality', c.Q], ['OEE', c.OEE]].map(([l, v]) => `<div class="nn-kpi" style="padding:8px 12px"><span class="nn-label">${l}</span><div class="nn-kpi-value sm">${fmtPct(v)}</div></div>`).join('')}
      </div>
      ${(p.dung_ke_hoach || []).length ? `<div class="t-h3" style="margin:8px 0">Dừng có kế hoạch</div><div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lý do</th><th>Từ</th><th>Đến</th><th class="num">Phút</th></tr></thead><tbody>
        ${p.dung_ke_hoach.map((k) => `<tr><td>${esc(k.ly_do_ten || '')}</td><td>${hm(k.gio_bd)}</td><td>${hm(k.gio_kt)}</td><td class="num">${k.phut}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="t-h3" style="margin:12px 0 8px">Các lần dừng máy</div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lần</th><th>Mã lỗi</th><th>Lý do dừng máy</th><th>Nhóm tổn thất</th><th>Từ – đến</th><th class="num">Phút</th><th>Vấn đề chất lượng</th><th>Người xử lý</th><th>Tình trạng</th><th>Ghi chú</th></tr></thead><tbody>
        ${stops.map((s) => `<tr><td>${s.stt}</td><td class="nn-mono">${esc(s.ma_loi || '')}</td><td class="wrap">${esc(s.ten_loi || '')}</td><td>${esc(NHOM_TT[s.dung_ngan ? 3 : s.nhom_ton_that] || '')}</td>
          <td>${hm(s.gio_bd)}–${hm(s.gio_kt)}</td><td class="num">${s.phut}</td><td class="wrap">${esc(s.van_de_cl || '')}</td><td>${esc(cat.person(s.nguoi_xu_ly_id))}</td>
          <td>${esc(TINH_TRANG[s.tinh_trang]?.label || '')}</td><td class="wrap">${esc([s.ghi_chu, s.ghi_chu_xu_ly].filter(Boolean).join(' · '))}</td></tr>`).join('')}
        ${'<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(pad)}
        <tr><td colspan="5"><b>Tổng thời gian dừng</b></td><td class="num"><b>${fmtNum(c.stopLoss)}</b></td><td colspan="4"></td></tr>
      </tbody></table></div>
      ${p.ghi_chu ? `<p><b>Ghi chú:</b> ${esc(p.ghi_chu)}</p>` : ''}
      <div class="pr-sign">
        <div><b>Người vận hành</b><br><span class="t-cap">${esc(cat.person(p.nguoi_van_hanh_id))}</span></div>
        <div><b>Tổ trưởng</b><br><span class="t-cap">${esc(cat.person(p.to_truong_id))}${p.xac_nhan_luc ? `<br>Đã xác nhận ${fmtDateTime(p.xac_nhan_luc)}` : ''}</span></div>
        <div><b>Kỹ thuật</b><br><span class="t-cap">${esc(cat.person(p.ky_thuat_id))}</span></div>
      </div>
      <div class="t-cap" style="margin-top:12px">In lúc ${fmtDateTime(new Date())} · KỸ THUẬT - THEO DÕI OEE</div>
    </div>`;
  main.onclick = (e) => { if (e.target.closest('[data-print]')) window.print(); };
}
