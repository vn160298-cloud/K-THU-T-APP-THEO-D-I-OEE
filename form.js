// Ghi phiếu vận hành: danh sách nháp, form phiếu (máy đơn hoặc dây chuyền; tự lưu, ngoại tuyến), chi tiết phiếu
import { S, cat, can, submitPhieu, saveDraftServer, deleteDraftServer, getPhieuGroup, flushQueue, rpc, errText } from '../api.js';
import { drafts, queue } from '../store.js';
import { calcPhieu } from '../kpi.js';
import {
  esc, icon, uuid, today, nowHM, hm, fmtDate, fmtNum, fmtPct, fmtMin, minutesBetween, timeInRange, toNum, toInt,
  NHOM_TT, TINH_TRANG, ttBadge, phieuBadge, oeeBadge, debounce, fmtDateTime, VAI_TRO, isLoiKhac,
} from '../lib.js';
import {
  el, $, $$, toast, confirmBox, inputField, selectField, comboField, dateField, textField, kpiCard,
} from '../ui.js';
import { go, drawHeader } from '../app.js';
import { openFaultUpdate, shareZalo } from './faults.js';

export async function render(main, { route, params }) {
  if (route === 'phieu') {
    if (params[1] === 'sua') return editServer(main, params[0]);
    return detail(main, params[0]);
  }
  if (params[0] === 'moi') return form(main, newDraft());
  if (params[0] === 'nhap') {
    let d = drafts.get(params[1]);
    const q = queue.all().find((x) => x.id === params[1]);
    if (q) { d = { ...(d || {}), ...q }; queue.remove(q.id); drawHeader(); } // mở lại phiếu chờ gửi để sửa -> thành nháp
    if (!d) { toast('Không tìm thấy phiếu nháp', 'warning'); return go('#/ghi-phieu'); }
    return form(main, d);
  }
  return hub(main);
}

const targetLabel = (d) => (d.day_chuyen_id ? cat.name('day_chuyen', d.day_chuyen_id) || 'Dây chuyền' : d.may_id ? cat.mayLabel(d.may_id) : 'Chưa chọn máy / dây chuyền');

// ================= DANH SÁCH NHÁP & CHỜ GỬI =================
function hub(main) {
  const ds = drafts.list(), qs = queue.all();
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Ghi phiếu</div>
    <div class="muted">Phiếu ghi dở được tự lưu theo tài khoản — thoát app vẫn còn</div></div>
    ${can.ghiPhieu() ? `<a class="nn-btn nn-btn-primary nn-btn-lg" href="#/ghi-phieu/moi">${icon('plus', 20)}Tạo phiếu mới</a>` : ''}</div>
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
    ke_hoach: [], dung_may: [], bo_may: [], created_at: new Date().toISOString(),
  };
}

const stopToDraft = (d) => ({
  id: d.id, stt: d.stt, ma_loi_id: d.ma_loi_id, ma_loi: d.ma_loi, ten_loi: d.ten_loi, nhom_ton_that: d.nhom_ton_that, loai_loi: d.loai_loi,
  gio_bd: hm(d.gio_bd), gio_kt: hm(d.gio_kt), van_de_cl: d.van_de_cl || '', nguoi_xu_ly_id: d.nguoi_xu_ly_id || '', tinh_trang: d.tinh_trang, ghi_chu: d.ghi_chu || '',
});

const toDraft = (p) => ({
  id: p.id, ngay: p.ngay, may_id: p.may_id, day_chuyen_id: '', ca_id: p.ca_id, san_pham_id: p.san_pham_id || '', toc_do_dm: p.toc_do_dm,
  nguoi_van_hanh_id: p.nguoi_van_hanh_id || '', to_truong_id: p.to_truong_id || '', ky_thuat_id: p.ky_thuat_id || '',
  gio_bd: hm(p.gio_bd), gio_kt: hm(p.gio_kt), nghi_phut: p.nghi_phut, tong_sl: p.tong_sl, sl_loi_kd: p.sl_loi_kd, sl_loi_qt: p.sl_loi_qt,
  ghi_chu: p.ghi_chu || '', created_at: p.created_at, _edit: true, _trang_thai: p.trang_thai,
  ke_hoach: (p.dung_ke_hoach || []).map((k) => ({ ly_do_id: k.ly_do_id, ly_do_ten: k.ly_do_ten, gio_bd: hm(k.gio_bd), gio_kt: hm(k.gio_kt) })),
  dung_may: (p.dung_may || []).filter((s) => s.goc !== false).sort((a, b) => a.stt - b.stt).map(stopToDraft),
});

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
  const rows = await getPhieuGroup(id);
  if (!rows.length) throw new Error('Không tìm thấy phiếu');
  if (rows.some((r) => r.trang_thai === 'da_xac_nhan') && !can.suaKhoa()) throw new Error('Phiếu đã khóa — chỉ quản lý hoặc admin được sửa');
  return form(main, rows[0].nhom_id ? toDraftGroup(rows) : toDraft(rows[0]));
}

// ================= FORM =================
function form(main, d) {
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
  const people = (roles) => cat.nhanSu(roles).map((n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · ${VAI_TRO[n.vai_tro]}` }));
  // Phân công: Ca + Dây chuyền/Máy -> chỉ hiện người được phân công (có nút "Xem tất cả")
  const assigned = (vaiTro) => (d.ca_id && (d.may_id || d.day_chuyen_id) ? cat.phanCong(d.ca_id, target(), vaiTro) : []);
  const peopleField = (label, key, vaiTro, roles) => {
    const list = assigned(vaiTro);
    const all = people(roles);
    if (!list.length) return comboField({ label, value: d[key], options: all, onChange: (v) => { d[key] = v; changed(); } });
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

  const targetOptions = () => {
    const lines = cat.dayChuyen().filter((l) => cat.members(l.id).length).map((l) => ({
      value: `dc:${l.id}`, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → '), group: 'Dây chuyền' }));
    const singles = [...cat.mayDon()].sort((a, b) => kvOf(a).localeCompare(kvOf(b), 'vi')).map((m) => ({
      value: `m:${m.id}`, label: `${m.ma} · ${m.ten}`, group: `Máy đơn · ${kvOf(m)}` }));
    return [...lines, ...singles];
  };
  const caOptions = () => cat.ca(isLine() ? null : S.cat.byId.may[d.may_id]?.bo_phan_id);

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
  const clearFault = (s) => Object.assign(s, { ma_loi_id: '', ma_loi: '', ten_loi: '', nhom_ton_that: null, loai_loi: '' });

  function build() {
    const locked = d._trang_thai === 'da_xac_nhan';
    main.innerHTML = `<div class="page-head"><div><div class="t-page">${d._edit ? 'Sửa phiếu' : 'Phiếu ghi nhận vận hành'}</div>
      <div class="t-cap" data-saved>${d._savedAt ? `Đã tự lưu lúc ${fmtDateTime(d._savedAt).slice(11)}` : 'Tự lưu khi nhập'}</div></div>
      <a class="nn-btn nn-btn-ghost nn-btn-md" href="#/ghi-phieu">${icon('chevL', 18)}Danh sách nháp</a></div>
      ${d._error ? `<div class="nn-alert nn-alert-danger section" role="alert"><span class="nn-alert-icon nn-tone-danger">${icon('fail', 20)}</span><div class="nn-alert-body"><div class="nn-alert-title">Lần gửi trước bị từ chối</div><div class="nn-alert-text">${esc(d._error)}</div></div></div>` : ''}
      ${locked ? `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Phiếu đã khóa — bạn đang sửa với quyền ${esc(VAI_TRO[S.profile.vai_tro])}</div></div></div>` : ''}
      <section class="card section"><div class="card-head"><div class="t-h2">Thông tin chung</div></div><div class="form-grid" data-g1></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">Thời gian & sản lượng</div><span class="chip" data-capinfo></span></div><div class="form-grid" data-g2></div></section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">Dừng có kế hoạch</div><div class="t-cap">Nghỉ ăn, họp đầu ca, bảo trì định kỳ, không có đơn hàng — không tính vào tổn thất</div></div>
        <button class="nn-btn nn-btn-secondary nn-btn-md" data-addkh>${icon('plus', 18)}Thêm</button></div><div data-kh></div></section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">Các lần dừng máy</div><div class="t-cap">${isLine()
        ? 'Chọn máy gây lỗi rồi chọn tên lỗi của máy đó — mã lỗi, nhóm tổn thất, loại lỗi tự điền'
        : 'Chọn tên lỗi — mã lỗi, nhóm tổn thất, loại lỗi tự điền'}. Dưới ${ngan} phút tự tính là dừng ngắn</div></div>
        <button class="nn-btn nn-btn-secondary nn-btn-md" data-addstop>${icon('plus', 18)}Thêm lần dừng</button></div><div data-stops></div></section>
      <section class="card section"><div class="form-grid" data-g3></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">${isLine() ? 'Chỉ số tạm tính của dây chuyền' : 'Chỉ số tạm tính của phiếu'}</div></div><div class="grid-kpi" data-preview></div></section>
      <section class="card section no-print"><div class="nn-row" style="padding:0;justify-content:flex-end">
        <button class="nn-btn nn-btn-secondary nn-btn-lg" data-del>${icon('trash', 18)}${d._edit ? 'Hủy sửa' : 'Xóa nháp'}</button>
        ${can.xacNhan() && !locked ? `<label class="nn-row" style="padding:0;gap:8px"><input type="checkbox" data-confirm style="width:22px;height:22px"> Xác nhận và khóa phiếu luôn</label>` : ''}
        <button class="nn-btn nn-btn-primary nn-btn-lg" data-submit>${icon('pass', 20)}Gửi phiếu</button></div></section>`;

    // --- Thông tin chung
    const g1 = $('[data-g1]', main);
    g1.append(
      comboField({ label: 'Dây chuyền / Máy', value: targetValue(), req: true, span: true, options: targetOptions(),
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
      comboField({ label: 'Sản phẩm', value: d.san_pham_id, req: true, options: cat.sanPhamFor(target()).map((s) => ({ value: s.id, label: s.ten, sub: s.dvt ? `${s.ma} · ${s.dvt}` : s.ma })),
        onChange: (v) => { d.san_pham_id = v; d.toc_do_dm = null; applySpeed(); changed(); build(); } }),
    );
    const fixedSpeed = (d.may_id || d.day_chuyen_id) && d.san_pham_id && cat.speedFor(target(), d.san_pham_id) != null;
    g1.append(inputField({ label: 'Tốc độ định mức', value: d.toc_do_dm ?? '', unit: `${dvt()}/phút`, num: 'dec', readonly: !!fixedSpeed, req: true,
      msg: fixedSpeed ? `Tự điền theo ${isLine() ? 'dây chuyền' : 'máy'} và sản phẩm` : `Chưa khai báo tốc độ cho ${isLine() ? 'dây chuyền' : 'máy'} + sản phẩm này — nhập tạm hoặc báo Admin`,
      onInput: (v) => { d.toc_do_dm = toNum(v); changed(); } }));
    g1.append(
      peopleField('Người vận hành', 'nguoi_van_hanh_id', 'van_hanh'),
      peopleField('Tổ trưởng', 'to_truong_id', 'to_truong', ['to_truong', 'quan_ly']),
      comboField({ label: 'Kỹ thuật', value: d.ky_thuat_id, options: people(['ky_thuat']), onChange: (v) => { d.ky_thuat_id = v; changed(); } }),
    );

    // --- Thời gian & sản lượng
    const g2 = $('[data-g2]', main);
    const capInfo = () => { $('[data-capinfo]', main).textContent = `Thời gian ca: ${fmtMin(minutesBetween(d.gio_bd, d.gio_kt))}`; };
    g2.append(
      inputField({ label: 'Giờ bắt đầu', type: 'time', value: d.gio_bd, req: true, onInput: (v) => { d.gio_bd = v; capInfo(); changed(); } }),
      inputField({ label: 'Giờ kết thúc', type: 'time', value: d.gio_kt, req: true, onInput: (v) => { d.gio_kt = v; capInfo(); changed(); } }),
      inputField({ label: 'Nghỉ giữa ca', value: d.nghi_phut ?? 0, unit: 'phút', num: 'int', onInput: (v) => { d.nghi_phut = toInt(v) || 0; changed(); } }),
      inputField({ label: 'Tổng sản lượng', value: d.tong_sl ?? '', unit: dvt(), num: 'int', req: true,
        msg: isLine() ? 'Đếm ở máy cuối chuyền, gồm cả hàng lỗi' : 'Gồm cả hàng lỗi', onInput: (v) => { d.tong_sl = toInt(v); changed(); } }),
      inputField({ label: 'SL lỗi khởi động', value: d.sl_loi_kd ?? 0, unit: dvt(), num: 'int', onInput: (v) => { d.sl_loi_kd = toInt(v) || 0; changed(); } }),
      inputField({ label: 'SL lỗi trong quá trình', value: d.sl_loi_qt ?? 0, unit: dvt(), num: 'int', onInput: (v) => { d.sl_loi_qt = toInt(v) || 0; changed(); } }),
    );
    capInfo();

    // --- Dừng có kế hoạch
    const kh = $('[data-kh]', main);
    if (!d.ke_hoach.length) kh.innerHTML = '<div class="t-cap">Không có</div>';
    d.ke_hoach.forEach((k, i) => {
      const row = el(`<div class="stop"><div class="form-grid"></div></div>`);
      const g = $('.form-grid', row);
      const mins = el(`<span class="chip">${fmtMin(minutesBetween(k.gio_bd, k.gio_kt))}</span>`);
      const upd = () => { mins.textContent = fmtMin(minutesBetween(k.gio_bd, k.gio_kt)); changed(); };
      g.append(
        selectField({ label: 'Lý do', value: k.ly_do_id, options: cat.lyDo().map((l) => ({ value: l.id, label: l.ten })), onChange: (v) => { k.ly_do_id = v; changed(); } }),
        inputField({ label: 'Bắt đầu', type: 'time', value: k.gio_bd, onInput: (v) => { k.gio_bd = v; upd(); } }),
        inputField({ label: 'Kết thúc', type: 'time', value: k.gio_kt, onInput: (v) => { k.gio_kt = v; upd(); } }),
      );
      const act = el(`<div class="nn-row" style="padding:8px 0 0;justify-content:space-between"></div>`);
      act.append(mins, el(`<button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmkh="${i}">${icon('trash', 16)}Xóa</button>`));
      row.append(act);
      kh.append(row);
    });

    // --- Dừng máy
    const st = $('[data-stops]', main);
    if (!d.dung_may.length) st.innerHTML = '<div class="t-cap">Chưa có lần dừng máy nào</div>';
    d.dung_may.forEach((s, i) => st.append(stopCard(s, i)));

    // --- Ghi chú
    $('[data-g3]', main).append(textField({ label: 'Ghi chú phiếu', value: d.ghi_chu, onInput: (v) => { d.ghi_chu = v; save(); } }));

    // --- Sự kiện
    $('[data-addkh]', main).onclick = () => { d.ke_hoach.push({ ly_do_id: cat.lyDo()[0]?.id || '', gio_bd: nowHM(), gio_kt: '' }); changed(); build(); };
    $('[data-addstop]', main).onclick = () => {
      if (!d.may_id && !d.day_chuyen_id) return toast('Chọn dây chuyền / máy trước để hiện đúng bộ mã lỗi', 'warning');
      d.dung_may.push({ id: uuid(), stt: d.dung_may.length + 1, may_id: '', ca_chuyen: true, ma_loi_id: '', gio_bd: nowHM(), gio_kt: '', van_de_cl: '', nguoi_xu_ly_id: '', tinh_trang: 'cho_xu_ly', ghi_chu: '' });
      changed(); build();
      $$('.stop', st).pop()?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    main.onclick = async (e) => {
      const rk = e.target.closest('[data-rmkh]'); if (rk) { d.ke_hoach.splice(+rk.dataset.rmkh, 1); changed(); build(); return; }
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

  function stopCard(s, i) {
    const line = isLine();
    const mayId = line ? s.may_id : d.may_id;
    const codes = mayId ? cat.maLoi(mayId) : [];
    const m = minutesBetween(s.gio_bd, s.gio_kt);
    const card = el(`<div class="stop"><div class="stop-head"><b>Lần dừng ${i + 1}</b>
      <span class="chip" data-min>${s.gio_kt ? fmtMin(m) : 'Đang dừng'}</span>
      <span class="chip" data-short ${s.gio_kt && m < ngan ? '' : 'hidden'}>Dừng ngắn</span>
      <span style="flex:1"></span><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmstop="${i}" aria-label="Xóa lần dừng">${icon('trash', 16)}</button></div>
      <div class="form-grid"></div></div>`);
    const g = $('.form-grid', card);
    const opts = codes.map((c) => ({ value: c.id, label: c.ten, sub: `${c.ma} · ${NHOM_TT[c.nhom_ton_that]}`, group: NHOM_TT[c.nhom_ton_that] }))
      .sort((a, b) => a.group.localeCompare(b.group, 'vi') || 0);
    const auto = el(`<div class="nn-field span-2"><span class="nn-label">Tự điền</span><div class="nn-row" style="padding:0;gap:8px" data-auto></div></div>`);
    const paintAuto = () => {
      const short = s.gio_kt && minutesBetween(s.gio_bd, s.gio_kt) < ngan;
      $('[data-auto]', auto).innerHTML = s.ma_loi_id
        ? `<span class="chip nn-mono">${esc(s.ma_loi)}</span><span class="chip dept">${esc(short ? `${NHOM_TT[3]} (dưới ${ngan} phút)` : NHOM_TT[s.nhom_ton_that])}</span><span class="chip">${esc(s.loai_loi || '')}</span>`
        : '<span class="t-cap">Chọn tên lỗi để tự điền mã lỗi, nhóm tổn thất, loại lỗi</span>';
    };
    const updTime = () => {
      const mm = minutesBetween(s.gio_bd, s.gio_kt);
      $('[data-min]', card).textContent = s.gio_kt ? fmtMin(mm) : 'Đang dừng';
      $('[data-short]', card).hidden = !(s.gio_kt && mm < ngan);
      paintAuto(); changed();
    };
    if (line) {
      g.append(selectField({ label: 'Máy gây lỗi', value: s.may_id || '', req: true, span: true,
        options: running().map((x) => ({ value: x.may_id, label: cat.mayLabel(x.may_id) })),
        onChange: (v) => { s.may_id = v; clearFault(s); card.replaceWith(stopCard(s, i)); changed(); } }));
    }
    g.append(
      comboField({ label: 'Tên lỗi', value: s.ma_loi_id, req: true, span: true, options: opts,
        msg: line && !s.may_id ? 'Chọn máy gây lỗi trước để hiện đúng bộ mã lỗi của máy đó' : '',
        onChange: (v) => {
          const c = S.cat.byId.ma_loi[v];
          const wasKhac = isLoiKhac(s.ten_loi);
          Object.assign(s, c ? { ma_loi_id: c.id, ma_loi: c.ma, ten_loi: c.ten, nhom_ton_that: c.nhom_ton_that, loai_loi: c.loai_loi } : { ma_loi_id: '', ma_loi: '', ten_loi: '', nhom_ton_that: null, loai_loi: '' });
          paintAuto(); changed();
          if (wasKhac !== isLoiKhac(s.ten_loi)) {
            const fresh = stopCard(s, i); card.replaceWith(fresh);
            if (isLoiKhac(s.ten_loi)) setTimeout(() => $('[data-gc] textarea', fresh)?.focus(), 50);
          }
        } }),
      auto,
      inputField({ label: 'Bắt đầu dừng', type: 'time', value: s.gio_bd, req: true, onInput: (v) => { s.gio_bd = v; updTime(); } }),
      inputField({ label: 'Kết thúc dừng', type: 'time', value: s.gio_kt, req: true, onInput: (v) => { s.gio_kt = v; updTime(); } }),
    );
    if (line && running().length > 1) {
      const cb = el(`<label class="nn-field span-2" style="flex-direction:row;align-items:flex-start;gap:8px"><input type="checkbox" style="width:22px;height:22px;flex:none" ${s.ca_chuyen !== false ? 'checked' : ''}>
        <span>Cả chuyền dừng<br><span class="t-cap">Máy chạy nối tiếp nên thường cả chuyền dừng theo. Bỏ tích nếu chỉ riêng máy này dừng.</span></span></label>`);
      $('input', cb).onchange = (e) => { s.ca_chuyen = e.target.checked; changed(); };
      g.append(cb);
    }
    g.append(
      comboField({ label: 'Người xử lý', value: s.nguoi_xu_ly_id, options: cat.nhanSu().map((n) => ({ value: n.id, label: n.ho_ten, sub: VAI_TRO[n.vai_tro] })), onChange: (v) => { s.nguoi_xu_ly_id = v; changed(); } }),
      selectField({ label: 'Tình trạng lỗi', value: s.tinh_trang, placeholder: '— Chọn —', options: Object.entries(TINH_TRANG).map(([k, t]) => ({ value: k, label: t.label })), onChange: (v) => { s.tinh_trang = v || 'cho_xu_ly'; changed(); } }),
      textField({ label: 'Vấn đề chất lượng', value: s.van_de_cl, onInput: (v) => { s.van_de_cl = v; save(); } }),
    );
    const khac = isLoiKhac(s.ten_loi);
    const gc = textField({ label: khac ? 'Ghi chú: ghi rõ lỗi cụ thể (bắt buộc với lỗi khác)' : 'Ghi chú', value: s.ghi_chu,
      placeholder: khac ? 'Ví dụ: kẹt chai ở băng tải ra do lệch thanh dẫn hướng' : '', onInput: (v) => { s.ghi_chu = v; save(); } });
    if (khac) { gc.dataset.gc = '1'; $('.nn-label', gc).classList.add('req'); }
    g.append(gc);
    paintAuto();
    return card;
  }

  function preview() {
    const box = $('[data-preview]', main); if (!box) return;
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
    if (!d.may_id && !d.day_chuyen_id) errs.push('Chưa chọn dây chuyền / máy');
    if (!d.ngay) errs.push('Chưa chọn ngày');
    if (!d.ca_id) errs.push('Chưa chọn ca');
    if (!d.san_pham_id) errs.push('Chưa chọn sản phẩm');
    if (!(d.toc_do_dm > 0)) errs.push('Chưa có tốc độ định mức');
    if (!d.gio_bd || !d.gio_kt) errs.push('Thiếu giờ bắt đầu / kết thúc ca');
    if (d.tong_sl == null) errs.push('Chưa nhập tổng sản lượng');
    if ((d.sl_loi_kd || 0) + (d.sl_loi_qt || 0) > (d.tong_sl || 0)) errs.push('Sản lượng lỗi lớn hơn tổng sản lượng');
    d.ke_hoach.forEach((k, i) => { if (!k.ly_do_id || !k.gio_bd || !k.gio_kt) errs.push(`Dừng kế hoạch ${i + 1}: thiếu lý do hoặc giờ`); });
    d.dung_may.forEach((s, i) => {
      if (isLine() && !s.may_id) errs.push(`Lần dừng ${i + 1}: chưa chọn máy gây lỗi`);
      if (!s.ma_loi_id) errs.push(`Lần dừng ${i + 1}: chưa chọn tên lỗi`);
      else if (isLoiKhac(s.ten_loi) && !String(s.ghi_chu || '').trim()) errs.push(`Lần dừng ${i + 1}: chọn "${s.ten_loi}" thì phải ghi rõ lỗi cụ thể vào ô Ghi chú`);
      if (isLine() && s.may_id && d.bo_may.includes(s.may_id)) errs.push(`Lần dừng ${i + 1}: máy gây lỗi đã bị bỏ tích (không chạy)`);
      if (!s.gio_bd || !s.gio_kt) errs.push(`Lần dừng ${i + 1}: thiếu giờ bắt đầu / kết thúc`);
      else if (d.gio_bd && d.gio_kt && !timeInRange(s.gio_bd, d.gio_bd, d.gio_kt)) errs.push(`Lần dừng ${i + 1}: giờ bắt đầu ${s.gio_bd} nằm ngoài ca ${d.gio_bd}–${d.gio_kt}`);
    });
    const c = calcPhieu(d, ngan);
    if (c.caPhut && c.stopLoss + c.keHoach + c.nghi > c.caPhut) errs.push(`Tổng thời gian dừng (${fmtMin(c.stopLoss + c.keHoach + c.nghi)}) vượt thời gian ca (${fmtMin(c.caPhut)})`);
    return errs;
  }

  async function submit() {
    const errs = validate();
    if (errs.length) {
      toast(errs.slice(0, 4).join(' · ') + (errs.length > 4 ? ` · và ${errs.length - 4} lỗi khác` : ''), 'danger', 'Chưa gửi được phiếu');
      return;
    }
    const btn = $('[data-submit]', main);
    btn.disabled = true;
    const line = isLine();
    const body = { ...d, trang_thai: $('[data-confirm]', main)?.checked ? 'da_xac_nhan' : undefined, nghi_phut: d.nghi_phut || 0 };
    body.day_chuyen_id = d.day_chuyen_id || null;
    body.dung_may = d.dung_may.map((s, k) => ({ ...s, stt: k + 1, nguoi_xu_ly_id: s.nguoi_xu_ly_id || null, ma_loi_id: s.ma_loi_id || null, may_id: line ? s.may_id : undefined, ca_chuyen: line ? s.ca_chuyen !== false : undefined }));
    body.ke_hoach = d.ke_hoach.map((k) => ({ ...k, ly_do_id: k.ly_do_id || null }));
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
  const canEdit = can.suaKhoa() || (!locked && (p.nguoi_tao === me.id || can.xacNhan()) && can.ghiPhieu());
  const canDelete = can.suaKhoa() || (!locked && p.nguoi_tao === me.id);
  const stops = [];
  for (const it of items) for (const s of (it.p.dung_may || []).filter((x) => x.goc !== false)) stops.push({ s, parent: it.p });
  stops.sort((a, b) => String(a.s.gio_bd).localeCompare(String(b.s.gio_bd)));
  const caChuyen = (s) => isGroup && rows.some((o) => (o.dung_may || []).some((x) => x.dung_may_goc_id === s.id));
  const title = isGroup ? (line?.ten || 'Dây chuyền') : (m?.ma || '');

  main.innerHTML = `<div class="page-head"><div><div class="t-page">${esc(title)} · ${fmtDate(p.ngay)} · ${esc(cat.name('ca', p.ca_id))}</div>
    <div class="muted">${isGroup ? `Phiếu dây chuyền · ${rows.length} máy · máy cuối ${esc(cat.name('may', lastId, 'ma'))}` : `${esc(m?.ten || '')} · ${esc(cat.name('bo_phan', p.bo_phan_id))}`}</div></div>${phieuBadge(p.trang_thai)}</div>
    <section class="card section no-print"><div class="nn-row" style="padding:0">
      ${can.xacNhan() && !locked ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-act="confirm">${icon('lock', 18)}Xác nhận và khóa phiếu</button>` : ''}
      ${canEdit ? `<a class="nn-btn nn-btn-secondary nn-btn-lg" href="#/phieu/${key}/sua">${icon('edit', 18)}Sửa phiếu</a>` : ''}
      ${locked && can.suaKhoa() ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-act="unlock">${icon('unlock', 18)}Mở khóa</button>` : ''}
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
        <tr><th>Tổ trưởng</th><td>${esc(cat.person(p.to_truong_id) || '—')}</td><th>Lỗi khởi động</th><td class="num">${fmtNum(p.sl_loi_kd)}</td></tr>
        <tr><th>Kỹ thuật</th><td>${esc(cat.person(p.ky_thuat_id) || '—')}</td><th>Lỗi quá trình</th><td class="num">${fmtNum(p.sl_loi_qt)}</td></tr>
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
        <div class="t-cap">Người xử lý: ${esc(cat.person(s.nguoi_xu_ly_id) || '—')}${s.ghi_chu_xu_ly ? ` · Xử lý: ${esc(s.ghi_chu_xu_ly)}` : ''}${s.cap_nhat_luc ? ` · Cập nhật ${fmtDateTime(s.cap_nhat_luc)}` : ''}</div>
        <div class="nn-row no-print" style="padding:0">
          ${can.xuLyLoi() ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-upd="${s.id}">${icon('edit', 16)}Cập nhật tình trạng</button>` : ''}
          <button class="nn-btn nn-btn-ghost nn-btn-md" data-zalo="${s.id}">${icon('share', 16)}Gửi qua Zalo</button></div>
      </div>`).join('')}</div>` : '<div class="empty">Không có lần dừng máy</div>'}</section>`;

  const findStop = (sid) => stops.find((x) => x.s.id === sid);
  main.onclick = async (e) => {
    const a = e.target.closest('[data-act]');
    try {
      if (a?.dataset.act === 'confirm') {
        if (!(await confirmBox('Sau khi khóa, chỉ quản lý hoặc admin được sửa phiếu.', { ok: 'Xác nhận và khóa' }))) return;
        await rpc('xac_nhan_phieu', { p_id: key }); toast('Đã xác nhận và khóa phiếu'); detail(main, id);
      } else if (a?.dataset.act === 'unlock') {
        await rpc('mo_khoa_phieu', { p_id: key }); toast('Đã mở khóa phiếu', 'info'); detail(main, id);
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
