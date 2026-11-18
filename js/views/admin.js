// Danh mục (Admin): máy, mã lỗi, dây chuyền, sản phẩm, tốc độ định mức, ca, lý do dừng KH, nhân sự, bộ phận, khu vực, nhà máy, cài đặt
// Mọi danh mục (trừ Nhà máy) quản lý riêng theo từng nhà máy: chọn nhà máy ở đầu trang.
import { S, sb, cat, can, loadCatalog, rpc, errText } from '../api.js';
import { lsSet } from '../store.js';
import { clearCalc } from '../data.js';
import { GIAI_DOAN, esc, icon, hm, NHOM_TT, LOAI_LOI, MUC_DO, LOI_KHAC, mucDoBadge, VAI_TRO, toNum, sortCat, noAccent, numInput } from '../lib.js';
import { el, $, $$, toast, openSheet, confirmBox, inputField, selectField, comboField, segmented, timeField } from '../ui.js';
import { drawHeader } from '../app.js';
import { exportCatalog, importCatalog, confirmPin } from './catalog_xlsx.js';

const yes = (v) => (v ? `<span class="nn-status nn-tone-success">${icon('pass', 14)}Đang dùng</span>` : `<span class="nn-status nn-tone-info">${icon('info', 14)}Ngưng</span>`);

const TABS = () => [
  { k: 'may', t: 'Máy' }, { k: 'ma_loi', t: 'Mã lỗi' }, { k: 'day_chuyen', t: 'Dây chuyền' }, { k: 'san_pham', t: 'Sản phẩm' },
  { k: 'loi_sp', t: 'Lỗi sản phẩm' }, { k: 'toc_do', t: 'Tốc độ định mức' }, { k: 'ca', t: 'Ca làm việc' }, { k: 'kip', t: 'Kíp' },
  { k: 'dinh_bien', t: 'Định biên' }, { k: 'quy_cach', t: 'Quy cách đóng gói' }, { k: 'ds_nhap_nhanh', t: 'Danh sách nhập nhanh' },
  { k: 'nhan_su_ca', t: 'Nhân sự theo ca' }, { k: 'nhan_su', t: 'Nhân sự (tài khoản)' }, { k: 'phan_cong', t: 'Phân công' }, { k: 'bo_phan', t: 'Bộ phận' }, { k: 'khu_vuc', t: 'Khu vực' },
  can.adminTong() && { k: 'nha_may', t: 'Nhà máy' }, { k: 'cai_dat', t: 'Cài đặt' },
].filter(Boolean);

// v1.7: Danh mục gộp mọi nhà máy, có bộ lọc Nhà máy ('' = tất cả — chỉ admin tổng)
let NMF = '';
const opt = (list, f = (x) => x.ten) => list.map((x) => ({ value: x.id, label: !NMF && x.nha_may_id && S.cat.nha_may.length > 1 ? `${f(x)} · ${nmName(x.nha_may_id)}` : f(x) }));
const ofNm = (t) => (S.cat[t] || []).filter((r) => !NMF || r.nha_may_id === NMF);
const dcOf = (nm) => S.cat.day_chuyen.filter((l) => l.hoat_dong && (nm ? l.nha_may_id === nm : !NMF || l.nha_may_id === NMF));
const donOf = (all, nm) => S.cat.may.filter((m) => (all || m.hoat_dong) && (nm ? m.nha_may_id === nm : !NMF || m.nha_may_id === NMF) && !cat.lineOfMay(m.id));
const LOAI_DS = { ly_do_tang_ca: 'Lý do tăng ca', loi_ky_luat: 'Lỗi kỷ luật lao động', loi_qa_lon: 'Lỗi QA đầu vào — yến lon', loi_qa_chai: 'Lỗi QA đầu vào — yến chai', loai_nguyen_lieu: 'Loại nguyên liệu / bao bì' };
const BAO_BI = { lon: 'Yến lon', chai: 'Yến chai' };

// ---------- v1.4: lọc theo Khu vực / Bộ phận / Dây chuyền (suy ra qua máy) ----------
// sc = { kv, bp, dc }: dây chuyền thuộc khu vực / bộ phận nếu có ít nhất 1 máy thuộc khu vực / bộ phận đó.
const mayHop = (m, sc) => !!m && (!sc.kv || m.khu_vuc_id === sc.kv) && (!sc.bp || m.bo_phan_id === sc.bp)
  && (!sc.dc || cat.linesOfMay(m.id).some((l) => l.id === sc.dc));
const lineHop = (l, sc) => (!sc.dc || l.id === sc.dc)
  && ((!sc.kv && !sc.bp) || cat.members(l.id).some((x) => mayHop(S.cat.byId.may[x.may_id], { kv: sc.kv, bp: sc.bp })));
/** Sản phẩm chạy trên dây chuyền / máy nằm trong phạm vi lọc */
const spHop = (spId, sc) => S.cat.day_chuyen_san_pham.some((x) => x.san_pham_id === spId && lineHop(S.cat.byId.day_chuyen[x.day_chuyen_id] || { id: x.day_chuyen_id }, sc))
  || S.cat.may_san_pham.some((x) => x.san_pham_id === spId && mayHop(S.cat.byId.may[x.may_id], sc));
/** Các ô lọc Khu vực / Bộ phận / (Dây chuyền). Đổi lựa chọn -> gọi onChange(). */
function scopeFields(sc, onChange, { dc = true } = {}) {
  const out = [];
  const add = (key, label, list) => { if (list.length > 1) out.push(selectField({ label, size: 'md', value: sc[key] || '', placeholder: `Tất cả ${label.toLowerCase()}`, options: opt(list), onChange: (v) => { sc[key] = v; onChange(); } })); };
  add('kv', 'Khu vực', ofNm('khu_vuc')); add('bp', 'Bộ phận', ofNm('bo_phan'));
  if (dc) add('dc', 'Dây chuyền', ofNm('day_chuyen'));
  return out;
}
const scopeDefs = () => [
  { key: 'kv', label: 'Khu vực', values: () => opt(ofNm('khu_vuc')), match: (r, v) => spHop(r.id, { kv: v }) },
  { key: 'bp', label: 'Bộ phận', values: () => opt(ofNm('bo_phan')), match: (r, v) => spHop(r.id, { bp: v }) },
];
const nmName = (id) => S.cat.byId.nha_may[id]?.ten || '';

const CFG = {
  may: () => ({
    title: 'Máy', rows: ofNm('may'),
    cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên máy'], [(r) => cat.name('khu_vuc', r.khu_vuc_id), 'Khu vực'], [(r) => cat.name('bo_phan', r.bo_phan_id), 'Bộ phận'],
      [(r) => cat.lineNames(r.id) || 'Máy đơn', 'Dây chuyền'], [(r) => `${r.oee_muc_tieu}% · ${r.nguong_vang}/${r.nguong_xanh}`, 'Mục tiêu · ngưỡng'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã máy', 'text', true], ['ten', 'Tên máy', 'text', true], ['khu_vuc_id', 'Khu vực', 'select', false, () => opt(ofNm('khu_vuc'))],
      ['bo_phan_id', 'Bộ phận', 'select', true, () => opt(ofNm('bo_phan'))], ['oee_muc_tieu', 'OEE mục tiêu (%)', 'number'],
      ['nguong_xanh', 'Ngưỡng xanh từ (%)', 'number'], ['nguong_vang', 'Ngưỡng vàng từ (%)', 'number'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, oee_muc_tieu: 85, nguong_xanh: 85, nguong_vang: 60, hoat_dong: true, thu_tu: ofNm('may').length + 1 }),
    filters: [
      { key: 'kv', label: 'Khu vực', get: (r) => cat.name('khu_vuc', r.khu_vuc_id) || 'Chưa gán khu vực' },
      { key: 'bp', label: 'Bộ phận', get: (r) => cat.name('bo_phan', r.bo_phan_id) || 'Chưa gán bộ phận' },
      { key: 'dc', label: 'Dây chuyền', get: (r) => cat.lineNames(r.id) || 'Máy đơn' },
    ],
  }),
  san_pham: () => ({
    title: 'Sản phẩm', rows: ofNm('san_pham'),
    cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên sản phẩm'], ['dvt', 'ĐVT'], [(r) => BAO_BI[r.loai_bao_bi] || '—', 'Loại bao bì'],
      [(r) => cat.chayTren(r.id).join(', ') || '<span class="t-cap">Chưa khai — hiện ở mọi máy</span>', 'Chạy trên', 'html'],
      [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã sản phẩm', 'text', true], ['ten', 'Tên sản phẩm', 'text', true], ['dvt', 'Đơn vị tính (ĐVT)', 'text'],
      ['loai_bao_bi', 'Loại bao bì', 'select', false, () => Object.entries(BAO_BI).map(([k, v]) => ({ value: k, label: v })), 'Báo cáo giao ca Đóng gói: lỗi QA đầu vào hiện cột và danh sách lỗi theo loại này'],
      ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, loai_bao_bi: 'chai', hoat_dong: true, thu_tu: ofNm('san_pham').length + 1 }),
    headerExtra: () => (S.cat.nha_may.length > 1 ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-copyprod>${icon('copy', 18)}Sao chép từ nhà máy khác</button>` : ''),
    rowExtra: (r) => `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-spmay="${r.id}">${icon('sanxuat', 14)}Máy chạy</button>`,
    filters: [
      ...scopeDefs(),
      { key: 'may', label: 'Dây chuyền / máy',
        values: () => [...dcOf().map((l) => ({ value: `dc:${l.id}`, label: l.ten })),
          ...donOf().map((m) => ({ value: `m:${m.id}`, label: `${m.ma} · ${m.ten}` })),
          { value: 'chua', label: '— Chưa khai máy chạy —' }],
        match: (r, v) => (v === 'chua' ? !cat.chayTren(r.id).length
          : cat.sanPhamGan(v.startsWith('dc:') ? { day_chuyen_id: v.slice(3) } : { may_id: v.slice(2) }).includes(r.id)) },
      { key: 'dvt', label: 'ĐVT', get: (r) => r.dvt || 'Chưa có ĐVT' },
      { key: 'bb', label: 'Loại bao bì', get: (r) => BAO_BI[r.loai_bao_bi] || 'Chưa chọn' },
    ],
  }),
  // v1.10: nhân sự từng ca (công nhân, không cần tài khoản) — báo cáo giao ca chọn người vắng / tăng ca / vi phạm theo nhà máy + bộ phận + ca
  nhan_su_ca: () => ({
    title: 'Nhân sự theo ca', rows: ofNm('nhan_su_ca'),
    filters: [{ key: 'bp', label: 'Bộ phận', get: (r) => cat.name('bo_phan', r.bo_phan_id) || 'Chưa gán' }, { key: 'ca', label: 'Ca', get: (r) => cat.name('ca', r.ca_id) || 'Mọi ca' }],
    cols: [['ma_nv', 'Mã NV', 'mono'], ['ho_ten', 'Họ tên'], [(r) => cat.name('bo_phan', r.bo_phan_id), 'Bộ phận'], [(r) => cat.name('ca', r.ca_id) || 'Mọi ca', 'Ca'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma_nv', 'Mã nhân viên', 'text'], ['ho_ten', 'Họ tên', 'text', true], ['bo_phan_id', 'Bộ phận', 'select', true, () => opt(ofNm('bo_phan'))],
      ['ca_id', 'Ca (để trống = mọi ca)', 'select', false, () => opt(ofNm('ca'))], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang làm', 'bool']],
    def: () => ({ nha_may_id: NMF || S.nm, hoat_dong: true, thu_tu: 0 }),
    headerExtra: () => `<button class="nn-btn nn-btn-secondary nn-btn-md" data-pastens>${icon('upload', 18)}Dán danh sách từ Excel</button>`,
  }),
  ca: () => ({
    title: 'Ca làm việc', rows: ofNm('ca'),
    filters: [{ key: 'bp', label: 'Bộ phận', get: (r) => cat.name('bo_phan', r.bo_phan_id) || 'Tất cả bộ phận' }],
    cols: [['ten', 'Ca'], [(r) => cat.name('bo_phan', r.bo_phan_id) || 'Tất cả', 'Bộ phận'], [(r) => `${hm(r.gio_bd)}–${hm(r.gio_kt)}`, 'Giờ'], ['nghi_phut', 'Nghỉ (phút)'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Tên ca', 'text', true], ['bo_phan_id', 'Bộ phận (để trống = tất cả)', 'select', false, () => opt(ofNm('bo_phan'))],
      ['gio_bd', 'Giờ bắt đầu', 'time', true], ['gio_kt', 'Giờ kết thúc', 'time', true], ['nghi_phut', 'Nghỉ giữa ca (phút)', 'number'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, nghi_phut: 30, hoat_dong: true, thu_tu: ofNm('ca').length + 1 }),
  }),
  kip: () => ({
    title: 'Kíp', rows: ofNm('kip'),
    cols: [['ten', 'Kíp'], [(r) => nmName(r.nha_may_id), 'Thuộc nhà máy'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']], nmCol: true,
    fields: [['ten', 'Tên kíp', 'text', true, null, 'Ví dụ: Kíp 3 — nhóm người làm luân phiên, chọn trên phiếu và báo cáo giao ca'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('kip').length + 1 }),
  }),
  dinh_bien: () => ({
    title: 'Định biên', rows: ofNm('dinh_bien'),
    cols: [[(r) => cat.name('bo_phan', r.bo_phan_id), 'Bộ phận'], [(r) => cat.name('ca', r.ca_id), 'Ca'], [(r) => cat.name('kip', r.kip_id) || 'Mọi kíp', 'Kíp'],
      ['so_nguoi', 'Số người'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['bo_phan_id', 'Bộ phận', 'select', true, () => opt(ofNm('bo_phan'))], ['ca_id', 'Ca', 'select', true, () => opt(ofNm('ca'))],
      ['kip_id', 'Kíp (để trống = mọi kíp)', 'select', false, () => opt(ofNm('kip'))], ['so_nguoi', 'Số người định biên', 'number', true, null, 'Báo cáo giao ca tự điền ô Định biên theo bộ phận + ca + kíp'],
      ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: NMF || S.nm, hoat_dong: true, thu_tu: 0 }),
  }),
  quy_cach: () => ({
    title: 'Quy cách đóng gói thành phẩm (dùng chung)', rows: S.cat.quy_cach_tp || [], table: 'quy_cach_tp', nmCol: true,
    filters: [{ key: 'btp', label: 'Sản phẩm (BTP)', get: (r) => r.ten_btp || r.ma_btp || 'Chưa có' }, { key: 'dvt', label: 'ĐVT TP', get: (r) => r.dvt_tp || '—' }],
    cols: [['ma_tp', 'Mã TP', 'mono'], ['ten_tp', 'Tên thành phẩm'], ['dvt_tp', 'ĐVT'], [(r) => `${r.ma_btp || ''} · ${r.ten_btp || ''}`, 'BTP (SKU)'],
      [(r) => r.quy_cach_dong || (r.sl_btp_tp ? `${+r.sl_btp_tp} ${r.dvt_btp || ''} / 1 ${r.dvt_tp || ''}` : ''), 'Quy cách đóng'],
      [(r) => r.quy_cach_thung || (r.sl_tp_thung ? `${+r.sl_tp_thung} ${r.dvt_tp || ''} / 1 thùng` : '—'), 'Quy cách thùng'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma_tp', 'Mã thành phẩm (TP)', 'text', true], ['ten_tp', 'Tên thành phẩm', 'text', true], ['dvt_tp', 'ĐVT thành phẩm', 'text', false, null, 'VD: Hộp, Lốc'],
      ['ma_btp', 'Mã BTP (SKU) = mã sản phẩm', 'text'], ['ten_btp', 'Tên BTP', 'text'], ['dvt_btp', 'ĐVT BTP', 'text', false, null, 'VD: Hũ, Chai, Lon'],
      ['sl_btp_tp', 'Số BTP trong 1 thành phẩm', 'number', true], ['quy_cach_dong', 'Quy cách đóng', 'text', false, null, 'VD: 6 Hũ / 1 Lốc'],
      ['ma_thung', 'Mã thùng', 'text'], ['ten_thung', 'Tên thùng', 'text'], ['sl_tp_thung', 'Số thành phẩm trong 1 thùng', 'number'],
      ['quy_cach_thung', 'Quy cách đóng thùng', 'text', false, null, 'VD: 8 Lốc / 1 thùng'], ['ghi_chu', 'Ghi chú', 'text'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ sl_btp_tp: 1, hoat_dong: true, thu_tu: (S.cat.quy_cach_tp || []).length + 1 }),
  }),
  ds_nhap_nhanh: () => ({
    title: 'Danh sách nhập nhanh (dùng chung mọi nhà máy)', rows: S.cat.ds_nhap_nhanh || [], nmCol: true,
    filters: [{ key: 'loai', label: 'Loại danh sách', get: (r) => LOAI_DS[r.loai] }],
    cols: [[(r) => LOAI_DS[r.loai], 'Loại'], ['ten', 'Nội dung'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['loai', 'Loại danh sách', 'select', true, () => Object.entries(LOAI_DS).map(([k, v]) => ({ value: k, label: v }))], ['ten', 'Nội dung', 'text', true],
      ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ loai: 'ly_do_tang_ca', hoat_dong: true, thu_tu: 0 }),
  }),
  ly_do_ke_hoach: () => ({
    title: 'Lý do dừng có kế hoạch', rows: ofNm('ly_do_ke_hoach'),
    cols: [['ten', 'Lý do'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Lý do', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('ly_do_ke_hoach').length + 1 }),
  }),
  bo_phan: () => ({
    title: 'Bộ phận', rows: ofNm('bo_phan'), cols: [['ten', 'Bộ phận'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Tên bộ phận', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('bo_phan').length + 1 }),
  }),
  khu_vuc: () => ({
    title: 'Khu vực', rows: ofNm('khu_vuc'), cols: [['ten', 'Khu vực'], [(r) => `${S.cat.may.filter((m) => m.khu_vuc_id === r.id).length} máy`, 'Số máy'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Tên khu vực', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('khu_vuc').length + 1 }),
  }),
  nha_may: () => ({
    title: 'Nhà máy', rows: S.cat.nha_may, cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên nhà máy'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã nhà máy', 'text', true], ['ten', 'Tên nhà máy', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ hoat_dong: true, thu_tu: S.cat.nha_may.length + 1 }),
    after: async (row) => { await sb.from('cai_dat').upsert({ nha_may_id: row.id }, { onConflict: 'nha_may_id', ignoreDuplicates: true }); },
  }),
  nhan_su: () => ({
    title: 'Nhân sự', rows: [],
    fields: [['ma_nv', 'Mã nhân viên', 'text', true, null, 'Đổi mã sau khi đã cấp PIN thì bấm "Đổi PIN" để cập nhật lại tài khoản đăng nhập'], ['ho_ten', 'Họ tên', 'text', true],
      ['vai_tro', 'Vai trò', 'select', true, () => Object.entries(VAI_TRO).map(([k, v]) => ({ value: k, label: v }))],
      ['nha_may_id', can.adminTong() ? 'Nhà máy (để trống = admin tổng)' : 'Nhà máy', 'select', false, () => opt(can.adminTong() ? S.cat.nha_may : S.cat.nha_may.filter((n) => n.id === S.nm))],
      ['bo_phan_id', 'Bộ phận', 'select', false, () => opt(can.adminTong() ? S.cat.bo_phan : ofNm('bo_phan'), (b) => `${b.ten}${can.adminTong() ? ` · ${nmName(b.nha_may_id)}` : ''}`)],
      ['hoat_dong', 'Đang hoạt động', 'bool']],
    def: () => ({ nha_may_id: S.nm, vai_tro: 'van_hanh', hoat_dong: true }),
  }),
};

export async function render(main, { q }) {
  if (!can.admin()) { main.innerHTML = '<div class="empty">Chỉ Admin được vào Danh mục</div>'; return; }
  let tab = TABS().some((t) => t.k === q.tab) ? q.tab : 'may';
  NMF = can.adminTong() ? (render.nmf ?? '') : S.nm;
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Danh mục</div><div class="muted">Thêm, sửa các danh sách xổ xuống dùng trong app — quản lý riêng theo từng nhà máy</div></div>
    <div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-md" data-export>${icon('download', 18)}Xuất Excel toàn bộ danh mục</button>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-import>${icon('upload', 18)}Nhập từ Excel</button>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-reload>${icon('sync', 18)}Tải lại</button></div></div>
    <div class="filters" data-nm></div>
    <div class="nn-row" style="padding:0 0 16px;gap:8px" data-tabs></div><div data-body></div>`;
  const nmBox = $('[data-nm]', main);
  if (can.adminTong()) {
    nmBox.append(selectField({ label: 'Lọc theo nhà máy', size: 'md', placeholder: 'Tất cả nhà máy', value: NMF, options: S.cat.nha_may.map((n) => ({ value: n.id, label: n.ten })),
      onChange: (v) => { NMF = v || ''; render.nmf = NMF; if (v) { S.nm = v; lsSet('nm', v); clearCalc(); drawHeader(); } show(); } }));
  } else {
    nmBox.innerHTML = `<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:32px">${esc(nmName(S.nm))}</span></div>`;
  }
  const drawTabs = () => {
    $('[data-tabs]', main).innerHTML = TABS().map((t) => `<button class="nn-btn ${t.k === tab ? 'nn-btn-primary' : 'nn-btn-secondary'} nn-btn-sm" data-tab="${t.k}">${esc(t.t)}</button>`).join('');
  };
  const show = () => {
    drawTabs(); history.replaceState(null, '', `#/danh-muc?tab=${tab}`);
    const body = $('[data-body]', main); body.innerHTML = '';
    body.onclick = null; body.oninput = null; body.onchange = null; // bỏ handler của tab trước
    if (tab === 'nhan_su') nhanSu(body, show);
    else if (CFG[tab]) crud(body, () => ({ table: tab, ...CFG[tab]() }), show);
    else if (tab === 'ma_loi') maLoi(body, show);
    else if (tab === 'toc_do') tocDo(body);
    else if (tab === 'day_chuyen') dayChuyen(body, show);
    else if (tab === 'cai_dat') caiDat(body);
    else if (tab === 'phan_cong') phanCong(body);
    else if (tab === 'loi_sp') loiSp(body, show);
  };
  $('[data-tabs]', main).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; show(); } };
  $('[data-reload]', main).onclick = async () => {
    if (!(await confirmPin('Tải lại toàn bộ danh mục mới nhất từ máy chủ?', { ok: 'Tải lại' }))) return;
    try { await reload(); toast('Đã tải lại danh mục', 'info'); show(); } catch (e) { toast(errText(e), 'danger'); }
  };
  $('[data-export]', main).onclick = exportCatalog;
  $('[data-import]', main).onclick = () => importCatalog(async () => { clearCalc(); drawHeader(); show(); });
  show();
}

const reload = async () => { await loadCatalog(true); clearCalc(); drawHeader(); };

// ---------- Bộ lọc dùng chung cho các bảng danh mục ----------
// Mỗi bộ lọc: { key, label, get(row) } -> tự gom giá trị để chọn,
// hoặc { key, label, values(), match(row, v) } khi cần lọc theo quan hệ (ví dụ sản phẩm chạy trên máy nào).
function filterBar(box, defs, rows, st, onChange) {
  const f = $('[data-f]', box);
  f.innerHTML = '';
  defs.forEach((d) => {
    const opts = d.values ? d.values()
      : [...new Set(rows.map((r) => String(d.get(r) ?? '')).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).map((v) => ({ value: v, label: v }));
    if (opts.length < 2) return;                       // chỉ một giá trị thì lọc không có ý nghĩa
    f.append(selectField({ label: d.label, size: 'md', value: st.f[d.key] || '', placeholder: `Tất cả ${d.label.toLowerCase()}`,
      options: opts, onChange: (v) => { st.f[d.key] = v; onChange(); } }));
  });
  const clear = el(`<button class="nn-btn nn-btn-ghost nn-btn-md" data-clearf style="align-self:flex-end">${icon('x', 16)}Bỏ lọc</button>`);
  clear.hidden = !Object.values(st.f).some(Boolean) && !st.kw;
  clear.onclick = () => { st.f = {}; st.kw = ''; const i = $('[data-kw]', box); if (i) i.value = ''; filterBar(box, defs, rows, st, onChange); onChange(); };
  f.append(clear);
}
const passFilter = (r, defs, st) => defs.every((d) => {
  const v = st.f[d.key];
  return !v || (d.match ? d.match(r, v) : String(d.get(r) ?? '') === v);
});

// ---------- Bảng thêm/sửa chung ----------
function crud(box, cfgFn, refresh) {
  const cfg = cfgFn();
  const defs = [...(cfg.filters || []), { key: '_hd', label: 'Trạng thái', get: (r) => (r.hoat_dong === false ? 'Ngưng' : 'Đang dùng') }];
  // giữ lại lựa chọn lọc khi bảng được vẽ lại (sau khi thêm/sửa/xóa)
  const st = (crud.st = crud.st && crud.st.t === cfg.table && crud.st.nm === S.nm ? crud.st : { t: cfg.table, nm: S.nm, kw: '', f: {} });

  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2">${esc(cfg.title)} <span data-count></span></div>
    <div class="nn-row" style="padding:0"><div class="nn-input-wrap nn-input-md">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm…" data-kw value="${esc(st.kw)}"></div>
    ${cfg.headerExtra ? cfg.headerExtra() : ''}<button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm</button></div></div>
    <div class="filters" data-f style="margin-bottom:4px"></div><div data-tb></div></section>`;
  if (!NMF && !cfg.nmCol && cfg.table !== 'nha_may' && cfg.rows.some((r) => r.nha_may_id)) cfg.cols = [[(r) => nmName(r.nha_may_id), 'Nhà máy'], ...cfg.cols];
  const draw = () => {
    const rows = cfg.rows.filter((r) => passFilter(r, defs, st)
      && (!st.kw || noAccent(JSON.stringify(r) + ' ' + defs.map((d) => (d.get ? d.get(r) : '')).join(' ')).includes(st.kw)));
    $('[data-count]', box).textContent = rows.length === cfg.rows.length ? `(${cfg.rows.length})` : `(${rows.length} / ${cfg.rows.length})`;
    $('[data-clearf]', box) && ($('[data-clearf]', box).hidden = !Object.values(st.f).some(Boolean) && !st.kw);
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr>${cfg.cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${cfg.cols.map(([k, , t]) => { const v = typeof k === 'function' ? k(r) : r[k]; return `<td class="${t === 'mono' ? 'nn-mono' : ''}">${t === 'html' ? v : esc(v ?? '')}</td>`; }).join('')}
        <td style="white-space:nowrap">${(cfg.rowExtra ? cfg.rowExtra(r) : '')}<button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id ?? r.nha_may_id}">${icon('edit', 14)}Sửa</button>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-delrow="${r.id ?? r.nha_may_id}" aria-label="Xóa">${icon('trash', 14)}</button></td></tr>`).join('')
        || `<tr><td colspan="${cfg.cols.length + 1}" class="muted">${Object.values(st.f).some(Boolean) || st.kw ? 'Không có dòng nào khớp bộ lọc' : 'Chưa có dữ liệu'}</td></tr>`}</tbody></table></div>`;
  };
  filterBar(box, defs, cfg.rows, st, draw);
  draw();
  $('[data-kw]', box).oninput = (e) => { st.kw = noAccent(e.target.value); draw(); };
  box.onclick = async (e) => {
    if (e.target.closest('[data-clearf]')) return;                       // đã có onclick riêng
    if (e.target.closest('[data-add]')) return editRow(cfg, cfg.def(), refresh);
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg, cfg.rows.find((r) => r.id === ed.dataset.edit), refresh);
    const dl = e.target.closest('[data-delrow]'); if (dl) return delRow(cfg, cfg.rows.find((r) => (r.id ?? r.nha_may_id) === dl.dataset.delrow), refresh);
    if (e.target.closest('[data-copyprod]')) return copyProducts(refresh);
    if (e.target.closest('[data-pastens]')) return dsNhanSuCa(refresh);
    if (e.target.closest('[data-spmay]')) return sanPhamMay(e.target.closest('[data-spmay]').dataset.spmay, refresh);
  };
}

// v1.10: dán nhanh danh sách nhân sự 1 ca từ Excel (mỗi dòng: Mã NV <Tab> Họ tên — hoặc chỉ Họ tên). Trùng mã / tên cùng bộ phận + ca thì bỏ qua.
function dsNhanSuCa(refresh) {
  const v = { nm: NMF || S.nm, bp: '', ca: '', txt: '' };
  const body = el('<div class="form-grid"></div>');
  const bpOpt = () => opt(S.cat.bo_phan.filter((b) => b.nha_may_id === v.nm && b.hoat_dong));
  const caOpt = () => opt(S.cat.ca.filter((c) => c.nha_may_id === v.nm && c.hoat_dong && (!c.bo_phan_id || !v.bp || c.bo_phan_id === v.bp)));
  const draw = () => {
    body.innerHTML = '';
    if (can.adminTong()) body.append(selectField({ label: 'Nhà máy', value: v.nm, req: true, size: 'md', options: S.cat.nha_may.map((n) => ({ value: n.id, label: n.ten })), onChange: (x) => { v.nm = x; v.bp = ''; v.ca = ''; draw(); } }));
    body.append(selectField({ label: 'Bộ phận', value: v.bp, req: true, size: 'md', options: bpOpt(), onChange: (x) => { v.bp = x; draw(); } }),
      selectField({ label: 'Ca', value: v.ca, size: 'md', placeholder: '— Mọi ca —', options: caOpt(), onChange: (x) => { v.ca = x; } }));
    const t = el(`<div class="nn-field span-2"><label class="nn-label req">Danh sách (copy 2 cột Mã NV + Họ tên trong Excel rồi dán vào đây)</label>
      <div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="8" placeholder="NN-062&#9;Trần Văn Tuấn&#10;NN-063&#9;Nguyễn Thị Lan">${esc(v.txt)}</textarea></div></div>`);
    $('textarea', t).oninput = (e) => { v.txt = e.target.value; };
    body.append(t);
  };
  draw();
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('upload', 18)}Thêm vào danh mục</button>`);
  const sh = openSheet({ title: 'Dán danh sách nhân sự theo ca', body, foot: [ok], wide: true });
  ok.onclick = async () => {
    if (!v.bp) return toast('Chọn bộ phận', 'warning');
    const co = (S.cat.nhan_su_ca || []).filter((r) => r.bo_phan_id === v.bp && (r.ca_id || '') === (v.ca || ''));
    const key = (r) => noAccent(r.ma_nv || r.ho_ten);
    const seen = new Set(co.map(key));
    const rows = v.txt.split(/\r?\n/).map((l) => l.split('\t').map((x) => x.trim()).filter(Boolean)).filter((c) => c.length)
      .map((c) => (c.length >= 2 ? { ma_nv: c[0], ho_ten: c[1] } : { ma_nv: null, ho_ten: c[0] }))
      .filter((r) => r.ho_ten && !seen.has(key(r)) && seen.add(key(r)))
      .map((r, i) => ({ ...r, nha_may_id: v.nm, bo_phan_id: v.bp, ca_id: v.ca || null, hoat_dong: true, thu_tu: co.length + i + 1 }));
    if (!rows.length) return toast('Không có người mới để thêm (trống hoặc đã có hết)', 'warning');
    const { error } = await sb.from('nhan_su_ca').insert(rows);
    if (error) return toast(errText(error), 'danger');
    sh.close(); await reload(); toast(`Đã thêm ${rows.length} người`, 'success'); refresh();
  };
}

// Xóa hẳn một dòng danh mục. Dòng đang được phiếu / dữ liệu khác dùng sẽ bị cơ sở dữ liệu chặn.
async function delRow(cfg, row, refresh, table = cfg.table) {
  if (!row) return;
  const ten = row.ten || row.ma || '';
  if (!(await confirmBox(`Xóa hẳn "${ten}" khỏi ${cfg.title.toLowerCase()}? Không khôi phục được. Nếu chỉ muốn ngưng dùng, hãy bấm Sửa rồi tắt "Đang dùng" — cách đó giữ nguyên dữ liệu cũ.`,
    { ok: 'Xóa hẳn', danger: true, title: 'Xóa khỏi danh mục' }))) return;
  const { error } = await sb.from(table).delete().eq('id', row.id ?? row.nha_may_id);
  if (error) {
    const fk = /foreign key|violates|still referenced/i.test(error.message || '');
    return toast(fk ? `Không xóa được "${ten}" vì đang có phiếu hoặc dữ liệu khác dùng tới. Hãy bấm Sửa rồi tắt "Đang dùng".` : errText(error), 'danger');
  }
  await reload(); toast(`Đã xóa "${ten}"`); refresh();
}

function editRow(cfg, row, refresh, table = cfg.table) {
  const isNew = !row.id;
  const val = { ...row };
  const body = el('<div class="form-grid"></div>');
  // v1.7: admin tổng chọn nhà máy của dòng (danh mục gộp nhiều nhà máy)
  if (can.adminTong() && 'nha_may_id' in val && !['nha_may', 'nhan_su', 'cai_dat', 'ds_nhap_nhanh', 'quy_cach_tp'].includes(table) && !cfg.fields.some(([k]) => k === 'nha_may_id')) {
    body.append(selectField({ label: 'Nhà máy', value: val.nha_may_id || '', req: true, size: 'md', options: S.cat.nha_may.map((n) => ({ value: n.id, label: n.ten })), onChange: (v) => { val.nha_may_id = v || null; } }));
  }
  for (const [k, label, type, req, options, hint] of cfg.fields) {
    if (type === 'bool') {
      const f = el(`<label class="nn-field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" style="width:22px;height:22px" ${val[k] ? 'checked' : ''}> ${esc(label)}</label>`);
      $('input', f).onchange = (e) => { val[k] = e.target.checked; };
      body.append(f);
    } else if (type === 'select') {
      body.append(selectField({ label, value: val[k] ?? '', req, size: 'md', options: options(), onChange: (v) => { val[k] = v || null; } }));
    } else if (type === 'time') {
      body.append(timeField({ label, value: hm(val[k]), req, size: 'md', msg: hint, onInput: (v) => { val[k] = v || null; } }));
    } else {
      body.append(inputField({ label, value: val[k] ?? '', type: 'text', req, size: 'md', msg: hint,
        inputmode: type === 'number' ? 'decimal' : undefined, onInput: (v) => { val[k] = type === 'number' ? toNum(v) : v.trim(); } }));
    }
  }
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu</button>`);
  const del = isNew ? null : el(`<button class="nn-btn nn-btn-danger nn-btn-lg">${icon('trash', 18)}Xóa</button>`);
  const s = openSheet({ title: `${isNew ? 'Thêm' : 'Sửa'} ${cfg.title.toLowerCase()}`, body, foot: [del, ok].filter(Boolean), wide: true });
  ok.onclick = async () => {
    const miss = cfg.fields.filter(([k, , , req]) => req && (val[k] == null || val[k] === '')).map(([, l]) => l);
    if (miss.length) return toast(`Chưa nhập: ${miss.join(', ')}`, 'warning');
    ok.disabled = true;
    try {
      const { data, error } = await sb.from(table).upsert(val).select().single();
      if (error) throw error;
      await cfg.after?.(data);
      await reload(); s.close(); toast('Đã lưu'); refresh();
    } catch (e) { ok.disabled = false; toast(errText(e), 'danger'); }
  };
  if (del) del.onclick = async () => {
    if (!(await confirmBox('Xóa dòng này? Nếu đã có phiếu dùng tới, hãy bỏ chọn "Đang dùng" thay vì xóa.', { ok: 'Xóa', danger: true }))) return;
    const { error } = await sb.from(table).delete().eq('id', row.id);
    if (error) return toast(errText(error), 'danger');
    await reload(); s.close(); toast('Đã xóa', 'info'); refresh();
  };
}

// ---------- Nhân sự: tìm kiếm + lọc theo nhà máy, bộ phận ----------
function nhanSu(box, refresh) {
  const cfg = { ...CFG.nhan_su(), table: 'nhan_su' };
  const st = { nm: S.nm, bp: '', ca: '', kw: '' };
  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2" data-title></div><button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm nhân sự</button></div>
    <div class="filters" data-f></div><div data-tb></div></section>`;
  const bpOpts = () => S.cat.bo_phan.filter((b) => !st.nm || b.nha_may_id === st.nm).map((b) => ({ value: b.id, label: `${b.ten}${st.nm ? '' : ` · ${nmName(b.nha_may_id)}`}` }));
  const fBp = selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả bộ phận', options: bpOpts(), onChange: (v) => { st.bp = v; draw(); } });
  const kw = inputField({ label: 'Tìm kiếm', size: 'md', placeholder: 'Mã NV hoặc họ tên…', onInput: (v) => { st.kw = noAccent(v); draw(); } });
  if (can.adminTong()) {
    $('[data-f]', box).append(selectField({ label: 'Nhà máy', size: 'md', placeholder: 'Tất cả nhà máy', value: st.nm, options: opt(S.cat.nha_may),
      onChange: (v) => { st.nm = v; st.bp = ''; st.ca = ''; fBp.setOptions(bpOpts(), ''); fCa.setOptions(caOpts(), ''); draw(); } }));
  }
  const caOpts = () => S.cat.ca.filter((c) => (!st.nm || c.nha_may_id === st.nm) && c.hoat_dong)
    .map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})${st.nm ? '' : ` · ${nmName(c.nha_may_id)}`}` }));
  const fCa = selectField({ label: 'Ca (theo phân công)', size: 'md', placeholder: 'Tất cả ca', options: caOpts(), onChange: (v) => { st.ca = v; draw(); } });
  $('[data-f]', box).append(fBp, fCa, kw);
  // Ca + dây chuyền / máy được phân công (hiện dưới vai trò)
  const pcOf = (id) => { const xs = (S.cat.phan_cong || []).filter((x) => x.nhan_su_id === id);
    return xs.length ? `<br><span class="t-cap">${esc([...new Set(xs.map((x) => `${cat.name('ca', x.ca_id)}: ${x.day_chuyen_id ? cat.name('day_chuyen', x.day_chuyen_id) : cat.name('may', x.may_id, 'ma')}`))].join(' · '))}</span>` : ''; };
  const draw = () => {
    const rows = S.cat.nhan_su.filter((n) => (!st.nm || n.nha_may_id === st.nm || !n.nha_may_id) && (!st.bp || n.bo_phan_id === st.bp)
      && (!st.ca || (S.cat.phan_cong || []).some((x) => x.ca_id === st.ca && x.nhan_su_id === n.id))
      && (!st.kw || noAccent(`${n.ma_nv} ${n.ho_ten}`).includes(st.kw))).sort((a, b) => a.ma_nv.localeCompare(b.ma_nv, 'vi', { numeric: true }));
    $('[data-title]', box).textContent = `Nhân sự (${rows.length})`;
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Vai trò</th><th>Nhà máy</th><th>Bộ phận</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="nn-mono">${esc(r.ma_nv)}</td><td>${esc(r.ho_ten)}</td><td>${esc(VAI_TRO[r.vai_tro])}${pcOf(r.id)}</td><td>${esc(r.nha_may_id ? nmName(r.nha_may_id) : 'Tất cả (admin tổng)')}</td><td>${esc(cat.name('bo_phan', r.bo_phan_id))}</td>
        <td>${r.user_id ? `<span class="nn-status nn-tone-success">${icon('pass', 14)}Có PIN</span>` : `<span class="nn-status nn-tone-warning">${icon('hold', 14)}Chưa cấp</span>`}</td><td>${yes(r.hoat_dong)}</td>
        <td style="white-space:nowrap"><button class="nn-btn nn-btn-secondary nn-btn-sm" data-pin="${r.id}">${icon('lock', 14)}${r.user_id ? 'Đổi PIN' : 'Cấp PIN'}</button>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id}">${icon('edit', 14)}Sửa</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Không có nhân sự phù hợp</td></tr>'}</tbody></table></div>`;
  };
  draw();
  box.onclick = (e) => {
    if (e.target.closest('[data-add]')) return editRow(cfg, { ...cfg.def(), nha_may_id: st.nm || null, bo_phan_id: st.bp || null }, refresh);
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg, S.cat.byId.nhan_su[ed.dataset.edit], refresh);
    const pin = e.target.closest('[data-pin]'); if (pin) return setPin(S.cat.byId.nhan_su[pin.dataset.pin], refresh);
  };
}

async function setPin(ns, refresh) {
  const f = inputField({ label: `PIN mới cho ${ns.ho_ten} (${ns.ma_nv})`, type: 'password', inputmode: 'numeric', req: true, msg: '4–6 chữ số. Báo cho nhân viên đăng nhập bằng mã NV + PIN này.', attrs: 'maxlength="6"' });
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('lock', 18)}Lưu PIN</button>`);
  const s = openSheet({ title: ns.user_id ? 'Đổi PIN' : 'Cấp tài khoản', body: f, foot: [ok] });
  ok.onclick = async () => {
    const pin = f.input.value.trim();
    if (!/^\d{4,6}$/.test(pin)) return toast('PIN gồm 4–6 chữ số', 'warning');
    try { await rpc('admin_dat_pin', { p_ns: ns.id, p_pin: pin }); await reload(); s.close(); toast(`Đã đặt PIN cho ${ns.ma_nv}`); refresh(); }
    catch (e) { toast(errText(e), 'danger'); }
  };
}

// ---------- Sao chép sản phẩm giữa các nhà máy ----------
function copyProducts(refresh) {
  let src = '';
  const f = selectField({ label: 'Sao chép sản phẩm từ nhà máy', placeholder: '— Chọn nhà máy nguồn —', options: opt(S.cat.nha_may.filter((n) => n.id !== S.nm)), onChange: (v) => { src = v; } });
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('copy', 18)}Sao chép</button>`);
  const s = openSheet({ title: 'Sao chép sản phẩm', body: el(`<div><p class="t-cap">Chỉ thêm sản phẩm chưa có (so theo mã). Sản phẩm đã có trong ${esc(nmName(S.nm))} được giữ nguyên.</p></div>`), foot: [ok] });
  $('.sheet-body > div', s.el).append(f);
  ok.onclick = async () => {
    if (!src) return toast('Chọn nhà máy nguồn', 'warning');
    const have = new Set(ofNm('san_pham').map((p) => p.ma));
    const rows = S.cat.san_pham.filter((p) => p.nha_may_id === src && !have.has(p.ma)).map((p) => ({ nha_may_id: S.nm, ma: p.ma, ten: p.ten, dvt: p.dvt, quy_cach: p.quy_cach, thu_tu: p.thu_tu, hoat_dong: p.hoat_dong }));
    if (!rows.length) return toast('Không có sản phẩm mới để chép', 'info');
    const { error } = await sb.from('san_pham').insert(rows);
    if (error) return toast(errText(error), 'danger');
    await reload(); s.close(); toast(`Đã chép ${rows.length} sản phẩm`); refresh();
  };
}

// ---------- Khai dây chuyền / máy đơn nào chạy một sản phẩm ----------
// Phiếu chỉ hiện sản phẩm đã khai cho máy đang chọn; chưa khai gì thì hiện tất cả (để không chặn người ghi).
function sanPhamMay(spId, refresh) {
  const sp = S.cat.byId.san_pham[spId]; if (!sp) return;
  const lines = dcOf(sp.nha_may_id), singles = donOf(false, sp.nha_may_id);
  const cur = new Set([
    ...S.cat.day_chuyen_san_pham.filter((x) => x.san_pham_id === spId).map((x) => `dc:${x.day_chuyen_id}`),
    ...S.cat.may_san_pham.filter((x) => x.san_pham_id === spId).map((x) => `m:${x.may_id}`),
  ]);
  const sel = new Set(cur);
  const line = (k, label, sub) => `<label class="lc-row" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;gap:10px;cursor:pointer;justify-content:flex-start">
    <input type="checkbox" data-k="${esc(k)}" ${sel.has(k) ? 'checked' : ''} style="width:20px;height:20px;flex:none">
    <span>${esc(label)}${sub ? `<br><span class="t-cap">${esc(sub)}</span>` : ''}</span></label>`;
  const body = el(`<div class="nn-stack" style="padding:0;gap:8px">
    <p class="t-cap">Tích những dây chuyền / máy đơn có chạy <b>${esc(sp.ten)}</b>. Khi ghi phiếu, chọn máy nào thì ô Sản phẩm chỉ hiện sản phẩm đã khai cho máy đó.
      Không tích gì thì sản phẩm này hiện ở mọi máy.</p>
    ${lines.length ? `<div class="nn-label">Dây chuyền</div>${lines.map((l) => line(`dc:${l.id}`, l.ten, cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → '))).join('')}` : ''}
    ${singles.length ? `<div class="nn-label" style="margin-top:6px">Máy đơn</div>${singles.map((m) => line(`m:${m.id}`, `${m.ma} · ${m.ten}`, cat.name('khu_vuc', m.khu_vuc_id))).join('')}` : ''}
    ${!lines.length && !singles.length ? '<div class="empty">Chưa có dây chuyền hoặc máy nào</div>' : ''}</div>`);
  body.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) e.target.checked ? sel.add(k) : sel.delete(k); });
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu</button>`);
  const s = openSheet({ title: `Máy chạy sản phẩm ${sp.ma}`, body, foot: [ok] });
  ok.onclick = async () => {
    const them = [...sel].filter((k) => !cur.has(k)), bo = [...cur].filter((k) => !sel.has(k));
    const ids = (arr, p) => arr.filter((k) => k.startsWith(p)).map((k) => k.slice(p.length));
    try {
      const dcThem = ids(them, 'dc:'), mThem = ids(them, 'm:');
      if (dcThem.length) { const { error } = await sb.from('day_chuyen_san_pham').insert(dcThem.map((id) => ({ day_chuyen_id: id, san_pham_id: spId }))); if (error) throw error; }
      if (mThem.length) { const { error } = await sb.from('may_san_pham').insert(mThem.map((id) => ({ may_id: id, san_pham_id: spId }))); if (error) throw error; }
      const dcBo = ids(bo, 'dc:'), mBo = ids(bo, 'm:');
      if (dcBo.length) { const { error } = await sb.from('day_chuyen_san_pham').delete().eq('san_pham_id', spId).in('day_chuyen_id', dcBo); if (error) throw error; }
      if (mBo.length) { const { error } = await sb.from('may_san_pham').delete().eq('san_pham_id', spId).in('may_id', mBo); if (error) throw error; }
    } catch (e) { return toast(errText(e), 'danger'); }
    await reload(); s.close();
    toast(sel.size ? `${sp.ma} chạy trên ${sel.size} dây chuyền / máy` : `${sp.ma} hiện ở mọi máy`);
    refresh();
  };
}

// ---------- Mã lỗi theo máy ----------
function maLoi(box, refresh) {
  let mayId = maLoi.last && ofNm('may').some((m) => m.id === maLoi.last) ? maLoi.last : ofNm('may')[0]?.id;
  const st = (maLoi.st = maLoi.st && maLoi.st.nm === S.nm ? maLoi.st : { nm: S.nm, kw: '', f: {}, sc: {} });
  st.sc ||= {};
  const defs = [
    { key: 'nhom', label: 'Nhóm tổn thất', get: (r) => `${r.nhom_ton_that}. ${NHOM_TT[r.nhom_ton_that]}` },
    { key: 'loai', label: 'Loại lỗi', get: (r) => r.loai_loi || 'Chưa có' },
    { key: 'md', label: 'Mức độ xử lý', get: (r) => (MUC_DO[r.muc_do] || MUC_DO.dung_ngay).label },
    { key: '_hd', label: 'Trạng thái', get: (r) => (r.hoat_dong === false ? 'Ngưng' : 'Đang dùng') },
  ];
  const allOf = () => S.cat.ma_loi.filter((l) => l.may_id === mayId);

  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2" data-title></div>
    <div class="nn-row" style="padding:0"><div class="nn-input-wrap nn-input-md">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm mã hoặc tên lỗi…" data-kw></div>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-copy>${icon('copy', 18)}Sao chép từ máy khác</button>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm mã lỗi</button></div></div>
    <div class="filters" data-may style="margin-bottom:4px"></div><div class="filters" data-f style="margin-bottom:4px"></div><div data-tb></div>
    <p class="t-cap">Nhóm 4–6 (giảm tốc độ, lỗi trong quá trình, lỗi khởi động): các lần dừng gắn nhóm này vẫn tính thời gian dừng, và biểu đồ 6 tổn thất cộng thêm phần app tự tính từ sản lượng. Lần dừng dưới ngưỡng dừng ngắn luôn xếp vào nhóm 3.
    Mức độ xử lý: <b>${esc(MUC_DO.dung_ngay.label)}</b> hoặc <b>${esc(MUC_DO.chay_tam.label)}</b> — phiếu tự điền theo mã lỗi, người ghi sửa lại được. Mỗi máy luôn có sẵn “${esc(LOI_KHAC.ten)}” trong phiếu nên không cần khai vào đây.</p></section>`;

  const draw = () => {
    maLoi.last = mayId;
    const all = allOf();
    const rows = sortCat(all.filter((r) => passFilter(r, defs, st)
      && (!st.kw || noAccent(`${r.ma} ${r.ten} ${r.loai_loi}`).includes(st.kw))));
    $('[data-title]', box).textContent = `${cat.mayLabel(mayId)} · ${rows.length === all.length ? `${all.length} mã` : `${rows.length} / ${all.length} mã`}`;
    $('[data-clearf]', box) && ($('[data-clearf]', box).hidden = !Object.values(st.f).some(Boolean) && !st.kw);
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Mã</th><th>Tên lỗi</th><th>Nhóm 6 tổn thất</th><th>Loại lỗi</th><th>Mức độ xử lý</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="nn-mono">${esc(r.ma)}</td><td class="wrap">${esc(r.ten)}</td><td><span class="chip dept">${r.nhom_ton_that}. ${esc(NHOM_TT[r.nhom_ton_that])}</span></td><td>${esc(r.loai_loi)}</td>
        <td>${mucDoBadge(r.muc_do)}</td><td>${yes(r.hoat_dong)}</td>
        <td style="white-space:nowrap"><button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id}">${icon('edit', 14)}Sửa</button>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-delml="${r.id}" aria-label="Xóa">${icon('trash', 14)}</button></td></tr>`).join('')
        || `<tr><td colspan="7" class="muted">${Object.values(st.f).some(Boolean) || st.kw ? 'Không có mã lỗi nào khớp bộ lọc' : 'Chưa có mã lỗi'}</td></tr>`}
      </tbody></table></div>`;
  };
  const redraw = () => { filterBar(box, defs, allOf(), st, draw); draw(); };
  const cfg = () => ({
    title: 'Mã lỗi', table: 'ma_loi', rows: allOf(),
    fields: [['ma', 'Mã lỗi', 'text', true], ['ten', 'Tên lỗi', 'text', true],
      ['nhom_ton_that', 'Nhóm 6 tổn thất', 'select', true, () => [1, 2, 3, 4, 5, 6].map((i) => ({ value: i, label: `${i}. ${NHOM_TT[i]}` }))],
      ['loai_loi', 'Loại lỗi', 'select', true, () => LOAI_LOI.map((x) => ({ value: x, label: x }))],
      ['muc_do', 'Mức độ xử lý', 'select', true, () => Object.entries(MUC_DO).map(([k, v]) => ({ value: k, label: v.label }))],
      ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
  });
  // Chọn máy: lọc trước theo khu vực / bộ phận / dây chuyền cho dễ tìm
  const mayOpts = () => ofNm('may').filter((m) => mayHop(m, st.sc))
    .map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}`, sub: [cat.name('khu_vuc', m.khu_vuc_id), cat.name('bo_phan', m.bo_phan_id), cat.lineNames(m.id) || 'Máy đơn'].filter(Boolean).join(' · ') }));
  if (!mayOpts().some((o) => o.value === mayId)) mayId = mayOpts()[0]?.value || mayId;
  const fMay = comboField({ label: 'Máy', value: mayId, size: 'md', allowClear: false, options: mayOpts(), onChange: (v) => { mayId = v; redraw(); } });
  $('[data-may]', box).append(...scopeFields(st.sc, () => {
    const o = mayOpts();
    if (!o.some((x) => x.value === mayId) && o.length) mayId = o[0].value;
    fMay.setOptions(o, mayId); redraw();
    if (!o.length) toast('Không có máy nào khớp bộ lọc', 'info');
  }), fMay);
  redraw();
  $('[data-kw]', box).oninput = (e) => { st.kw = noAccent(e.target.value); draw(); };

  box.onclick = async (e) => {
    if (e.target.closest('[data-clearf]')) return;
    if (e.target.closest('[data-add]')) return editRow(cfg(), { may_id: mayId, nhom_ton_that: 1, loai_loi: 'Cơ', muc_do: 'dung_ngay', hoat_dong: true, thu_tu: allOf().length + 1 }, refresh, 'ma_loi');
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg(), S.cat.byId.ma_loi[ed.dataset.edit], refresh, 'ma_loi');
    const dl = e.target.closest('[data-delml]'); if (dl) return delRow(cfg(), S.cat.byId.ma_loi[dl.dataset.delml], refresh, 'ma_loi');
    if (e.target.closest('[data-copy]')) return copyFaults();
  };

  // Sao chép = THAY THẾ: bộ mã cũ của máy này bị xóa hết, chỉ giữ bộ vừa chép sang.
  function copyFaults() {
    let src = '';
    const dst = S.cat.byId.may[mayId];
    const info = el('<p class="t-cap"></p>');
    const paint = () => {
      const n = src ? S.cat.ma_loi.filter((l) => l.may_id === src).length : 0;
      const cu = allOf().length;
      info.innerHTML = src
        ? `Sẽ <b>xóa ${cu} mã lỗi hiện có</b> của ${esc(cat.mayLabel(mayId))} và thay bằng <b>${n} mã</b> của ${esc(cat.mayLabel(src))}. Tiền tố mã được đổi sang <b>${esc(dst?.ma || '')}</b>.`
        : 'Chọn máy nguồn. Bộ mã lỗi hiện có của máy này sẽ bị xóa hết và thay bằng bộ mã của máy nguồn.';
    };
    paint();
    const f = comboField({ label: 'Sao chép toàn bộ mã lỗi từ máy', allowClear: false,
      options: ofNm('may').filter((m) => m.id !== mayId).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}`, sub: `${S.cat.ma_loi.filter((l) => l.may_id === m.id).length} mã lỗi` })),
      onChange: (v) => { src = v; paint(); } });
    const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('copy', 18)}Thay bằng bộ mã này</button>`);
    const body = el('<div class="nn-stack" style="padding:0;gap:10px"></div>');
    body.append(f, info);
    const s = openSheet({ title: 'Thay bộ mã lỗi bằng bộ của máy khác', body, foot: [ok] });
    ok.onclick = async () => {
      if (!src) return toast('Chọn máy nguồn', 'warning');
      const srcM = S.cat.byId.may[src];
      const cu = allOf();
      const rows = sortCat(S.cat.ma_loi.filter((l) => l.may_id === src)).map((l) => ({
        may_id: mayId, ma: l.ma.startsWith(srcM.ma) ? dst.ma + l.ma.slice(srcM.ma.length) : l.ma, ten: l.ten,
        nhom_ton_that: l.nhom_ton_that, loai_loi: l.loai_loi, muc_do: l.muc_do || 'dung_ngay', thu_tu: l.thu_tu, hoat_dong: l.hoat_dong,
      }));
      if (!rows.length) return toast('Máy nguồn chưa có mã lỗi nào', 'warning');
      if (!(await confirmBox(`Xóa ${cu.length} mã lỗi của ${cat.mayLabel(mayId)} và thay bằng ${rows.length} mã của ${cat.mayLabel(src)}? Các lần dừng đã ghi vẫn giữ tên và mã lỗi cũ trong phiếu.`,
        { ok: 'Xóa và thay', danger: true, title: 'Thay bộ mã lỗi' }))) return;
      // Chép bộ mới trước rồi mới xóa bộ cũ: nếu chép hỏng thì bộ cũ vẫn còn nguyên.
      const { error } = await sb.from('ma_loi').insert(rows);
      if (error) return toast(errText(error), 'danger');
      if (cu.length) {
        const { error: e2 } = await sb.from('ma_loi').delete().in('id', cu.map((l) => l.id));
        if (e2) { await reload(); s.close(); refresh(); return toast(`Đã chép ${rows.length} mã nhưng chưa xóa được bộ cũ: ${errText(e2)}`, 'danger'); }
      }
      await reload(); s.close(); toast(`Đã thay bằng ${rows.length} mã lỗi của ${srcM.ma}`); refresh();
    };
  }
}

// ---------- v1.4: Lỗi sản phẩm theo từng sản phẩm (lỗi nắp, lỗi chiết…) ----------
// Phiếu xổ danh sách này theo sản phẩm đang chạy để ghi số lượng từng lỗi. "Lỗi khác" luôn có sẵn, không cần khai.
function loiSp(box, refresh) {
  if (!S.cat.loi_san_pham) { box.innerHTML = '<div class="empty">Chưa cập nhật database — chạy lại file supabase/01_schema.sql bản mới</div>'; return; }
  const st = (loiSp.st = loiSp.st && loiSp.st.nm === S.nm ? loiSp.st : { nm: S.nm, sp: '', sc: {}, kw: '' });
  const prods = () => ofNm('san_pham').filter((p) => p.hoat_dong && (!st.sc.kv && !st.sc.bp && !st.sc.dc || spHop(p.id, st.sc)));
  const spOpts = () => prods().map((p) => ({ value: p.id, label: p.ten, sub: `${p.ma}${p.dvt ? ` · ${p.dvt}` : ''} · ${cat.loiSp(p.id, true).length} lỗi` }));
  if (!prods().some((p) => p.id === st.sp)) st.sp = prods()[0]?.id || '';
  const allOf = () => cat.loiSp(st.sp, true);
  const cfg = () => ({ title: 'Lỗi sản phẩm', table: 'loi_san_pham', rows: allOf(),
    fields: [['giai_doan', 'Giai đoạn', 'select', true, () => Object.entries(GIAI_DOAN).map(([k, v]) => ({ value: k, label: `${v.label} (${v.bp})` }))],
      ['ma', 'Mã lỗi (không bắt buộc)', 'text'], ['ten', 'Tên lỗi', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']] });

  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2" data-title></div>
    <div class="nn-row" style="padding:0"><div class="nn-input-wrap nn-input-md">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm lỗi…" data-kw value="${esc(st.kw)}"></div>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-copy>${icon('copy', 18)}Sao chép từ sản phẩm khác</button>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm lỗi</button></div></div>
    <div class="filters" data-f style="margin-bottom:4px"></div><div data-tb></div>
    <p class="t-cap">Mỗi sản phẩm có bộ lỗi riêng (ví dụ yến chai: lỗi nắp, lỗi chiết, lỗi tem…). Khi ghi phiếu, người ghi chọn lỗi trong danh sách của sản phẩm đang chạy rồi nhập số lượng;
      tổng các lỗi là sản lượng lỗi của phiếu. “${esc(LOI_KHAC.ten)}” luôn có sẵn nên không cần khai — chọn nó thì bắt buộc ghi chú.</p></section>`;
  const fSp = comboField({ label: 'Sản phẩm', value: st.sp, size: 'md', allowClear: false, options: spOpts(), onChange: (v) => { st.sp = v; draw(); } });
  const fGd = selectField({ label: 'Giai đoạn', size: 'md', value: st.gd || '', placeholder: 'Tất cả giai đoạn', options: Object.entries(GIAI_DOAN).map(([k, v]) => ({ value: k, label: `${v.label} (${v.bp})` })), onChange: (v) => { st.gd = v; draw(); } });
  $('[data-f]', box).append(...scopeFields(st.sc, () => {
    if (!prods().some((p) => p.id === st.sp)) st.sp = prods()[0]?.id || '';
    fSp.setOptions(spOpts(), st.sp); draw();
  }), fSp, fGd);
  function draw() {
    const sp = S.cat.byId.san_pham[st.sp];
    const all = allOf();
    const rows = all.filter((r) => (!st.gd || (r.giai_doan || 'san_xuat') === st.gd) && (!st.kw || noAccent(`${r.ma || ''} ${r.ten}`).includes(st.kw)))
      .sort((a, b) => Object.keys(GIAI_DOAN).indexOf(a.giai_doan || 'san_xuat') - Object.keys(GIAI_DOAN).indexOf(b.giai_doan || 'san_xuat'));
    $('[data-title]', box).textContent = sp ? `${sp.ten} · ${rows.length === all.length ? `${all.length} lỗi` : `${rows.length} / ${all.length} lỗi`}` : 'Lỗi sản phẩm';
    $('[data-tb]', box).innerHTML = !sp ? `<div class="empty">${ofNm('san_pham').length ? 'Không có sản phẩm nào khớp bộ lọc' : 'Chưa có sản phẩm — thêm ở tab Sản phẩm'}</div>`
      : `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Giai đoạn</th><th>Mã</th><th>Tên lỗi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><span class="chip dept">${esc(GIAI_DOAN[r.giai_doan || 'san_xuat'].label)}</span></td><td class="nn-mono">${esc(r.ma || '')}</td><td class="wrap">${esc(r.ten)}</td><td>${yes(r.hoat_dong)}</td>
        <td style="white-space:nowrap"><button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id}">${icon('edit', 14)}Sửa</button>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-dellsp="${r.id}" aria-label="Xóa">${icon('trash', 14)}</button></td></tr>`).join('')
        || `<tr><td colspan="5" class="muted">${st.kw || st.gd ? 'Không có lỗi nào khớp' : 'Chưa khai lỗi nào — báo cáo giao ca chỉ có “Lỗi khác”'}</td></tr>`}</tbody></table></div>`;
  }
  draw();
  $('[data-kw]', box).oninput = (e) => { st.kw = noAccent(e.target.value); draw(); };
  box.onclick = async (e) => {
    if (e.target.closest('[data-clearf]')) return;
    if (e.target.closest('[data-add]')) { if (!st.sp) return toast('Chọn sản phẩm trước', 'warning'); return editRow(cfg(), { san_pham_id: st.sp, giai_doan: st.gd || 'san_xuat', hoat_dong: true, thu_tu: allOf().length + 1 }, refresh, 'loi_san_pham'); }
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg(), allOf().find((r) => r.id === ed.dataset.edit), refresh, 'loi_san_pham');
    const dl = e.target.closest('[data-dellsp]'); if (dl) return delRow(cfg(), allOf().find((r) => r.id === dl.dataset.dellsp), refresh, 'loi_san_pham');
    if (e.target.closest('[data-copy]')) return copyDefects();
  };

  // Sao chép = THAY THẾ (giống mã lỗi): bộ lỗi cũ của sản phẩm này bị xóa, chỉ giữ bộ vừa chép
  function copyDefects() {
    if (!st.sp) return toast('Chọn sản phẩm trước', 'warning');
    let src = '';
    const info = el('<p class="t-cap">Chọn sản phẩm nguồn. Bộ lỗi hiện có của sản phẩm này sẽ bị xóa hết và thay bằng bộ lỗi của sản phẩm nguồn.</p>');
    const f = comboField({ label: 'Sao chép toàn bộ lỗi từ sản phẩm', allowClear: false,
      options: ofNm('san_pham').filter((p) => p.id !== st.sp && cat.loiSp(p.id, true).length).map((p) => ({ value: p.id, label: p.ten, sub: `${p.ma} · ${cat.loiSp(p.id, true).length} lỗi` })),
      onChange: (v) => { src = v; info.innerHTML = `Sẽ <b>xóa ${allOf().length} lỗi hiện có</b> và thay bằng <b>${cat.loiSp(v, true).length} lỗi</b> của ${esc(S.cat.byId.san_pham[v]?.ten || '')}.`; } });
    const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('copy', 18)}Thay bằng bộ lỗi này</button>`);
    const body = el('<div class="nn-stack" style="padding:0;gap:10px"></div>'); body.append(f, info);
    const s = openSheet({ title: 'Thay bộ lỗi sản phẩm', body, foot: [ok] });
    ok.onclick = async () => {
      if (!src) return toast('Chọn sản phẩm nguồn', 'warning');
      const cu = allOf();
      const rows = cat.loiSp(src, true).map((l) => ({ san_pham_id: st.sp, giai_doan: l.giai_doan || 'san_xuat', ma: l.ma, ten: l.ten, thu_tu: l.thu_tu, hoat_dong: l.hoat_dong }));
      if (cu.length && !(await confirmBox(`Xóa ${cu.length} lỗi của sản phẩm này và thay bằng ${rows.length} lỗi? Phiếu đã ghi vẫn giữ tên lỗi cũ.`, { ok: 'Xóa và thay', danger: true, title: 'Thay bộ lỗi sản phẩm' }))) return;
      const { error } = await sb.from('loi_san_pham').insert(rows);           // chép trước, xóa sau
      if (error) return toast(errText(error), 'danger');
      if (cu.length) { const { error: e2 } = await sb.from('loi_san_pham').delete().in('id', cu.map((l) => l.id)); if (e2) toast(`Đã chép nhưng chưa xóa được bộ cũ: ${errText(e2)}`, 'danger'); }
      await reload(); s.close(); toast(`Đã thay bằng ${rows.length} lỗi`); refresh();
    };
  }
}

// ---------- Sản phẩm & tốc độ định mức theo dây chuyền / máy đơn ----------
// Chọn sản phẩm mà dây chuyền (hoặc máy đơn) chạy + nhập tốc độ. Máy thuộc dây chuyền dùng tốc độ của dây chuyền.
function tocDo(box) {
  const st = (tocDo.st = tocDo.st && tocDo.st.nm === S.nm ? tocDo.st : { nm: S.nm, kind: 'chuyen', id: '', sc: {} });
  st.sc ||= {};
  const targets = () => (st.kind === 'chuyen'
    ? ofNm('day_chuyen').filter((l) => lineHop(l, st.sc)).map((l) => ({ value: l.id, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → ') }))
    : donOf(true).filter((m) => mayHop(m, st.sc)).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}`, sub: [cat.name('khu_vuc', m.khu_vuc_id), cat.name('bo_phan', m.bo_phan_id)].filter(Boolean).join(' · ') })));
  const T = () => (st.kind === 'chuyen' ? { col: 'day_chuyen_id', assign: 'day_chuyen_san_pham', speed: 'toc_do_day_chuyen' } : { col: 'may_id', assign: 'may_san_pham', speed: 'toc_do' });
  let sel = new Set(), spd = {}, kw = '';
  const loadState = (id) => {
    const t = T();
    sel = new Set(S.cat[t.assign].filter((x) => x[t.col] === id).map((x) => x.san_pham_id));
    spd = {};
    for (const x of S.cat[t.speed].filter((y) => y[t.col] === id)) { spd[x.san_pham_id] = numInput(x.sp_phut); sel.add(x.san_pham_id); }
  };
  if (!targets().some((t) => t.value === st.id)) st.id = targets()[0]?.value || '';
  loadState(st.id);

  box.innerHTML = `<section class="card"><div class="filters" data-f style="margin-bottom:8px"></div><div data-tb></div></section>`;
  const f = $('[data-f]', box);
  const seg = segmented([{ value: 'chuyen', label: 'Theo dây chuyền' }, { value: 'may', label: 'Theo máy đơn' }], st.kind, (v) => { st.kind = v; st.id = targets()[0]?.value || ''; loadState(st.id); fTarget.setOptions(targets(), st.id); draw(); });
  const segWrap = el('<div class="nn-field" style="flex:0 0 auto;min-width:0"><span class="nn-label">Loại tốc độ</span></div>'); segWrap.append(seg);
  const fTarget = comboField({ label: 'Dây chuyền / Máy đơn', value: st.id, size: 'md', allowClear: false, options: targets(), onChange: (v) => { st.id = v; loadState(v); draw(); } });
  f.append(segWrap, ...scopeFields(st.sc, () => {
    if (!targets().some((t) => t.value === st.id)) { st.id = targets()[0]?.value || ''; loadState(st.id); }
    fTarget.setOptions(targets(), st.id); draw();
  }, { dc: false }), fTarget);

  const draw = () => {
    const prods = ofNm('san_pham').filter((p) => p.hoat_dong).filter((p) => !kw || noAccent(`${p.ma} ${p.ten}`).includes(kw));
    const inLine = '';
    $('[data-tb]', box).innerHTML = !st.id ? `<div class="empty">${st.sc.kv || st.sc.bp ? 'Không có dây chuyền / máy đơn nào khớp bộ lọc' : st.kind === 'chuyen' ? 'Chưa có dây chuyền — thêm ở tab Dây chuyền' : 'Không có máy đơn'}</div>` : `
      <div class="card-head"><div><div class="t-h2">${esc(targets().find((t) => t.value === st.id)?.label || '')}</div>
        <div class="t-cap">${st.kind === 'chuyen' ? 'Tốc độ của dây chuyền được ưu tiên cho mọi máy trong chuyền.' : `Chỉ dành cho máy đơn.${inLine ? ` Máy thuộc dây chuyền (${esc(inLine)}) dùng tốc độ dây chuyền.` : ''}`}
        Tích chọn sản phẩm chạy, nhập tốc độ (sp/phút); để trống tốc độ nếu chưa có.</div></div>
        <div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-md" data-copy>${icon('copy', 18)}Sao chép từ nơi khác</button>
        <button class="nn-btn nn-btn-primary nn-btn-md" data-save>${icon('pass', 18)}Lưu</button></div></div>
      <div class="nn-row" style="padding:0 0 12px"><div class="nn-input-wrap nn-input-md" style="flex:1;min-width:200px">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm sản phẩm…" data-kw value="${esc(kw)}"></div>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-all>Chọn tất cả</button><button class="nn-btn nn-btn-ghost nn-btn-sm" data-none>Bỏ chọn tất cả</button>
        <span class="chip" data-count>${sel.size} sản phẩm đã chọn</span></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th style="width:56px">Chạy</th><th>Mã</th><th>Sản phẩm</th><th>ĐVT</th><th style="width:200px">Tốc độ (sp/phút)</th></tr></thead><tbody>
      ${prods.map((p) => `<tr><td><input type="checkbox" style="width:22px;height:22px" data-sp="${p.id}" ${sel.has(p.id) ? 'checked' : ''}></td><td class="nn-mono">${esc(p.ma)}</td><td class="wrap">${esc(p.ten)}</td><td>${esc(p.dvt || '')}</td>
        <td><div class="nn-input-wrap nn-input-sm"><input class="nn-input" inputmode="decimal" data-spd="${p.id}" value="${esc(spd[p.id] ?? '')}"><span class="nn-input-unit">sp/phút</span></div></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Không có sản phẩm — thêm ở tab Sản phẩm</td></tr>'}
      </tbody></table></div>`;
  };
  const updCount = () => { const c = $('[data-count]', box); if (c) c.textContent = `${sel.size} sản phẩm đã chọn`; };
  draw();
  box.addEventListener('focusout', (e) => { const i = e.target.closest?.('[data-spd]'); if (i) { const n = toNum(i.value); if (n != null) { i.value = numInput(n); spd[i.dataset.spd] = i.value; } } });
  box.oninput = (e) => {
    const k = e.target.closest('[data-kw]');
    if (k) { kw = noAccent(k.value); const pos = k.selectionStart; draw(); const n = $('[data-kw]', box); n.focus(); n.setSelectionRange(pos, pos); return; }
    const i = e.target.closest('[data-spd]');
    if (i) { spd[i.dataset.spd] = i.value; if (toNum(i.value) > 0 && !sel.has(i.dataset.spd)) { sel.add(i.dataset.spd); const c = $(`[data-sp="${i.dataset.spd}"]`, box); if (c) c.checked = true; updCount(); } }
  };
  box.onchange = (e) => {
    const c = e.target.closest('[data-sp]');
    if (c) { if (c.checked) sel.add(c.dataset.sp); else sel.delete(c.dataset.sp); updCount(); }
  };
  box.onclick = async (e) => {
    if (e.target.closest('[data-all]')) { ofNm('san_pham').filter((p) => p.hoat_dong).forEach((p) => sel.add(p.id)); return draw(); }
    if (e.target.closest('[data-none]')) { sel.clear(); return draw(); }
    if (e.target.closest('[data-copy]')) {
      let src = '';
      const pick = comboField({ label: `Sao chép từ ${st.kind === 'chuyen' ? 'dây chuyền' : 'máy đơn'}`, options: targets().filter((t) => t.value !== st.id), onChange: (v) => { src = v; } });
      const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('copy', 18)}Sao chép</button>`);
      const s = openSheet({ title: 'Sao chép sản phẩm và tốc độ', body: el('<div><p class="t-cap">Chép vào bảng bên dưới (chưa lưu cho đến khi bấm Lưu).</p></div>'), foot: [ok] });
      $('.sheet-body > div', s.el).append(pick);
      ok.onclick = () => {
        if (!src) return toast('Chọn nơi cần chép', 'warning');
        const keep = st.id; st.id = src; loadState(src); st.id = keep; s.close(); draw(); toast('Đã chép — kiểm tra rồi bấm Lưu', 'info');
      };
      return;
    }
    if (!e.target.closest('[data-save]')) return;
    const t = T();
    const oldA = S.cat[t.assign].filter((x) => x[t.col] === st.id), oldS = S.cat[t.speed].filter((x) => x[t.col] === st.id);
    const addA = [...sel].filter((id) => !oldA.some((x) => x.san_pham_id === id)).map((id) => ({ [t.col]: st.id, san_pham_id: id }));
    const delA = oldA.filter((x) => !sel.has(x.san_pham_id)).map((x) => x.id);
    const upS = [...sel].filter((id) => toNum(spd[id]) > 0).map((id) => ({ [t.col]: st.id, san_pham_id: id, sp_phut: toNum(spd[id]) }));
    const delS = oldS.filter((x) => !sel.has(x.san_pham_id) || !(toNum(spd[x.san_pham_id]) > 0)).map((x) => x.id);
    try {
      if (addA.length) { const { error } = await sb.from(t.assign).insert(addA); if (error) throw error; }
      if (delA.length) { const { error } = await sb.from(t.assign).delete().in('id', delA); if (error) throw error; }
      if (upS.length) { const { error } = await sb.from(t.speed).upsert(upS, { onConflict: `${t.col},san_pham_id` }); if (error) throw error; }
      if (delS.length) { const { error } = await sb.from(t.speed).delete().in('id', delS); if (error) throw error; }
      await reload(); loadState(st.id); toast('Đã lưu sản phẩm và tốc độ'); draw();
    } catch (err) { toast(errText(err), 'danger'); }
  };
}

// ---------- Dây chuyền ----------
function dayChuyen(box, refresh) {
  const st = (dayChuyen.st = dayChuyen.st && dayChuyen.st.nm === S.nm ? dayChuyen.st : { nm: S.nm, sc: {}, kw: '' });
  const lines = ofNm('day_chuyen');
  box.innerHTML = `<section class="card"><div class="card-head"><div><div class="t-h2" data-title></div>
    <div class="t-cap">Một phiếu cho cả dây chuyền; mã lỗi theo từng máy. Một máy có thể thuộc nhiều dây chuyền (máy dùng chung): mỗi ca máy đó chỉ tính cho dây chuyền ghi phiếu trước. Máy không thuộc dây chuyền nào là máy đơn.</div></div>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm dây chuyền</button></div>
    <div class="filters" data-f style="margin-bottom:8px"></div><div class="list-cards" data-list></div></section>`;
  const kw = inputField({ label: 'Tìm dây chuyền', size: 'md', placeholder: 'Tên dây chuyền hoặc mã máy…', value: st.kw, onInput: (v) => { st.kw = noAccent(v); draw(); } });
  $('[data-f]', box).append(...scopeFields(st.sc, () => draw(), { dc: false }), kw);
  function draw() {
    const rows = lines.filter((l) => lineHop(l, st.sc)
      && (!st.kw || noAccent(`${l.ten} ${cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' ')}`).includes(st.kw)));
    $('[data-title]', box).textContent = `Dây chuyền (${rows.length === lines.length ? lines.length : `${rows.length} / ${lines.length}`})`;
    $('[data-list]', box).innerHTML = rows.map((l) => {
      const mem = cat.members(l.id);
      const last = cat.lastMay(l.id);
      const kvs = [...new Set(mem.map((x) => cat.name('khu_vuc', S.cat.byId.may[x.may_id]?.khu_vuc_id)).filter(Boolean))].join(', ');
      return `<div class="lc" data-edit="${l.id}"><div class="lc-row"><b>${esc(l.ten)}</b>${yes(l.hoat_dong)}</div>
        <div class="nn-row" style="padding:0;gap:6px">${mem.map((m) => `<span class="chip ${m.may_id === last ? 'dept' : ''}">${esc(cat.name('may', m.may_id, 'ma'))}${m.may_id === last ? ' · cuối' : ''}</span>`).join(icon('chevR', 14)) || '<span class="t-cap">Chưa gán máy</span>'}</div>
        <div class="t-cap">${kvs ? `${esc(kvs)} · ` : ''}${S.cat.day_chuyen_san_pham.filter((x) => x.day_chuyen_id === l.id).length} sản phẩm · ${S.cat.toc_do_day_chuyen.filter((x) => x.day_chuyen_id === l.id).length} tốc độ đã khai báo</div></div>`;
    }).join('') || `<div class="empty">${lines.length ? 'Không có dây chuyền nào khớp bộ lọc' : 'Chưa có dây chuyền'}</div>`;
  }
  draw();
  box.onclick = (e) => {
    if (e.target.closest('[data-add]')) return editLine({ nha_may_id: NMF || S.nm, ten: '', hoat_dong: true, thu_tu: lines.length + 1 }, []);
    const ed = e.target.closest('[data-edit]');
    if (ed) { const l = S.cat.byId.day_chuyen[ed.dataset.edit]; editLine(l, cat.members(l.id)); }
  };
  function editLine(line, members) {
    const v = { ...line, san_pham_id: null }; let mem = members.map((m) => ({ ...m }));
    const body = el('<div class="nn-stack" style="padding:0"><div class="form-grid" data-g></div><div class="t-h3">Các máy theo thứ tự chạy</div><div data-m></div><div data-addm></div></div>');
    $('[data-g]', body).append(inputField({ label: 'Tên dây chuyền', value: v.ten, req: true, size: 'md', onInput: (x) => { v.ten = x.trim(); } }));
    const act = el(`<label class="nn-row" style="padding:0;gap:8px"><input type="checkbox" ${v.hoat_dong ? 'checked' : ''} style="width:22px;height:22px"> Đang dùng</label>`);
    $('input', act).onchange = (e) => { v.hoat_dong = e.target.checked; };
    $('[data-g]', body).append(act);
    const drawM = () => {
      $('[data-m]', body).innerHTML = mem.map((m, i) => `<div class="stop"><div class="lc-row"><b>${i + 1}. ${esc(cat.mayLabel(m.may_id))}</b>
        <span><button class="nn-btn nn-btn-ghost nn-btn-sm" data-up="${i}" aria-label="Lên">▲</button><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${i}">${icon('trash', 14)}</button></span></div>
        <div class="nn-row" style="padding:4px 0 0"><label><input type="radio" name="last" data-last="${i}" ${m.la_may_cuoi ? 'checked' : ''}> Máy cuối chuyền (đếm sản lượng đạt)</label></div></div>`).join('') || '<div class="t-cap">Chưa có máy</div>';
    };
    drawM();
    const free = () => S.cat.may.filter((m) => m.nha_may_id === v.nha_may_id && !mem.some((x) => x.may_id === m.id));
    const freeOpts = () => free().map((m) => { const other = cat.linesOfMay(m.id).filter((l) => l.id !== v.id);
      return { value: m.id, label: `${m.ma} · ${m.ten}`, sub: other.length ? `Dùng chung — đang thuộc ${other.map((l) => l.ten).join(', ')}` : 'Máy đơn', group: other.length ? 'Máy đã thuộc dây chuyền khác (dùng chung)' : 'Máy đơn' }; })
      .sort((a, b) => a.group.localeCompare(b.group, 'vi'));
    const add = comboField({ label: 'Thêm máy vào dây chuyền (máy đã thuộc dây chuyền khác sẽ thành máy dùng chung)', size: 'md', options: freeOpts(),
      onChange: (x, fld) => { if (x) { mem.push({ may_id: x, la_may_cuoi: false }); drawM(); fld.setOptions(freeOpts(), ''); } } });
    $('[data-addm]', body).append(add);
    body.addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]'); if (up) { const i = +up.dataset.up; if (i > 0) { [mem[i - 1], mem[i]] = [mem[i], mem[i - 1]]; drawM(); } }
      const rm = e.target.closest('[data-rm]'); if (rm) { mem.splice(+rm.dataset.rm, 1); drawM(); add.setOptions(freeOpts(), ''); }
    });
    body.addEventListener('change', (e) => { if (e.target.dataset.last != null) mem.forEach((m, i) => { m.la_may_cuoi = i === +e.target.dataset.last; }); });
    const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu</button>`);
    const del = v.id ? el(`<button class="nn-btn nn-btn-danger nn-btn-lg">${icon('trash', 18)}Xóa</button>`) : null;
    const s = openSheet({ title: v.id ? 'Sửa dây chuyền' : 'Thêm dây chuyền', body, foot: [del, ok].filter(Boolean), wide: true });
    ok.onclick = async () => {
      if (!v.ten) return toast('Nhập tên dây chuyền', 'warning');
      if (mem.length && !mem.some((m) => m.la_may_cuoi)) mem[mem.length - 1].la_may_cuoi = true;
      // v1.4: bỏ dây chuyền tổng — không gửi các cột này (giữ nguyên dữ liệu cũ trong database)
      delete v.tong_id; delete v.la_cd_cuoi;
      try {
        const { data, error } = await sb.from('day_chuyen').upsert(v).select().single(); if (error) throw error;
        const { error: e0 } = await sb.from('day_chuyen_may').delete().eq('day_chuyen_id', data.id); if (e0) throw e0;
        if (mem.length) {
          const { error: e2 } = await sb.from('day_chuyen_may').insert(mem.map((m, i) => ({ day_chuyen_id: data.id, may_id: m.may_id, thu_tu: i + 1, la_may_cuoi: !!m.la_may_cuoi })));
          if (e2) throw e2;
        }
        await reload(); s.close(); toast('Đã lưu dây chuyền'); refresh();
      } catch (e) { toast(errText(e), 'danger'); }
    };
    if (del) del.onclick = async () => {
      if (!(await confirmBox('Xóa dây chuyền này? Phiếu dây chuyền đã ghi vẫn được giữ. Nếu chỉ muốn tạm dừng, bỏ chọn "Đang dùng".', { ok: 'Xóa', danger: true }))) return;
      const { error } = await sb.from('day_chuyen').delete().eq('id', v.id); if (error) return toast(errText(error), 'danger');
      await reload(); s.close(); refresh();
    };
  }
}

// ---------- Phân công: Ca × (Dây chuyền | Máy đơn) -> tổ trưởng, người vận hành ----------
// Phiếu dùng bảng này để tự điền tổ trưởng và lọc danh sách người vận hành theo ca + máy.
function phanCong(box) {
  const st = (phanCong.st = phanCong.st && phanCong.st.nm === S.nm ? phanCong.st : { nm: S.nm, ca: '', t: '' });
  const caNm = () => S.cat.byId.ca[st.ca]?.nha_may_id || NMF || S.nm;   // v1.7: nhà máy theo ca đang chọn
  const cas = ofNm('ca').filter((c) => c.hoat_dong);
  const targets = () => [
    ...dcOf(caNm()).map((l) => ({ value: `dc:${l.id}`, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → '), group: 'Dây chuyền' })),
    ...donOf(false, caNm()).map((m) => ({ value: `m:${m.id}`, label: `${m.ma} · ${m.ten}`, group: 'Máy đơn' })),
  ];
  const tOf = (v) => (v.startsWith('dc:') ? { day_chuyen_id: v.slice(3), may_id: null } : { may_id: v.slice(2), day_chuyen_id: null });
  const tLabel = (x) => (x.day_chuyen_id ? cat.name('day_chuyen', x.day_chuyen_id) : cat.mayLabel(x.may_id));
  const rowsOf = () => ofNm('phan_cong');
  if (!cas.some((c) => c.id === st.ca)) st.ca = cas[0]?.id || '';
  if (!targets().some((t) => t.value === st.t)) st.t = targets()[0]?.value || '';

  box.innerHTML = `<section class="card section"><div class="card-head"><div><div class="t-h2">Phân công theo ca</div>
    <div class="t-cap">Chọn ca và dây chuyền / máy đơn, rồi thêm tổ trưởng và người vận hành. Khi ghi phiếu, app tự điền tổ trưởng và chỉ gợi ý người vận hành được phân công (vẫn có nút "Xem tất cả" khi có người làm thay).</div></div></div>
    <div class="filters" data-f></div><div data-cur></div></section>
    <section class="card"><div class="card-head"><div class="t-h2" data-sumt></div></div><div data-sum></div></section>`;
  if (!S.cat.phan_cong) { $('[data-cur]', box).innerHTML = '<div class="empty">Chưa cập nhật database — chạy lại file supabase/01_schema.sql bản mới</div>'; return; }
  const fCa = selectField({ label: 'Ca', size: 'md', value: st.ca, options: cas.map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})${c.bo_phan_id ? ` · ${cat.name('bo_phan', c.bo_phan_id)}` : ''}${NMF ? '' : ` · ${nmName(c.nha_may_id)}`}` })),
    onChange: (v) => { st.ca = v; fT.setOptions(targets(), st.t = targets()[0]?.value || ''); drawCur(); } });
  const fT = comboField({ label: 'Dây chuyền / Máy đơn', size: 'md', value: st.t, allowClear: false, options: targets(), onChange: (v) => { st.t = v; drawCur(); } });
  $('[data-f]', box).append(fCa, fT);

  const list = (vt) => (st.ca && st.t ? rowsOf().filter((x) => x.ca_id === st.ca && x.vai_tro === vt && (x.day_chuyen_id || x.may_id) === tOf(st.t)[st.t.startsWith('dc:') ? 'day_chuyen_id' : 'may_id']) : []);
  const person = (n) => n ? `${esc(n.ho_ten)} <span class="t-cap">${esc(n.ma_nv)}</span>` : '<span class="t-cap">(đã xóa)</span>';

  function block(vt, title, roles) {
    const cur = list(vt);
    const wrap = el(`<div class="nn-field"><span class="nn-label">${esc(title)} (${cur.length})</span><div class="nn-stack" style="padding:0;gap:6px">
      ${cur.map((x) => `<div class="lc-row" style="padding:6px 10px;border:1px solid var(--line);border-radius:8px"><span>${person(S.cat.byId.nhan_su[x.nhan_su_id])}</span>
        <button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmpc="${x.id}" aria-label="Bỏ phân công">${icon('trash', 14)}</button></div>`).join('') || '<span class="t-cap">Chưa phân công</span>'}</div></div>`);
    const have = new Set(cur.map((x) => x.nhan_su_id));
    wrap.append(comboField({ label: `Thêm ${title.toLowerCase()}`, size: 'md', placeholder: '— Chọn người —',
      options: S.cat.nhan_su.filter((n) => n.hoat_dong && roles.includes(n.vai_tro) && (!n.nha_may_id || n.nha_may_id === caNm()) && !have.has(n.id)).map((n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · ${VAI_TRO[n.vai_tro]}${n.bo_phan_id ? ` · ${cat.name('bo_phan', n.bo_phan_id)}` : ''}` })),
      onChange: async (v) => {
        if (!v) return;
        const { error } = await sb.from('phan_cong').insert({ nha_may_id: caNm(), ca_id: st.ca, ...tOf(st.t), nhan_su_id: v, vai_tro: vt, thu_tu: cur.length + 1 });
        if (error) return toast(errText(error), 'danger');
        await reload(); drawCur(); drawSum();
      } }));
    return wrap;
  }

  function drawCur() {
    const c = $('[data-cur]', box);
    if (!st.ca || !st.t) { c.innerHTML = '<div class="empty">Chưa có ca hoặc dây chuyền / máy — khai báo ở các tab trước</div>'; return; }
    c.innerHTML = '<div class="form-grid" style="margin-top:12px"></div>';
    $('.form-grid', c).append(block('to_truong', 'Tổ trưởng', ['to_truong', 'quan_ly']), block('van_hanh', 'Người vận hành', ['van_hanh', 'to_truong']));
  }

  function drawSum() {
    const groups = new Map();
    for (const x of rowsOf()) {
      const key = `${x.ca_id}|${x.day_chuyen_id ? `dc:${x.day_chuyen_id}` : `m:${x.may_id}`}`;
      const g = groups.get(key) || { ca: x.ca_id, t: key.split('|')[1], x, tt: [], vh: [] };
      (x.vai_tro === 'to_truong' ? g.tt : g.vh).push(S.cat.byId.nhan_su[x.nhan_su_id]?.ho_ten || '?');
      groups.set(key, g);
    }
    const arr = [...groups.values()].sort((a, b) => cat.name('ca', a.ca).localeCompare(cat.name('ca', b.ca), 'vi') || tLabel(a.x).localeCompare(tLabel(b.x), 'vi', { numeric: true }));
    $('[data-sumt]', box).textContent = `Bảng phân công ${NMF ? nmName(NMF) : '— tất cả nhà máy'} (${arr.length})`;
    $('[data-sum]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Ca</th><th>Dây chuyền / Máy</th><th>Tổ trưởng</th><th>Người vận hành</th><th></th></tr></thead><tbody>
      ${arr.map((g) => `<tr><td>${esc(cat.name('ca', g.ca))}</td><td class="wrap">${esc(tLabel(g.x))}</td><td class="wrap">${esc(g.tt.join(', ') || '—')}</td><td class="wrap">${esc(g.vh.join(', ') || '—')}</td>
        <td><button class="nn-btn nn-btn-ghost nn-btn-sm" data-pick="${g.ca}|${g.t}">${icon('edit', 14)}Sửa</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Chưa có phân công nào</td></tr>'}</tbody></table></div>`;
  }

  box.onclick = async (e) => {
    const rm = e.target.closest('[data-rmpc]');
    if (rm) {
      const { error } = await sb.from('phan_cong').delete().eq('id', rm.dataset.rmpc);
      if (error) return toast(errText(error), 'danger');
      await reload(); drawCur(); drawSum(); return;
    }
    const pk = e.target.closest('[data-pick]');
    if (pk) {
      const [ca, t] = pk.dataset.pick.split('|');
      st.ca = ca; st.t = t; fCa.input.value = ca; fT.setValue(t); drawCur();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  drawCur(); drawSum();
}

// ---------- Cài đặt ----------
function caiDat(box) {
  const c = { nha_may_id: S.nm, ...cat.caiDat() };
  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2">Cài đặt nhà máy ${esc(nmName(S.nm))}</div></div><div class="form-grid" data-g></div><div class="nn-row" style="padding:16px 0 0" data-a></div></section>`;
  $('[data-g]', box).append(
    inputField({ label: 'Ngưỡng dừng ngắn', value: c.nguong_dung_ngan, unit: 'phút', inputmode: 'numeric', size: 'md', msg: 'Lần dừng dưới mức này tự xếp vào "Dừng ngắn / chạy không tải"', onInput: (v) => { c.nguong_dung_ngan = toNum(v); } }),
    inputField({ label: 'Cảnh báo lỗi quá hạn sau', value: c.gio_qua_han, unit: 'giờ', inputmode: 'numeric', size: 'md', msg: 'Lỗi chưa xử lý quá số giờ này được đánh dấu đỏ', onInput: (v) => { c.gio_qua_han = toNum(v); } }),
  );
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-md">${icon('pass', 18)}Lưu cài đặt</button>`);
  $('[data-a]', box).append(ok);
  ok.onclick = async () => {
    const { error } = await sb.from('cai_dat').upsert({ nha_may_id: S.nm, nguong_dung_ngan: c.nguong_dung_ngan || 5, gio_qua_han: c.gio_qua_han || 4 });
    if (error) return toast(errText(error), 'danger');
    await reload(); toast('Đã lưu cài đặt');
  };
}

