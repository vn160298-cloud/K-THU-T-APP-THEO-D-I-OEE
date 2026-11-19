// BÁO CÁO GIAO CA (biểu mẫu GMP01-BM03-v00) cho bộ phận Sản xuất / Đóng gói.
// 1 báo cáo / bộ phận + ngày + ca + kíp. Lưu nháp sửa thoải mái; bấm "Gửi báo cáo" là xong và khóa (v1.7 — không còn bước nhận ca).
// Sản xuất: Năng suất / Chất lượng / Máy móc tự lấy từ phiếu ghi nhận vận hành. Đóng gói: năng suất nhập theo từng xe SX (mẫu Excel
// "Báo cáo số lượng đóng gói"), Tổng SKU / Tổng chai-hũ tự tính theo Quy cách đóng gói.
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { loadCalc, groupEntries, entryLabel } from '../data.js';
import { esc, icon, today, addDays, hm, fmtNum, fmtDate, fmtDateTime, toInt, toNum, TINH_TRANG, isLoiKhac, GIAI_DOAN, LOI_KHAC, minutesBetween } from '../lib.js';
import { $, el, toast, selectField, rangeField, dateField, bindNum, segmented, multiField, confirmBox } from '../ui.js';
import { go, drawHeader } from '../app.js';
import { lsSet } from '../store.js';
import { askText, historyHtml } from './form.js';

const MA_BM = 'GMP01-BM03-v00';
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function render(main, { params, q = {} }) {
  if (!params[0]) return list(main, q.bp || '');
  return editor(main, params[0] === 'moi' ? null : params[0], q.bp || '');
}

const tieuDe = (g) => `${cat.name('bo_phan', g.bo_phan_id)} · ${fmtDate(g.ngay)} · ${cat.name('ca', g.ca_id)}${g.kip_id ? ` · ${cat.name('kip', g.kip_id)}` : ''}`;
const TT = {
  nhap: ['info', 'edit', 'Nháp'],
  da_gui: ['success', 'pass', 'Đã gửi'],
  da_nhan: ['success', 'lock', 'Đã nhận ca'],
};
const ttBadgeGC = (g) => { const [tone, ic, t] = TT[g.trang_thai] || TT.nhap; return `<span class="nn-status nn-tone-${tone}">${icon(ic, 14)}${t}</span>`; };
const dsNhanh = (loai) => (S.cat.ds_nhap_nhanh || []).filter((x) => x.loai === loai && x.hoat_dong).sort((a, b) => a.thu_tu - b.thu_tu).map((x) => x.ten);

// ================= DANH SÁCH =================
async function list(main, bp0) {
  const st = { from: addDays(today(), -6), to: today(), bp: cat.boPhan().some((b) => b.id === bp0) ? bp0 : '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Báo cáo giao ca</div><div class="muted">Biểu mẫu ${MA_BM} · Sản xuất / Đóng gói · Kỹ thuật</div></div>
    ${can.giaoCa() || (can.giaoCaKT() && cat.laKyThuat(st.bp)) ? `<a class="nn-btn nn-btn-primary nn-btn-lg" href="#/giao-ca/moi${st.bp ? `?bp=${st.bp}` : ''}">${icon('plus', 20)}Lập báo cáo giao ca</a>` : ''}</div>
    <div class="filters" data-f></div><div data-body></div>`;
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', value: st.bp, options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; load(); } }),
  );
  async function load() {
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    let q = sb.from('giao_ca').select('*').eq('nha_may_id', S.nm).gte('ngay', st.from).lte('ngay', st.to).order('ngay', { ascending: false });
    if (st.bp) q = q.eq('bo_phan_id', st.bp);
    const { data, error } = await q;
    if (error) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(error))}${/giao_ca/.test(error.message || '') ? ' — chạy lại file supabase/01_schema.sql bản mới' : ''}</div>`; return; }
    $('[data-body]', main).innerHTML = data.length ? `<div class="list-cards">${data.map((g) => `<a class="lc" href="#/giao-ca/${g.id}" style="text-decoration:none;color:inherit">
      <div class="lc-row"><b>${esc(tieuDe(g))}</b>${ttBadgeGC(g)}</div>
      <div class="t-cap">${g.luc_giao ? `Gửi: ${esc(cat.person(g.nguoi_giao) || '—')} · ${fmtDateTime(g.luc_giao)}` : `Nháp — ${esc(cat.person(g.nguoi_giao) || '')}`}</div>
      <div class="t-cap">${cat.laKyThuat(g.bo_phan_id) ? `${(g.kt?.may || []).filter((m) => m.trang_thai === 'hoat_dong').length} máy hoạt động · ${(g.kt?.su_co || []).length} sự cố${g.luc_nhan ? ` · Nhận ca: ${esc(cat.person(g.nguoi_nhan) || '')} ${fmtDateTime(g.luc_nhan)}` : ''}`
        : `${g.nang_suat.length} dòng năng suất · ${g.chat_luong.length} dòng lỗi · ${g.may_moc.length} lần dừng${g.da_hop ? ' · Đã họp giao ca' : ''}`}</div></a>`).join('')}</div>`
      : '<div class="empty">Chưa có báo cáo giao ca trong khoảng này</div>';
  }
  load();
}

// ================= CỘT CÁC BẢNG =================
// [khóa, nhãn, độ rộng tối thiểu (px), kiểu]: text (tự xuống dòng) | num | auto (tự tính) | date | sel:<danh sách>
const COLS = {
  ns_sx: [['nd', 'Nội dung / sản phẩm', 220], ['ke_hoach', 'SL kế hoạch', 90, 'num'], ['hoan_thanh', 'SL hoàn thành', 90, 'num'], ['con_lai', 'SL còn lại', 80, 'auto']],
  // v1.8: mã thành phẩm theo danh mục Quy cách đóng gói (file QUI CÁCH ĐÓNG GÓI); ngày SX mặc định = ngày đóng gói
  // v1.9: Ca / Ngày đóng gói / Nhà máy lấy theo báo cáo; Tên SP = tên BTP trong Quy cách (bỏ chữ "BTP"), Mã SP tự theo tên;
  // Quy cách = chọn tên thành phẩm của sản phẩm đó; Tổng SKU = Thùng × số TP / thùng + Lẻ (lẻ = số thành phẩm); Tổng số lượng = SKU × số BTP / TP
  ns_dg: [['ca_dg', 'Ca đóng gói', 60, 'auto'], ['ngay_dg', 'Ngày đóng gói', 90, 'auto'], ['ngay_sx', 'Ngày sản xuất', 130, 'date'], ['ma_sp_hien', 'Mã sản phẩm', 90, 'auto'],
    ['ma_sp', 'Tên sản phẩm', 190, 'sel:btp'], ['ma_lo', 'Mã lô', 70], ['stt_xe', 'STT xe SX', 70, 'sel:stt'], ['kip_sx', 'Kíp SX', 90, 'sel:kip'], ['ma_tp', 'Quy cách đóng gói', 210, 'sel:tpsp'],
    ['thung', 'Thùng', 70, 'num'], ['le', 'Lẻ', 60, 'num'], ['tong_sku', 'Tổng SKU', 80, 'auto'], ['tong_chai', 'Tổng số lượng', 90, 'auto'], ['nha_may', 'Nhà máy', 100, 'auto']],
  // v1.8: lỗi sản phẩm (chuyển từ phiếu sang) — mỗi giai đoạn 1 bảng; tên lỗi chọn trong danh mục hoặc gõ tay
  // v1.10: lỗi trong quá trình đóng gói ghi giống lỗi trong quá trình sản xuất (cl_sx)
  cl_sx: [['sp', 'Sản phẩm', 170, 'sel:spca'], ['loi', 'Lỗi', 200, 'list:loi'], ['sl', 'SL lỗi', 80, 'num'], ['ghi_chu', 'Ghi chú', 160]],
  // v1.10: lỗi nguyên liệu trước sản xuất — truy nguồn gốc (lô, ngày nhập, ngày SX của chai, nắp…); 1 dòng nhiều lỗi, mỗi lỗi 1 số lượng
  cl_nl: [['loai_nl', 'Loại NL / bao bì', 130, 'list:loai_nl'], ['ncc', 'Nhà cung cấp', 140], ['lo_nl', 'Lô NL', 90], ['ngay_nhap', 'Ngày nhập', 130, 'date'],
    ['ngay_sx_nl', 'Ngày SX của NL', 130, 'date'], ['sp', 'Sản phẩm đang chạy', 170, 'sel:sp'], ['loi_ds', 'Lỗi · số lượng', 290, 'loids'], ['tong_loi', 'Tổng SL lỗi', 80, 'auto'], ['ghi_chu', 'Ghi chú', 150]],
  // v1.10: QA đầu vào đóng gói theo file "CÁC LOẠI LỖI VÀ CÁCH GHI CHO QC ĐẦU VÀO ĐÓNG GÓI": yến lon (mẻ pha chế) / yến chai (mã lô, số lớp trên xe).
  // Loại lon / chai theo Danh mục → Sản phẩm; danh sách lỗi theo loại (Danh mục → Danh sách nhập nhanh)
  cl_qa: [['ngay_dg', 'Ngày đóng gói', 90, 'auto'], ['ngay_sx', 'Ngày SX', 130, 'date'], ['ma_sp_hien', 'Mã SP', 80, 'auto'], ['ma_sp', 'Tên sản phẩm', 190, 'sel:btp'],
    ['loai_bb', 'Loại', 60, 'auto'], ['ma_lo', 'Mã lô / Mẻ pha chế', 90], ['stt_xe', 'STT xe SX', 80, 'list:stt'], ['kip_sx', 'Kíp SX', 90, 'sel:kip'],
    ['so_lop', 'Số lớp trên xe', 70, 'dec'], ['tong_kiem', 'SL tổng kiểm', 90, 'num'], ['loi_ds', 'Lỗi · số lượng', 290, 'loids'], ['tong_loi', 'Tổng lỗi', 70, 'auto'],
    ['ty_le', 'Tỷ lệ lỗi', 70, 'auto'], ['ghi_chu', 'Ghi chú', 140]],
  // v1.10: người vắng / tăng ca chọn theo danh mục Nhân sự theo ca (lọc nhà máy + bộ phận + ca) hoặc gõ tay
  vg: [['ns', 'Người vắng', 200, 'list:nsca'], ['loai', 'Hình thức', 150, 'sel:vang'], ['so_gio', 'Số giờ nghỉ', 80, 'dec'], ['ly_do', 'Lý do', 160]],
  mm: [['tb', 'Line / thiết bị', 180], ['loi', 'Tình trạng / lỗi', 180], ['gio', 'Khung giờ', 100], ['phut', 'Dừng (phút)', 70, 'num'], ['xu_ly', 'Xử lý', 110]],
  tc: [['ns', 'Người tăng ca', 200, 'list:nsca'], ['gio', 'Số giờ', 80, 'listdec:gio_tc'], ['ly_do', 'Lý do tăng ca', 200, 'list:ly_do_tang_ca'], ['ghi_chu', 'Ghi chú (bắt buộc khi lý do khác)', 180]],
  // v1.12: kỷ luật lao động theo từng người — 1 người nhiều lỗi
  kl: [['ns', 'Người vi phạm', 200, 'list:nsca'], ['loi', 'Lỗi vi phạm', 300, 'chk:loi_ky_luat'], ['ghi_chu', 'Ghi chú (bắt buộc khi lỗi khác)', 200]],
};
const TONG = { ns_sx: [['hoan_thanh', 'SL hoàn thành']], ns_dg: [['thung', 'Thùng'], ['tong_sku', 'SKU'], ['tong_chai', 'Chai/hũ']], cl_sx: [['sl', 'SL lỗi']], cl_nl: [['tong_loi', 'SL lỗi']], cl_qa: [['tong_kiem', 'Tổng kiểm'], ['tong_loi', 'SL lỗi']], mm: [['phut', 'Dừng (phút)']], tc: [['gio', 'Giờ tăng ca']], kl: [], vg: [['so_gio', 'Giờ nghỉ']] };
const VANG = { ca_ngay: 'Nghỉ cả ngày', nua_buoi: 'Nghỉ nửa buổi', gio: 'Xin nghỉ theo giờ' };
/** 2 giai đoạn lỗi theo bộ phận */
const gdOf = (dg) => (dg ? ['qc_dau_vao', 'dong_goi'] : ['nguyen_lieu', 'san_xuat']);

/** Lấy số từ các phiếu ghi nhận vận hành của bộ phận + ngày + ca (+ kíp). Đóng gói: năng suất nhập theo xe nên không ghi đè. */
async function tuPhieu(g) {
  const dg = cat.laDongGoi(g.bo_phan_id);
  const rows = (await loadCalc(g.ngay, g.ngay, { force: true }))
    .filter(({ p }) => p.bo_phan_id === g.bo_phan_id && p.ca_id === g.ca_id && (!g.kip_id || !p.kip_id || p.kip_id === g.kip_id));
  const ns = [], cl = [], mm = [];
  for (const e of groupEntries(rows)) {
    const { p, c } = e.rep;
    const sp = cat.name('san_pham', p.san_pham_id) || 'Chưa chọn sản phẩm', ten = entryLabel(e);
    if (!dg) ns.push({ nd: `${sp} — ${ten}`, ke_hoach: p.sl_ke_hoach ?? null, hoan_thanh: c.good ?? null });
    const loi = (p.loi_sp || []).length ? p.loi_sp : ((+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) ? [{ ten: 'Lỗi (chưa phân loại)', so_luong: (+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) }] : []);
    const maSp = S.cat.byId.san_pham[p.san_pham_id]?.ma || '';
    for (const x of loi) cl.push({ gd: gdOf(dg)[1], sp: maSp, loi: x.ten === 'Lỗi (chưa phân loại)' ? 'Lỗi (chưa phân loại) — từ phiếu' : x.ten, sl: x.so_luong, ghi_chu: x.ghi_chu || '' });
    for (const ch of e.children) for (const s of (ch.p.dung_may || []).filter((x) => x.goc !== false).sort((a, b) => (a.gio_bd > b.gio_bd ? 1 : -1))) {
      mm.push({ tb: cat.mayLabel(ch.p.may_id), loi: s.ten_loi || '', gio: `${hm(s.gio_bd)}–${hm(s.gio_kt)}`, phut: s.phut ?? null, xu_ly: TINH_TRANG[s.tinh_trang]?.label || '' });
    }
  }
  return { nang_suat: dg ? null : ns, chat_luong: cl, may_moc: mm, so_phieu: groupEntries(rows).length };
}

// ================= LẬP / XEM BÁO CÁO =================
async function editor(main, id, bp0 = '') {
  let g;
  if (id) {
    const { data, error } = await sb.from('giao_ca').select('*').eq('id', id).maybeSingle();
    if (error || !data) { main.innerHTML = `<div class="empty">${esc(error ? errText(error) : 'Không tìm thấy báo cáo giao ca')}</div>`; return; }
    g = data;
    if (cat.laKyThuat(g.bo_phan_id)) return (await import('./giaoca_kt.js')).editorKT(main, g);
  } else {
    if (cat.laKyThuat(bp0)) return (await import('./giaoca_kt.js')).editorKT(main, null, bp0);
    if (!can.giaoCa()) { main.innerHTML = '<div class="empty">Chỉ tổ trưởng, quản lý hoặc admin được lập báo cáo giao ca</div>'; return; }
    const bp = cat.boPhan().some((b) => b.id === bp0) ? bp0 : S.profile.bo_phan_id && cat.boPhan().some((b) => b.id === S.profile.bo_phan_id) ? S.profile.bo_phan_id : cat.boPhan()[0]?.id || '';
    g = { ngay: today(), ca_id: '', kip_id: '', bo_phan_id: bp, nha_may_id: S.nm, trang_thai: 'nhap', nang_suat: [], chat_luong: [], may_moc: [], con_nguoi: {}, ve_sinh: {}, can_chu_y: '', da_hop: false };
  }
  g.con_nguoi ||= {}; g.ve_sinh ||= {};
  const cn = g.con_nguoi;
  cn.tang_ca ||= []; cn.ky_luat ||= 'tot'; cn.ky_luat_loi ||= []; cn.ky_luat_nguoi ||= []; cn.vang_ds ||= [];
  // v1.8: lỗi sản phẩm tách 2 bảng theo giai đoạn (dòng cũ chưa có giai đoạn -> bảng "trong quá trình")
  const splitCL = () => {
    const [a, b] = gdOf(cat.laDongGoi(g.bo_phan_id));
    // v1.10: bảng giai đoạn 1 (NL / QA đầu vào) ghi nhiều lỗi trên 1 dòng -> chuyển dòng cũ (1 lỗi / dòng) sang danh sách lỗi
    g.loi1 = (g.chat_luong || []).filter((r) => r.gd === a).map((r) => (r.loi_ds ? r : { ...r, ma_sp: r.ma_sp || r.sp, loi_ds: r.loi ? [{ loi: r.loi, sl: r.sl ?? null }] : [] }));
    g.loi2 = (g.chat_luong || []).filter((r) => r.gd !== a).map((r) => ({ ...r, gd: b }));
  };
  splitCL();
  const tenNs = (x) => (S.cat.byId.nhan_su?.[x] ? cat.person(x) : x);
  cn.vang_ds.forEach((r) => { r.ns = tenNs(r.ns); }); cn.tang_ca.forEach((r) => { r.ns = tenNs(r.ns); }); cn.ky_luat_nguoi = cn.ky_luat_nguoi.map(tenNs);
  // v1.12: kỷ luật ghi theo từng người (mỗi người nhiều lỗi, ghi chú riêng). Báo cáo cũ (gom chung) -> mỗi người 1 dòng cùng các lỗi đã chọn
  if (!Array.isArray(cn.ky_luat_ds)) {
    cn.ky_luat_ds = cn.ky_luat_nguoi.length ? cn.ky_luat_nguoi.map((ns) => ({ ns, loi: [...cn.ky_luat_loi], ghi_chu: cn.ky_luat_ghi_chu || '' }))
      : cn.ky_luat_loi.length ? [{ ns: '', loi: [...cn.ky_luat_loi], ghi_chu: cn.ky_luat_ghi_chu || '' }] : [];
  }
  (g.nang_suat || []).forEach((r) => { if (!r.ma_sp && r.ma_tp) r.ma_sp = tpOf(r.ma_tp)?.ma_btp || ''; });
  let nm = g.nha_may_id || S.nm;
  const canEdit = can.giaoCa() && (!id || g.trang_thai === 'nhap');
  const logs = id ? ((await sb.from('nhat_ky').select('*').eq('phieu_id', id).order('luc', { ascending: false }).limit(100)).data || []) : [];

  // --- danh sách chọn
  const qcList = () => (S.cat.quy_cach || []).filter((q) => q.nha_may_id === nm && q.hoat_dong);
  const spList = () => S.cat.san_pham.filter((p) => p.nha_may_id === nm && p.hoat_dong);
  const nsList = () => S.cat.nhan_su.filter((n) => n.hoat_dong && n.nha_may_id === nm)
    .sort((a, b) => (a.bo_phan_id === g.bo_phan_id ? 0 : 1) - (b.bo_phan_id === g.bo_phan_id ? 0 : 1) || a.ho_ten.localeCompare(b.ho_ten, 'vi'));
  /** v1.10: nhân sự theo ca (Danh mục → Nhân sự theo ca) lọc nhà máy + bộ phận + ca; chưa khai thì dùng danh sách tài khoản */
  const nsCa = () => {
    const ds = (S.cat.nhan_su_ca || []).filter((n) => n.hoat_dong && n.nha_may_id === nm && n.bo_phan_id === g.bo_phan_id);
    const theoCa = ds.filter((n) => !n.ca_id || n.ca_id === g.ca_id);
    const list = (theoCa.length ? theoCa : ds).sort((a, b) => (a.thu_tu - b.thu_tu) || a.ho_ten.localeCompare(b.ho_ten, 'vi')).map((n) => (n.ma_nv ? `${n.ho_ten} - ${n.ma_nv}` : n.ho_ten));
    // v1.11: thêm tài khoản app đúng bộ phận + ca (tab Nhân sự có cột Ca)
    const tk = nsList().filter((n) => cat.hopNhom(n, { bp: g.bo_phan_id, ca: g.ca_id }) && (n.bo_phan_id || n.ca_id)).map((n) => `${n.ho_ten} - ${n.ma_nv}`);
    const gop = [...new Set([...list, ...tk])];
    return gop.length ? gop : nsList().map((n) => n.ho_ten);
  };
  /** Loại bao bì của sản phẩm (mã BTP): Danh mục → Sản phẩm; chưa khai thì đoán theo ĐVT / tên có chữ "lon" */
  const loaiBB = (ma) => {
    if (!ma) return '';
    const sp = S.cat.san_pham.find((x) => x.ma === ma && x.nha_may_id === nm) || S.cat.san_pham.find((x) => x.ma === ma);
    if (sp?.loai_bao_bi) return sp.loai_bao_bi;
    const q = (S.cat.quy_cach_tp || []).find((x) => x.ma_btp === ma);
    return /^lon$/i.test(String(q?.dvt_btp || sp?.dvt || '').trim()) || /(^|\s)lon(\s|$)/i.test(btpName(ma)) ? 'lon' : 'chai';
  };
  /** v1.12: đổi nhà máy (admin tổng): bộ phận / ca / kíp lấy theo tên tương ứng ở nhà máy mới */
  const kipList = () => (can.adminTong() ? (S.cat.kip || []).filter((k) => k.hoat_dong).sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0)) : cat.kip(nm));
  function doiNM(v) {
    if (!v || v === nm) return;
    const bpTen = cat.name('bo_phan', g.bo_phan_id), caTen = cat.name('ca', g.ca_id);
    nm = v; g.nha_may_id = v; S.nm = v; lsSet('nm', v); drawHeader();
    g.bo_phan_id = cat.boPhan().find((b) => b.ten === bpTen)?.id || cat.boPhan()[0]?.id || '';
    g.ca_id = cat.ca(g.bo_phan_id).find((c) => c.ten === caTen)?.id || ''; g.kip_id = '';
  }
  const nmField = () => (can.adminTong() && !id && S.cat.nha_may.filter((n) => n.hoat_dong).length > 1
    ? selectField({ label: 'Nhà máy', value: nm, req: true, options: S.cat.nha_may.filter((n) => n.hoat_dong).map((n) => ({ value: n.id, label: n.ten })),
      onChange: async (v) => { doiNM(v); g.nang_suat = []; g.chat_luong = []; splitCL(); await napSpCa(); build(); } })
    : el(`<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:40px">${esc(cat.name('nha_may', nm))}</span></div>`));
  const SEL = {
    sp: () => spList().map((p) => [p.ma, `${p.ma} · ${p.ten}`]),
    // v1.12: lỗi trong quá trình: chỉ sản phẩm có phiếu ghi nhận vận hành của ngày + ca + bộ phận này (chưa có phiếu nào thì hiện tất cả)
    spca: () => { const all = spList().map((p) => [p.ma, `${p.ma} · ${p.ten}`]); return spCa.size ? all.filter(([m]) => spCa.has(m)) : all; },
    kip: () => cat.kip(nm).map((k) => [k.ten, k.ten]),
    loi_ky_luat: () => [...new Set([...dsNhanh('loi_ky_luat'), ...cn.ky_luat_ds.flatMap((r) => r.loi || [])])].map((x) => [x, x]),
    qc: () => qcList().map((q) => [q.ten, `${q.ten} (${+q.sku_thung}×${+q.chai_sku})`]),
    ns: () => nsList().map((n) => [n.id, `${n.ho_ten} · ${n.ma_nv}`]),
    tp: () => (S.cat.quy_cach_tp || []).filter((q) => q.hoat_dong).map((q) => [q.ma_tp, `${q.ma_tp} · ${q.ten_tp}`]),
    btp: () => { const all = btpList(); return [...all.filter(([m]) => spCa.has(m)).map(([m, t]) => [m, `★ ${t}`]), ...all.filter(([m]) => !spCa.has(m))]; },
    stt: () => Array.from({ length: 100 }, (_, i) => [String(i + 1), String(i + 1)]),
    tpsp: (r) => (S.cat.quy_cach_tp || []).filter((q) => q.hoat_dong && (!r?.ma_sp || q.ma_btp === r.ma_sp)).map((q) => [q.ma_tp, q.ten_tp]),
    vang: () => Object.entries(VANG),
  };
  const tpOf = (ma) => (S.cat.quy_cach_tp || []).find((q) => q.ma_tp === ma);
  /** Sản phẩm (BTP) trong Quy cách đóng gói: [mã, tên bỏ chữ "BTP"] */
  const btpName = (ma) => { const q = (S.cat.quy_cach_tp || []).find((x) => x.ma_btp === ma); return q ? String(q.ten_btp || '').replace(/^BTP\s+/i, '') : cat.name('san_pham', S.cat.san_pham.find((x) => x.ma === ma)?.id) || ma; };
  const btpList = () => [...new Set((S.cat.quy_cach_tp || []).filter((q) => q.hoat_dong && q.ma_btp).map((q) => q.ma_btp))].map((m) => [m, btpName(m)]).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  // Sản phẩm đã ghi trong phiếu ghi nhận vận hành của ngày + ca + bộ phận này -> hiện lên đầu danh sách (★)
  let spCa = new Set();
  async function napSpCa() {
    try {
      const rows = g.ngay && g.ca_id ? await loadCalc(g.ngay, g.ngay, { nm }) : [];
      spCa = new Set(rows.filter(({ p }) => p.ca_id === g.ca_id && p.bo_phan_id === g.bo_phan_id).map(({ p }) => S.cat.byId.san_pham[p.san_pham_id]?.ma).filter(Boolean));
    } catch { spCa = new Set(); }
  }
  /** Danh sách gõ nhanh (datalist): lỗi theo giai đoạn của bảng, lý do tăng ca */
  const LISTS = {
    loi: (gd) => [...new Set([...(S.cat.loi_san_pham || []).filter((l) => l.hoat_dong && (l.giai_doan || 'san_xuat') === gd
      && S.cat.byId.san_pham[l.san_pham_id]?.nha_may_id === nm).map((l) => l.ten), LOI_KHAC.ten])],
    ly_do_tang_ca: () => { const ds = dsNhanh('ly_do_tang_ca'); return ds.some((x) => isLoiKhac(x)) ? ds : [...ds, 'Lý do khác']; },
    nsca: () => nsCa(),
    stt: () => Array.from({ length: 100 }, (_, i) => String(i + 1)),
    gio_tc: () => Array.from({ length: 16 }, (_, i) => String((i + 1) / 2).replace('.', ',')),
    loai_nl: () => dsNhanh('loai_nguyen_lieu'),
  };
  /** Danh sách lỗi cho ô nhiều lỗi: QA đầu vào theo lon / chai; nguyên liệu theo danh mục lỗi sản phẩm */
  // v1.11: lỗi QA đầu vào = Lỗi sản phẩm (giai đoạn QA đầu vào) của chính sản phẩm; chưa khai thì dùng bộ lỗi của sản phẩm cùng loại Lon / Chai
  const loiVar = (k, r) => (k === 'cl_qa' ? `sp${String(r.ma_sp || '').replace(/[^\w-]/g, '_')}` : 'nl');
  const loiQA = (ma) => {
    const ten = (ds) => [...new Set([...ds.sort((a, b) => a.thu_tu - b.thu_tu).map((l) => l.ten), LOI_KHAC.ten])];
    const qa = (S.cat.loi_san_pham || []).filter((l) => l.hoat_dong && l.giai_doan === 'qc_dau_vao');
    const sp = S.cat.san_pham.find((x) => x.ma === ma && x.nha_may_id === nm);
    const rieng = sp ? qa.filter((l) => l.san_pham_id === sp.id) : [];
    if (rieng.length) return ten(rieng);
    const loai = loaiBB(ma) || 'chai';
    return ten(qa.filter((l) => { const p = S.cat.byId.san_pham[l.san_pham_id]; return p && p.nha_may_id === nm && loaiBB(p.ma) === loai; }));
  };
  const maNM = () => (S.cat.byId.nha_may[nm]?.ma || '').slice(0, 1);
  /** Tự tính các ô "auto" của 1 dòng */
  const AUTO = {
    con_lai: (r) => (r.ke_hoach != null && r.hoan_thanh != null ? (+r.ke_hoach || 0) - (+r.hoan_thanh || 0) : null),
    ca_dg: () => cat.name('ca', g.ca_id).replace(/^Ca\s*/i, ''),
    ngay_dg: () => (g.ngay ? fmtDate(g.ngay) : ''),
    ten_tp: (r) => tpOf(r.ma_tp)?.ten_tp || '',
    ma_sp_hien: (r) => r.ma_sp || tpOf(r.ma_tp)?.ma_btp || '',
    quy_cach: (r) => { const q = tpOf(r.ma_tp); return q ? [q.quy_cach_dong, q.quy_cach_thung].filter(Boolean).join(' · ') : ''; },
    // Tổng SKU (thành phẩm) = Thùng × số TP / thùng + Lẻ; Tổng chai/hũ = SKU × số BTP / 1 TP
    tong_sku: (r) => { const q = tpOf(r.ma_tp); return q && (r.thung != null || r.le != null) ? (+r.thung || 0) * (+q.sl_tp_thung || 0) + (+r.le || 0) : null; },
    tong_chai: (r) => { const q = tpOf(r.ma_tp); const sku = AUTO.tong_sku(r); return q && sku != null ? sku * (+q.sl_btp_tp || 1) : null; },
    nha_may: () => cat.name('nha_may', nm),
    loai_bb: (r) => ({ lon: 'Lon', chai: 'Chai' })[loaiBB(r.ma_sp)] || '',
    tong_loi: (r) => { const ds = (r.loi_ds || []).filter((x) => x.sl != null); return ds.length ? ds.reduce((a, x) => a + (+x.sl || 0), 0) : null; },
    ty_le: (r) => { const t = AUTO.tong_loi(r); return t != null && +r.tong_kiem > 0 ? `${fmtNum((t / r.tong_kiem) * 100, 2)}%` : ''; },
  };
  const dinhBien = () => {
    const ds = (S.cat.dinh_bien || []).filter((d) => d.hoat_dong && d.bo_phan_id === g.bo_phan_id && d.ca_id === g.ca_id);
    return (ds.find((d) => g.kip_id && d.kip_id === g.kip_id) || ds.find((d) => !d.kip_id))?.so_nguoi ?? null;
  };

  function build() {
    const dg = cat.laDongGoi(g.bo_phan_id);
    const locked = !canEdit;
    main.innerHTML = `<div class="page-head"><div><div class="t-page">Báo cáo giao ca — ${esc(cat.name('bo_phan', g.bo_phan_id) || '')}</div>
      <div class="muted">Biểu mẫu ${MA_BM}${g.luc_giao ? ` · Gửi: ${esc(cat.person(g.nguoi_giao) || '')} · ${fmtDateTime(g.luc_giao)}` : ''}</div></div>
      <div class="nn-row" style="padding:0">${id ? ttBadgeGC(g) : ''}<a class="nn-btn nn-btn-ghost nn-btn-md no-print" href="#/giao-ca${g.bo_phan_id ? `?bp=${g.bo_phan_id}` : ''}">${icon('chevL', 18)}Danh sách</a></div></div>
      ${id && locked && g.trang_thai !== 'nhap' ? `<div class="nn-alert nn-alert-info section"><span class="nn-alert-icon nn-tone-info">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Báo cáo đã gửi và khóa. Muốn sửa: quản lý / admin bấm Mở khóa kèm lý do (ghi nhật ký).</div></div></div>` : ''}
      <section class="card section"><div class="form-grid" data-head></div></section>
      ${sec(1, 'Năng suất', dg ? 'Số lượng đóng gói theo từng xe SX' : 'Số lượng?', 'ns')}
      <section class="card section"><div class="card-head"><div class="t-h2">2. Chất lượng <span class="t-cap">(Hàng lỗi?)</span></div></div>
        ${gdOf(dg).map((gd, k) => `<div class="t-h3" style="margin:${k ? 16 : 0}px 0 8px">${esc(GIAI_DOAN[gd].label)} <span class="chip" data-tong="cl${k + 1}"></span></div><div data-tb="cl${k + 1}"></div>
          ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="cl${k + 1}" style="margin-top:8px">${icon('plus', 16)}Thêm lỗi</button>` : ''}`).join('')}
        <p class="t-cap" style="margin-top:8px">Mỗi dòng ${dg ? 'QA đầu vào' : 'nguyên liệu'} ghi được nhiều lỗi: bấm “+ lỗi” để thêm loại lỗi và số lượng.
          ${dg ? 'Cột và danh sách lỗi theo loại Lon / Chai của sản phẩm (Danh mục → Sản phẩm); danh sách lỗi sửa ở Danh mục → Danh sách nhập nhanh.' : 'Tên lỗi chọn trong danh sách (Danh mục → Lỗi sản phẩm) hoặc gõ tay.'}
          “${esc(LOI_KHAC.ten)}” bắt buộc ghi chú.</p></section>
      <section class="card section"><div class="card-head"><div class="t-h2">3. Con người</div></div><div class="form-grid" data-cn></div>
        <div class="t-h3" style="margin:16px 0 8px">Người vắng <span class="chip" data-tong="vg"></span></div><div data-tb="vg"></div>
        ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="vg" style="margin-top:8px">${icon('plus', 16)}Thêm người vắng</button>` : ''}
        <div class="t-h3" style="margin:16px 0 8px">Tăng ca <span class="chip" data-tong="tc"></span></div><div data-tb="tc"></div>
        ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="tc" style="margin-top:8px">${icon('plus', 16)}Thêm người tăng ca</button>` : ''}
        <div class="t-h3" style="margin:16px 0 8px">Kỷ luật lao động</div><div class="form-grid" data-kl></div></section>
      ${sec(4, 'Máy móc', 'Tình trạng?', 'mm')}
      <section class="card section"><div class="card-head"><div class="t-h2">5. Vệ sinh — 5S</div></div><div class="form-grid" data-vs></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">6. Cần chú ý?</div></div><div data-ccy></div>
        <label class="nn-row" style="padding:12px 0 0;gap:8px"><input type="checkbox" data-hop ${g.da_hop ? 'checked' : ''} ${canEdit ? '' : 'disabled'} style="width:22px;height:22px">
        <span><b>Đã họp giao ca</b> — họp ở nhà ăn, theo mô hình vòng tròn.</span></label></section>
      <section class="card section no-print action-bar"><div class="nn-row" style="padding:0;justify-content:flex-end" data-act></div></section>
      ${id ? historyHtml(logs, []) : ''}`;

    // --- đầu phiếu
    const head = $('[data-head]', main);
    head.append(
      dateField({ label: 'Ngày', value: g.ngay, req: true, onChange: async (v) => { g.ngay = v; await napSpCa(); build(); } }),
      selectField({ label: 'Ca', value: g.ca_id, req: true, placeholder: '— Chọn ca —', options: cat.ca(g.bo_phan_id).map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})` })), onChange: async (v) => { g.ca_id = v; await napSpCa(); build(); } }),
      selectField({ label: 'Kíp', value: g.kip_id || '', placeholder: '— Chọn kíp —', options: kipList().map((k) => ({ value: k.id, label: `${k.ten}${k.nha_may_id !== nm ? ` · ${cat.name('nha_may', k.nha_may_id)}` : ''}${k.ca_id ? ` · ${cat.name('ca', k.ca_id)}` : ''}` })),
        onChange: async (v) => {
          // v1.12: chọn kíp -> tự điền nhà máy + ca của kíp (ca phải thuộc bộ phận đang chọn)
          const k = S.cat.byId.kip?.[v];
          if (k && k.nha_may_id !== nm) doiNM(k.nha_may_id);
          g.kip_id = v;
          if (k?.ca_id && cat.ca(g.bo_phan_id).some((c) => c.id === k.ca_id)) g.ca_id = k.ca_id;
          await napSpCa(); build();
        } }),
      selectField({ label: 'Bộ phận', value: g.bo_phan_id, req: true, options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })),
        onChange: (v) => { if (v === g.bo_phan_id) return;
          if (cat.laKyThuat(v)) return import('./giaoca_kt.js').then((m) => m.editorKT(main, null, v));
          g.bo_phan_id = v; g.nang_suat = []; g.chat_luong = []; splitCL(); napSpCa().then(build); } }),
      nmField(),
    );
    if (canEdit) head.append(el(`<div class="nn-field span-2"><button class="nn-btn nn-btn-secondary nn-btn-md" data-fill>${icon('sync', 18)}Lấy số từ phiếu ghi nhận vận hành của ca này</button>
      <span class="nn-field-msg">Tự điền ${dg ? 'Chất lượng, Máy móc' : 'Năng suất, Chất lượng, Máy móc'} từ các phiếu đã ghi (đúng bộ phận, ngày, ca, kíp). Sửa / thêm dòng được sau đó.</span></div>`));
    $$('[data-head] input, [data-head] select', main).forEach((x) => { x.disabled = !canEdit; });

    // --- bảng
    tbl('ns', dg ? 'ns_dg' : 'ns_sx', 'nang_suat');
    tbl('cl1'); tbl('cl2'); tbl('vg');
    tbl('mm', 'mm', 'may_moc');
    tbl('tc', 'tc', null);

    // --- con người: định biên (khóa) -> có mặt -> vắng tự trừ; điều động mượn / cho mượn -> thực tế đứng máy
    const db = dinhBien();
    if (canEdit) cn.dinh_bien = db;
    const bc = $('[data-cn]', main);
    const ro = (label, val, msg) => el(`<div class="nn-field"><span class="nn-label">${esc(label)}</span><div class="nn-input-wrap nn-input-md auto-fill"><input class="nn-input" readonly value="${esc(val ?? '')}" data-ro="${esc(label)}"></div>${msg ? `<div class="nn-field-msg">${msg}</div>` : ''}</div>`);
    const num = (label, k, msg, req) => { const f = el(`<div class="nn-field"><label class="nn-label ${req ? 'req' : ''}">${esc(label)}</label><div class="nn-input-wrap nn-input-md"><input class="nn-input" inputmode="numeric" value="${esc(cn[k] ?? '')}" ${canEdit ? '' : 'disabled'}></div>${msg ? `<div class="nn-field-msg">${msg}</div>` : ''}</div>`);
      const i = $('input', f); bindNum(i, 'int'); i.oninput = () => { cn[k] = toInt(i.value); paintCN(); }; return f; };
    bc.append(
      ro('Định biên', cn.dinh_bien, db == null && canEdit ? 'Chưa khai định biên cho bộ phận + ca + kíp này (Danh mục → Định biên)' : 'Tự điền theo ca / kíp'),
      cn.dinh_bien != null ? ro('Sĩ số có mặt', '', 'Tự tính = Định biên − Vắng cả ngày') : num('Sĩ số có mặt', 'co_mat', 'Chưa khai định biên nên nhập tay', true),
      ro('Vắng mặt', '', 'Số người nghỉ cả ngày (chọn ở bảng Người vắng)'),
    );
    paintCNref = paintCN;
    function paintCN() {
      const vang = cn.vang_ds.filter((r) => r.ns && r.loai === 'ca_ngay').length;
      if (cn.dinh_bien != null) { cn.co_mat = cn.dinh_bien - vang; const f = $('[data-ro="Sĩ số có mặt"]', main); if (f) f.value = cn.co_mat; }
      cn.vang = vang; cn.thuc_te = cn.co_mat ?? null;
      cn.gio_vang = cn.vang_ds.reduce((a, r) => a + (r.loai === 'gio' ? +r.so_gio || 0 : r.loai === 'nua_buoi' ? caGio() / 2 : 0), 0);
      $('[data-ro="Vắng mặt"]', main).value = vang ?? '';
    }
    paintCN();

    // --- kỷ luật: Tốt / Có vi phạm -> chọn lỗi (danh sách thêm bớt được), người vi phạm, ghi chú (bắt buộc nếu lỗi khác)
    const kl = $('[data-kl]', main);
    const seg = el('<div class="nn-field span-2"></div>');
    seg.append(segmented([{ value: 'tot', label: 'Tốt' }, { value: 'vi_pham', label: 'Có vi phạm' }], cn.ky_luat, (v) => { if (!canEdit) return; cn.ky_luat = v; build(); }));
    kl.append(seg);
    if (cn.ky_luat === 'vi_pham') {
      kl.append(el(`<div class="nn-field span-2"><div class="t-cap">Mỗi người 1 dòng, tích các lỗi người đó vi phạm. Có “lỗi khác” thì bắt buộc ghi chú. <span class="chip" data-tong="kl"></span></div>
        <div data-tb="kl"></div>${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="kl" style="margin-top:8px;align-self:flex-start">${icon('plus', 16)}Thêm người vi phạm</button>` : ''}</div>`));
      tbl('kl');
    }

    // --- 5S: Đạt / Không đạt (không đạt bắt buộc ghi chú)
    const vs = g.ve_sinh;
    const bv = $('[data-vs]', main);
    const s5 = el('<div class="nn-field span-2"><span class="nn-label req">Đánh giá</span></div>');
    s5.append(segmented([{ value: 'Đạt', label: 'Đạt' }, { value: 'Không đạt', label: 'Không đạt' }], vs.danh_gia || '', (v) => { if (!canEdit) return; vs.danh_gia = v; build(); }));
    bv.append(s5);
    const kd = vs.danh_gia === 'Không đạt';
    const f5 = el(`<div class="nn-field span-2"><label class="nn-label ${kd ? 'req' : ''}">Ghi chú${kd ? ' (bắt buộc khi Không đạt)' : ''}</label><div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" placeholder="VD: người trực vệ sinh, khu vực chưa đạt…" ${canEdit ? '' : 'disabled'}>${esc(vs.ghi_chu || '')}</textarea></div></div>`);
    const t5 = $('textarea', f5); grow(t5); t5.oninput = () => { vs.ghi_chu = t5.value; grow(t5); };
    bv.append(f5);

    // --- cần chú ý
    const ta = el(`<div class="nn-input-wrap nn-input-lg ta"><textarea class="nn-input" rows="3" ${canEdit ? '' : 'disabled'} placeholder="Việc ca sau cần lưu ý…">${esc(g.can_chu_y || '')}</textarea></div>`);
    $('textarea', ta).oninput = (e) => { g.can_chu_y = e.target.value; };
    $('[data-ccy]', main).append(ta);
    $('[data-hop]', main).onchange = (e) => { g.da_hop = e.target.checked; };

    // --- nút
    $('[data-act]', main).innerHTML = [
      canEdit ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-draft>${icon('edit', 18)}Lưu nháp</button>` : '',
      canEdit ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-send>${icon('send', 18)}Gửi báo cáo</button>` : '',
      id && !canEdit && g.trang_thai !== 'nhap' && can.moKhoa() ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-unlock>${icon('unlock', 18)}Mở khóa</button>` : '',
      id ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-print>${icon('print', 18)}In / PDF</button>` : '',
      id && can.admin() ? `<button class="nn-btn nn-btn-danger nn-btn-lg" data-xoa>${icon('trash', 18)}Xóa báo cáo</button>` : '',
    ].join('');
  }

  const sec = (n, t, hint, key) => `<section class="card section"><div class="card-head"><div class="t-h2">${n}. ${esc(t)} <span class="t-cap">(${esc(hint)})</span></div>
    <span class="chip" data-tong="${key}"></span></div><div data-tb="${key}"></div>
    ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="${key}" style="margin-top:8px">${icon('plus', 16)}Thêm dòng</button>` : ''}</section>`;

  let paintCNref = () => {};
  const caGio = () => { const c = S.cat.byId.ca[g.ca_id]; return c ? minutesBetween(hm(c.gio_bd), hm(c.gio_kt)) / 60 : 8; };
  const FIELD = { ns: 'nang_suat', mm: 'may_moc', cl1: 'loi1', cl2: 'loi2' };
  const rowsOf = (key) => (key === 'tc' ? g.con_nguoi.tang_ca : key === 'vg' ? g.con_nguoi.vang_ds : key === 'kl' ? g.con_nguoi.ky_luat_ds : g[FIELD[key]]);
  const colsKey = (key) => { const dg = cat.laDongGoi(g.bo_phan_id); return key === 'ns' ? (dg ? 'ns_dg' : 'ns_sx') : key === 'cl1' ? (dg ? 'cl_qa' : 'cl_nl') : key === 'cl2' ? 'cl_sx' : key; };
  const gdKey = (key) => gdOf(cat.laDongGoi(g.bo_phan_id))[key === 'cl1' ? 0 : 1];
  const valOf = (r, c, t) => (t === 'auto' ? AUTO[c]?.(r) : r[c]);
  function tong(key) {
    const k = colsKey(key), rows = rowsOf(key) || [];
    if (key === 'vg') {
      const n = (l) => rows.filter((r) => r.ns && r.loai === l).length;
      $('[data-tong="vg"]', main).textContent = `Cả ngày: ${n('ca_ngay')} · nửa buổi: ${n('nua_buoi')} · theo giờ: ${fmtNum(rows.filter((r) => r.loai === 'gio').reduce((a, r) => a + (+r.so_gio || 0), 0), 1)} giờ`;
      return;
    }
    if (!TONG[k]) return;
    if (key === 'kl') { $('[data-tong="kl"]', main).textContent = `${rows.filter((r) => r.ns).length} người · ${rows.reduce((a, r) => a + (r.loi || []).length, 0)} lỗi`; return; }
    $(`[data-tong="${key}"]`, main).textContent = TONG[k].map(([c, l]) => { const t = COLS[k].find((x) => x[0] === c)?.[3];
      return `${l}: ${fmtNum(rows.reduce((a, r) => a + (+valOf(r, c, t) || 0), 0), key === 'tc' ? 1 : 0)}`; }).join(' · ');
  }
  let listId = '', curK = '';
  const listOf = (t) => (t.startsWith('list:') ? t.slice(5) : t.startsWith('listdec:') ? t.slice(8) : null);
  const viGio = (v) => (v == null ? '' : String(v).replace('.', ','));
  function cell(r, i, [c, , w, t = 'text']) {
    const dis = canEdit ? '' : 'disabled';
    const st = `style="min-width:${w}px;width:100%"`;
    // v1.10: nhiều lỗi trên 1 dòng — mỗi lỗi: tên (chọn hoặc gõ) + số lượng
    if (t === 'loids') {
      const v = loiVar(curK, r);
      return `<div class="gc-loids" style="min-width:${w}px">${(r.loi_ds || []).map((x, j) => `<div class="nn-row" style="padding:0 0 4px;gap:4px;flex-wrap:nowrap">
        <input class="nn-input" style="flex:1;min-width:150px" list="dl-${esc(listId)}-${v}" data-r="${i}" data-li="${j}" data-lf="loi" value="${esc(x.loi ?? '')}" placeholder="Chọn hoặc gõ lỗi" ${dis}>
        <input class="nn-input" style="width:72px" inputmode="numeric" data-r="${i}" data-li="${j}" data-lf="sl" data-t="num" value="${esc(x.sl != null ? fmtNum(x.sl) : '')}" placeholder="SL" ${dis}>
        ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-lrm="${esc(listId)}:${i}:${j}" aria-label="Bỏ lỗi này">${icon('x', 14)}</button>` : ''}</div>`).join('')}
        ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-ladd="${esc(listId)}:${i}">${icon('plus', 14)}lỗi</button>` : (r.loi_ds || []).length ? '' : '—'}</div>`;
    }
    if (c === 'so_lop' && curK === 'cl_qa' && loaiBB(r.ma_sp) === 'lon') return '<span class="gc-auto">—</span>';
    if (t.startsWith('chk:')) {
      const cur = r[c] || [];
      return `<div class="nn-row" style="padding:0;gap:6px;flex-wrap:wrap;min-width:${w}px">${SEL[t.slice(4)](r).map(([v, l]) => `<label class="chip" style="gap:6px;cursor:pointer">
        <input type="checkbox" data-r="${i}" data-c="${c}" data-chk="${esc(v)}" ${cur.includes(v) ? 'checked' : ''} ${dis} style="width:18px;height:18px">${esc(l)}</label>`).join('') || '<span class="t-cap">Chưa có danh sách — Danh mục → Danh sách nhập nhanh</span>'}</div>`;
    }
    if (t.startsWith('listdec:')) return `<input class="nn-input" ${st} list="dl-${esc(listId)}-${listOf(t)}" data-r="${i}" data-c="${c}" data-t="dec" inputmode="decimal" value="${esc(viGio(r[c]))}" placeholder="Chọn hoặc gõ" ${dis}>`;
    if (t === 'auto') { const v = AUTO[c]?.(r); return `<span class="gc-auto" data-auto="${i}:${c}">${v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : esc(v)}</span>`; }
    if (t === 'num' || t === 'dec') return `<input class="nn-input" ${st} data-r="${i}" data-c="${c}" data-t="${t}" inputmode="${t === 'num' ? 'numeric' : 'decimal'}" value="${esc(r[c] != null ? fmtNum(r[c], t === 'dec' ? 1 : 0) : '')}" ${dis}>`;
    if (t === 'date') return `<input class="nn-input" type="date" ${st} data-r="${i}" data-c="${c}" value="${esc(r[c] || '')}" ${dis}>`;
    if (t.startsWith('sel:')) {
      const opts = SEL[t.slice(4)](r);
      const cur = r[c] ?? '';
      return `<select class="nn-input" ${st} data-r="${i}" data-c="${c}" ${dis}><option value="">—</option>${cur && !opts.some(([v]) => v === cur) ? `<option value="${esc(cur)}" selected>${esc(t === 'sel:ns' ? cat.person(cur) || cur : cur)}</option>` : ''}
        ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    }
    if (t.startsWith('list:')) return `<input class="nn-input" ${st} list="dl-${esc(listId)}-${listOf(t)}" data-r="${i}" data-c="${c}" value="${esc(r[c] ?? '')}" placeholder="Chọn hoặc gõ" ${dis}>`;
    const ph = c === 'ma_lo' && curK === 'cl_qa' ? (loaiBB(r.ma_sp) === 'lon' ? 'Mẻ pha chế' : 'Mã lô') : '';
    return `<textarea class="nn-input gc-ta" rows="1" ${st} data-r="${i}" data-c="${c}" placeholder="${ph}" ${dis}>${esc(r[c] ?? '')}</textarea>`;
  }
  function tbl(key) {
    const k = colsKey(key), cols = COLS[k];
    const rows = rowsOf(key);
    const box = $(`[data-tb="${key}"]`, main);
    const lists = cols.map(([, , , t]) => t && listOf(t)).filter(Boolean);
    listId = key; curK = k;
    const items = (l) => (l === 'loi' ? LISTS.loi(gdKey(key)) : LISTS[l]?.() || []);
    const dls = [...lists.map((l) => [l, items(l)]), ...(cols.some(([, , , t]) => t === 'loids') ? (k === 'cl_qa' ? [...new Set(rows.map((r) => r.ma_sp || ''))].map((m) => [loiVar(k, { ma_sp: m }), loiQA(m)]) : [['nl', LISTS.loi(gdKey(key))]]) : [])];
    box.innerHTML = `${dls.map(([l, ds]) => `<datalist id="dl-${key}-${l}">${ds.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
      <div class="nn-table-wrap"><table class="nn-table gc-tb"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${cols.map((col) => `<td>${cell(r, i, col)}</td>`).join('')}
        ${canEdit ? `<td style="white-space:nowrap">${key === 'ns' && k === 'ns_dg' ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-dup="${i}" title="Chép dòng này xuống dưới (STT xe +1)">${icon('copy', 14)}</button>` : ''}
          <button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${key}:${i}" aria-label="Xóa dòng">${icon('x', 14)}</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${cols.length + 1}" class="muted">Chưa có dòng nào</td></tr>`}</tbody></table></div>`;
    $$('textarea.gc-ta', box).forEach(grow);
    $$('[data-t="num"]', box).forEach((x) => bindNum(x, 'int'));
    $$('.gc-loids input', box).forEach((x) => { x.onkeydown = (ev) => { if (ev.key === 'Enter') ev.preventDefault(); }; });
    const paintAuto = (i) => { for (const [c, , , t] of cols) if (t === 'auto') { const a = box.querySelector(`[data-auto="${i}:${c}"]`); const v = AUTO[c]?.(rows[i]); if (a) a.textContent = v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : v; } };
    const upd = (x, e) => {
      const i = +x.dataset.r, c = x.dataset.c, t = x.dataset.t;
      if (x.dataset.chk != null) {                                  // ô tích nhiều lựa chọn
        const cur = rows[i][c] || [];
        rows[i][c] = x.checked ? [...new Set([...cur, x.dataset.chk])] : cur.filter((y) => y !== x.dataset.chk);
        tong(key); return;
      }
      if (x.dataset.li != null) {                                   // ô trong danh sách nhiều lỗi
        const it = rows[i].loi_ds[+x.dataset.li];
        it[x.dataset.lf] = x.dataset.lf === 'sl' ? toInt(x.value) : x.value;
        paintAuto(i); tong(key); return;
      }
      rows[i][c] = t === 'num' ? toInt(x.value) : t === 'dec' ? toNum(x.value) : x.value;
      if (k === 'ns_dg' && (c === 'ma_sp' || c === 'ngay_sx') && e?.type === 'change') {
        const r = rows[i];
        if (c === 'ma_sp') {
          if (r.ma_tp && tpOf(r.ma_tp)?.ma_btp !== r.ma_sp) r.ma_tp = '';
          const ds = SEL.tpsp(r); if (!r.ma_tp && ds.length === 1) r.ma_tp = ds[0][0];
        }
        if (!r.ma_lo) { const tr = rows.slice(0, i).reverse().find((y) => y.ma_sp === r.ma_sp && y.ngay_sx === r.ngay_sx && y.ma_lo); if (tr) r.ma_lo = tr.ma_lo; }
        return tbl(key);
      }
      // QA đầu vào: đổi sản phẩm -> đổi cột / danh sách lỗi theo lon - chai; mã lô, kíp lấy theo dòng năng suất cùng sản phẩm + ngày SX
      if (k === 'cl_qa' && (c === 'ma_sp' || c === 'ngay_sx') && e?.type === 'change') {
        const r = rows[i], ns = (g.nang_suat || []).find((y) => y.ma_sp === r.ma_sp && (!r.ngay_sx || y.ngay_sx === r.ngay_sx));
        if (ns) { r.ma_lo ||= ns.ma_lo || ''; r.kip_sx ||= ns.kip_sx || ''; r.ngay_sx ||= ns.ngay_sx; }
        if (loaiBB(r.ma_sp) === 'lon') r.so_lop = null;
        return tbl(key);
      }
      if (x.tagName === 'TEXTAREA') grow(x);
      paintAuto(i); tong(key);
      if (key === 'vg') paintCNref();
    };
    box.oninput = (e) => { const x = e.target.closest('[data-r]'); if (x && x.dataset.chk == null) upd(x); };
    box.onchange = (e) => { const x = e.target.closest('[data-r]'); if (x) upd(x, e); };
    tong(key);
  }

  /** Lưu nháp hoặc gửi */
  async function luu(gui) {
    if (!g.ngay || !g.ca_id || !g.bo_phan_id) return toast('Chọn đủ ngày, ca, bộ phận', 'warning');
    const co = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
    // v1.10: bỏ lỗi trống trong danh sách lỗi của dòng trước khi xét dòng trống
    const clean = (arr) => arr.map((r) => (r.loi_ds ? { ...r, loi_ds: r.loi_ds.filter((x) => co(x.loi) || co(x.sl)) } : r)).filter((r) => Object.values(r).some(co));
    const dg = cat.laDongGoi(g.bo_phan_id);
    if (gui) {
      const errs = [];
      if (cn.co_mat == null) errs.push('Chưa nhập sĩ số có mặt');
      if (!g.ve_sinh.danh_gia) errs.push('Chưa đánh giá Vệ sinh 5S');
      if (g.ve_sinh.danh_gia === 'Không đạt' && !String(g.ve_sinh.ghi_chu || '').trim()) errs.push('5S Không đạt thì phải ghi chú');
      if (cn.ky_luat === 'vi_pham') {
        const ds = clean(cn.ky_luat_ds);
        if (!ds.length) errs.push('Có vi phạm kỷ luật thì thêm người vi phạm');
        ds.forEach((r, i) => { if (!String(r.ns || '').trim()) errs.push(`Kỷ luật dòng ${i + 1}: chọn người vi phạm`);
          if (!(r.loi || []).length) errs.push(`Kỷ luật dòng ${i + 1}: tích lỗi vi phạm`);
          if ((r.loi || []).some((x) => isLoiKhac(x)) && !String(r.ghi_chu || '').trim()) errs.push(`Kỷ luật ${r.ns || `dòng ${i + 1}`}: có "lỗi khác" thì phải ghi chú`); });
      }
      clean(cn.tang_ca).forEach((r, i) => { if (!r.ns || !(r.gio > 0)) errs.push(`Tăng ca dòng ${i + 1}: chọn người và nhập số giờ`);
        if (isLoiKhac(r.ly_do) && !String(r.ghi_chu || '').trim()) errs.push(`Tăng ca dòng ${i + 1}: lý do khác thì phải ghi chú`); });
      clean(cn.vang_ds).forEach((r, i) => { if (!r.ns || !r.loai) errs.push(`Người vắng dòng ${i + 1}: chọn người và hình thức`); else if (r.loai === 'gio' && !(r.so_gio > 0)) errs.push(`Người vắng dòng ${i + 1}: nhập số giờ nghỉ`); });
      clean(g.loi2).forEach((r) => { if (isLoiKhac(r.loi) && !String(r.ghi_chu || '').trim()) errs.push(`Lỗi "${r.loi}" phải ghi chú`); if (!(r.sl > 0)) errs.push(`Lỗi "${r.loi || '?'}": chưa nhập SL`); });
      const t1 = dg ? 'QA đầu vào' : 'Lỗi nguyên liệu';
      clean(g.loi1).forEach((r, i) => {
        if (dg && !r.ma_sp) errs.push(`${t1} dòng ${i + 1}: chưa chọn sản phẩm`);
        if (!dg && !String(r.loai_nl || '').trim()) errs.push(`${t1} dòng ${i + 1}: chưa nhập loại nguyên liệu`);
        if (!r.loi_ds.length && !(dg && r.tong_kiem > 0)) errs.push(`${t1} dòng ${i + 1}: chưa ghi lỗi`);
        r.loi_ds.forEach((x) => { if (!String(x.loi || '').trim()) errs.push(`${t1} dòng ${i + 1}: có số lượng nhưng chưa chọn lỗi`); else if (!(x.sl > 0)) errs.push(`${t1} dòng ${i + 1}: lỗi "${x.loi}" chưa nhập SL`); });
        if (r.loi_ds.some((x) => isLoiKhac(x.loi)) && !String(r.ghi_chu || '').trim()) errs.push(`${t1} dòng ${i + 1}: có "lỗi khác" thì phải ghi chú`);
      });
      if (dg) clean(g.nang_suat).forEach((r, i) => { if (r.ngay_sx && g.ngay && r.ngay_sx > g.ngay) errs.push(`Năng suất dòng ${i + 1}: ngày SX sau ngày đóng gói`);
        if (!AUTO.ma_sp_hien(r)) errs.push(`Năng suất dòng ${i + 1}: chưa chọn tên sản phẩm`); if (!r.ma_tp) errs.push(`Năng suất dòng ${i + 1}: chưa chọn quy cách đóng gói`); });
      if (errs.length) return toast(errs.slice(0, 4).join(' · '), 'danger', 'Chưa gửi được');
      if (!(await confirmBox('Gửi báo cáo giao ca? Sau khi gửi, báo cáo bị khóa — muốn sửa phải nhờ quản lý / admin mở khóa.', { ok: 'Gửi báo cáo' }))) return;
    }
    // Lưu giá trị tự tính vào dòng để xuất / in đúng như lúc gửi
    const ns = clean(g.nang_suat).map((r) => (dg ? { ...r, ca_dg: AUTO.ca_dg(), ngay_dg: AUTO.ngay_dg(), ma_sp: AUTO.ma_sp_hien(r), ten_sp: btpName(AUTO.ma_sp_hien(r)), ten_tp: AUTO.ten_tp(r),
      quy_cach: AUTO.quy_cach(r), tong_sku: AUTO.tong_sku(r), tong_chai: AUTO.tong_chai(r), nha_may: cat.name('nha_may', nm) }
      : { ...r, con_lai: AUTO.con_lai(r) }));
    const tc = clean(cn.tang_ca);
    // v1.12: kỷ luật theo người + bản gộp (ky_luat_loi / ky_luat_nguoi / ky_luat_ghi_chu) cho báo cáo cũ và kiểm tra phía máy chủ
    const klTong = () => { const ds = cn.ky_luat === 'vi_pham' ? clean(cn.ky_luat_ds) : [];
      return { ky_luat_ds: ds, ky_luat_loi: [...new Set(ds.flatMap((r) => r.loi || []))], ky_luat_nguoi: ds.map((r) => r.ns).filter(Boolean),
        ky_luat_ghi_chu: ds.filter((r) => String(r.ghi_chu || '').trim()).map((r) => `${r.ns}: ${r.ghi_chu}`).join('; ') }; };
    const [ga, gb] = gdOf(dg);
    // lưu luôn giá trị tự tính (tổng lỗi, tỷ lệ, mã / tên SP…) để in, xuất đúng như lúc gửi; sl = tổng lỗi, loi = các lỗi nối lại (cho báo cáo cũ)
    const l1 = clean(g.loi1).map((r) => ({ ...r, gd: ga, sl: AUTO.tong_loi(r), loi: r.loi_ds.map((x) => x.loi).join(', '),
      ...(dg ? { ngay_dg: AUTO.ngay_dg(), ma_sp: r.ma_sp || '', sp: r.ma_sp || '', ten_sp: r.ma_sp ? btpName(r.ma_sp) : '', loai_bb: loaiBB(r.ma_sp), ty_le: AUTO.ty_le(r) } : {}) }));
    const chatLuong = [...l1, ...clean(g.loi2).map((r) => ({ ...r, gd: gb }))];
    const body = { ...g, gui, nang_suat: ns, chat_luong: chatLuong, may_moc: clean(g.may_moc), kip_id: g.kip_id || null,
      con_nguoi: { ...cn, muon: undefined, cho_muon: undefined, dieu_dong: undefined, ghi_chu: undefined, vang_ds: clean(cn.vang_ds), tang_ca: tc, tong_gio_tang_ca: tc.reduce((a, r) => a + (+r.gio || 0), 0), ...klTong() } };
    const nid = await rpc('luu_giao_ca', { p: body });
    toast(gui ? 'Đã gửi báo cáo giao ca' : 'Đã lưu nháp', 'success');
    if (nid !== id) go(`#/giao-ca/${nid}`); else editor(main, id);
  }

  main.onclick = async (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { const k = add.dataset.add, dg = cat.laDongGoi(g.bo_phan_id);
      rowsOf(k).push(k === 'ns' && dg ? { ngay_sx: g.ngay } : k === 'vg' ? { loai: 'ca_ngay' } : k === 'kl' ? { loi: [] } : k === 'cl1' ? (dg ? { ngay_sx: g.ngay, loi_ds: [{}] } : { loi_ds: [{}] }) : {}); build(); return; }
    const la = t.closest('[data-ladd]');
    if (la) { const [k, i] = la.dataset.ladd.split(':'); const r = rowsOf(k)[+i]; (r.loi_ds ||= []).push({}); tbl(k); return; }
    const lr = t.closest('[data-lrm]');
    if (lr) { const [k, i, j] = lr.dataset.lrm.split(':'); rowsOf(k)[+i].loi_ds.splice(+j, 1); tbl(k); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); rowsOf(k).splice(+i, 1); build(); return; }
    const dup = t.closest('[data-dup]');
    if (dup) { const i = +dup.dataset.dup, r = g.nang_suat[i]; g.nang_suat.splice(i + 1, 0, { ...r, stt_xe: r.stt_xe ? String(Math.min(100, +r.stt_xe + 1)) : r.stt_xe }); build(); return; }
    try {
      if (t.closest('[data-fill]')) {
        if (!g.ca_id) return toast('Chọn ca trước', 'warning');
        const r = await tuPhieu(g);
        const de = (r.nang_suat && g.nang_suat.length) || g.loi2.length || g.may_moc.length;
        if (de && !(await confirmBox(`Ghi đè ${r.nang_suat ? 'Năng suất, ' : ''}lỗi trong quá trình, Máy móc bằng số liệu từ phiếu? (Bảng ${cat.laDongGoi(g.bo_phan_id) ? 'QA đầu vào' : 'lỗi nguyên liệu'} giữ nguyên)`, { ok: 'Ghi đè' }))) return;
        if (r.nang_suat) g.nang_suat = r.nang_suat;
        const ga = gdOf(cat.laDongGoi(g.bo_phan_id))[0];
        Object.assign(g, { chat_luong: [...g.loi1.map((x) => ({ ...x, gd: ga })), ...r.chat_luong], may_moc: r.may_moc }); splitCL();
        build(); toast(r.so_phieu ? `Đã lấy số từ ${r.so_phieu} phiếu` : 'Không có phiếu nào của bộ phận, ngày, ca này', r.so_phieu ? 'success' : 'warning');
      } else if (t.closest('[data-draft]')) await luu(false);
      else if (t.closest('[data-send]')) await luu(true);
      else if (t.closest('[data-unlock]')) {
        const ly = await askText('Mở khóa báo cáo giao ca', 'Lý do mở khóa (bắt buộc — lưu vào nhật ký)', '', 'Mở khóa');
        if (ly == null) return;
        await rpc('mo_khoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã mở khóa — báo cáo trở về nháp', 'info'); editor(main, id);
      } else if (t.closest('[data-xoa]')) {
        const ly = await askText(`Xóa hẳn: ${tieuDe(g)}`, 'Lý do xóa (bắt buộc — không khôi phục được, nhật ký giữ bản chụp)', '', 'Xóa hẳn');
        if (ly == null) return;
        await rpc('xoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã xóa báo cáo giao ca', 'info'); go(`#/giao-ca?bp=${g.bo_phan_id}`);
      } else if (t.closest('[data-print]')) window.print();
    } catch (err) { toast(errText(err), 'danger'); }
  };
  await napSpCa();
  build();
}

/** Ô chữ tự giãn chiều cao để chữ dài xuống dòng, không bị khuất */
function grow(t) { t.style.height = 'auto'; t.style.height = `${Math.max(36, t.scrollHeight + 2)}px`; }
