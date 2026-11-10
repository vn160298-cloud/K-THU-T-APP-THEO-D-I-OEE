// Công thức OEE, TEEP, OPE, MTBF, MTTR, Six Big Losses — xem DAC_TA_APP.md mục 5
import { minutesBetween } from './lib.js';

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
  const keHoach = (p.dung_ke_hoach || p.ke_hoach || []).reduce((s, k) => s + (k.phut ?? minutesBetween(k.gio_bd, k.gio_kt)), 0);
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
  const s = { n: list.length, ppt: 0, run: 0, pptS: 0, runS: 0, ideal: 0, goodTime: 0, tong: 0, good: 0, kd: 0, qt: 0,
    bdCount: 0, bdMin: 0, stopCount: 0, stopLoss: 0, L: [0, 0, 0, 0, 0, 0, 0], missingSpeed: 0, invalid: 0 };
  for (const c of list) {
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
  s.MTBF = s.bdCount > 0 ? s.run / s.bdCount : null;
  s.MTTR = s.bdCount > 0 ? s.bdMin / s.bdCount : null;
  return s;
}

/** TEEP = thời gian sản xuất hiệu quả / thời gian lịch (24h × số ngày × số máy) */
export const teep = (agg, days, machines) => (days > 0 && machines > 0 ? agg.goodTime / (days * 1440 * machines) : null);

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
