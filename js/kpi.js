// Công thức OEE, TEEP, OPE, MTBF, MTTR, Six Big Losses — xem DAC_TA_APP.md mục 5
import { minutesBetween } from './lib.js';

/**
 * Tính chỉ số cho 1 phiếu.
 * p: {gio_bd, gio_kt, nghi_phut, tong_sl, sl_loi_kd, sl_loi_qt, toc_do_dm, dung_ke_hoach[], dung_may[]}
 * Mọi thời gian tính bằng phút.
 */
export function calcPhieu(p, nguongNgan = 5) {
  const caPhut = minutesBetween(p.gio_bd, p.gio_kt);
  const nghi = +p.nghi_phut || 0;
  const keHoach = (p.dung_ke_hoach || p.ke_hoach || []).reduce((s, k) => s + (k.phut ?? minutesBetween(k.gio_bd, k.gio_kt)), 0);
  const ppt = Math.max(0, caPhut - nghi - keHoach);
  const L = [0, 0, 0, 0, 0, 0, 0]; // L[1..6]
  let bdCount = 0, shortCount = 0, stopCount = 0;
  for (const d of p.dung_may || []) {
    const m = d.phut ?? minutesBetween(d.gio_bd, d.gio_kt);
    const short = d.dung_ngan ?? m < nguongNgan;
    const g = short ? 3 : (+d.nhom_ton_that || 1);
    L[g] += m;
    stopCount++;
    if (short) shortCount++;
    if (g === 1) bdCount++;
  }
  const stopLoss = L[1] + L[2] + L[3];
  const run = Math.max(0, ppt - stopLoss);
  const tong = +p.tong_sl || 0, kd = +p.sl_loi_kd || 0, qt = +p.sl_loi_qt || 0;
  const good = Math.max(0, tong - kd - qt);
  const ct = p.toc_do_dm > 0 ? 1 / p.toc_do_dm : null; // phút / sản phẩm
  const ideal = ct != null ? tong * ct : null;
  const goodTime = ct != null ? good * ct : null;
  if (ct != null) {
    L[4] = Math.max(0, run - ideal);
    L[5] = qt * ct;
    L[6] = kd * ct;
  }
  return {
    caPhut, nghi, keHoach, ppt, stopLoss, run, ct, tong, good, kd, qt, ideal, goodTime, L,
    bdCount, bdMin: L[1], shortCount, stopCount, hasSpeed: ct != null,
    A: ppt > 0 ? run / ppt : null,
    P: ct != null && run > 0 ? ideal / run : null,
    Q: tong > 0 ? good / tong : null,
    OEE: ct != null && ppt > 0 ? goodTime / ppt : null,
  };
}

/** Gộp nhiều kết quả calcPhieu (trọng số theo thời gian) */
export function aggregate(list) {
  const s = { n: list.length, ppt: 0, run: 0, pptS: 0, runS: 0, ideal: 0, goodTime: 0, tong: 0, good: 0, kd: 0, qt: 0,
    bdCount: 0, bdMin: 0, stopCount: 0, stopLoss: 0, L: [0, 0, 0, 0, 0, 0, 0], missingSpeed: 0 };
  for (const c of list) {
    s.ppt += c.ppt; s.run += c.run; s.tong += c.tong; s.good += c.good; s.kd += c.kd; s.qt += c.qt;
    s.bdCount += c.bdCount; s.bdMin += c.bdMin; s.stopCount += c.stopCount; s.stopLoss += c.stopLoss;
    c.L.forEach((v, i) => { s.L[i] += v; });
    // Phiếu thiếu tốc độ hoặc PPT = 0 (dừng kế hoạch nhập sai) không tính vào OEE/P/Q
    if (c.hasSpeed && c.ppt > 0) { s.pptS += c.ppt; s.runS += c.run; s.ideal += c.ideal; s.goodTime += c.goodTime; } else if (!c.hasSpeed) s.missingSpeed++; else s.invalid = (s.invalid || 0) + 1;
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

/**
 * OEE dây chuyền sản phẩm (OPE dây chuyền)
 * = SL đạt ở máy cuối × CT lý tưởng của máy nút cổ chai / PPT của máy nút cổ chai
 */
export function lineOEE(line, members, phieuCalc, tocDo) {
  const last = members.find((m) => m.la_may_cuoi) || members[members.length - 1];
  const bott = members.find((m) => m.la_nut_co_chai) || last;
  if (!last || !bott) return null;
  const okSp = (p) => !line.san_pham_id || p.san_pham_id === line.san_pham_id;
  const lastP = phieuCalc.filter(({ p }) => p.may_id === last.may_id && okSp(p));
  const botP = phieuCalc.filter(({ p }) => p.may_id === bott.may_id && okSp(p));
  const good = lastP.reduce((s, { c }) => s + c.good, 0);
  const ppt = botP.reduce((s, { c }) => s + c.ppt, 0);
  let speed = line.san_pham_id ? tocDo(bott.may_id, line.san_pham_id) : null;
  if (!speed) { const w = botP.find(({ p }) => p.toc_do_dm > 0); speed = w?.p.toc_do_dm ?? null; }
  if (!speed || !ppt) return { good, ppt, speed, oee: null, lastId: last.may_id, bottId: bott.may_id };
  return { good, ppt, speed, oee: (good / speed) / ppt, lastId: last.may_id, bottId: bott.may_id };
}

/** Pareto lỗi: gom theo mã lỗi */
export function pareto(stops) {
  const m = new Map();
  for (const d of stops) {
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
