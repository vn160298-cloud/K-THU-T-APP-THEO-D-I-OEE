// Công thức OEE, TEEP, OPE, MTBF, MTTR, Six Big Losses — xem DAC_TA_APP.md mục 5
import { minutesBetween, giaoPhut } from './lib.js';

/**
 * Tính chỉ số cho 1 phiếu (phiếu của 1 máy; phiếu con của dây chuyền cũng tính như phiếu máy).
 * p: {gio_bd, gio_kt, nghi_phut, tong_sl, sl_loi_kd, sl_loi_qt, toc_do_dm, dung_ke_hoach[], dung_may[]}
 * Mọi thời gian tính bằng phút.
 *
 * Dòng dừng có goc === false là dòng PHÁI SINH (máy này dừng vì máy khác trong chuyền gây lỗi):
 * tính vào thời gian dừng / Availability / 6 tổn thất của máy này, nhưng KHÔNG tính vào số lần dừng, MTBF, MTTR, Pareto.
 */
export function calcPhieu(p, nguongNgan = 5) {
  const caPhut = minutesBetween(p.gio_bd, p.gio_kt);
  const nghi = +p.nghi_phut || 0;
  // v1.13: khoảng nghỉ / dừng kế hoạch chỉ trừ phần trùng với giờ chạy của phiếu (mỗi dây chuyền / máy có giờ riêng)
  const keHoach = (p.dung_ke_hoach || p.ke_hoach || []).reduce((s, k) => s + (k.phut ?? giaoPhut(p.gio_bd, p.gio_kt, k.gio_bd, k.gio_kt)), 0);
  const ppt = Math.max(0, caPhut - nghi - keHoach);
  const L = [0, 0, 0, 0, 0, 0, 0]; // L[1..6]
  let bdCount = 0, bdMin = 0, shortCount = 0, stopCount = 0, totalStop = 0;
  for (const d of p.dung_may || []) {
    const m = d.phut ?? minutesBetween(d.gio_bd, d.gio_kt);
    const own = d.goc !== false;
    const short = d.dung_ngan ?? m < nguongNgan;
    const g = short ? 3 : (+d.nhom_ton_that || 1); // dưới ngưỡng dừng ngắn -> luôn xếp nhóm 3
    L[g] += m; totalStop += m;
    if (own) {
      stopCount++;
      if (short) shortCount++;
      if (g === 1) { bdCount++; bdMin += m; }
    }
  }
  const stopLoss = totalStop;                 // mọi lần dừng, mọi nhóm: đều trừ vào thời gian chạy
  const run = Math.max(0, ppt - stopLoss);
  const tong = +p.tong_sl || 0, kd = +p.sl_loi_kd || 0, qt = +p.sl_loi_qt || 0;
  const good = Math.max(0, tong - kd - qt);
  const ct = p.toc_do_dm > 0 ? 1 / p.toc_do_dm : null; // phút / sản phẩm
  const ideal = ct != null ? tong * ct : null;
  const goodTime = ct != null ? good * ct : null;
  if (ct != null) {
    // Nhóm 4-6: cộng phần tự tính từ sản lượng vào phần các lần dừng đã gắn nhóm đó
    L[4] += Math.max(0, run - ideal);
    L[5] += qt * ct;
    L[6] += kd * ct;
  }
  return {
    kt: !!p.giao_ca_id, // v1.12: phiếu tự tạo từ báo cáo giao ca Kỹ thuật
    caPhut, nghi, keHoach, ppt, stopLoss, run, ct, tong, good, kd, qt, ideal, goodTime, L,
    bdCount, bdMin, shortCount, stopCount, hasSpeed: ct != null,
    demSl: true, // aggregate chỉ cộng sản lượng của máy cuối chuyền (data.js đặt false cho các máy còn lại)
    A: ppt > 0 ? run / ppt : null,
    P: ct != null && run > 0 ? ideal / run : null,
    Q: tong > 0 ? good / tong : null,
    OEE: ct != null && ppt > 0 ? goodTime / ppt : null,
  };
}

/** Gộp nhiều kết quả calcPhieu (trọng số theo thời gian) */
export function aggregate(list) {
  const s = { n: list.length, nSX: 0, ppt: 0, run: 0, pptS: 0, runS: 0, ideal: 0, goodTime: 0, tong: 0, good: 0, kd: 0, qt: 0,
    bdCount: 0, bdMin: 0, stopCount: 0, stopLoss: 0, L: [0, 0, 0, 0, 0, 0, 0], missingSpeed: 0, invalid: 0,
    kt: { n: 0, ppt: 0, run: 0, stop: 0, bdCount: 0, bdMin: 0, stopCount: 0 } };
  for (const c of list) {
    // v1.15: máy phụ trợ (lò hơi, khí nén, nước làm mềm…) không có sản lượng -> không vào OEE / 6 tổn thất.
    // Tính riêng: Độ sẵn sàng = giờ chạy / giờ hoạt động yêu cầu, MTBF / MTTR bằng giờ chạy của chính máy phụ trợ (không cộng lẫn máy sản xuất).
    if (c.kt) { const k = s.kt; k.n++; k.ppt += c.ppt; k.run += c.run; k.stop += c.stopLoss; k.bdCount += c.bdCount; k.bdMin += c.bdMin; k.stopCount += c.stopCount; continue; }
    s.nSX++;
    s.ppt += c.ppt; s.run += c.run;
    if (c.demSl !== false) { s.tong += c.tong; s.good += c.good; s.kd += c.kd; s.qt += c.qt; }
    s.bdCount += c.bdCount; s.bdMin += c.bdMin; s.stopCount += c.stopCount; s.stopLoss += c.stopLoss;
    c.L.forEach((v, i) => { s.L[i] += v; });
    // Phiếu thiếu tốc độ hoặc PPT = 0 (dừng kế hoạch nhập sai) không tính vào OEE/P/Q
    if (c.hasSpeed && c.ppt > 0) { s.pptS += c.ppt; s.runS += c.run; s.ideal += c.ideal; s.goodTime += c.goodTime; }
    else if (!c.hasSpeed) s.missingSpeed++;
    else s.invalid++;
  }
  s.A = s.ppt > 0 ? s.run / s.ppt : null;
  s.P = s.runS > 0 ? s.ideal / s.runS : null;
  s.Q = s.ideal > 0 ? s.goodTime / s.ideal : (s.tong > 0 ? s.good / s.tong : null);
  s.OEE = s.pptS > 0 ? s.goodTime / s.pptS : null;
  // MTBF / MTTR máy sản xuất: chỉ giờ chạy + hỏng hóc của máy sản xuất
  s.MTBF = s.bdCount > 0 ? s.run / s.bdCount : null;
  s.MTTR = s.bdCount > 0 ? s.bdMin / s.bdCount : null;
  const k = s.kt;
  k.A = k.ppt > 0 ? k.run / k.ppt : null;
  k.MTBF = k.bdCount > 0 ? k.run / k.bdCount : null;
  k.MTTR = k.bdCount > 0 ? k.bdMin / k.bdCount : null;
  // Chỉ có máy phụ trợ (VD lọc 1 máy lò hơi): A / MTBF / MTTR / dừng lấy theo máy phụ trợ; OEE, P, Q để trống
  if (!s.nSX && k.n) Object.assign(s, { A: k.A, MTBF: k.MTBF, MTTR: k.MTTR, bdCount: k.bdCount, bdMin: k.bdMin, stopCount: k.stopCount, stopLoss: k.stop, ppt: k.ppt, run: k.run, phuTro: true });
  return s;
}

/** TEEP = thời gian sản xuất hiệu quả / thời gian lịch (24h × số ngày × số đơn vị: mỗi dây chuyền / máy đơn tính 1 lần) */
export const teep = (agg, days, units) => (days > 0 && units > 0 ? agg.goodTime / (days * 1440 * units) : null);
/** v1.15: Loading = thời gian chạy kế hoạch / thời gian lịch -> TEEP ≈ OEE × Loading */
export const loading = (agg, days, units) => (days > 0 && units > 0 ? agg.ppt / (days * 1440 * units) : null);

/** Pareto lỗi: gom theo mã lỗi — chỉ các lần dừng gốc (bỏ dòng phái sinh) */
export function pareto(stops) {
  const m = new Map();
  for (const d of stops) {
    if (d.goc === false) continue;
    const k = `${d.ma_loi || ''}|${d.ten_loi || 'Không rõ'}`;
    const r = m.get(k) || { ma: d.ma_loi, ten: d.ten_loi || 'Không rõ', phut: 0, lan: 0, nhom: d.dung_ngan ? 3 : d.nhom_ton_that };
    r.phut += d.phut || 0; r.lan++;
    m.set(k, r);
  }
  const arr = [...m.values()].sort((a, b) => b.phut - a.phut);
  const total = arr.reduce((s, r) => s + r.phut, 0);
  let cum = 0;
  for (const r of arr) { cum += r.phut; r.tyLe = total ? r.phut / total : 0; r.luyKe = total ? cum / total : 0; }
  return arr;
}
