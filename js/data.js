// Nạp phiếu theo khoảng ngày và tính sẵn chỉ số
import { S, cat, fetchPhieu } from './api.js';
import { calcPhieu } from './kpi.js';

const memo = new Map();
export async function loadCalc(from, to, { force } = {}) {
  const key = `${S.nm}|${from}|${to}`;
  const hit = memo.get(key);
  if (hit && !force && Date.now() - hit.t < 60000) return hit.v;
  const list = await fetchPhieu({ from, to });
  const ngan = cat.caiDat().nguong_dung_ngan || 5;
  const v = list.map((p) => ({ p, c: calcPhieu(p, ngan) }));
  memo.set(key, { t: Date.now(), v });
  return v;
}
export const clearCalc = () => memo.clear();
