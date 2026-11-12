// Danh mục ⇄ Excel: xuất toàn bộ danh mục (mỗi mục 1 sheet) và nhập nhanh lại từ chính file đó.
// Nhập = THÊM MỚI + CẬP NHẬT theo mã/tên, KHÔNG XÓA (muốn bỏ thì đặt "Đang dùng" = Không).
// Trước khi nhập: xem trước số dòng thêm / sửa / lỗi, rồi xác nhận bằng PIN của admin.
import { S, sb, cat, can, loadCatalog, verifyPin, errText } from '../api.js';
import { esc, icon, hm, pad, today, NHOM_TT, LOAI_LOI, VAI_TRO, noAccent, toNum, xlsxSheet } from '../lib.js';
import { el, $, toast, openSheet, inputField } from '../ui.js';

// ---------- Xác nhận bằng PIN admin ----------
/** Hỏi xác nhận + PIN của người đang đăng nhập. Trả về true nếu PIN đúng. */
export function confirmPin(text, { ok = 'Xác nhận', title = 'Xác nhận bằng PIN', danger = false } = {}) {
  return new Promise((res) => {
    let done = false;
    const body = el(`<div><p>${esc(text)}</p></div>`);
    const f = inputField({ label: `PIN đăng nhập của ${S.profile.ho_ten} (${S.profile.ma_nv})`, type: 'password', inputmode: 'numeric', req: true, attrs: 'maxlength="6" autocomplete="off"' });
    body.append(f);
    const okB = el(`<button class="nn-btn ${danger ? 'nn-btn-danger' : 'nn-btn-primary'} nn-btn-lg">${icon('lock', 18)}${esc(ok)}</button>`);
    const noB = el('<button class="nn-btn nn-btn-secondary nn-btn-lg">Hủy</button>');
    const s = openSheet({ title, body, foot: [noB, okB], onClose: () => { if (!done) res(false); } });
    const go = async () => {
      const pin = f.input.value.trim();
      if (!/^\d{4,6}$/.test(pin)) return toast('Nhập PIN gồm 4–6 chữ số', 'warning');
      okB.disabled = true;
      try { await verifyPin(pin); done = true; s.close(); res(true); } catch (e) { okB.disabled = false; f.input.value = ''; f.input.focus(); toast(errText(e), 'danger'); }
    };
    okB.onclick = go;
    f.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    noB.onclick = () => { done = true; s.close(); res(false); };
    setTimeout(() => f.input.focus(), 50);
  });
}

// ---------- Tiện ích ----------
const nmName = (id) => S.cat.byId.nha_may[id]?.ten || '';
const yn = (b) => (b ? 'Có' : 'Không');
const k = (s) => noAccent(String(s ?? '').trim()).replace(/\s+/g, ' ');
const str = (v) => String(v ?? '').trim();
const ALL_NM = '(admin tổng)';
const ALL_BP = '(tất cả)';
const MAY_DON = 'Máy đơn';
const LOAI_PC = { van_hanh: 'Vận hành', to_truong: 'Tổ trưởng' };

const boolOf = (v, def = true) => {
  if (v === '' || v == null) return def;
  if (typeof v === 'boolean') return v;
  const s = k(v);
  if (['co', 'x', '1', 'true', 'yes', 'dang dung', 'dang hoat dong'].includes(s)) return true;
  if (['khong', '0', 'false', 'no', 'ngung'].includes(s)) return false;
  throw new Error(`"${v}" không phải Có/Không`);
};
const timeOf = (v) => {
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }
  const m = str(v).match(/^(\d{1,2})[:hH.](\d{2})/);
  if (!m) throw new Error(`Giờ "${v}" không hợp lệ (dạng 06:00)`);
  return `${pad(m[1])}:${m[2]}`;
};
const numOf = (v, label, { req = false, def = null } = {}) => {
  if (v === '' || v == null) { if (req) throw new Error(`Thiếu ${label}`); return def; }
  const n = toNum(v);
  if (n == null) throw new Error(`${label} "${v}" không phải số`);
  return n;
};
const need = (v, label) => { const s = str(v); if (!s) throw new Error(`Thiếu ${label}`); return s; };

// ---------- XUẤT ----------
export function exportCatalog() {
  if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
  const scope = can.adminTong() ? S.cat.nha_may.map((n) => n.id) : [S.nm];
  const inScope = (r) => scope.includes(r.nha_may_id);
  const mayOf = (id) => S.cat.byId.may[id];
  const mayIn = (r) => scope.includes(mayOf(r.may_id)?.nha_may_id);
  const lineIn = (r) => scope.includes(S.cat.byId.day_chuyen[r.day_chuyen_id]?.nha_may_id);
  const sp = (id) => S.cat.byId.san_pham[id];
  const wb = XLSX.utils.book_new();
  const add = (name, arr, header) => XLSX.utils.book_append_sheet(wb, xlsxSheet(arr.length ? arr : [Object.fromEntries(header.map((h) => [h, '']))], { header }), name);

  add('Hướng dẫn', [
    { 'Hướng dẫn nhập lại file này vào app': '1. Sửa hoặc thêm dòng ở các sheet. Giữ nguyên tên sheet và tên cột.' },
    { 'Hướng dẫn nhập lại file này vào app': '2. Dòng trùng mã/tên với dữ liệu đang có = cập nhật; dòng mới = thêm. App KHÔNG xóa gì: muốn bỏ thì đặt "Đang dùng" = Không.' },
    { 'Hướng dẫn nhập lại file này vào app': '3. Cột có chữ "(chỉ xem)" app bỏ qua khi nhập. Cột Có/Không ghi "Có" hoặc "Không".' },
    { 'Hướng dẫn nhập lại file này vào app': '4. Vào Danh mục → Nhập từ Excel → chọn file → xem trước → nhập PIN admin để xác nhận.' },
    { 'Hướng dẫn nhập lại file này vào app': `5. Nhóm 6 tổn thất ghi số 1–6 (vd "1. ${NHOM_TT[1]}"). Loại lỗi: ${LOAI_LOI.join(', ')}. Vai trò: ${Object.values(VAI_TRO).join(', ')}.` },
  ], ['Hướng dẫn nhập lại file này vào app']);
  add('Nhà máy', S.cat.nha_may.filter((n) => scope.includes(n.id)).map((n) => ({ 'Mã': n.ma, 'Tên nhà máy': n.ten, 'Đang dùng': yn(n.hoat_dong), 'Thứ tự': n.thu_tu })), SHEETS.nha_may.cols);
  add('Bộ phận', S.cat.bo_phan.filter(inScope).map((b) => ({ 'Nhà máy': nmName(b.nha_may_id), 'Bộ phận': b.ten, 'Đang dùng': yn(b.hoat_dong), 'Thứ tự': b.thu_tu })), SHEETS.bo_phan.cols);
  add('Khu vực', S.cat.khu_vuc.filter(inScope).map((x) => ({ 'Nhà máy': nmName(x.nha_may_id), 'Khu vực': x.ten, 'Đang dùng': yn(x.hoat_dong), 'Thứ tự': x.thu_tu })), SHEETS.khu_vuc.cols);
  add('Máy', S.cat.may.filter(inScope).map((m) => ({ 'Nhà máy': nmName(m.nha_may_id), 'Mã máy': m.ma, 'Tên máy': m.ten, 'Khu vực': cat.name('khu_vuc', m.khu_vuc_id), 'Bộ phận': cat.name('bo_phan', m.bo_phan_id),
    'Dây chuyền (chỉ xem)': cat.lineNames(m.id) || MAY_DON, 'OEE mục tiêu (%)': m.oee_muc_tieu, 'Ngưỡng xanh (%)': m.nguong_xanh, 'Ngưỡng vàng (%)': m.nguong_vang, 'Đang dùng': yn(m.hoat_dong), 'Thứ tự': m.thu_tu })), SHEETS.may.cols);
  add('Mã lỗi', S.cat.ma_loi.filter(mayIn).map((l) => ({ 'Nhà máy': nmName(mayOf(l.may_id)?.nha_may_id), 'Mã máy': mayOf(l.may_id)?.ma, 'Tên máy (chỉ xem)': mayOf(l.may_id)?.ten, 'Mã lỗi': l.ma, 'Tên lỗi': l.ten,
    'Nhóm 6 tổn thất': `${l.nhom_ton_that}. ${NHOM_TT[l.nhom_ton_that]}`, 'Loại lỗi': l.loai_loi, 'Đang dùng': yn(l.hoat_dong), 'Thứ tự': l.thu_tu })), SHEETS.ma_loi.cols);
  add('Dây chuyền tổng', (S.cat.day_chuyen_tong || []).filter(inScope).map((t) => ({ 'Nhà máy': nmName(t.nha_may_id), 'Dây chuyền tổng': t.ten,
    'Các công đoạn (chỉ xem)': S.cat.day_chuyen.filter((l) => l.tong_id === t.id).map((l) => l.ten).join(' + '), 'Đang dùng': yn(t.hoat_dong), 'Thứ tự': t.thu_tu })), SHEETS.day_chuyen_tong.cols);
  add('Dây chuyền', S.cat.day_chuyen.filter(inScope).map((l) => ({ 'Nhà máy': nmName(l.nha_may_id), 'Dây chuyền': l.ten, 'Số máy (chỉ xem)': cat.members(l.id).length,
    'Thuộc dây chuyền tổng': (S.cat.day_chuyen_tong || []).find((t) => t.id === l.tong_id)?.ten || '', 'Công đoạn cuối': l.tong_id ? yn(l.la_cd_cuoi) : '', 'Đang dùng': yn(l.hoat_dong), 'Thứ tự': l.thu_tu })), SHEETS.day_chuyen.cols);
  add('Dây chuyền - Máy', S.cat.day_chuyen_may.filter(lineIn).sort((a, b) => a.thu_tu - b.thu_tu).map((x) => { const l = S.cat.byId.day_chuyen[x.day_chuyen_id]; return {
    'Nhà máy': nmName(l.nha_may_id), 'Dây chuyền': l.ten, 'Thứ tự': x.thu_tu, 'Mã máy': mayOf(x.may_id)?.ma, 'Tên máy (chỉ xem)': mayOf(x.may_id)?.ten, 'Máy cuối chuyền': yn(x.la_may_cuoi) }; }), SHEETS.day_chuyen_may.cols);
  add('Sản phẩm', S.cat.san_pham.filter(inScope).map((p) => ({ 'Nhà máy': nmName(p.nha_may_id), 'Mã': p.ma, 'Sản phẩm': p.ten, 'ĐVT': p.dvt, 'Đang dùng': yn(p.hoat_dong), 'Thứ tự': p.thu_tu })), SHEETS.san_pham.cols);
  const speedRows = (assign, speed, col) => {
    const m = new Map();
    for (const x of assign) m.set(`${x[col]}|${x.san_pham_id}`, { [col]: x[col], san_pham_id: x.san_pham_id, sp_phut: '' });
    for (const x of speed) m.set(`${x[col]}|${x.san_pham_id}`, { [col]: x[col], san_pham_id: x.san_pham_id, sp_phut: x.sp_phut });
    return [...m.values()];
  };
  add('SP & tốc độ theo máy', speedRows(S.cat.may_san_pham, S.cat.toc_do, 'may_id').filter(mayIn).map((r) => ({
    'Nhà máy': nmName(mayOf(r.may_id)?.nha_may_id), 'Mã máy': mayOf(r.may_id)?.ma, 'Tên máy (chỉ xem)': mayOf(r.may_id)?.ten, 'Mã sản phẩm': sp(r.san_pham_id)?.ma, 'Sản phẩm (chỉ xem)': sp(r.san_pham_id)?.ten, 'Tốc độ (sp/phút)': r.sp_phut })), SHEETS.toc_do.cols);
  add('SP & tốc độ theo chuyền', speedRows(S.cat.day_chuyen_san_pham, S.cat.toc_do_day_chuyen, 'day_chuyen_id').filter(lineIn).map((r) => { const l = S.cat.byId.day_chuyen[r.day_chuyen_id]; return {
    'Nhà máy': nmName(l.nha_may_id), 'Dây chuyền': l.ten, 'Mã sản phẩm': sp(r.san_pham_id)?.ma, 'Sản phẩm (chỉ xem)': sp(r.san_pham_id)?.ten, 'Tốc độ (sp/phút)': r.sp_phut }; }), SHEETS.toc_do_day_chuyen.cols);
  add('Ca làm việc', S.cat.ca.filter(inScope).map((c) => ({ 'Nhà máy': nmName(c.nha_may_id), 'Bộ phận': cat.name('bo_phan', c.bo_phan_id) || ALL_BP, 'Ca': c.ten, 'Giờ bắt đầu': hm(c.gio_bd), 'Giờ kết thúc': hm(c.gio_kt), 'Nghỉ (phút)': c.nghi_phut, 'Đang dùng': yn(c.hoat_dong), 'Thứ tự': c.thu_tu })), SHEETS.ca.cols);
  add('Lý do dừng KH', S.cat.ly_do_ke_hoach.filter(inScope).map((l) => ({ 'Nhà máy': nmName(l.nha_may_id), 'Lý do': l.ten, 'Đang dùng': yn(l.hoat_dong), 'Thứ tự': l.thu_tu })), SHEETS.ly_do_ke_hoach.cols);
  add('Nhân sự', S.cat.nhan_su.filter((n) => (!n.nha_may_id && can.adminTong()) || scope.includes(n.nha_may_id)).map((n) => ({ 'Nhà máy': n.nha_may_id ? nmName(n.nha_may_id) : ALL_NM, 'Bộ phận': cat.name('bo_phan', n.bo_phan_id),
    'Mã NV': n.ma_nv, 'Họ tên': n.ho_ten, 'Vai trò': VAI_TRO[n.vai_tro], 'Đã cấp tài khoản (chỉ xem)': yn(!!n.user_id), 'Đang hoạt động': yn(n.hoat_dong) })), SHEETS.nhan_su.cols);
  add('Phân công', (S.cat.phan_cong || []).filter(inScope).map((x) => { const c = S.cat.byId.ca[x.ca_id]; const n = S.cat.byId.nhan_su[x.nhan_su_id]; return {
    'Nhà máy': nmName(x.nha_may_id), 'Ca': c?.ten, 'Bộ phận của ca': cat.name('bo_phan', c?.bo_phan_id) || ALL_BP, 'Loại': x.day_chuyen_id ? 'Dây chuyền' : MAY_DON,
    'Dây chuyền / Mã máy': x.day_chuyen_id ? cat.name('day_chuyen', x.day_chuyen_id) : cat.name('may', x.may_id, 'ma'), 'Mã NV': n?.ma_nv, 'Họ tên (chỉ xem)': n?.ho_ten, 'Vai trò phân công': LOAI_PC[x.vai_tro] }; }), SHEETS.phan_cong.cols);
  add('Cài đặt', S.cat.cai_dat.filter((c) => scope.includes(c.nha_may_id)).map((c) => ({ 'Nhà máy': nmName(c.nha_may_id), 'Ngưỡng dừng ngắn (phút)': c.nguong_dung_ngan, 'Cảnh báo quá hạn (giờ)': c.gio_qua_han })), SHEETS.cai_dat.cols);
  XLSX.writeFile(wb, `DanhMuc_OEE_${today()}.xlsx`);
  toast('Đã xuất danh mục (không gồm PIN). File này dùng làm mẫu để nhập lại.', 'success');
}

// ---------- NHẬP ----------
// Mỗi sheet: tên, bảng, đợt (đợt sau cần id của đợt trước), cột, và hàm dựng bản ghi từ 1 dòng.
// build(row, X) trả về { rec, old } — old = bản ghi đang có (nếu trùng khóa) — hoặc ném lỗi.
// X.find* trả về bản ghi có thật, hoặc { id: PENDING } khi bản ghi sẽ được tạo ở đợt trước (lúc xem trước).
const PENDING = '__moi__';

const SHEETS = {
  nha_may: { sheet: 'Nhà máy', table: 'nha_may', phase: 1, cols: ['Mã', 'Tên nhà máy', 'Đang dùng', 'Thứ tự'], tongOnly: true,
    key: (r) => k(r['Mã']),
    build: (r) => {
      const ma = need(r['Mã'], 'mã nhà máy');
      return { rec: { ma, ten: need(r['Tên nhà máy'], 'tên nhà máy'), hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) },
        old: S.cat.nha_may.find((n) => k(n.ma) === k(ma)) };
    } },
  bo_phan: { sheet: 'Bộ phận', table: 'bo_phan', phase: 2, cols: ['Nhà máy', 'Bộ phận', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Bộ phận'], 'tên bộ phận');
      return { rec: { nha_may_id: nm, ten, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) }, old: X.byName('bo_phan', nm, ten), pkey: `${nm}|${k(ten)}` }; } },
  khu_vuc: { sheet: 'Khu vực', table: 'khu_vuc', phase: 2, cols: ['Nhà máy', 'Khu vực', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Khu vực'], 'tên khu vực');
      return { rec: { nha_may_id: nm, ten, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) }, old: X.byName('khu_vuc', nm, ten), pkey: `${nm}|${k(ten)}` }; } },
  san_pham: { sheet: 'Sản phẩm', table: 'san_pham', phase: 2, cols: ['Nhà máy', 'Mã', 'Sản phẩm', 'ĐVT', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ma = need(r['Mã'], 'mã sản phẩm');
      return { rec: { nha_may_id: nm, ma, ten: need(r['Sản phẩm'], 'tên sản phẩm'), dvt: str(r['ĐVT']) || null, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) },
        old: X.findSp(nm, ma, true), pkey: `${nm}|${k(ma)}` }; } },
  ly_do_ke_hoach: { sheet: 'Lý do dừng KH', table: 'ly_do_ke_hoach', phase: 2, cols: ['Nhà máy', 'Lý do', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Lý do'], 'lý do');
      return { rec: { nha_may_id: nm, ten, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) }, old: X.byName('ly_do_ke_hoach', nm, ten), pkey: `${nm}|${k(ten)}` }; } },
  day_chuyen_tong: { sheet: 'Dây chuyền tổng', table: 'day_chuyen_tong', phase: 2, cols: ['Nhà máy', 'Dây chuyền tổng', 'Các công đoạn (chỉ xem)', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Dây chuyền tổng'], 'tên dây chuyền tổng');
      return { rec: { nha_may_id: nm, ten, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) }, old: X.byName('day_chuyen_tong', nm, ten), pkey: `${nm}|${k(ten)}` }; } },
  cai_dat: { sheet: 'Cài đặt', table: 'cai_dat', phase: 2, cols: ['Nhà máy', 'Ngưỡng dừng ngắn (phút)', 'Cảnh báo quá hạn (giờ)'], pk: 'nha_may_id',
    build: (r, X) => { const nm = X.nm(r);
      return { rec: { nha_may_id: nm, nguong_dung_ngan: numOf(r['Ngưỡng dừng ngắn (phút)'], 'Ngưỡng dừng ngắn', { def: 5 }), gio_qua_han: numOf(r['Cảnh báo quá hạn (giờ)'], 'Cảnh báo quá hạn', { def: 4 }) },
        old: S.cat.cai_dat.find((c) => c.nha_may_id === nm), pkey: nm }; } },
  may: { sheet: 'Máy', table: 'may', phase: 3, cols: ['Nhà máy', 'Mã máy', 'Tên máy', 'Khu vực', 'Bộ phận', 'Dây chuyền (chỉ xem)', 'OEE mục tiêu (%)', 'Ngưỡng xanh (%)', 'Ngưỡng vàng (%)', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ma = need(r['Mã máy'], 'mã máy');
      const bp = X.byName('bo_phan', nm, need(r['Bộ phận'], 'bộ phận'), 'bộ phận');
      const kv = str(r['Khu vực']) ? X.byName('khu_vuc', nm, r['Khu vực'], 'khu vực') : null;
      return { rec: { nha_may_id: nm, ma, ten: need(r['Tên máy'], 'tên máy'), bo_phan_id: bp.id, khu_vuc_id: kv?.id || null,
        oee_muc_tieu: numOf(r['OEE mục tiêu (%)'], 'OEE mục tiêu', { def: 85 }), nguong_xanh: numOf(r['Ngưỡng xanh (%)'], 'Ngưỡng xanh', { def: 85 }), nguong_vang: numOf(r['Ngưỡng vàng (%)'], 'Ngưỡng vàng', { def: 60 }),
        hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) }, old: X.findMay(nm, ma, true), pkey: `${nm}|${k(ma)}` }; } },
  ca: { sheet: 'Ca làm việc', table: 'ca', phase: 3, cols: ['Nhà máy', 'Bộ phận', 'Ca', 'Giờ bắt đầu', 'Giờ kết thúc', 'Nghỉ (phút)', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Ca'], 'tên ca');
      const bp = str(r['Bộ phận']) && k(r['Bộ phận']) !== k(ALL_BP) ? X.byName('bo_phan', nm, r['Bộ phận'], 'bộ phận') : null;
      return { rec: { nha_may_id: nm, bo_phan_id: bp?.id || null, ten, gio_bd: timeOf(need(r['Giờ bắt đầu'], 'giờ bắt đầu')), gio_kt: timeOf(need(r['Giờ kết thúc'], 'giờ kết thúc')),
        nghi_phut: numOf(r['Nghỉ (phút)'], 'Nghỉ', { def: 0 }), hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) },
        old: X.findCa(nm, r['Bộ phận'], ten, true), pkey: `${nm}|${k(bp?.ten || '')}|${k(ten)}` }; } },
  nhan_su: { sheet: 'Nhân sự', table: 'nhan_su', phase: 3, cols: ['Nhà máy', 'Bộ phận', 'Mã NV', 'Họ tên', 'Vai trò', 'Đã cấp tài khoản (chỉ xem)', 'Đang hoạt động'],
    build: (r, X) => {
      const ma = need(r['Mã NV'], 'mã NV');
      const nm = k(r['Nhà máy']) === k(ALL_NM) || !str(r['Nhà máy']) ? (can.adminTong() ? null : X.nm({ 'Nhà máy': '' })) : X.nm(r);
      const vt = Object.keys(VAI_TRO).find((x) => k(VAI_TRO[x]) === k(r['Vai trò']) || x === str(r['Vai trò']));
      if (!vt) throw new Error(`Vai trò "${r['Vai trò']}" không có (${Object.values(VAI_TRO).join(', ')})`);
      const bp = str(r['Bộ phận']) ? (nm ? X.byName('bo_phan', nm, r['Bộ phận'], 'bộ phận') : null) : null;
      const old = S.cat.nhan_su.find((n) => k(n.ma_nv) === k(ma));
      if (old && !can.adminTong() && old.nha_may_id !== S.nm) throw new Error(`Mã NV ${ma} đã thuộc nhà máy khác`);
      if (old?.id === S.profile.id && (vt !== 'admin' || !boolOf(r['Đang hoạt động']))) throw new Error('Không tự đổi vai trò / ngưng tài khoản admin đang đăng nhập');
      return { rec: { ma_nv: ma, ho_ten: need(r['Họ tên'], 'họ tên'), vai_tro: vt, nha_may_id: nm, bo_phan_id: bp?.id || null, hoat_dong: boolOf(r['Đang hoạt động']) }, old, pkey: k(ma) };
    } },
  day_chuyen: { sheet: 'Dây chuyền', table: 'day_chuyen', phase: 3, cols: ['Nhà máy', 'Dây chuyền', 'Số máy (chỉ xem)', 'Thuộc dây chuyền tổng', 'Công đoạn cuối', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const ten = need(r['Dây chuyền'], 'tên dây chuyền');
      const tong = str(r['Thuộc dây chuyền tổng']) ? X.byName('day_chuyen_tong', nm, r['Thuộc dây chuyền tổng'], 'dây chuyền tổng') : null;
      return { rec: { nha_may_id: nm, ten, tong_id: tong?.id || null, la_cd_cuoi: tong ? boolOf(r['Công đoạn cuối'], false) : false, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) },
        old: X.findLine(nm, ten, true), pkey: `${nm}|${k(ten)}` }; } },
  ma_loi: { sheet: 'Mã lỗi', table: 'ma_loi', phase: 4, cols: ['Nhà máy', 'Mã máy', 'Tên máy (chỉ xem)', 'Mã lỗi', 'Tên lỗi', 'Nhóm 6 tổn thất', 'Loại lỗi', 'Đang dùng', 'Thứ tự'],
    build: (r, X) => { const nm = X.nm(r); const m = X.findMay(nm, need(r['Mã máy'], 'mã máy')); const ma = need(r['Mã lỗi'], 'mã lỗi');
      const g = parseInt(str(r['Nhóm 6 tổn thất']), 10);
      if (!(g >= 1 && g <= 6)) throw new Error(`Nhóm 6 tổn thất "${r['Nhóm 6 tổn thất']}" phải bắt đầu bằng số 1–6`);
      const loai = LOAI_LOI.find((x) => k(x) === k(r['Loại lỗi']));
      if (!loai) throw new Error(`Loại lỗi "${r['Loại lỗi']}" không có (${LOAI_LOI.join(', ')})`);
      const ten = need(r['Tên lỗi'], 'tên lỗi');
      // Khớp theo mã lỗi; nếu máy có nhiều mã trùng nhau (bộ mã tạm chép từ máy khác) thì khớp thêm theo tên lỗi
      const cand = m.id === PENDING ? [] : S.cat.ma_loi.filter((l) => l.may_id === m.id && k(l.ma) === k(ma));
      const old = cand.length > 1 ? cand.find((l) => k(l.ten) === k(ten)) || null : cand[0] || null;
      return { rec: { may_id: m.id, ma, ten, nhom_ton_that: g, loai_loi: loai, hoat_dong: boolOf(r['Đang dùng']), thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }) },
        old, pkey: `${k(r['Mã máy'])}|${k(ma)}|${k(ten)}` }; } },
  day_chuyen_may: { sheet: 'Dây chuyền - Máy', table: 'day_chuyen_may', phase: 4, cols: ['Nhà máy', 'Dây chuyền', 'Thứ tự', 'Mã máy', 'Tên máy (chỉ xem)', 'Máy cuối chuyền'],
    build: (r, X) => { const nm = X.nm(r); const l = X.findLine(nm, need(r['Dây chuyền'], 'dây chuyền')); const m = X.findMay(nm, need(r['Mã máy'], 'mã máy'));
      return { rec: { day_chuyen_id: l.id, may_id: m.id, thu_tu: numOf(r['Thứ tự'], 'Thứ tự', { def: 0 }), la_may_cuoi: boolOf(r['Máy cuối chuyền'], false) },
        old: l.id === PENDING || m.id === PENDING ? null : S.cat.day_chuyen_may.find((x) => x.day_chuyen_id === l.id && x.may_id === m.id), pkey: `${k(r['Dây chuyền'])}|${k(r['Mã máy'])}` }; } },
  toc_do: { sheet: 'SP & tốc độ theo máy', table: 'toc_do', phase: 4, cols: ['Nhà máy', 'Mã máy', 'Tên máy (chỉ xem)', 'Mã sản phẩm', 'Sản phẩm (chỉ xem)', 'Tốc độ (sp/phút)'],
    speed: { col: 'may_id', assign: 'may_san_pham' },
    build: (r, X) => { const nm = X.nm(r); const m = X.findMay(nm, need(r['Mã máy'], 'mã máy')); const p = X.findSp(nm, need(r['Mã sản phẩm'], 'mã sản phẩm'));
      const v = numOf(r['Tốc độ (sp/phút)'], 'Tốc độ'); if (v != null && v <= 0) throw new Error('Tốc độ phải lớn hơn 0');
      return speedRec('may_id', 'may_san_pham', 'toc_do', m.id, p.id, v); } },
  toc_do_day_chuyen: { sheet: 'SP & tốc độ theo chuyền', table: 'toc_do_day_chuyen', phase: 4, cols: ['Nhà máy', 'Dây chuyền', 'Mã sản phẩm', 'Sản phẩm (chỉ xem)', 'Tốc độ (sp/phút)'],
    speed: { col: 'day_chuyen_id', assign: 'day_chuyen_san_pham' },
    build: (r, X) => { const nm = X.nm(r); const l = X.findLine(nm, need(r['Dây chuyền'], 'dây chuyền')); const p = X.findSp(nm, need(r['Mã sản phẩm'], 'mã sản phẩm'));
      const v = numOf(r['Tốc độ (sp/phút)'], 'Tốc độ'); if (v != null && v <= 0) throw new Error('Tốc độ phải lớn hơn 0');
      return speedRec('day_chuyen_id', 'day_chuyen_san_pham', 'toc_do_day_chuyen', l.id, p.id, v); } },
  phan_cong: { sheet: 'Phân công', table: 'phan_cong', phase: 4, cols: ['Nhà máy', 'Ca', 'Bộ phận của ca', 'Loại', 'Dây chuyền / Mã máy', 'Mã NV', 'Họ tên (chỉ xem)', 'Vai trò phân công'],
    build: (r, X) => { const nm = X.nm(r);
      const c = X.findCa(nm, r['Bộ phận của ca'], need(r['Ca'], 'ca'));
      const isLine = k(r['Loại']) === k('Dây chuyền');
      if (!isLine && k(r['Loại']) !== k(MAY_DON)) throw new Error('Cột Loại ghi "Dây chuyền" hoặc "Máy đơn"');
      const t = isLine ? X.findLine(nm, need(r['Dây chuyền / Mã máy'], 'dây chuyền')) : X.findMay(nm, need(r['Dây chuyền / Mã máy'], 'mã máy'));
      const n = X.findNs(need(r['Mã NV'], 'mã NV'));
      const vt = Object.keys(LOAI_PC).find((x) => k(LOAI_PC[x]) === k(r['Vai trò phân công']));
      if (!vt) throw new Error('Vai trò phân công ghi "Vận hành" hoặc "Tổ trưởng"');
      const rec = { nha_may_id: nm, ca_id: c.id, day_chuyen_id: isLine ? t.id : null, may_id: isLine ? null : t.id, nhan_su_id: n.id, vai_tro: vt };
      const old = [c.id, t.id, n.id].includes(PENDING) ? null : (S.cat.phan_cong || []).find((x) => x.ca_id === c.id && (x.day_chuyen_id || x.may_id) === t.id && x.nhan_su_id === n.id && x.vai_tro === vt);
      return { rec: old ? { ...rec, thu_tu: old.thu_tu } : rec, old, pkey: `${k(r['Ca'])}|${k(r['Dây chuyền / Mã máy'])}|${k(r['Mã NV'])}|${vt}` }; } },
};

function speedRec(col, assignT, speedT, tid, pid, v) {
  const pend = tid === PENDING || pid === PENDING;
  const a = pend ? null : S.cat[assignT].find((x) => x[col] === tid && x.san_pham_id === pid);
  const o = pend ? null : S.cat[speedT].find((x) => x[col] === tid && x.san_pham_id === pid);
  // "old" giả lập để so sánh: đã gán + tốc độ hiện có
  const old = a || o ? { id: o?.id || a?.id, [col]: tid, san_pham_id: pid, sp_phut: o?.sp_phut ?? null } : null;
  return { rec: { [col]: tid, san_pham_id: pid, sp_phut: v }, old, pkey: `${tid}|${pid}`, speed: true };
}

/** Bộ tra cứu: trong lúc xem trước, bản ghi sẽ được tạo ở đợt trước được coi là có (id = PENDING) */
function makeX(pending) {
  const has = (t, key) => pending[t]?.has(key);
  const nmScope = () => (can.adminTong() ? null : S.nm);
  const X = {
    nm: (r) => {
      const v = str(r['Nhà máy']);
      if (!v) { if (!can.adminTong()) return S.nm; throw new Error('Thiếu cột Nhà máy'); }
      const n = S.cat.nha_may.find((x) => k(x.ten) === k(v) || k(x.ma) === k(v));
      if (n) { if (nmScope() && n.id !== nmScope()) throw new Error(`Không được sửa danh mục của nhà máy "${v}"`); return n.id; }
      if (can.adminTong() && [...(pending.nha_may_ten || [])].includes(k(v))) return PENDING;
      throw new Error(`Không có nhà máy "${v}"`);
    },
    byName: (t, nm, name, label) => {
      const found = nm === PENDING ? null : (S.cat[t] || []).find((x) => x.nha_may_id === nm && k(x.ten) === k(name));
      if (found) return found;
      if (has(t, `${nm}|${k(name)}`) || nm === PENDING) return { id: PENDING };
      if (label) throw new Error(`Không có ${label} "${name}"`);
      return null;
    },
    findMay: (nm, ma, soft) => {
      const m = nm === PENDING ? null : S.cat.may.find((x) => x.nha_may_id === nm && k(x.ma) === k(ma));
      if (m || soft) return m || null;
      if (has('may', `${nm}|${k(ma)}`) || nm === PENDING) return { id: PENDING };
      throw new Error(`Không có máy "${ma}"`);
    },
    findSp: (nm, ma, soft) => {
      const p = nm === PENDING ? null : S.cat.san_pham.find((x) => x.nha_may_id === nm && k(x.ma) === k(ma));
      if (p || soft) return p || null;
      if (has('san_pham', `${nm}|${k(ma)}`) || nm === PENDING) return { id: PENDING };
      throw new Error(`Không có sản phẩm mã "${ma}"`);
    },
    findLine: (nm, ten, soft) => {
      const l = nm === PENDING ? null : S.cat.day_chuyen.find((x) => x.nha_may_id === nm && k(x.ten) === k(ten));
      if (l || soft) return l || null;
      if (has('day_chuyen', `${nm}|${k(ten)}`) || nm === PENDING) return { id: PENDING };
      throw new Error(`Không có dây chuyền "${ten}"`);
    },
    findCa: (nm, bpName, ten, soft) => {
      const bpAll = !str(bpName) || k(bpName) === k(ALL_BP);
      const list = nm === PENDING ? [] : S.cat.ca.filter((x) => x.nha_may_id === nm && k(x.ten) === k(ten));
      const c = list.find((x) => (bpAll ? !x.bo_phan_id : k(cat.name('bo_phan', x.bo_phan_id)) === k(bpName))) || (bpAll && list.length === 1 ? list[0] : null);
      if (c || soft) return c || null;
      if (has('ca', `${nm}|${bpAll ? '' : k(bpName)}|${k(ten)}`) || nm === PENDING) return { id: PENDING };
      throw new Error(`Không có ca "${ten}"${bpAll ? '' : ` của bộ phận ${bpName}`}`);
    },
    findNs: (ma) => {
      const n = S.cat.nhan_su.find((x) => k(x.ma_nv) === k(ma));
      if (n) return n;
      if (has('nhan_su', k(ma))) return { id: PENDING };
      throw new Error(`Không có nhân sự mã "${ma}"`);
    },
  };
  return X;
}

const same = (a, b) => {
  if ((a == null || a === '') && (b == null || b === '')) return true;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  if (typeof a === 'boolean' || typeof b === 'boolean') return !!a === !!b;
  if (/^\d{2}:\d{2}/.test(String(a)) && /^\d{2}:\d{2}/.test(String(b))) return String(a).slice(0, 5) === String(b).slice(0, 5);
  return String(a) === String(b);
};
const changedFields = (rec, old) => Object.keys(rec).filter((f) => !same(rec[f], old[f]));

/** Đọc file, kiểm tra từng dòng. dry = true: xem trước (chưa ghi). Trả về kế hoạch theo sheet. */
function plan(wb, phases, pending = {}) {
  const X = makeX(pending);
  const out = [];
  for (const spec of Object.values(SHEETS)) {
    if (!phases.includes(spec.phase)) continue;
    const ws = wb.Sheets[spec.sheet];
    const res = { spec, add: [], upd: [], same: 0, errors: [], present: !!ws };
    out.push(res);
    if (!ws) continue;
    if (spec.tongOnly && !can.adminTong()) { res.skipped = 'Chỉ admin tổng được sửa danh sách nhà máy — bỏ qua sheet này'; continue; }
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
    const seen = new Set();
    rows.forEach((r, i) => {
      const line = i + 2;
      if (Object.values(r).every((v) => str(v) === '')) return;
      try {
        const { rec, old, pkey, speed } = spec.build(r, X);
        const key = pkey ?? spec.key?.(r);
        if (key != null) { if (seen.has(key)) throw new Error('Trùng với một dòng phía trên trong cùng sheet'); seen.add(key); }
        if (!old) {
          res.add.push({ line, rec });
          if (key != null) { (pending[spec.table] ||= new Set()).add(key); }
          if (spec.table === 'nha_may') (pending.nha_may_ten ||= new Set()).add(k(rec.ten));
        } else {
          const diff = changedFields(rec, old);
          if (diff.length) res.upd.push({ line, rec: speed ? rec : { ...rec, [spec.pk || 'id']: old[spec.pk || 'id'] }, diff });
          else res.same++;
        }
      } catch (e) { res.errors.push(`Dòng ${line}: ${e.message}`); }
    });
    // Mỗi dây chuyền chỉ 1 máy cuối / mỗi dây chuyền tổng chỉ 1 công đoạn cuối
    if (spec.table === 'day_chuyen_may') checkOneFlag(rows, 'Dây chuyền', 'Máy cuối chuyền', 'máy cuối chuyền', res);
    if (spec.table === 'day_chuyen') checkOneFlag(rows, 'Thuộc dây chuyền tổng', 'Công đoạn cuối', 'công đoạn cuối', res);
  }
  return out;
}

function checkOneFlag(rows, groupCol, flagCol, label, res) {
  const cnt = {};
  for (const r of rows) { try { if (str(r[groupCol]) && boolOf(r[flagCol], false)) cnt[k(r[groupCol])] = (cnt[k(r[groupCol])] || 0) + 1; } catch { /* lỗi đã báo ở trên */ } }
  for (const [g, n] of Object.entries(cnt)) if (n > 1) res.errors.push(`"${g}": có ${n} dòng đánh dấu ${label} — chỉ được 1`);
}

const chunk = (arr, n = 500) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

async function writePlan(list) {
  let n = 0;
  for (const res of list) {
    const { spec } = res;
    if (res.skipped) continue;
    if (spec.speed) {
      const { col, assign } = spec.speed;
      const recs = [...res.add, ...res.upd].map((x) => x.rec);
      for (const c of chunk(recs.map((r) => ({ [col]: r[col], san_pham_id: r.san_pham_id })))) {
        const { error } = await sb.from(assign).upsert(c, { onConflict: `${col},san_pham_id`, ignoreDuplicates: true }); if (error) throw error;
      }
      const sp = recs.filter((r) => r.sp_phut > 0);
      for (const c of chunk(sp)) { const { error } = await sb.from(spec.table).upsert(c, { onConflict: `${col},san_pham_id` }); if (error) throw error; }
      n += recs.length;
      continue;
    }
    for (const c of chunk(res.add.map((x) => x.rec))) { const { error } = await sb.from(spec.table).insert(c); if (error) throw error; }
    for (const c of chunk(res.upd.map((x) => x.rec))) { const { error } = await sb.from(spec.table).upsert(c, spec.pk ? { onConflict: spec.pk } : undefined); if (error) throw error; }
    n += res.add.length + res.upd.length;
    if (spec.table === 'nha_may' && res.add.length) {
      await loadCatalog(true);
      const ids = S.cat.nha_may.filter((x) => res.add.some((a) => a.rec.ma === x.ma)).map((x) => ({ nha_may_id: x.id }));
      if (ids.length) await sb.from('cai_dat').upsert(ids, { onConflict: 'nha_may_id', ignoreDuplicates: true });
    }
  }
  return n;
}

/** Mở hộp chọn file → xem trước → xác nhận PIN → nhập. done(): làm mới màn hình sau khi nhập. */
export function importCatalog(done) {
  if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
  const body = el(`<div class="nn-stack" style="padding:0">
    <p>Dùng file <b>Xuất Excel toàn bộ danh mục</b> làm mẫu: sửa/thêm dòng rồi tải lên. Dòng trùng mã/tên sẽ được <b>cập nhật</b>, dòng mới được <b>thêm</b>. App <b>không xóa</b> dữ liệu nào.</p>
    <label class="nn-btn nn-btn-secondary nn-btn-lg" style="align-self:flex-start">${icon('upload', 18)}Chọn file Excel<input type="file" accept=".xlsx,.xls" hidden data-file></label>
    <div data-pv></div></div>`);
  const run = el(`<button class="nn-btn nn-btn-primary nn-btn-lg" disabled>${icon('upload', 18)}Nhập vào danh mục</button>`);
  const s = openSheet({ title: 'Nhập danh mục từ Excel', body, foot: [run], wide: true });
  let wb = null, preview = null;

  $('[data-file]', body).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const known = Object.values(SHEETS).map((x) => x.sheet);
      if (!wb.SheetNames.some((n) => known.includes(n))) throw new Error('File không có sheet danh mục nào (dùng file "Xuất Excel toàn bộ danh mục" làm mẫu)');
      preview = plan(wb, [1, 2, 3, 4]);
      drawPreview(f.name);
    } catch (err) { wb = null; preview = null; run.disabled = true; $('[data-pv]', body).innerHTML = ''; toast(`Không đọc được file: ${err.message}`, 'danger'); }
    e.target.value = '';
  };

  function drawPreview(name) {
    const rows = preview.filter((r) => r.present);
    const tot = rows.reduce((a, r) => ({ add: a.add + r.add.length, upd: a.upd + r.upd.length, err: a.err + r.errors.length }), { add: 0, upd: 0, err: 0 });
    $('[data-pv]', body).innerHTML = `<div class="t-h3">${esc(name)}</div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Sheet</th><th class="num">Thêm mới</th><th class="num">Cập nhật</th><th class="num">Giữ nguyên</th><th class="num">Lỗi</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.spec.sheet)}${r.skipped ? `<div class="t-cap">${esc(r.skipped)}</div>` : ''}</td><td class="num">${r.add.length}</td><td class="num">${r.upd.length}</td><td class="num">${r.same}</td>
        <td class="num">${r.errors.length ? `<b class="nn-tone-danger">${r.errors.length}</b>` : 0}</td></tr>`).join('')}
      </tbody></table></div>
      ${tot.err ? `<div class="nn-alert nn-alert-danger"><span class="nn-alert-icon nn-tone-danger">${icon('fail', 20)}</span><div class="nn-alert-body"><div class="nn-alert-title">Có ${tot.err} dòng lỗi — sửa file rồi chọn lại. Chưa nhập gì.</div>
        <div class="nn-alert-text">${rows.flatMap((r) => r.errors.map((x) => `<div><b>${esc(r.spec.sheet)}</b> · ${esc(x)}</div>`)).slice(0, 40).join('')}${tot.err > 40 ? `<div>… và ${tot.err - 40} lỗi khác</div>` : ''}</div></div></div>`
        : `<div class="nn-alert nn-alert-info"><span class="nn-alert-icon nn-tone-info">${icon('info', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Sẽ thêm <b>${tot.add}</b> dòng, cập nhật <b>${tot.upd}</b> dòng. Bấm "Nhập vào danh mục" rồi nhập PIN để xác nhận.</div></div></div>`}`;
    run.disabled = !!tot.err || !(tot.add + tot.upd);
  }

  run.onclick = async () => {
    if (!wb) return;
    if (!(await confirmPin('Ghi các thay đổi trong file Excel vào danh mục? Thao tác này áp dụng ngay cho mọi người dùng.', { ok: 'Nhập vào danh mục' }))) return;
    run.disabled = true;
    let n = 0;
    try {
      // Ghi theo đợt; sau mỗi đợt tải lại danh mục để đợt sau tra được id vừa tạo
      for (const ph of [1, 2, 3, 4]) {
        await loadCatalog(true);
        const list = plan(wb, [ph]).filter((r) => r.present);
        const errs = list.flatMap((r) => r.errors.map((x) => `${r.spec.sheet} · ${x}`));
        if (errs.length) throw new Error(errs.slice(0, 3).join(' | '));
        n += await writePlan(list);
      }
      await loadCatalog(true);
      s.close(); toast(`Đã nhập ${n} dòng danh mục`, 'success'); done?.();
    } catch (e) {
      await loadCatalog(true).catch(() => {});
      run.disabled = false;
      toast(`${errText(e)}${n ? ` (đã ghi ${n} dòng trước khi lỗi)` : ''}`, 'danger', 'Nhập chưa xong');
      done?.();
    }
  };
}
