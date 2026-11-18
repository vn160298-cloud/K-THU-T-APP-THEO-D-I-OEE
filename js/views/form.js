// Ghi phiếu vận hành: danh sách nháp, form phiếu (máy đơn hoặc dây chuyền; tự lưu, ngoại tuyến), chi tiết phiếu
import { S, sb, cat, can, submitPhieu, PHIEU_SEL, saveDraftServer, deleteDraftServer, getPhieuGroup, flushQueue, rpc, errText } from '../api.js';
import { drafts, queue, lsSet } from '../store.js';
import { calcPhieu } from '../kpi.js';
import {
  esc, icon, uuid, today, nowHM, hm, fmtDate, fmtNum, fmtPct, fmtMin, minutesBetween, timeInRange, toNum, toInt,
  NHOM_TT, TINH_TRANG, MUC_DO, LOI_KHAC, mucDoBadge, ttBadge, phieuBadge, oeeBadge, debounce, fmtDateTime, VAI_TRO, isLoiKhac,
} from '../lib.js';
import {
  el, $, $$, toast, confirmBox, inputField, selectField, comboField, dateField, textField, kpiCard, segmented, timeField, openSheet, multiField,
} from '../ui.js';
import { go, drawHeader } from '../app.js';
import { openFaultUpdate, shareZalo } from './faults.js';

export async function render(main, { route, params, q = {} }) {
  if (route === 'phieu') {
    if (params[1] === 'sua') return editServer(main, params[0]);
    return detail(main, params[0]);
  }
  if (params[0] === 'moi') { const d = newDraft(); if (q.bp && cat.boPhan().some((b) => b.id === q.bp)) d.bo_phan_id = q.bp; return form(main, d); }
  if (params[0] === 'nhap') {
    let d = drafts.get(params[1]);
    const q = queue.all().find((x) => x.id === params[1]);
    if (q) { d = { ...(d || {}), ...q }; queue.remove(q.id); drawHeader(); } // mở lại phiếu chờ gửi để sửa -> thành nháp
    if (!d) { toast('Không tìm thấy phiếu nháp', 'warning'); return go('#/ghi-phieu'); }
    return form(main, d);
  }
  return hub(main, q.bp);
}

const targetLabel = (d) => (d.multi ? `Ghi chung ${(d.muc || []).length} dây chuyền / máy` : d.day_chuyen_id ? cat.name('day_chuyen', d.day_chuyen_id) || 'Dây chuyền' : d.may_id ? cat.mayLabel(d.may_id) : 'Chưa chọn máy / dây chuyền');

// ================= DANH SÁCH NHÁP & CHỜ GỬI =================
function hub(main, bp) {
  const ds = drafts.list(), qs = queue.all();
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Ghi phiếu</div>
    <div class="muted">Phiếu ghi dở được tự lưu theo tài khoản — thoát app vẫn còn</div></div>
    ${can.ghiPhieu() ? `<a class="nn-btn nn-btn-primary nn-btn-lg" href="#/ghi-phieu/moi${bp ? `?bp=${bp}` : ''}">${icon('plus', 20)}Tạo phiếu mới</a>` : ''}</div>
    ${qs.length ? `<section class="card section"><div class="card-head"><div class="t-h2">Chờ gửi lên máy chủ (${qs.length})</div>
      <button class="nn-btn nn-btn-secondary nn-btn-md" data-retry>${icon('sync', 18)}Gửi lại</button></div>
      <div class="list-cards">${qs.map((q) => itemCard(q, true)).join('')}</div></section>` : ''}
    <section class="card section"><div class="card-head"><div class="t-h2">Phiếu đang ghi dở (${ds.length})</div></div>
      ${ds.length ? `<div class="list-cards">${ds.map((d) => itemCard(d)).join('')}</div>` : '<div class="empty">Không có phiếu nháp</div>'}</section>`;
  main.onclick = async (e) => {
    const c = e.target.closest('[data-open]');
    if (c) go(`#/ghi-phieu/nhap/${c.dataset.open}`);
    if (e.target.closest('[data-retry]')) {
      const r = await flushQueue({ retryErrors: true });
      toast(r.sent ? `Đã gửi ${r.sent} phiếu` : S.online ? 'Chưa gửi được — xem lỗi từng phiếu' : 'Đang mất mạng', r.sent ? 'success' : 'warning');
      drawHeader(); hub(main);
    }
  };
}

function itemCard(d, isQueue) {
  return `<div class="lc" data-open="${d.id}" role="button" tabindex="0">
    <div class="lc-row"><b>${esc(targetLabel(d))}</b>${isQueue ? (d._error ? `<span class="nn-status nn-tone-danger">${icon('fail', 14)}Lỗi gửi</span>` : phieuBadge('cho_dong_bo')) : phieuBadge('nhap')}</div>
    <div class="lc-row muted"><span>${fmtDate(d.ngay)} · ${esc(cat.name('ca', d.ca_id) || 'Chưa chọn ca')}</span><span>${(d.dung_may || []).length} lần dừng</span></div>
    ${d._error ? `<div class="nn-alert nn-alert-danger" style="padding:8px 12px"><span class="nn-alert-icon nn-tone-danger">${icon('fail', 16)}</span><div class="nn-alert-body"><div class="nn-alert-text">${esc(d._error)} — bấm để sửa rồi gửi lại</div></div></div>` : ''}
    ${d._edit ? '<span class="chip">Đang sửa phiếu đã gửi</span>' : ''}
  </div>`;
}

// ================= PHIẾU MỚI =================
function newDraft() {
  const me = S.profile;
  return {
    id: uuid(), ngay: today(), may_id: '', day_chuyen_id: '', ca_id: '', san_pham_id: '', toc_do_dm: null,
    nguoi_van_hanh_id: me.vai_tro === 'van_hanh' ? me.id : '', to_truong_id: me.vai_tro === 'to_truong' ? me.id : '', ky_thuat_id: '',
    gio_bd: '', gio_kt: '', nghi_phut: 0, tong_sl: null, sl_loi_kd: 0, sl_loi_qt: 0, ghi_chu: '',
    kip_id: '', sl_ke_hoach: null, ngay_sx: '', lo: '', so_thung: null, kip_sx_id: '', so_phieu_kho: '', bo_phan_id: me.bo_phan_id || '',
    ke_hoach: [], dung_may: [], bo_may: [], loi_sp: [], _kv: '', created_at: new Date().toISOString(),
  };
}

const stopToDraft = (d) => ({
  id: d.id, stt: d.stt, ma_loi_id: d.ma_loi_id, ma_loi: d.ma_loi, ten_loi: d.ten_loi, nhom_ton_that: d.nhom_ton_that, loai_loi: d.loai_loi,
  muc_do: d.muc_do || 'dung_ngay', _khac: !d.ma_loi_id && !!d.ten_loi,
  gio_bd: hm(d.gio_bd), gio_kt: hm(d.gio_kt), van_de_cl: d.van_de_cl || '', nguoi_xu_ly_id: d.nguoi_xu_ly_id || '', nguoi_ho_tro: d.nguoi_ho_tro || [], tinh_trang: d.tinh_trang, ghi_chu: d.ghi_chu || '',
});

const toDraft = (p) => ({
  id: p.id, ngay: p.ngay, may_id: p.may_id, day_chuyen_id: '', ca_id: p.ca_id, san_pham_id: p.san_pham_id || '', toc_do_dm: p.toc_do_dm,
  nguoi_van_hanh_id: p.nguoi_van_hanh_id || '', to_truong_id: p.to_truong_id || '', ky_thuat_id: p.ky_thuat_id || '',
  gio_bd: hm(p.gio_bd), gio_kt: hm(p.gio_kt), nghi_phut: p.nghi_phut, tong_sl: p.tong_sl, sl_loi_kd: p.sl_loi_kd, sl_loi_qt: p.sl_loi_qt,
  ghi_chu: p.ghi_chu || '', created_at: p.created_at, _edit: true, _trang_thai: p.trang_thai,
  kip_id: p.kip_id || '', bo_phan_id: p.bo_phan_id || '', sl_ke_hoach: p.sl_ke_hoach ?? null, ngay_sx: p.ngay_sx || '', lo: p.lo || '', so_thung: p.so_thung ?? null,
  kip_sx_id: p.kip_sx_id || '', so_phieu_kho: p.so_phieu_kho || '',
  ke_hoach: (p.dung_ke_hoach || []).map((k) => ({ ly_do_id: k.ly_do_id, ly_do_ten: k.ly_do_ten, gio_bd: hm(k.gio_bd), gio_kt: hm(k.gio_kt) })),
  dung_may: (p.dung_may || []).filter((s) => s.goc !== false).sort((a, b) => a.stt - b.stt).map(stopToDraft),
  loi_sp: loiSpToDraft(p),
});

// v1.4: lỗi sản phẩm theo từng loại. Phiếu cũ (chỉ có 2 số lỗi khởi động / quá trình) chuyển thành 1 dòng "Lỗi khác".
function loiSpToDraft(p) {
  const arr = Array.isArray(p.loi_sp) ? p.loi_sp : [];
  if (arr.length) return arr.map((x) => ({ loi_id: x.loi_id || '', ma: x.ma || '', ten: x.ten || '', so_luong: x.so_luong ?? null, ghi_chu: x.ghi_chu || '' }));
  const cu = (+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0);
  return cu ? [{ loi_id: '', ma: '', ten: LOI_KHAC.ten, so_luong: cu, ghi_chu: 'Số liệu cũ (trước bản 1.4)' }] : [];
}
const tongLoiSp = (d) => (d.loi_sp || []).reduce((a, x) => a + (+x.so_luong || 0), 0);

/** v1.8: dựng lại phiếu ghi chung từ các phiếu con (mỗi dây chuyền / máy = 1 mục) */
function toDraftMulti(gid, rows) {
  const groups = new Map();
  for (const r of rows) { const k = r.nhom_id || r.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const muc = [], stops = [];
  for (const g of groups.values()) {
    const line = g[0].day_chuyen_id && g[0].nhom_id;
    const rep = line ? (g.find((r) => r.may_id === cat.lastMay(g[0].day_chuyen_id)) || g[0]) : g[0];
    const raw = line ? g[0].day_chuyen_id : g[0].may_id;
    muc.push({ key: line ? `dc:${raw}` : `m:${raw}`, tong_sl: rep.tong_sl, sl_loi_qt: (+rep.sl_loi_kd || 0) + (+rep.sl_loi_qt || 0), toc_do_dm: rep.toc_do_dm, bo_may: [] });
    for (const r of g) for (const x of (r.dung_may || []).filter((y) => y.goc !== false)) stops.push({ ...stopToDraft(x), muc: raw, may_id: line ? r.may_id : '', ca_chuyen: true });
  }
  const d = toDraft(rows[0]);
  Object.assign(d, { id: gid, multi: true, muc, may_id: '', day_chuyen_id: '', bo_may: [], tong_sl: null,
    dung_may: stops.sort((a, b) => (a.gio_bd > b.gio_bd ? 1 : -1)).map((x, i) => ({ ...x, stt: i + 1 })) });
  return d;
}

/** Phiếu dây chuyền: dựng lại từ các phiếu con (lấy phiếu máy cuối làm gốc; chỉ lấy dòng dừng gốc) */
function toDraftGroup(rows) {
  const last = cat.lastMay(rows[0].day_chuyen_id);
  const rep = rows.find((r) => r.may_id === last) || rows[0];
  const d = toDraft(rep);
  d.id = rep.nhom_id; d.day_chuyen_id = rep.day_chuyen_id; d.may_id = '';
  d._trang_thai = rows.some((r) => r.trang_thai === 'da_xac_nhan') ? 'da_xac_nhan' : 'da_gui';
  d.bo_may = cat.members(rep.day_chuyen_id).map((x) => x.may_id).filter((id) => !rows.some((r) => r.may_id === id));
  const stops = [];
  for (const r of rows) {
    for (const s of (r.dung_may || []).filter((x) => x.goc !== false)) {
      const caChuyen = rows.some((o) => (o.dung_may || []).some((x) => x.dung_may_goc_id === s.id));
      stops.push({ ...stopToDraft(s), may_id: r.may_id, ca_chuyen: caChuyen || rows.length < 2, _t: s.gio_bd });
    }
  }
  d.dung_may = stops.sort((a, b) => String(a._t).localeCompare(String(b._t))).map((s, i) => { const { _t, ...x } = s; return { ...x, stt: i + 1 }; });
  return d;
}

async function editServer(main, id) {
  const local = drafts.get(id);
  if (local) return form(main, local);
  // v1.8: phiếu ghi chung nhiều dây chuyền / máy
  const { data: chung } = await sb.from('phieu').select(PHIEU_SEL).eq('nhom_chung', id);
  if (chung?.length) {
    if (chung.some((r) => r.trang_thai === 'da_xac_nhan')) throw new Error('Có dây chuyền / máy trong phiếu ghi chung đã khóa — mở khóa (kèm lý do) rồi mới sửa');
    return form(main, toDraftMulti(id, chung));
  }
  const rows = await getPhieuGroup(id);
  if (!rows.length) throw new Error('Không tìm thấy phiếu');
  if (rows.some((r) => r._luu_tru)) throw new Error('Phiếu đã chuyển sang lưu trữ — chỉ xem, không sửa');
  if (rows.some((r) => r.trang_thai === 'da_xac_nhan')) throw new Error('Phiếu đã khóa — mở trang phiếu, bấm "Yêu cầu mở khóa" (quản lý / admin: "Mở khóa" kèm lý do) rồi mới sửa');
  return form(main, rows[0].nhom_id ? toDraftGroup(rows) : toDraft(rows[0]));
}

// ================= FORM =================
function form(main, d) {
  // Nháp lưu từ bản trước 1.4 chưa có danh sách lỗi sản phẩm
  if (!Array.isArray(d.loi_sp)) d.loi_sp = loiSpToDraft(d);
  d.ke_hoach ||= [];
  const ngan = cat.caiDat().nguong_dung_ngan || 5;
  const save = debounce(() => { const s = drafts.put(d); saveDraftServer(s); $('[data-saved]', main) && ($('[data-saved]', main).textContent = `Đã tự lưu lúc ${nowHM()}`); }, 500);
  const changed = () => { save(); preview(); };

  const isLine = () => !!d.day_chuyen_id;
  const target = () => ({ may_id: d.may_id, day_chuyen_id: d.day_chuyen_id });
  const members = () => (isLine() ? cat.members(d.day_chuyen_id) : []);
  const repMayId = () => (isLine() ? cat.lastMay(d.day_chuyen_id) : d.may_id);
  const repMay = () => S.cat.byId.may[repMayId()];
  const targetValue = () => (d.day_chuyen_id ? `dc:${d.day_chuyen_id}` : d.may_id ? `m:${d.may_id}` : '');
  const kvOf = (m) => cat.name('khu_vuc', m.khu_vuc_id) || 'Chưa có khu vực';
  const people = (roles) => cat.nhanSu(roles).map((n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · ${VAI_TRO[n.vai_tro]}${n.ca_id ? ` · ${cat.name('ca', n.ca_id)}` : ''}` }));
  // v1.11: chỉ gợi ý người đúng bộ phận + ca của phiếu (kỹ thuật: chỉ theo ca); nút "Xem tất cả" để chọn người làm thay
  const peopleNhom = (roles, theoBp = true) => { const ok = new Set(cat.nhanSu(roles).filter((n) => cat.hopNhom(n, { bp: theoBp ? d.bo_phan_id : '', ca: d.ca_id })).map((n) => n.id));
    return people(roles).filter((o) => ok.has(o.value)); };
  const comboNhom = (label, key, roles, theoBp = true) => {
    const all = people(roles), nhom = peopleNhom(roles, theoBp);
    const cur = d[key] && !nhom.some((o) => o.value === d[key]) ? all.filter((o) => o.value === d[key]) : [];
    return comboField({ label, value: d[key], options: [...nhom, ...cur], more: nhom.length < all.length ? { label: 'Xem tất cả nhân sự (khác bộ phận / ca)', options: () => all } : undefined,
      onChange: (v) => { d[key] = v; changed(); } });
  };
  // Phân công: Ca + Dây chuyền/Máy -> chỉ hiện người được phân công (có nút "Xem tất cả")
  const assigned = (vaiTro) => (d.ca_id && (d.may_id || d.day_chuyen_id) ? cat.phanCong(d.ca_id, target(), vaiTro) : []);
  const peopleField = (label, key, vaiTro, roles) => {
    const list = assigned(vaiTro);
    const all = people(roles);
    if (!list.length) return comboNhom(label, key, roles);
    const opts = list.map((n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · phân công ca này` }));
    const cur = d[key] && !opts.some((o) => o.value === d[key]) ? all.filter((o) => o.value === d[key]) : [];
    return comboField({ label, value: d[key], options: [...opts, ...cur], more: { label: 'Xem tất cả nhân sự (người làm thay)', options: () => all },
      msg: `Theo phân công ${esc(cat.name('ca', d.ca_id))}: ${list.map((n) => esc(n.ho_ten)).join(', ')}`, onChange: (v) => { d[key] = v; changed(); } });
  };
  /** Tự điền người theo phân công khi ô đang trống (vận hành: khi chỉ có 1 người) */
  const applyPeople = () => {
    const vh = assigned('van_hanh'), tt = assigned('to_truong');
    if (!d.nguoi_van_hanh_id && vh.length === 1) d.nguoi_van_hanh_id = vh[0].id;
    if (!d.to_truong_id && tt.length >= 1) d.to_truong_id = tt[0].id;
  };
  const dvt = () => S.cat.byId.san_pham[d.san_pham_id]?.dvt || 'sp';
  if (!Array.isArray(d.bo_may)) d.bo_may = [];
  const running = () => members().filter((x) => !d.bo_may.includes(x.may_id));

  // Khu vực sản xuất: lọc danh sách dây chuyền / máy bên dưới. Để trống = tất cả khu vực.
  const kvId = () => d._kv || '';
  const mayInKv = (mayId) => !kvId() || S.cat.byId.may[mayId]?.khu_vuc_id === kvId();
  // v1.9: lọc theo bộ phận chọn ở đầu phiếu
  const mayInBp = (mayId) => !d.bo_phan_id || S.cat.byId.may[mayId]?.bo_phan_id === d.bo_phan_id;
  const lineInKv = (lineId) => !kvId() || cat.members(lineId).some((x) => mayInKv(x.may_id));
  const kvOptions = () => S.cat.khu_vuc.filter((k) => k.nha_may_id === S.nm && k.hoat_dong)
    .map((k) => {
      const n = cat.may().filter((m) => m.khu_vuc_id === k.id && mayInBp(m.id)).length;
      return { value: k.id, label: k.ten, sub: `${n} máy` };
    }).filter((o) => o.sub !== '0 máy');
  const targetOptions = () => {
    const lines = cat.dayChuyen().filter((l) => cat.members(l.id).length && lineInKv(l.id) && cat.members(l.id).some((x) => mayInBp(x.may_id))).map((l) => ({
      value: `dc:${l.id}`, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → '), group: 'Dây chuyền' }));
    const singles = [...cat.mayDon()].filter((m) => mayInKv(m.id) && mayInBp(m.id)).sort((a, b) => kvOf(a).localeCompare(kvOf(b), 'vi')).map((m) => ({
      value: `m:${m.id}`, label: `${m.ma} · ${m.ten}`, group: `Máy đơn · ${kvOf(m)}` }));
    return [...lines, ...singles];
  };
  const caOptions = () => cat.ca((isLine() ? null : S.cat.byId.may[d.may_id]?.bo_phan_id) || d.bo_phan_id || null);

  const applyCa = () => {
    const c = S.cat.byId.ca[d.ca_id];
    if (c) { d.gio_bd = hm(c.gio_bd); d.gio_kt = hm(c.gio_kt); d.nghi_phut = c.nghi_phut; }
  };
  const pickDefaultCa = () => {
    const list = caOptions(); const now = nowHM();
    const c = list.find((x) => timeInRange(now, hm(x.gio_bd), hm(x.gio_kt))) || list[0];
    d.ca_id = c?.id || ''; applyCa();
  };
  const applySpeed = () => {
    const v = (d.may_id || d.day_chuyen_id) && d.san_pham_id ? cat.speedFor(target(), d.san_pham_id) : null;
    if (v != null) d.toc_do_dm = v;
  };
  const clearFault = (s) => Object.assign(s, { ma_loi_id: '', ma_loi: '', ten_loi: '', nhom_ton_that: null, loai_loi: '', muc_do: '', _khac: false });

  function build() {
    const locked = d._trang_thai === 'da_xac_nhan';
    main.innerHTML = `<div class="page-head"><div><div class="t-page">${d._edit ? 'Sửa phiếu' : 'Phiếu ghi nhận vận hành'}</div>
      <div class="t-cap" data-saved>${d._savedAt ? `Đã tự lưu lúc ${fmtDateTime(d._savedAt).slice(11)}` : 'Tự lưu khi nhập'}</div></div>
      <a class="nn-btn nn-btn-ghost nn-btn-md" href="#/ghi-phieu">${icon('chevL', 18)}Danh sách nháp</a></div>
      ${d._error ? `<div class="nn-alert nn-alert-danger section" role="alert"><span class="nn-alert-icon nn-tone-danger">${icon('fail', 20)}</span><div class="nn-alert-body"><div class="nn-alert-title">Lần gửi trước bị từ chối</div><div class="nn-alert-text">${esc(d._error)}</div></div></div>` : ''}
      ${locked ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Phiếu đã khóa — bạn đang sửa với quyền ${esc(VAI_TRO[S.profile.vai_tro])}</div></div></div>` : ''}
      <section class="card section"><div class="card-head"><div class="t-h2">Thông tin chung</div></div><div class="form-grid" data-g1></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">Thời gian & sản lượng</div><span class="chip" data-capinfo></span></div><div class="form-grid" data-g2></div></section>

      <section class="card section"><div class="card-head"><div><div class="t-h2">Các lần dừng máy</div><div class="t-cap">${isLine()
        ? 'Chọn máy gây lỗi rồi chọn tên lỗi của máy đó — mã lỗi, nhóm tổn thất, loại lỗi tự điền'
        : 'Chọn tên lỗi — mã lỗi, nhóm tổn thất, loại lỗi tự điền'}. Dưới ${ngan} phút tự tính là dừng ngắn</div></div>
        <button class="nn-btn nn-btn-secondary nn-btn-md" data-addstop>${icon('plus', 18)}Thêm lần dừng</button></div><div data-stops></div></section>
      <section class="card section"><div class="form-grid" data-g3></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">${isLine() ? 'Chỉ số tạm tính của dây chuyền' : 'Chỉ số tạm tính của phiếu'}</div></div><div class="grid-kpi" data-preview></div></section>
      <section class="card section no-print action-bar"><div class="nn-row" style="padding:0;justify-content:flex-end">
        <button class="nn-btn nn-btn-secondary nn-btn-lg" data-del>${icon('trash', 18)}${d._edit ? 'Hủy sửa' : 'Xóa nháp'}</button>
        ${can.xacNhan() && !locked ? `<label class="nn-row" style="padding:0;gap:8px"><input type="checkbox" data-confirm style="width:22px;height:22px"> Xác nhận và khóa phiếu luôn</label>` : ''}
        <button class="nn-btn nn-btn-primary nn-btn-lg" data-submit>${icon('pass', 20)}Gửi phiếu</button></div></section>`;

    // --- Thông tin chung
    const g1 = $('[data-g1]', main);
    // v1.6: chọn nhà máy (admin tổng quản nhiều nhà máy); người khác thấy nhà máy của mình
    if (can.adminTong() && S.cat.nha_may.filter((n) => n.hoat_dong).length > 1) {
      g1.append(selectField({ label: 'Nhà máy', value: S.nm, req: true, options: S.cat.nha_may.filter((n) => n.hoat_dong).map((n) => ({ value: n.id, label: n.ten })),
        onChange: async (v) => {
          if (!v || v === S.nm) return;
          if ((d.may_id || d.day_chuyen_id) && !(await confirmBox('Đổi nhà máy sẽ bỏ chọn dây chuyền / máy, ca, kíp, sản phẩm và các lần dừng đã chọn. Tiếp tục?', { ok: 'Đổi nhà máy' }))) return build();
          S.nm = v; lsSet('nm', v); drawHeader();
          Object.assign(d, { may_id: '', day_chuyen_id: '', ca_id: '', kip_id: '', kip_sx_id: '', san_pham_id: '', toc_do_dm: null, bo_may: [], _kv: '', loi_sp: [] });
          d.dung_may.forEach((x) => { clearFault(x); x.may_id = ''; });
          pickDefaultCa(); changed(); build();
        } }));
    } else {
      g1.append(el(`<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:40px">${esc(cat.name('nha_may', S.nm))}</span></div>`));
    }
    // v1.9: Bộ phận — các ô bên dưới (khu vực, dây chuyền / máy, ca) chỉ hiện danh sách của bộ phận này
    g1.append(selectField({ label: 'Bộ phận', value: d.bo_phan_id || '', placeholder: 'Tất cả bộ phận', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })),
      onChange: (v) => {
        d.bo_phan_id = v;
        if (kvId() && !kvOptions().some((o) => o.value === kvId())) d._kv = '';
        const ok = new Set(targetOptions().map((o) => o.value));
        if (d.multi) d.muc = d.muc.filter((m) => ok.has(m.key));
        else if (targetValue() && !ok.has(targetValue())) { d.day_chuyen_id = ''; d.may_id = ''; d.bo_may = []; d.dung_may.forEach((x) => { clearFault(x); x.may_id = ''; }); }
        if (!caOptions().some((c) => c.id === d.ca_id)) pickDefaultCa();
        applyPeople(); changed(); build();
      } }));
    // v1.8: ghi chung 1 phiếu cho nhiều dây chuyền / máy chạy cùng 1 sản phẩm
    if (!d._edit || d.multi) {
      const mt = el(`<label class="nn-field span-2" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" ${d.multi ? 'checked' : ''} ${d._edit ? 'disabled' : ''} style="width:22px;height:22px">
        <span><b>Ghi chung nhiều dây chuyền / máy</b> <span class="t-cap">— khi 2, 3 line / máy chạy cùng 1 sản phẩm: giờ, sản phẩm, người ghi chung; mỗi line nhập sản lượng riêng</span></span></label>`);
      $('input', mt).onchange = (e) => {
        if (e.target.checked) {
          const v = targetValue();
          Object.assign(d, { multi: true, muc: v ? [{ key: v, tong_sl: d.tong_sl, sl_loi_qt: d.sl_loi_qt || 0, toc_do_dm: d.toc_do_dm, bo_may: [] }] : [], may_id: '', day_chuyen_id: '', bo_may: [] });
          d.dung_may.forEach((x) => { x.muc = v ? v.slice(v.indexOf(':') + 1) : ''; if (v.startsWith('m:')) x.may_id = ''; });
        } else {
          const m0 = (d.muc || [])[0];
          Object.assign(d, { multi: false, day_chuyen_id: m0?.key.startsWith('dc:') ? m0.key.slice(3) : '', may_id: m0?.key.startsWith('m:') ? m0.key.slice(2) : '',
            tong_sl: m0?.tong_sl ?? null, sl_loi_qt: m0?.sl_loi_qt || 0, toc_do_dm: m0?.toc_do_dm ?? null, muc: [] });
          d.dung_may.forEach((x) => { clearFault(x); x.may_id = ''; });
        }
        changed(); build();
      };
      g1.append(mt);
    }
    const kvs = kvOptions();
    if (kvs.length > 1) {
      g1.append(selectField({ label: 'Khu vực sản xuất', value: kvId(), placeholder: 'Tất cả khu vực', options: kvs,
        onChange: (v) => {
          d._kv = v;
          // Đang chọn máy / dây chuyền không thuộc khu vực mới thì bỏ chọn để không ghi nhầm
          if (targetValue() && !targetOptions().some((o) => o.value === targetValue())) {
            d.day_chuyen_id = ''; d.may_id = ''; d.bo_may = [];
            d.dung_may.forEach((s) => { clearFault(s); s.may_id = ''; });
          }
          changed(); build();
        } }));
    }
    if (d.multi) g1.append(multiField({ label: 'Các dây chuyền / máy chạy cùng sản phẩm', value: d.muc.map((x) => x.key), span: true, options: targetOptions(),
      placeholder: '— Thêm dây chuyền / máy —',
      onChange: (v) => {
        d.muc = v.map((k) => d.muc.find((x) => x.key === k) || { key: k, tong_sl: null, sl_loi_qt: 0, toc_do_dm: d.san_pham_id ? cat.speedFor(tOf(k), d.san_pham_id) : null, bo_may: [] });
        d.dung_may.forEach((x) => { if (x.muc && !v.some((k) => k.endsWith(x.muc))) { x.muc = ''; x.may_id = ''; clearFault(x); } });
        changed(); build();
      } }));
    else g1.append(
      comboField({ label: 'Dây chuyền / Máy', value: targetValue(), req: true, span: true, options: targetOptions(),
        msg: kvId() ? `Chỉ hiện dây chuyền / máy thuộc ${esc(cat.name('khu_vuc', kvId()))}` : '',
        onChange: (v) => {
          d.day_chuyen_id = v.startsWith('dc:') ? v.slice(3) : '';
          d.may_id = v.startsWith('m:') ? v.slice(2) : '';
          d.dung_may.forEach((s) => { clearFault(s); s.may_id = ''; if (s.ca_chuyen == null) s.ca_chuyen = true; });
          d.bo_may = [];
          if (!caOptions().some((c) => c.id === d.ca_id)) pickDefaultCa();
          applyPeople();
          if (d.san_pham_id && !cat.sanPhamFor(target()).some((p) => p.id === d.san_pham_id)) d.san_pham_id = '';
          d.toc_do_dm = null; applySpeed(); changed(); build();
        } }),
    );
    if (isLine()) {
      const mem = members();
      const last = repMayId();
      const shared = (id) => cat.linesOfMay(id).length > 1;
      const box = el(`<div class="nn-field span-2"><span class="nn-label">Các máy chạy trong ca (bỏ tích máy không chạy)</span><div class="nn-row" style="padding:0;gap:6px">
        ${mem.map((x) => `<label class="chip ${x.may_id === last ? 'dept' : ''}" style="gap:6px;cursor:pointer"><input type="checkbox" data-run="${x.may_id}" ${d.bo_may.includes(x.may_id) ? '' : 'checked'} ${x.may_id === last ? 'disabled' : ''} style="width:18px;height:18px">
          ${esc(cat.name('may', x.may_id, 'ma'))}${x.may_id === last ? ' · máy cuối' : ''}${shared(x.may_id) ? ' · dùng chung' : ''}</label>`).join(icon('chevR', 14))}</div>
        <div class="t-cap">Một phiếu cho cả dây chuyền. Sản lượng đếm ở máy cuối chuyền; mỗi lần dừng chọn máy gây lỗi.${mem.some((x) => shared(x.may_id)) ? ' Máy "dùng chung" thuộc nhiều dây chuyền: trong 1 ca chỉ tính cho dây chuyền ghi phiếu trước, dây chuyền ghi sau tự bỏ qua máy đó.' : ''}</div></div>`);
      box.addEventListener('change', (e) => {
        const id = e.target.dataset.run; if (!id) return;
        d.bo_may = e.target.checked ? d.bo_may.filter((x) => x !== id) : [...new Set([...d.bo_may, id])];
        d.dung_may.forEach((s) => { if (s.may_id === id && !e.target.checked) { s.may_id = ''; clearFault(s); } });
        changed(); build();
      });
      g1.append(box);
    }
    g1.append(
      dateField({ label: 'Ngày', value: d.ngay, req: true, onChange: (v) => { d.ngay = v; changed(); } }),
      selectField({ label: 'Ca', value: d.ca_id, req: true, options: caOptions().map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})` })),
        onChange: (v) => { d.ca_id = v; applyCa(); applyPeople(); changed(); build(); } }),
      selectField({ label: 'Kíp', value: d.kip_id, placeholder: cat.kip().length ? '— Chọn kíp —' : 'Chưa khai kíp (Danh mục → Kíp)', options: cat.kip().map((k) => ({ value: k.id, label: k.ten })),
        onChange: (v) => { d.kip_id = v; if (!d.kip_sx_id) d.kip_sx_id = v; changed(); } }),
      comboField({ label: 'Sản phẩm', value: d.san_pham_id, req: true, options: cat.sanPhamFor(target()).map((s) => ({ value: s.id, label: s.ten, sub: s.dvt ? `${s.ma} · ${s.dvt}` : s.ma })),
        msg: !(d.may_id || d.day_chuyen_id) ? ''
          : cat.coGanSanPham(target()) ? `Chỉ hiện sản phẩm đã khai cho ${isLine() ? 'dây chuyền' : 'máy'} này`
            : `Chưa khai sản phẩm cho ${isLine() ? 'dây chuyền' : 'máy'} này nên đang hiện tất cả — Admin khai ở Danh mục → Sản phẩm → Máy chạy`,
        onChange: (v) => {
          d.san_pham_id = v; d.toc_do_dm = null; applySpeed();
          if (d.multi) d.muc.forEach((m) => { const sp = cat.speedFor(tOf(m.key), v); if (sp != null) m.toc_do_dm = sp; });
          const ok = new Set(cat.loiSp(v).map((l) => l.id));
          const truoc = d.loi_sp.length;
          d.loi_sp = d.loi_sp.filter((x) => !x.loi_id || ok.has(x.loi_id));
          if (d.loi_sp.length < truoc) toast(`Đã bỏ ${truoc - d.loi_sp.length} dòng lỗi không thuộc sản phẩm mới`, 'info');
          changed(); build();
        } }),
    );
    const fixedSpeed = (d.may_id || d.day_chuyen_id) && d.san_pham_id && cat.speedFor(target(), d.san_pham_id) != null;
    if (!d.multi) g1.append(inputField({ label: 'Tốc độ định mức', value: d.toc_do_dm ?? '', unit: `${dvt()}/phút`, num: 'dec', readonly: !!fixedSpeed, req: true,
      msg: fixedSpeed ? `Tự điền theo ${isLine() ? 'dây chuyền' : 'máy'} và sản phẩm` : `Chưa khai báo tốc độ cho ${isLine() ? 'dây chuyền' : 'máy'} + sản phẩm này — nhập tạm hoặc báo Admin`,
      onInput: (v) => { d.toc_do_dm = toNum(v); changed(); } }));
    g1.append(
      peopleField('Người vận hành', 'nguoi_van_hanh_id', 'van_hanh'),
      peopleField('Tổ trưởng', 'to_truong_id', 'to_truong', ['to_truong', 'quan_ly']),
      comboNhom('Kỹ thuật', 'ky_thuat_id', ['ky_thuat'], false),
    );

    // --- Thời gian & sản lượng
    const g2 = $('[data-g2]', main);
    const caReg = S.cat.byId.ca[d.ca_id];
    const caHint = caReg ? `Giờ đăng ký của ${caReg.ten}: ${hm(caReg.gio_bd)}–${hm(caReg.gio_kt)}` : '';
    const capInfo = () => {
      const m = minutesBetween(d.gio_bd, d.gio_kt);
      const lech = caReg && (hm(caReg.gio_bd) !== d.gio_bd || hm(caReg.gio_kt) !== d.gio_kt);
      $('[data-capinfo]', main).textContent = `Thời gian ca: ${fmtMin(m)}${d.nghi_phut ? ` · nghỉ ${d.nghi_phut} phút` : ''}${lech ? ' · khác giờ đăng ký' : ''}`;
    };
    g2.append(
      timeField({ label: 'Giờ bắt đầu', value: d.gio_bd, req: true, msg: caHint,
        onInput: (v) => { d.gio_bd = v; changed(); build(); } }),
      timeField({ label: 'Giờ kết thúc', value: d.gio_kt, req: true, msg: 'Giờ thực tế — sửa được nếu chạy sớm / trễ hơn ca',
        onInput: (v) => { d.gio_kt = v; changed(); build(); } }),
      inputField({ label: 'Nghỉ + dừng có kế hoạch', value: d.nghi_phut ?? 0, unit: 'phút', num: 'int',
        msg: 'Cộng chung: nghỉ giữa ca, họp đầu ca, bảo trì định kỳ, không có đơn hàng… — không tính vào tổn thất',
        onInput: (v) => { d.nghi_phut = toInt(v) || 0; capInfo(); changed(); } }),
      inputField({ label: 'SL kế hoạch', value: d.sl_ke_hoach ?? '', unit: dvt(), num: 'int', msg: 'Để tính SL còn lại trong báo cáo giao ca',
        onInput: (v) => { d.sl_ke_hoach = toInt(v); changed(); } }),
    );
    if (!d.multi) {
      g2.append(
        inputField({ label: 'Tổng sản lượng', value: d.tong_sl ?? '', unit: dvt(), num: 'int', req: true,
          msg: isLine() ? 'Đếm ở máy cuối chuyền, gồm cả hàng lỗi' : 'Gồm cả hàng lỗi', onInput: (v) => { d.tong_sl = toInt(v); changed(); } }),
        inputField({ label: 'Tổng SL lỗi', value: (+d.sl_loi_kd || 0) + (+d.sl_loi_qt || 0), unit: dvt(), num: 'int',
          msg: 'Chi tiết từng lỗi (4 giai đoạn) ghi ở Báo cáo giao ca', onInput: (v) => { d.sl_loi_kd = 0; d.sl_loi_qt = toInt(v) || 0; changed(); } }),
      );
    } else {
      // v1.8: mỗi dây chuyền / máy 1 dòng: tổng SL, SL lỗi, tốc độ định mức
      const box = el(`<div class="nn-field span-2"><span class="nn-label req">Sản lượng từng dây chuyền / máy</span>${d.muc.length ? '' : '<span class="t-cap">Chọn dây chuyền / máy ở phần trên</span>'}</div>`);
      d.muc.forEach((m) => {
        const fixed = d.san_pham_id && cat.speedFor(tOf(m.key), d.san_pham_id) != null;
        const row = el(`<div class="stop"><div class="stop-head"><b>${esc(mucLabel(m.key))}</b></div><div class="form-grid"></div></div>`);
        $('.form-grid', row).append(
          inputField({ label: 'Tổng SL', value: m.tong_sl ?? '', unit: dvt(), num: 'int', req: true, msg: m.key.startsWith('dc:') ? 'Đếm ở máy cuối chuyền' : '', onInput: (v) => { m.tong_sl = toInt(v); changed(); } }),
          inputField({ label: 'SL lỗi', value: m.sl_loi_qt ?? 0, unit: dvt(), num: 'int', onInput: (v) => { m.sl_loi_qt = toInt(v) || 0; changed(); } }),
          inputField({ label: 'Tốc độ định mức', value: m.toc_do_dm ?? '', unit: `${dvt()}/phút`, num: 'dec', readonly: !!fixed, req: true,
            msg: fixed ? 'Tự điền theo danh mục' : 'Chưa khai tốc độ — nhập tạm', onInput: (v) => { m.toc_do_dm = toNum(v); changed(); } }),
        );
        box.append(row);
      });
      g2.append(box);
    }
    capInfo();

    // --- v1.4: bỏ phần Dừng có kế hoạch (gộp vào ô Nghỉ). Phiếu cũ có dữ liệu thì vẫn giữ nguyên khi gửi lại.
    if (d.ke_hoach.length) {
      g2.append(el(`<div class="nn-field span-2"><span class="t-cap">Phiếu cũ có ${d.ke_hoach.length} lần dừng có kế hoạch (${fmtMin(d.ke_hoach.reduce((a, k) => a + minutesBetween(k.gio_bd, k.gio_kt), 0))}) — được giữ nguyên.</span></div>`));
    }

    // --- Dừng máy
    const st = $('[data-stops]', main);
    if (!d.dung_may.length) st.innerHTML = '<div class="t-cap">Chưa có lần dừng máy nào</div>';
    d.dung_may.forEach((s, i) => st.append(stopCard(s, i)));

    // --- Ghi chú
    $('[data-g3]', main).append(textField({ label: 'Ghi chú phiếu', value: d.ghi_chu, onInput: (v) => { d.ghi_chu = v; save(); } }));

    // --- Sự kiện
    $('[data-addstop]', main).onclick = () => {
      if (d.multi ? !d.muc.length : (!d.may_id && !d.day_chuyen_id)) return toast('Chọn dây chuyền / máy trước để hiện đúng bộ mã lỗi', 'warning');
      d.dung_may.push({ id: uuid(), stt: d.dung_may.length + 1, may_id: '', ca_chuyen: true, ma_loi_id: '', muc_do: '', gio_bd: d.gio_bd && d.gio_kt && !timeInRange(nowHM(), d.gio_bd, d.gio_kt) ? '' : nowHM(), gio_kt: '', van_de_cl: '', nguoi_xu_ly_id: '', nguoi_ho_tro: [], tinh_trang: 'cho_xu_ly', ghi_chu: '' });
      changed(); build();
      $$('.stop', st).pop()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    main.onclick = async (e) => {
      const rl = e.target.closest('[data-rmloi]'); if (rl) { d.loi_sp.splice(+rl.dataset.rmloi, 1); changed(); build(); return; }
      const rs = e.target.closest('[data-rmstop]');
      if (rs) {
        if (!(await confirmBox('Xóa lần dừng máy này?', { ok: 'Xóa', danger: true }))) return;
        d.dung_may.splice(+rs.dataset.rmstop, 1); d.dung_may.forEach((x, k) => { x.stt = k + 1; }); changed(); build(); return;
      }
      if (e.target.closest('[data-del]')) {
        if (!(await confirmBox(d._edit ? 'Bỏ các thay đổi chưa gửi?' : 'Xóa phiếu nháp này?', { ok: d._edit ? 'Bỏ thay đổi' : 'Xóa nháp', danger: true }))) return;
        drafts.del(d.id); queue.remove(d.id); deleteDraftServer(d.id); drawHeader();
        return go(d._edit ? `#/phieu/${d.id}` : '#/ghi-phieu');
      }
      if (e.target.closest('[data-submit]')) submit();
    };
    preview();
  }

  // Người xử lý: Kỹ thuật lên đầu danh sách
  const peopleXL = () => cat.nhanSu().map((n) => ({ value: n.id, label: n.ho_ten, sub: VAI_TRO[n.vai_tro], k: n.vai_tro === 'ky_thuat' ? 0 : 1 }))
    .sort((a, b) => a.k - b.k || a.label.localeCompare(b.label, 'vi'));

  function stopCard(s, i) {
    const mk = d.multi ? d.muc.find((x) => x.key.slice(x.key.indexOf(':') + 1) === s.muc) : null;
    const line = d.multi ? !!mk?.key.startsWith('dc:') : isLine();
    const lineId = d.multi ? (line ? mk.key.slice(3) : '') : d.day_chuyen_id;
    const runIn = () => cat.members(lineId).filter((x) => !(d.multi ? [] : d.bo_may).includes(x.may_id));
    const mayId = line ? s.may_id : d.multi ? (mk ? mk.key.slice(2) : '') : d.may_id;
    const codes = mayId ? cat.maLoi(mayId) : [];
    const m = minutesBetween(s.gio_bd, s.gio_kt);
    const card = el(`<div class="stop"><div class="stop-head"><b>Lần dừng ${i + 1}</b>
      <span class="chip" data-min>${s.gio_kt ? fmtMin(m) : 'Đang dừng'}</span>
      <span class="chip" data-short ${s.gio_kt && m < ngan ? '' : 'hidden'}>Dừng ngắn</span>
      <span style="flex:1"></span><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmstop="${i}" aria-label="Xóa lần dừng">${icon('trash', 16)}</button></div>
      <div class="form-grid"></div></div>`);
    const g = $('.form-grid', card);
    // Lỗi khác: luôn có sẵn cho mọi máy, không cần khai trong danh mục — bắt buộc ghi rõ ở Ghi chú
    const khacSel = () => s._khac || (!s.ma_loi_id && !!s.ten_loi);
    const opts = codes.map((c) => ({ value: c.id, label: c.ten, sub: `${c.ma} · ${NHOM_TT[c.nhom_ton_that]} · ${(MUC_DO[c.muc_do] || MUC_DO.dung_ngay).ngan}`, group: NHOM_TT[c.nhom_ton_that] }))
      .sort((a, b) => a.group.localeCompare(b.group, 'vi') || 0);
    if (mayId) opts.push({ value: LOI_KHAC.id, label: LOI_KHAC.ten, sub: 'Không có trong danh mục — phải ghi rõ ở ô Ghi chú', group: 'Lỗi khác' });
    const auto = el(`<div class="nn-field span-2"><span class="nn-label">Tự điền</span><div class="nn-row" style="padding:0;gap:8px" data-auto></div></div>`);
    const paintAuto = () => {
      const short = s.gio_kt && minutesBetween(s.gio_bd, s.gio_kt) < ngan;
      $('[data-auto]', auto).innerHTML = s.ma_loi_id
        ? `<span class="chip nn-mono">${esc(s.ma_loi)}</span><span class="chip dept">${esc(short ? `${NHOM_TT[3]} (dưới ${ngan} phút)` : NHOM_TT[s.nhom_ton_that])}</span><span class="chip">${esc(s.loai_loi || '')}</span>${mucDoBadge(s.muc_do)}`
        : khacSel()
          ? `<span class="chip dept">${esc(short ? `${NHOM_TT[3]} (dưới ${ngan} phút)` : NHOM_TT[s.nhom_ton_that] || '')}</span><span class="chip">${esc(s.loai_loi || '')}</span>${mucDoBadge(s.muc_do)}`
          : '<span class="t-cap">Chọn tên lỗi để tự điền mã lỗi, nhóm tổn thất, loại lỗi</span>';
    };
    // Kết thúc dừng: từ lúc bắt đầu dừng đến hết giờ làm
    const fKt = timeField({ label: 'Kết thúc dừng', value: s.gio_kt, req: true, min: s.gio_bd && d.gio_bd && timeInRange(s.gio_bd, d.gio_bd, d.gio_kt) ? s.gio_bd : d.gio_bd, max: d.gio_kt,
      msg: 'Để trống nếu máy còn đang dừng', onInput: (v) => { s.gio_kt = v; updTime(); } });
    const updTime = () => {
      const mm = minutesBetween(s.gio_bd, s.gio_kt);
      $('[data-min]', card).textContent = s.gio_kt ? fmtMin(mm) : 'Đang dừng';
      $('[data-short]', card).hidden = !(s.gio_kt && mm < ngan);
      paintAuto(); changed();
    };
    if (d.multi) {
      g.append(selectField({ label: 'Dây chuyền / máy bị dừng', value: mk?.key || '', req: true, span: true, placeholder: '— Chọn dây chuyền / máy —',
        options: d.muc.map((m) => ({ value: m.key, label: mucLabel(m.key) })),
        onChange: (v) => { s.muc = v ? v.slice(v.indexOf(':') + 1) : ''; s.may_id = ''; clearFault(s); card.replaceWith(stopCard(s, i)); changed(); } }));
    }
    if (line) {
      g.append(selectField({ label: 'Máy gây lỗi', value: s.may_id || '', req: true, span: true,
        options: runIn().map((x) => ({ value: x.may_id, label: cat.mayLabel(x.may_id) })),
        onChange: (v) => { s.may_id = v; clearFault(s); card.replaceWith(stopCard(s, i)); changed(); } }));
    }
    // v1.4: ô giờ 24 tiếng chỉ hiện khung giờ từ giờ bắt đầu đến giờ kết thúc của phiếu (kể cả ca qua đêm)
    const qua_dem = d.gio_bd && d.gio_kt && d.gio_kt <= d.gio_bd;
    const gioMsg = d.gio_bd && d.gio_kt ? `Trong giờ làm ${d.gio_bd}–${d.gio_kt}${qua_dem ? ' (qua đêm)' : ''}` : 'Nhập giờ bắt đầu / kết thúc ở phần trên trước';

    g.append(
      comboField({ label: 'Tên lỗi', value: khacSel() ? LOI_KHAC.id : s.ma_loi_id, req: true, span: true, options: opts,
        msg: line && !s.may_id ? 'Chọn máy gây lỗi trước để hiện đúng bộ mã lỗi của máy đó' : '',
        onChange: (v) => {
          const c = S.cat.byId.ma_loi[v];
          const truoc = isLoiKhac(s.ten_loi);
          if (v === LOI_KHAC.id) {
            Object.assign(s, { _khac: true, ma_loi_id: '', ma_loi: '', ten_loi: LOI_KHAC.ten,
              nhom_ton_that: s.nhom_ton_that || 1, loai_loi: s.loai_loi || 'Khác', muc_do: s.muc_do || 'dung_ngay' });
          } else {
            Object.assign(s, { _khac: false }, c
              ? { ma_loi_id: c.id, ma_loi: c.ma, ten_loi: c.ten, nhom_ton_that: c.nhom_ton_that, loai_loi: c.loai_loi, muc_do: c.muc_do || 'dung_ngay' }
              : { ma_loi_id: '', ma_loi: '', ten_loi: '', nhom_ton_that: null, loai_loi: '', muc_do: '' });
          }
          paintAuto(); changed();
          if (truoc !== isLoiKhac(s.ten_loi)) {
            const fresh = stopCard(s, i); card.replaceWith(fresh);
            if (isLoiKhac(s.ten_loi)) setTimeout(() => $('[data-gc] textarea', fresh)?.focus(), 50);
          }
        } }),
      auto,
    );
    // Lỗi khác không có trong danh mục nên người ghi tự chọn nhóm tổn thất và loại lỗi
    if (khacSel()) {
      g.append(
        selectField({ label: 'Nhóm 6 tổn thất', value: String(s.nhom_ton_that || 1), req: true,
          options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n}. ${NHOM_TT[n]}` })),
          onChange: (v) => { s.nhom_ton_that = Number(v) || 1; paintAuto(); changed(); } }),
        selectField({ label: 'Loại lỗi', value: s.loai_loi || 'Khác', req: true,
          options: ['Cơ', 'Điện', 'Vận hành', 'Nguyên liệu', 'Tiện ích', 'Chất lượng', 'Khác'].map((x) => ({ value: x, label: x })),
          onChange: (v) => { s.loai_loi = v; paintAuto(); changed(); } }),
      );
    }
    // Mức độ xử lý: tự điền theo mã lỗi, người ghi sửa lại được cho trường hợp cá biệt
    if (s.ma_loi_id || khacSel()) {
      const md = el(`<div class="nn-field span-2"><span class="nn-label">Mức độ xử lý</span></div>`);
      md.append(segmented(Object.entries(MUC_DO).map(([k, v]) => ({ value: k, label: v.label })), s.muc_do || 'dung_ngay',
        (v) => { s.muc_do = v; paintAuto(); changed(); }));
      md.append(el(`<span class="nn-field-msg">${s.ma_loi_id ? 'Tự điền theo mã lỗi — sửa lại nếu thực tế khác' : 'Chọn cho lần dừng này'}</span>`));
      g.append(md);
    }
    g.append(
      timeField({ label: 'Bắt đầu dừng', value: s.gio_bd, req: true, min: d.gio_bd, max: d.gio_kt, msg: gioMsg,
        onInput: (v) => { s.gio_bd = v; updTime(); fKt.setRange(v || d.gio_bd, d.gio_kt); } }),
      fKt,
    );
    if (line && runIn().length > 1) {
      const cb = el(`<label class="nn-field span-2" style="flex-direction:row;align-items:flex-start;gap:8px"><input type="checkbox" style="width:22px;height:22px;flex:none" ${s.ca_chuyen !== false ? 'checked' : ''}>
        <span>Cả chuyền dừng<br><span class="t-cap">Máy chạy nối tiếp nên thường cả chuyền dừng theo. Bỏ tích nếu chỉ riêng máy này dừng.</span></span></label>`);
      $('input', cb).onchange = (e) => { s.ca_chuyen = e.target.checked; changed(); };
      g.append(cb);
    }
    g.append(
      comboField({ label: 'Người xử lý chính', value: s.nguoi_xu_ly_id, options: peopleXL(), onChange: (v) => { s.nguoi_xu_ly_id = v; s.nguoi_ho_tro = (s.nguoi_ho_tro || []).filter((x) => x !== v); changed(); } }),
      multiField({ label: 'Người hỗ trợ', value: s.nguoi_ho_tro || [], options: peopleXL(), span: true, onChange: (v) => { s.nguoi_ho_tro = v.filter((x) => x !== s.nguoi_xu_ly_id); changed(); } }),
      selectField({ label: 'Tình trạng lỗi', value: s.tinh_trang, placeholder: '— Chọn —', options: Object.entries(TINH_TRANG).map(([k, t]) => ({ value: k, label: t.label })), onChange: (v) => { s.tinh_trang = v || 'cho_xu_ly'; changed(); } }),
    );
    const khac = isLoiKhac(s.ten_loi);
    const gc = textField({ label: khac ? 'Ghi chú: ghi rõ lỗi cụ thể (bắt buộc với lỗi khác)' : 'Ghi chú', value: s.ghi_chu,
      placeholder: khac ? 'Ví dụ: kẹt chai ở băng tải ra do lệch thanh dẫn hướng' : '', onInput: (v) => { s.ghi_chu = v; save(); } });
    if (khac) { gc.dataset.gc = '1'; $('.nn-label', gc).classList.add('req'); }
    g.append(gc);
    paintAuto();
    return card;
  }

  function loiCard(x, i, onChange) {
    const list = cat.loiSp(d.san_pham_id);
    const opts = list.map((l) => ({ value: l.id, label: l.ten, sub: l.ma || '' }));
    opts.push({ value: LOI_KHAC.id, label: LOI_KHAC.ten, sub: 'Không có trong danh sách — phải ghi rõ ở ô Ghi chú' });
    if (x.loi_id && !list.some((l) => l.id === x.loi_id)) opts.unshift({ value: x.loi_id, label: x.ten, sub: 'Đã ngưng dùng trong danh mục' });
    const khac = !x.loi_id && isLoiKhac(x.ten);
    const card = el(`<div class="stop"><div class="stop-head"><b>Lỗi ${i + 1}</b><span style="flex:1"></span>
      <button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmloi="${i}" aria-label="Xóa dòng lỗi">${icon('trash', 16)}</button></div><div class="form-grid"></div></div>`);
    const g = $('.form-grid', card);
    g.append(
      comboField({ label: 'Tên lỗi', value: x.loi_id || (khac ? LOI_KHAC.id : ''), req: true, options: opts,
        msg: list.length ? '' : 'Sản phẩm này chưa khai danh sách lỗi — Admin khai ở Danh mục → Lỗi sản phẩm',
        onChange: (v) => {
          const l = S.cat.byId.loi_san_pham?.[v] || list.find((y) => y.id === v);
          const truoc = !x.loi_id && isLoiKhac(x.ten);
          if (v === LOI_KHAC.id) Object.assign(x, { loi_id: '', ma: '', ten: LOI_KHAC.ten });
          else Object.assign(x, l ? { loi_id: l.id, ma: l.ma || '', ten: l.ten } : { loi_id: '', ma: '', ten: '' });
          changed();
          if (truoc !== (!x.loi_id && isLoiKhac(x.ten))) { const fresh = loiCard(x, i, onChange); card.replaceWith(fresh); if (v === LOI_KHAC.id) setTimeout(() => $('textarea', fresh)?.focus(), 50); }
        } }),
      inputField({ label: 'Số lượng', value: x.so_luong ?? '', unit: dvt(), num: 'int', req: true, onInput: (v) => { x.so_luong = toInt(v); onChange(); changed(); } }),
    );
    const gc = textField({ label: khac ? 'Ghi chú: ghi rõ lỗi cụ thể (bắt buộc với lỗi khác)' : 'Ghi chú', value: x.ghi_chu,
      placeholder: khac ? 'Ví dụ: chai bị trầy thân do kẹt thanh dẫn hướng' : '', onInput: (v) => { x.ghi_chu = v; save(); } });
    if (khac) $('.nn-label', gc).classList.add('req');
    g.append(gc);
    return card;
  }

  // ---- v1.8: hỗ trợ ghi chung nhiều dây chuyền / máy
  function tOf(k) { return k.startsWith('dc:') ? { day_chuyen_id: k.slice(3) } : { may_id: k.slice(2) }; }
  function mucLabel(k) { return k.startsWith('dc:') ? cat.name('day_chuyen', k.slice(3)) : cat.mayLabel(k.slice(2)); }
  function calcMuc(m) {
    const raw = m.key.slice(m.key.indexOf(':') + 1);
    const last = m.key.startsWith('dc:') ? cat.lastMay(raw) : null;
    const stops = d.dung_may.filter((x) => x.muc === raw && (!last || x.ca_chuyen !== false || x.may_id === last));
    return calcPhieu({ ...d, tong_sl: m.tong_sl, sl_loi_kd: 0, sl_loi_qt: m.sl_loi_qt || 0, toc_do_dm: m.toc_do_dm, dung_may: stops }, ngan);
  }
  async function sendMulti(btn) {
    const body = { ...d, trang_thai: $('[data-confirm]', main)?.checked ? 'da_xac_nhan' : undefined, nghi_phut: d.nghi_phut || 0 };
    for (const k of ['loi_sp', 'multi', 'may_id', 'day_chuyen_id', 'bo_may', 'tong_sl', 'toc_do_dm', 'bo_phan_id']) delete body[k];
    for (const k of ['san_pham_id', 'nguoi_van_hanh_id', 'to_truong_id', 'ky_thuat_id', 'kip_id']) body[k] = body[k] || null;
    body.muc = d.muc.map((m) => ({ ...(m.key.startsWith('dc:') ? { day_chuyen_id: m.key.slice(3) } : { may_id: m.key.slice(2) }), tong_sl: m.tong_sl, sl_loi_qt: m.sl_loi_qt || 0, toc_do_dm: m.toc_do_dm, bo_may: [] }));
    body.dung_may = d.dung_may.map((x, k) => ({ ...x, stt: k + 1, nguoi_xu_ly_id: x.nguoi_xu_ly_id || null, ma_loi_id: x.ma_loi_id || null, may_id: x.may_id || null, ca_chuyen: x.ca_chuyen !== false }));
    try {
      const r = await submitPhieu(body);
      drawHeader();
      if (r.queued) { toast('Đang mất mạng — phiếu đã lưu trên máy và sẽ tự gửi khi có mạng', 'warning', 'Chờ đồng bộ'); go('#/ghi-phieu'); return; }
      toast(`Đã gửi phiếu ghi chung ${d.muc.length} dây chuyền / máy`, 'success');
      if (r.bo_qua?.length) toast(`Máy dùng chung ${r.bo_qua.join(', ')} đã có phiếu ca này ở dây chuyền khác — không tính`, 'warning');
      go('#/danh-sach');
    } catch (e) { btn.disabled = false; toast(errText(e), 'danger', 'Máy chủ từ chối phiếu'); }
  }
  /** Bước xem lại trước khi gửi: "← Quay lại sửa" hoặc "Xác nhận gửi" */
  function review() {
    return new Promise((resolve) => {
      const dongs = d.multi ? d.muc.map((m) => { const c = calcMuc(m); return [mucLabel(m.key), `${fmtNum(m.tong_sl)} ${dvt()} · lỗi ${fmtNum(m.sl_loi_qt || 0)} · OEE ${fmtPct(c.OEE)}`]; })
        : [[d.day_chuyen_id ? cat.name('day_chuyen', d.day_chuyen_id) : cat.mayLabel(d.may_id), `${fmtNum(d.tong_sl)} ${dvt()} · lỗi ${fmtNum((+d.sl_loi_kd || 0) + (+d.sl_loi_qt || 0))}`]];
      const body = el(`<div class="nn-stack" style="padding:0;gap:8px">
        <div class="t-cap">Kiểm tra lại trước khi gửi. Bấm “Quay lại sửa” để về phiếu sửa tiếp.</div>
        <div class="nn-table-wrap"><table class="nn-table"><tbody>
          <tr><th>Ngày · Ca</th><td>${fmtDate(d.ngay)} · ${esc(cat.name('ca', d.ca_id))}${d.kip_id ? ` · ${esc(cat.name('kip', d.kip_id))}` : ''} · ${esc(d.gio_bd)}–${esc(d.gio_kt)}</td></tr>
          <tr><th>Sản phẩm</th><td>${esc(cat.name('san_pham', d.san_pham_id) || '—')}</td></tr>
          ${dongs.map(([a, b]) => `<tr><th class="wrap">${esc(a)}</th><td>${b}</td></tr>`).join('')}
          <tr><th>Lần dừng máy</th><td>${d.dung_may.length} lần · ${fmtMin(d.dung_may.reduce((a, x) => a + minutesBetween(x.gio_bd, x.gio_kt), 0))}</td></tr>
          <tr><th>Người vận hành</th><td>${esc(cat.person(d.nguoi_van_hanh_id) || '—')}</td></tr>
        </tbody></table></div></div>`);
      const back = el(`<button class="nn-btn nn-btn-secondary nn-btn-lg">${icon('chevL', 18)}Quay lại sửa</button>`);
      const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Xác nhận gửi</button>`);
      let done = false;
      const sh = openSheet({ title: 'Xem lại phiếu trước khi gửi', body, foot: [back, ok], onClose: () => { if (!done) resolve(false); } });
      back.onclick = () => sh.close();
      ok.onclick = () => { done = true; sh.close(); resolve(true); };
    });
  }

  function preview() {
    const box = $('[data-preview]', main); if (!box) return;
    if (d.multi) {
      box.innerHTML = `<div style="grid-column:1/-1"><div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Dây chuyền / máy</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th class="num">OEE</th></tr></thead><tbody>
        ${d.muc.map((m) => { const c = calcMuc(m); return `<tr><td class="wrap">${esc(mucLabel(m.key))}</td><td class="num">${fmtPct(c.A)}</td><td class="num">${fmtPct(c.P)}</td><td class="num">${fmtPct(c.Q)}</td><td class="num"><b>${fmtPct(c.OEE)}</b></td></tr>`; }).join('')
          || '<tr><td colspan="5" class="muted">Chưa chọn dây chuyền / máy</td></tr>'}</tbody></table></div></div>`;
      return;
    }
    const rep = repMayId();
    // Dây chuyền: chỉ tính các lần dừng làm dừng máy cuối chuyền (cả chuyền dừng, hoặc chính máy cuối gây lỗi)
    const stops = isLine() ? d.dung_may.filter((s) => s.ca_chuyen !== false || s.may_id === rep) : d.dung_may;
    const c = calcPhieu({ ...d, dung_may: stops }, ngan);
    const m = repMay();
    box.innerHTML = [
      kpiCard({ label: 'OEE', value: c.OEE == null ? '—' : fmtNum(c.OEE * 100, 1), unit: '%', status: c.OEE == null ? '' : oeeBadge(c.OEE, m?.nguong_xanh, m?.nguong_vang, true), foot: `<span>Mục tiêu: <b>${fmtNum(m?.oee_muc_tieu ?? 85)}%</b></span>`, small: true }),
      kpiCard({ label: 'Availability', value: c.A == null ? '—' : fmtNum(c.A * 100, 1), unit: '%', foot: `<span>Chạy <b>${fmtMin(c.run)}</b> / ${fmtMin(c.ppt)}</span>`, small: true }),
      kpiCard({ label: 'Performance', value: c.P == null ? '—' : fmtNum(c.P * 100, 1), unit: '%', foot: c.hasSpeed ? `<span>Lý tưởng <b>${fmtMin(c.ideal)}</b></span>` : '<span>Thiếu tốc độ định mức</span>', small: true }),
      kpiCard({ label: 'Quality', value: c.Q == null ? '—' : fmtNum(c.Q * 100, 1), unit: '%', foot: `<span>Đạt <b>${fmtNum(c.good)}</b> sp</span>`, small: true }),
    ].join('');
    if (c.P != null && c.P > 1.05) box.insertAdjacentHTML('beforeend', `<div class="nn-alert nn-alert-warning" style="grid-column:1/-1"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Performance trên 100% — kiểm tra lại tổng sản lượng, thời gian dừng hoặc tốc độ định mức</div></div></div>`);
  }

  function validate() {
    const errs = [];
    if (d.multi) {
      if (!d.muc.length) errs.push('Chưa chọn dây chuyền / máy nào');
      d.muc.forEach((m) => {
        if (m.tong_sl == null) errs.push(`${mucLabel(m.key)}: chưa nhập tổng SL`);
        else if ((m.sl_loi_qt || 0) > m.tong_sl) errs.push(`${mucLabel(m.key)}: SL lỗi lớn hơn tổng SL`);
        if (!(m.toc_do_dm > 0)) errs.push(`${mucLabel(m.key)}: chưa có tốc độ định mức`);
      });
      d.dung_may.forEach((x, i) => { if (!x.muc) errs.push(`Lần dừng ${i + 1}: chưa chọn dây chuyền / máy bị dừng`); });
    } else if (!d.may_id && !d.day_chuyen_id) errs.push('Chưa chọn dây chuyền / máy');
    if (!d.ngay) errs.push('Chưa chọn ngày');
    if (!d.ca_id) errs.push('Chưa chọn ca');
    if (!d.san_pham_id) errs.push('Chưa chọn sản phẩm');
    if (!d.multi && !(d.toc_do_dm > 0)) errs.push('Chưa có tốc độ định mức');
    if (!d.gio_bd || !d.gio_kt) errs.push('Thiếu giờ bắt đầu / kết thúc ca');
    if (!d.multi && d.tong_sl == null) errs.push('Chưa nhập tổng sản lượng');
    if (!d.multi && (+d.sl_loi_qt || 0) + (+d.sl_loi_kd || 0) > (d.tong_sl || 0)) errs.push('Tổng SL lỗi lớn hơn tổng sản lượng');
    d.dung_may.forEach((s, i) => {
      if ((d.multi ? d.muc.find((m) => m.key === `dc:${s.muc}`) : isLine()) && !s.may_id) errs.push(`Lần dừng ${i + 1}: chưa chọn máy gây lỗi`);
      if (!s.ma_loi_id && !String(s.ten_loi || '').trim()) errs.push(`Lần dừng ${i + 1}: chưa chọn tên lỗi`);
      else if (isLoiKhac(s.ten_loi) && !String(s.ghi_chu || '').trim()) errs.push(`Lần dừng ${i + 1}: chọn "${s.ten_loi}" thì phải ghi rõ lỗi cụ thể vào ô Ghi chú`);
      if (isLine() && s.may_id && d.bo_may.includes(s.may_id)) errs.push(`Lần dừng ${i + 1}: máy gây lỗi đã bị bỏ tích (không chạy)`);
      if (!s.gio_bd || !s.gio_kt) errs.push(`Lần dừng ${i + 1}: thiếu giờ bắt đầu / kết thúc`);
      else if (d.gio_bd && d.gio_kt) {
        // Cả giờ bắt đầu lẫn giờ kết thúc dừng đều phải nằm trong giờ làm việc của phiếu
        if (!timeInRange(s.gio_bd, d.gio_bd, d.gio_kt)) errs.push(`Lần dừng ${i + 1}: giờ bắt đầu ${s.gio_bd} nằm ngoài ca ${d.gio_bd}–${d.gio_kt}`);
        else if (!timeInRange(s.gio_kt, d.gio_bd, d.gio_kt)) errs.push(`Lần dừng ${i + 1}: giờ kết thúc ${s.gio_kt} nằm ngoài ca ${d.gio_bd}–${d.gio_kt}`);
        else if (minutesBetween(d.gio_bd, s.gio_kt) < minutesBetween(d.gio_bd, s.gio_bd)) errs.push(`Lần dừng ${i + 1}: giờ kết thúc dừng ${s.gio_kt} sớm hơn giờ bắt đầu dừng ${s.gio_bd}`);
      }
    });
    const c = calcPhieu(d.multi ? { ...d, tong_sl: 0, toc_do_dm: 1 } : d, ngan);
    if (c.caPhut && c.stopLoss + c.keHoach + c.nghi > c.caPhut) errs.push(`Tổng thời gian dừng (${fmtMin(c.stopLoss + c.keHoach + c.nghi)}) vượt thời gian ca (${fmtMin(c.caPhut)})`);
    return errs;
  }

  async function submit() {
    const errs = validate();
    if (errs.length) {
      toast(errs.slice(0, 4).join(' · ') + (errs.length > 4 ? ` · và ${errs.length - 4} lỗi khác` : ''), 'danger', 'Chưa gửi được phiếu');
      return;
    }
    if (!(await review())) return;   // v1.8: xem lại -> "Quay lại sửa" hoặc "Xác nhận gửi"
    const btn = $('[data-submit]', main);
    btn.disabled = true;
    const line = isLine();
    if (d.multi) return sendMulti(btn);
    const body = { ...d, trang_thai: $('[data-confirm]', main)?.checked ? 'da_xac_nhan' : undefined, nghi_phut: d.nghi_phut || 0 };
    body.day_chuyen_id = d.day_chuyen_id || null;
    body.dung_may = d.dung_may.map((s, k) => ({ ...s, stt: k + 1, nguoi_xu_ly_id: s.nguoi_xu_ly_id || null, ma_loi_id: s.ma_loi_id || null, may_id: line ? s.may_id : undefined, ca_chuyen: line ? s.ca_chuyen !== false : undefined }));
    body.ke_hoach = d.ke_hoach.map((k) => ({ ...k, ly_do_id: k.ly_do_id || null }));
    delete body.loi_sp; delete body.muc; delete body.multi; delete body.bo_phan_id;   // v1.8: lỗi chi tiết ghi ở Báo cáo giao ca
    body.sl_loi_kd = 0; body.sl_loi_qt = (+d.sl_loi_kd || 0) + (+d.sl_loi_qt || 0);
    for (const k of ['san_pham_id', 'nguoi_van_hanh_id', 'to_truong_id', 'ky_thuat_id']) body[k] = body[k] || null;
    if (line) { body.may_id = null; body.bo_may = d.bo_may.filter((id) => members().some((x) => x.may_id === id)); } else delete body.bo_may;
    try {
      const r = await submitPhieu(body);
      drawHeader();
      if (r.queued) { toast('Đang mất mạng — phiếu đã lưu trên máy và sẽ tự gửi khi có mạng', 'warning', 'Chờ đồng bộ'); go('#/ghi-phieu'); }
      else {
        toast(r.trang_thai === 'da_xac_nhan' ? 'Đã gửi và khóa phiếu' : 'Đã gửi phiếu — chờ tổ trưởng xác nhận', 'success');
        if (r.bo_qua?.length) toast(`Máy dùng chung ${r.bo_qua.join(', ')} đã có phiếu ca này ở dây chuyền khác — không tính vào phiếu này`, 'warning', 'Bỏ qua máy dùng chung');
        go(`#/phieu/${d.id}`);
      }
    } catch (e) {
      btn.disabled = false;
      toast(errText(e), 'danger', 'Máy chủ từ chối phiếu');
    }
  }

  // Phiếu mới: chọn ca mặc định theo giờ hiện tại
  if (!d.ca_id && !d._edit && (d.may_id || d.day_chuyen_id)) { pickDefaultCa(); applyPeople(); }
  drafts.put(d);
  build();
}

// ================= CHI TIẾT PHIẾU (máy đơn hoặc dây chuyền) =================
/** Hộp nhập lý do. Trả về chuỗi (đã trim) hoặc null nếu bấm đóng. */
export function askText(title, label, placeholder, okText, req = true) {
  return new Promise((resolve) => {
    let v = '';
    const body = el('<div></div>');
    const f = textField({ label, placeholder, onInput: (x) => { v = x; } });
    if (req) $('.nn-label', f).classList.add('req');
    body.append(f);
    const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${esc(okText)}</button>`);
    let done = false;
    const s = openSheet({ title, body, foot: [ok], onClose: () => { if (!done) resolve(null); } });
    setTimeout(() => $('textarea', body)?.focus(), 50);
    ok.onclick = () => {
      if (req && !v.trim()) return toast('Chưa nhập lý do', 'warning');
      done = true; s.close(); resolve(v.trim());
    };
  });
}

const HANH_DONG = {
  tao: 'Tạo', sua: 'Sửa', xoa: 'Xóa', xac_nhan: 'Xác nhận & khóa', mo_khoa: 'Mở khóa', doi_tinh_trang: 'Đổi tình trạng lỗi',
  yeu_cau_mo_khoa: 'Yêu cầu mở khóa', tu_choi_mo_khoa: 'Từ chối mở khóa', luu_tru: 'Chuyển lưu trữ', nhan_ca: 'Nhận ca',
};
const TRUONG = {
  tong_sl: 'Tổng SL', sl_loi_kd: 'Lỗi KĐ', sl_loi_qt: 'Lỗi QT', loi_sp: 'Lỗi sản phẩm', gio_bd: 'Giờ bắt đầu', gio_kt: 'Giờ kết thúc', nghi_phut: 'Nghỉ',
  san_pham_id: 'Sản phẩm', toc_do_dm: 'Tốc độ', ca_id: 'Ca', ngay: 'Ngày', trang_thai: 'Trạng thái', ghi_chu: 'Ghi chú', tinh_trang: 'Tình trạng',
  ma_loi: 'Mã lỗi', ten_loi: 'Tên lỗi', nguoi_van_hanh_id: 'Vận hành', to_truong_id: 'Tổ trưởng', ky_thuat_id: 'Kỹ thuật', ghi_chu_xu_ly: 'Ghi chú xử lý',
};
const BO_QUA = new Set(['xac_nhan_boi', 'xac_nhan_luc', 'cap_nhat_boi', 'cap_nhat_luc', 'nguoi_tao', 'id', 'phieu_id', 'nha_may_id', 'bo_phan_id']);
const showVal = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} dòng` : '…') : String(v).slice(0, 40));

/** Phần "Lịch sử phiếu": nhật ký tự động (ai, lúc nào, làm gì, số cũ → số mới) */
export function historyHtml(logs, ycs) {
  if (!can.nhatKy() && !logs.some((l) => l.nguoi_id === S.profile.id)) return '';
  const rows = logs.map((l) => {
    let chi = '';
    if (l.hanh_dong === 'sua' || l.hanh_dong === 'doi_tinh_trang') {
      chi = Object.entries(l.thay_doi || {}).filter(([k]) => !BO_QUA.has(k))
        .map(([k, [a, b]]) => `${esc(TRUONG[k] || k)}: ${esc(showVal(a))} → <b>${esc(showVal(b))}</b>`).join(' · ');
    }
    const bang = l.bang === 'dung_may' ? ` <span class="chip">Lần dừng${l.thay_doi?.stt ? ` ${l.thay_doi.stt}` : ''}</span>` : '';
    return `<tr><td class="nn-mono" style="white-space:nowrap">${fmtDateTime(l.luc)}</td><td>${esc(l.nguoi || '')}</td>
      <td><b>${esc(HANH_DONG[l.hanh_dong] || l.hanh_dong)}</b>${bang}</td>
      <td class="wrap">${l.ly_do ? `Lý do: ${esc(l.ly_do)}${chi ? '<br>' : ''}` : ''}${chi}</td></tr>`;
  }).join('');
  return `<section class="card section"><div class="card-head"><div><div class="t-h2">Lịch sử phiếu (${logs.length})</div>
    <div class="t-cap">Tự động ghi mọi thao tác tạo, sửa, xác nhận, mở khóa, đổi tình trạng lỗi — không sửa / xóa được.${ycs.length ? ` ${ycs.length} lần yêu cầu mở khóa.` : ''}</div></div></div>
    ${logs.length ? `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lúc</th><th>Người</th><th>Thao tác</th><th>Chi tiết</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="t-cap">Chưa có nhật ký (phiếu tạo trước bản 1.5)</div>'}</section>`;
}

async function detail(main, id) {
  if (!S.online) {
    const q = queue.all().find((x) => x.id === id);
    if (q) return go(`#/ghi-phieu/nhap/${id}`);
    main.innerHTML = '<div class="empty">Cần kết nối mạng để xem phiếu đã gửi</div>'; return;
  }
  const rows = await getPhieuGroup(id);
  if (!rows.length) { main.innerHTML = '<div class="empty">Không tìm thấy phiếu (có thể đã bị xóa)</div>'; return; }
  const isGroup = !!rows[0].nhom_id;
  const key = rows[0].nhom_id || rows[0].id;
  const calc = (p) => calcPhieu(p, cat.caiDatOf(p.nha_may_id).nguong_dung_ngan || 5);
  const items = rows.map((p) => ({ p, c: calc(p) }));
  const line = isGroup ? S.cat.byId.day_chuyen[rows[0].day_chuyen_id] : null;
  const lastId = isGroup ? cat.lastMay(rows[0].day_chuyen_id) : null;
  const rep = (isGroup && items.find((x) => x.p.may_id === lastId)) || items[0];
  const { p, c } = rep;
  const m = S.cat.byId.may[p.may_id];
  const locked = rows.some((r) => r.trang_thai === 'da_xac_nhan');
  const me = S.profile;
  // v1.5: phiếu đã khóa thì không ai sửa / xóa trực tiếp — phải mở khóa (có lý do) hoặc yêu cầu mở khóa
  const arc = !!p._luu_tru;
  const canEdit = !arc && !locked && can.ghiPhieu() && (p.nguoi_tao === me.id || can.xacNhan());
  const canDelete = !arc && !locked && (can.suaKhoa() || p.nguoi_tao === me.id);
  const [{ data: ycs }, { data: logs }] = await Promise.all([
    sb.from('yeu_cau_mo_khoa').select('*').eq('phieu_id', key).order('luc', { ascending: false }),
    sb.from('nhat_ky').select('*').or(isGroup ? `nhom_id.eq.${key}` : `phieu_id.eq.${key}`).order('luc', { ascending: false }).limit(200),
  ]).catch(() => [{ data: [] }, { data: [] }]);
  const ycCho = (ycs || []).find((y) => y.trang_thai === 'cho_duyet');
  const canYc = !arc && locked && !ycCho && can.ghiPhieu() && !can.moKhoa() && (me.vai_tro !== 'van_hanh' || p.nguoi_tao === me.id);
  const stops = [];
  for (const it of items) for (const s of (it.p.dung_may || []).filter((x) => x.goc !== false)) stops.push({ s, parent: it.p });
  stops.sort((a, b) => String(a.s.gio_bd).localeCompare(String(b.s.gio_bd)));
  const caChuyen = (s) => isGroup && rows.some((o) => (o.dung_may || []).some((x) => x.dung_may_goc_id === s.id));
  const title = isGroup ? (line?.ten || 'Dây chuyền') : (m?.ma || '');

  main.innerHTML = `<div class="page-head"><div><div class="t-page">${esc(title)} · ${fmtDate(p.ngay)} · ${esc(cat.name('ca', p.ca_id))}</div>
    <div class="muted">${isGroup ? `Phiếu dây chuyền · ${rows.length} máy · máy cuối ${esc(cat.name('may', lastId, 'ma'))}` : `${esc(m?.ten || '')} · ${esc(cat.name('bo_phan', p.bo_phan_id))}`}</div></div>${phieuBadge(p.trang_thai)}</div>
    ${arc ? `<div class="nn-alert nn-alert-info section"><span class="nn-alert-icon nn-tone-info">${icon('info', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Phiếu đã chuyển sang lưu trữ — chỉ xem, không sửa.</div></div></div>` : ''}
    ${ycCho ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('hold', 20)}</span><div class="nn-alert-body">
      <div class="nn-alert-title">Đang chờ duyệt mở khóa</div><div class="nn-alert-text">${esc(cat.person(ycCho.nguoi_yc) || '')} · ${fmtDateTime(ycCho.luc)} · Lý do: ${esc(ycCho.ly_do)}</div></div></div>` : ''}
    <section class="card section no-print action-bar"><div class="nn-row" style="padding:0">
      ${!arc && can.xacNhan() && !locked ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-act="confirm">${icon('lock', 18)}Xác nhận và khóa</button>` : ''}
      ${canEdit ? `<a class="nn-btn nn-btn-secondary nn-btn-lg" href="#/phieu/${p.nhom_chung || key}/sua">${icon('edit', 18)}${p.nhom_chung ? 'Sửa phiếu ghi chung' : 'Sửa phiếu'}</a>` : ''}
      ${!arc && locked && can.moKhoa() && ycCho ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-act="approve">${icon('unlock', 18)}Duyệt mở khóa</button>
        <button class="nn-btn nn-btn-secondary nn-btn-lg" data-act="reject">${icon('x', 18)}Từ chối</button>` : ''}
      ${!arc && locked && can.moKhoa() && !ycCho ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-act="unlock">${icon('unlock', 18)}Mở khóa</button>` : ''}
      ${canYc ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-act="request">${icon('unlock', 18)}Yêu cầu mở khóa</button>` : ''}
      <a class="nn-btn nn-btn-secondary nn-btn-lg" href="#/in/${key}">${icon('print', 18)}In / PDF</a>
      ${canDelete ? `<button class="nn-btn nn-btn-danger nn-btn-lg" data-act="delete">${icon('trash', 18)}Xóa phiếu</button>` : ''}
    </div></section>
    <section class="grid-kpi section">
      ${kpiCard({ label: isGroup ? 'OEE dây chuyền' : 'OEE', value: c.OEE == null ? '—' : fmtNum(c.OEE * 100, 1), unit: '%', status: oeeBadge(c.OEE, m?.nguong_xanh, m?.nguong_vang, true), foot: `<span>Mục tiêu <b>${fmtNum(m?.oee_muc_tieu ?? 85)}%</b></span>` })}
      ${kpiCard({ label: 'Availability', value: fmtNum((c.A ?? 0) * 100, 1), unit: '%', foot: `<span>Chạy <b>${fmtMin(c.run)}</b></span><span>PPT ${fmtMin(c.ppt)}</span>` })}
      ${kpiCard({ label: 'Performance', value: c.P == null ? '—' : fmtNum(c.P * 100, 1), unit: '%', foot: `<span>Tốc độ <b>${fmtNum(p.toc_do_dm, 1)}</b> ${esc(S.cat.byId.san_pham[p.san_pham_id]?.dvt || 'sp')}/phút</span>` })}
      ${kpiCard({ label: 'Quality', value: c.Q == null ? '—' : fmtNum(c.Q * 100, 1), unit: '%', foot: `<span>Đạt <b>${fmtNum(c.good)}</b>/${fmtNum(c.tong)}</span>` })}
    </section>
    <section class="card section"><div class="card-head"><div class="t-h2">Thông tin phiếu</div></div>
      <div class="nn-table-wrap"><table class="nn-table"><tbody>
        <tr><th>Sản phẩm</th><td>${esc(cat.name('san_pham', p.san_pham_id) || '—')}</td><th>Giờ ca</th><td>${hm(p.gio_bd)}–${hm(p.gio_kt)} · nghỉ ${p.nghi_phut} phút</td></tr>
        <tr><th>Vận hành</th><td>${esc(cat.person(p.nguoi_van_hanh_id) || '—')}</td><th>Tổng SL</th><td class="num">${fmtNum(p.tong_sl)}</td></tr>
        <tr><th>Tổ trưởng</th><td>${esc(cat.person(p.to_truong_id) || '—')}</td><th>Tổng SL lỗi</th><td class="num">${fmtNum((+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0))}</td></tr>
        <tr><th>Kỹ thuật</th><td>${esc(cat.person(p.ky_thuat_id) || '—')}</td><th>Lỗi sản phẩm</th><td class="wrap">${(p.loi_sp || []).length
          ? p.loi_sp.map((x) => `${esc(x.ten)}: <b>${fmtNum(x.so_luong)}</b>${x.ghi_chu ? ` <span class="t-cap">(${esc(x.ghi_chu)})</span>` : ''}`).join('<br>')
          : (+p.sl_loi_kd ? `Khởi động ${fmtNum(p.sl_loi_kd)} · quá trình ${fmtNum(p.sl_loi_qt)}` : '—')}</td></tr>
        <tr><th>Kíp</th><td>${esc(cat.name('kip', p.kip_id) || '—')}</td><th>SL kế hoạch</th><td class="num">${p.sl_ke_hoach != null ? fmtNum(p.sl_ke_hoach) : '—'}</td></tr>
        ${p.lo || p.so_thung || p.ngay_sx || p.so_phieu_kho ? `<tr><th>Ngày SX · Lô</th><td>${p.ngay_sx ? fmtDate(p.ngay_sx) : '—'} · ${esc(p.lo || '—')}</td><th>Thùng · Phiếu kho</th><td>${p.so_thung != null ? fmtNum(p.so_thung) : '—'} · ${esc(p.so_phieu_kho || '—')}${p.kip_sx_id ? ` · ${esc(cat.name('kip', p.kip_sx_id))}` : ''}</td></tr>` : ''}
        <tr><th>Người tạo</th><td>${esc(cat.person(p.nguoi_tao))} · ${fmtDateTime(p.created_at)}</td><th>Xác nhận</th><td>${p.xac_nhan_boi ? `${esc(cat.person(p.xac_nhan_boi))} · ${fmtDateTime(p.xac_nhan_luc)}` : '—'}</td></tr>
        ${p.ghi_chu ? `<tr><th>Ghi chú</th><td colspan="3" class="wrap">${esc(p.ghi_chu)}</td></tr>` : ''}
      </tbody></table></div></section>
    ${isGroup ? `<section class="card section"><div class="card-head"><div class="t-h2">Chỉ số từng máy trong chuyền</div></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Máy</th><th class="num">Dừng (phút)</th><th class="num">Lần dừng gốc</th><th class="num">A</th><th class="num">P</th><th class="num">Q</th><th class="num">OEE</th></tr></thead><tbody>
      ${cat.members(rows[0].day_chuyen_id).map((x) => items.find((it) => it.p.may_id === x.may_id)).filter(Boolean).map(({ p: q, c: k }) => `<tr><td class="wrap"><span class="nn-mono">${esc(cat.name('may', q.may_id, 'ma'))}</span> <span class="t-cap">${esc(cat.name('may', q.may_id))}</span></td>
        <td class="num">${fmtNum(k.stopLoss)}</td><td class="num">${k.stopCount}</td><td class="num">${fmtPct(k.A)}</td><td class="num">${fmtPct(k.P)}</td><td class="num">${fmtPct(k.Q)}</td><td class="num"><b>${fmtPct(k.OEE)}</b></td></tr>`).join('')}
      </tbody></table></div></section>` : ''}
    ${(p.dung_ke_hoach || []).length ? `<section class="card section"><div class="card-head"><div class="t-h2">Dừng có kế hoạch</div><span class="chip">${fmtMin(c.keHoach)}</span></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lý do</th><th>Từ</th><th>Đến</th><th class="num">Phút</th></tr></thead><tbody>
      ${p.dung_ke_hoach.map((k) => `<tr><td>${esc(k.ly_do_ten || '')}</td><td>${hm(k.gio_bd)}</td><td>${hm(k.gio_kt)}</td><td class="num">${k.phut}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <section class="card section"><div class="card-head"><div class="t-h2">Các lần dừng máy (${stops.length})</div><span class="chip">${fmtMin(isGroup ? stops.reduce((a, x) => a + (x.s.phut || 0), 0) : c.stopLoss)}</span></div>
      ${stops.length ? `<div class="list-cards">${stops.map(({ s, parent }, i) => `<div class="lc" style="cursor:default">
        <div class="lc-row"><b>${i + 1}. ${esc(s.ten_loi || '')}</b>${ttBadge(s.tinh_trang)}</div>
        <div class="lc-row"><span>${isGroup ? `<span class="chip dept nn-mono">${esc(cat.name('may', parent.may_id, 'ma'))}</span> ` : ''}<span class="chip nn-mono">${esc(s.ma_loi || '')}</span> <span class="chip dept">${esc(NHOM_TT[s.dung_ngan ? 3 : s.nhom_ton_that] || '')}</span> <span class="chip">${esc(s.loai_loi || '')}</span>${isGroup ? (caChuyen(s) ? ' <span class="chip">Cả chuyền dừng</span>' : ' <span class="chip">Chỉ riêng máy này</span>') : ''}</span>
          <span>${hm(s.gio_bd)}–${hm(s.gio_kt)} · <b>${s.phut} phút</b></span></div>
        ${s.van_de_cl ? `<div class="t-cap">Chất lượng: ${esc(s.van_de_cl)}</div>` : ''}
        ${s.ghi_chu ? `<div class="t-cap">Ghi chú: ${esc(s.ghi_chu)}</div>` : ''}
        <div class="t-cap">Người xử lý: ${esc(cat.person(s.nguoi_xu_ly_id) || '—')}${(s.nguoi_ho_tro || []).length ? ` · Hỗ trợ: ${esc(s.nguoi_ho_tro.map((x) => cat.person(x)).join(', '))}` : ''}${s.ghi_chu_xu_ly ? ` · Xử lý: ${esc(s.ghi_chu_xu_ly)}` : ''}${s.cap_nhat_luc ? ` · Cập nhật ${fmtDateTime(s.cap_nhat_luc)}` : ''}</div>
        <div class="nn-row no-print" style="padding:0">
          ${can.xuLyLoi() ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-upd="${s.id}">${icon('edit', 16)}Cập nhật tình trạng</button>` : ''}
          <button class="nn-btn nn-btn-ghost nn-btn-md" data-zalo="${s.id}">${icon('share', 16)}Gửi qua Zalo</button></div>
      </div>`).join('')}</div>` : '<div class="empty">Không có lần dừng máy</div>'}</section>
    ${historyHtml(logs || [], ycs || [])}`;

  const findStop = (sid) => stops.find((x) => x.s.id === sid);
  main.onclick = async (e) => {
    const a = e.target.closest('[data-act]');
    try {
      if (a?.dataset.act === 'confirm') {
        if (!(await confirmBox('Sau khi khóa, muốn sửa phải "Yêu cầu mở khóa" và được quản lý duyệt. Mọi thao tác đều được ghi nhật ký.', { ok: 'Xác nhận và khóa' }))) return;
        await rpc('xac_nhan_phieu', { p_id: key }); toast('Đã xác nhận và khóa phiếu'); detail(main, id);
      } else if (a?.dataset.act === 'unlock') {
        const ly = await askText('Mở khóa phiếu', 'Lý do mở khóa (bắt buộc — lưu vào nhật ký)', 'Ví dụ: nhập sai tổng sản lượng 1.200 thành 12.000', 'Mở khóa');
        if (ly == null) return;
        await rpc('mo_khoa_phieu', { p_id: key, p_ly_do: ly }); toast('Đã mở khóa phiếu — sửa xong nhớ xác nhận lại', 'info'); detail(main, id);
      } else if (a?.dataset.act === 'request') {
        const ly = await askText('Yêu cầu mở khóa', 'Nhập sai chỗ nào, cần sửa gì (bắt buộc)', 'Ví dụ: ghi nhầm lần dừng 2 từ 09:10 thành 09:40', 'Gửi yêu cầu');
        if (ly == null) return;
        await rpc('yeu_cau_mo_khoa', { p_id: key, p_ly_do: ly }); toast('Đã gửi yêu cầu — chờ quản lý duyệt', 'success'); detail(main, id);
      } else if (a?.dataset.act === 'approve' || a?.dataset.act === 'reject') {
        const ok = a.dataset.act === 'approve';
        const gc = await askText(ok ? 'Duyệt mở khóa' : 'Từ chối mở khóa', ok ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối (bắt buộc)', '', ok ? 'Duyệt và mở khóa' : 'Từ chối', !ok);
        if (gc == null) return;
        await rpc('duyet_mo_khoa', { p_yc: ycCho.id, p_dong_y: ok, p_ghi_chu: gc }); toast(ok ? 'Đã mở khóa phiếu' : 'Đã từ chối yêu cầu', 'info'); detail(main, id);
      } else if (a?.dataset.act === 'delete') {
        if (!(await confirmBox(isGroup ? 'Xóa vĩnh viễn phiếu dây chuyền này cùng phiếu của tất cả các máy và các lần dừng máy?' : 'Xóa vĩnh viễn phiếu này cùng các lần dừng máy?', { ok: 'Xóa phiếu', danger: true }))) return;
        await rpc('xoa_phieu', { p_id: key }); toast('Đã xóa phiếu', 'info'); go('#/hom-nay');
      }
    } catch (err) { toast(errText(err), 'danger'); }
    const u = e.target.closest('[data-upd]');
    if (u) { const x = findStop(u.dataset.upd); openFaultUpdate(x.s, x.parent, () => detail(main, id)); }
    const z = e.target.closest('[data-zalo]');
    if (z) { const x = findStop(z.dataset.zalo); shareZalo(x.s, x.parent); }
  };
}
