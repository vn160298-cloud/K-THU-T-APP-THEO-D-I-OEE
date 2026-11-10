// Nạp phiếu theo khoảng ngày, tính sẵn chỉ số, gộp phiếu con của dây chuyền
import { S, cat, fetchPhieu } from './api.js';
import { calcPhieu } from './kpi.js';

const memo = new Map();
/** nm: id nhà máy (mặc định nhà máy đang chọn); '' = mọi nhà máy */
export async function loadCalc(from, to, { force, nm } = {}) {
  const nmId = nm === undefined ? S.nm : nm;
  const key = `${nmId}|${from}|${to}`;
  const hit = memo.get(key);
  if (hit && !force && Date.now() - hit.t < 60000) return hit.v;
  const list = await fetchPhieu({ from, to, nm: nmId });
  const lastOf = {};
  const v = list.map((p) => {
    const c = calcPhieu(p, cat.caiDatOf(p.nha_may_id).nguong_dung_ngan || 5);
    // Phiếu con của dây chuyền: chỉ máy cuối chuyền được tính sản lượng khi cộng nhiều máy (tránh cộng trùng)
    if (p.day_chuyen_id) {
      lastOf[p.day_chuyen_id] ??= cat.lastMay(p.day_chuyen_id);
      c.demSl = p.may_id === lastOf[p.day_chuyen_id];
    }
    return { p, c };
  });
  memo.set(key, { t: Date.now(), v });
  return v;
}
export const clearCalc = () => memo.clear();

/**
 * Gộp các phiếu con của cùng 1 phiếu dây chuyền thành 1 dòng; phiếu máy đơn giữ nguyên.
 * Mỗi mục: { key, kind: 'chuyen' | 'may', line, rep, children } — rep = phiếu của máy cuối chuyền (đại diện OEE dây chuyền).
 * key = id phiếu dây chuyền (nhom_id) hoặc id phiếu máy; mở trang chi tiết bằng #/phieu/<key>.
 */
export function groupEntries(rows) {
  const out = [], seen = new Map();
  for (const r of rows) {
    const g = r.p.nhom_id;
    if (!g) { out.push({ key: r.p.id, kind: 'may', rep: r, children: [r] }); continue; }
    let e = seen.get(g);
    if (!e) {
      e = { key: g, kind: 'chuyen', line: S.cat.byId.day_chuyen[r.p.day_chuyen_id], children: [] };
      seen.set(g, e); out.push(e);
    }
    e.children.push(r);
  }
  for (const e of out) {
    if (e.kind !== 'chuyen') continue;
    const last = e.line ? cat.lastMay(e.line.id) : null;
    e.rep = e.children.find((x) => x.p.may_id === last) || e.children[e.children.length - 1];
  }
  return out;
}

/** Tên hiển thị của 1 mục: tên dây chuyền hoặc "mã máy · tên máy" */
export const entryLabel = (e) => (e.kind === 'chuyen' ? (e.line?.ten || 'Dây chuyền') : cat.mayLabel(e.rep.p.may_id));
