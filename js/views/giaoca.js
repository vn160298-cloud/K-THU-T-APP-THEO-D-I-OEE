// BÁO CÁO GIAO CA (biểu mẫu GMP01-BM03-v00) cho bộ phận Sản xuất / Đóng gói.
// 1 báo cáo / bộ phận + ngày + ca + kíp. Lưu nháp sửa thoải mái; bấm "Gửi báo cáo" là xong và khóa (v1.7 — không còn bước nhận ca).
// Sản xuất: Năng suất / Chất lượng / Máy móc tự lấy từ phiếu ghi nhận vận hành. Đóng gói: năng suất nhập theo từng xe SX (mẫu Excel
// "Báo cáo số lượng đóng gói"), Tổng SKU / Tổng chai-hũ tự tính theo Quy cách đóng gói.
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { loadCalc, groupEntries, entryLabel } from '../data.js';
import { esc, icon, today, addDays, hm, fmtNum, fmtDate, fmtDateTime, toInt, toNum, TINH_TRANG, isLoiKhac } from '../lib.js';
import { $, el, toast, selectField, rangeField, dateField, bindNum, segmented, multiField, confirmBox } from '../ui.js';
import { go } from '../app.js';
import { askText, historyHtml } from './form.js';

const MA_BM = 'GMP01-BM03-v00';
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export async function render(main, { params }) {
  if (!params[0]) return list(main);
  return editor(main, params[0] === 'moi' ? null : params[0]);
}

const tieuDe = (g) => `${cat.name('bo_phan', g.bo_phan_id)} · ${fmtDate(g.ngay)} · ${cat.name('ca', g.ca_id)}${g.kip_id ? ` · ${cat.name('kip', g.kip_id)}` : ''}`;
const TT = {
  nhap: ['info', 'edit', 'Nháp'],
  da_gui: ['success', 'pass', 'Đã gửi'],
  da_nhan: ['success', 'lock', 'Đã nhận ca'],
};
const ttBadgeGC = (g) => { const [tone, ic, t] = TT[g.trang_thai] || TT.nhap; return `<span class="nn-status nn-tone-${tone}">${icon(ic, 14)}${t}</span>`; };
const dsNhanh = (loai, nm) => (S.cat.ds_nhap_nhanh || []).filter((x) => x.loai === loai && x.nha_may_id === nm && x.hoat_dong).sort((a, b) => a.thu_tu - b.thu_tu).map((x) => x.ten);

// ================= DANH SÁCH =================
async function list(main) {
  const st = { from: addDays(today(), -6), to: today(), bp: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Báo cáo giao ca</div><div class="muted">Biểu mẫu ${MA_BM} · Sản xuất / Đóng gói</div></div>
    ${can.giaoCa() ? `<a class="nn-btn nn-btn-primary nn-btn-lg" href="#/giao-ca/moi">${icon('plus', 20)}Lập báo cáo giao ca</a>` : ''}</div>
    <div class="filters" data-f></div><div data-body></div>`;
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả', options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })), onChange: (v) => { st.bp = v; load(); } }),
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
      <div class="t-cap">${g.nang_suat.length} dòng năng suất · ${g.chat_luong.length} dòng lỗi · ${g.may_moc.length} lần dừng${g.da_hop ? ' · Đã họp giao ca' : ''}</div></a>`).join('')}</div>`
      : '<div class="empty">Chưa có báo cáo giao ca trong khoảng này</div>';
  }
  load();
}

// ================= CỘT CÁC BẢNG =================
// [khóa, nhãn, độ rộng tối thiểu (px), kiểu]: text (tự xuống dòng) | num | auto (tự tính) | date | sel:<danh sách>
const COLS = {
  ns_sx: [['nd', 'Nội dung / sản phẩm', 220], ['ke_hoach', 'SL kế hoạch', 90, 'num'], ['hoan_thanh', 'SL hoàn thành', 90, 'num'], ['con_lai', 'SL còn lại', 80, 'auto']],
  ns_dg: [['ca_dg', 'Ca đóng gói', 70, 'auto'], ['ngay_dg', 'Ngày đóng gói', 90, 'auto'], ['ngay_sx', 'Ngày sản xuất', 130, 'date'], ['ma_sp', 'Mã sản phẩm', 150, 'sel:sp'],
    ['ten_sp', 'Tên sản phẩm', 150, 'auto'], ['ma_lo', 'Mã lô', 70], ['stt_xe', 'STT xe SX', 60, 'num'], ['kip_sx', 'Kíp SX', 90, 'sel:kip'], ['quy_cach', 'Quy cách đóng gói', 100, 'sel:qc'],
    ['thung', 'Thùng', 70, 'num'], ['le', 'Lẻ', 60, 'num'], ['tong_sku', 'Tổng SKU', 80, 'auto'], ['tong_chai', 'Tổng chai/hũ', 90, 'auto'], ['nha_may', 'Nhà máy', 60, 'auto'], ['tcb', 'TCB', 90]],
  cl_sx: [['nd', 'Nội dung lỗi', 220], ['sl', 'SL lỗi', 80, 'num'], ['ghi_chu', 'Ghi chú', 160]],
  cl_dg: [['sp', 'Sản phẩm (ngày SX) / lỗi', 220], ['sl', 'SL lỗi', 80, 'num'], ['tong_kiem', 'Tổng kiểm', 80, 'num'], ['kip_sx', 'Kíp SX', 90], ['ghi_chu', 'Ghi chú', 160]],
  mm: [['tb', 'Line / thiết bị', 180], ['loi', 'Tình trạng / lỗi', 180], ['gio', 'Khung giờ', 100], ['phut', 'Dừng (phút)', 70, 'num'], ['xu_ly', 'Xử lý', 110]],
  tc: [['ns', 'Người tăng ca', 180, 'sel:ns'], ['gio', 'Số giờ', 70, 'dec'], ['ly_do', 'Lý do tăng ca', 200, 'list:ly_do_tang_ca']],
};
const TONG = { ns_sx: [['hoan_thanh', 'SL hoàn thành']], ns_dg: [['thung', 'Thùng'], ['tong_sku', 'SKU'], ['tong_chai', 'Chai/hũ']], cl_sx: [['sl', 'SL lỗi']], cl_dg: [['sl', 'SL lỗi']], mm: [['phut', 'Dừng (phút)']], tc: [['gio', 'Giờ tăng ca']] };

/** Lấy số từ các phiếu ghi nhận vận hành của bộ phận + ngày + ca (+ kíp). Đóng gói: năng suất nhập theo xe nên không ghi đè. */
async function tuPhieu(g) {
  const dg = cat.laDongGoi(g.bo_phan_id);
  const rows = (await loadCalc(g.ngay, g.ngay, { force: true }))
    .filter(({ p }) => p.bo_phan_id === g.bo_phan_id && p.ca_id === g.ca_id && (!g.kip_id || !p.kip_id || p.kip_id === g.kip_id));
  const ns = [], cl = [], mm = [];
  for (const e of groupEntries(rows)) {
    const { p, c } = e.rep;
    const sp = cat.name('san_pham', p.san_pham_id) || 'Chưa chọn sản phẩm', ten = entryLabel(e);
    const kipSx = cat.name('kip', p.kip_sx_id || p.kip_id);
    if (!dg) ns.push({ nd: `${sp} — ${ten}`, ke_hoach: p.sl_ke_hoach ?? null, hoan_thanh: c.good ?? null });
    const loi = (p.loi_sp || []).length ? p.loi_sp : ((+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) ? [{ ten: 'Lỗi (chưa phân loại)', so_luong: (+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) }] : []);
    for (const x of loi) {
      if (dg) cl.push({ sp: `${sp}${p.ngay_sx ? ` ${fmtDate(p.ngay_sx).slice(0, 5)}` : ''} — ${x.ten}`, sl: x.so_luong, tong_kiem: p.tong_sl ?? null, kip_sx: kipSx, ghi_chu: x.ghi_chu || '' });
      else cl.push({ nd: `${sp} — ${x.ten}`, sl: x.so_luong, ghi_chu: x.ghi_chu || '' });
    }
    for (const ch of e.children) for (const s of (ch.p.dung_may || []).filter((x) => x.goc !== false).sort((a, b) => (a.gio_bd > b.gio_bd ? 1 : -1))) {
      mm.push({ tb: cat.mayLabel(ch.p.may_id), loi: s.ten_loi || '', gio: `${hm(s.gio_bd)}–${hm(s.gio_kt)}`, phut: s.phut ?? null, xu_ly: TINH_TRANG[s.tinh_trang]?.label || '' });
    }
  }
  return { nang_suat: dg ? null : ns, chat_luong: cl, may_moc: mm, so_phieu: groupEntries(rows).length };
}

// ================= LẬP / XEM BÁO CÁO =================
async function editor(main, id) {
  let g;
  if (id) {
    const { data, error } = await sb.from('giao_ca').select('*').eq('id', id).maybeSingle();
    if (error || !data) { main.innerHTML = `<div class="empty">${esc(error ? errText(error) : 'Không tìm thấy báo cáo giao ca')}</div>`; return; }
    g = data;
  } else {
    if (!can.giaoCa()) { main.innerHTML = '<div class="empty">Chỉ tổ trưởng, quản lý hoặc admin được lập báo cáo giao ca</div>'; return; }
    const bp = S.profile.bo_phan_id && cat.boPhan().some((b) => b.id === S.profile.bo_phan_id) ? S.profile.bo_phan_id : cat.boPhan()[0]?.id || '';
    g = { ngay: today(), ca_id: '', kip_id: '', bo_phan_id: bp, nha_may_id: S.nm, trang_thai: 'nhap', nang_suat: [], chat_luong: [], may_moc: [], con_nguoi: {}, ve_sinh: {}, can_chu_y: '', da_hop: false };
  }
  g.con_nguoi ||= {}; g.ve_sinh ||= {};
  const cn = g.con_nguoi;
  cn.tang_ca ||= []; cn.ky_luat ||= 'tot'; cn.ky_luat_loi ||= []; cn.ky_luat_nguoi ||= [];
  const nm = g.nha_may_id || S.nm;
  const canEdit = can.giaoCa() && (!id || g.trang_thai === 'nhap');
  const logs = id ? ((await sb.from('nhat_ky').select('*').eq('phieu_id', id).order('luc', { ascending: false }).limit(100)).data || []) : [];

  // --- danh sách chọn
  const qcList = () => (S.cat.quy_cach || []).filter((q) => q.nha_may_id === nm && q.hoat_dong);
  const spList = () => S.cat.san_pham.filter((p) => p.nha_may_id === nm && p.hoat_dong);
  const nsList = () => S.cat.nhan_su.filter((n) => n.hoat_dong && n.nha_may_id === nm)
    .sort((a, b) => (a.bo_phan_id === g.bo_phan_id ? 0 : 1) - (b.bo_phan_id === g.bo_phan_id ? 0 : 1) || a.ho_ten.localeCompare(b.ho_ten, 'vi'));
  const SEL = {
    sp: () => spList().map((p) => [p.ma, `${p.ma} · ${p.ten}`]),
    kip: () => cat.kip(nm).map((k) => [k.ten, k.ten]),
    qc: () => qcList().map((q) => [q.ten, `${q.ten} (${+q.sku_thung}×${+q.chai_sku})`]),
    ns: () => nsList().map((n) => [n.id, `${n.ho_ten} · ${n.ma_nv}`]),
  };
  const maNM = () => (S.cat.byId.nha_may[nm]?.ma || '').slice(0, 1);
  /** Tự tính các ô "auto" của 1 dòng */
  const AUTO = {
    con_lai: (r) => (r.ke_hoach != null && r.hoan_thanh != null ? (+r.ke_hoach || 0) - (+r.hoan_thanh || 0) : null),
    ca_dg: () => cat.name('ca', g.ca_id).replace(/^Ca\s*/i, ''),
    ngay_dg: () => (g.ngay ? fmtDate(g.ngay) : ''),
    ten_sp: (r) => spList().find((p) => p.ma === r.ma_sp)?.ten || '',
    tong_sku: (r) => { const q = qcList().find((x) => x.ten === r.quy_cach); return q && (r.thung != null || r.le != null) ? (+r.thung || 0) * +q.sku_thung + (+r.le || 0) : null; },
    tong_chai: (r) => { const q = qcList().find((x) => x.ten === r.quy_cach); const sku = AUTO.tong_sku(r); return q && sku != null ? sku * +q.chai_sku : null; },
    nha_may: () => maNM(),
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
      <div class="nn-row" style="padding:0">${id ? ttBadgeGC(g) : ''}<a class="nn-btn nn-btn-ghost nn-btn-md no-print" href="#/giao-ca">${icon('chevL', 18)}Danh sách</a></div></div>
      ${id && locked && g.trang_thai !== 'nhap' ? `<div class="nn-alert nn-alert-info section"><span class="nn-alert-icon nn-tone-info">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Báo cáo đã gửi và khóa. Muốn sửa: quản lý / admin bấm Mở khóa kèm lý do (ghi nhật ký).</div></div></div>` : ''}
      <section class="card section"><div class="form-grid" data-head></div></section>
      ${sec(1, 'Năng suất', dg ? 'Số lượng đóng gói theo từng xe SX' : 'Số lượng?', 'ns')}
      ${sec(2, 'Chất lượng', 'Hàng lỗi?', 'cl')}
      <section class="card section"><div class="card-head"><div class="t-h2">3. Con người</div></div><div class="form-grid" data-cn></div>
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
      dateField({ label: 'Ngày', value: g.ngay, req: true, onChange: (v) => { g.ngay = v; build(); } }),
      selectField({ label: 'Ca', value: g.ca_id, req: true, placeholder: '— Chọn ca —', options: cat.ca(g.bo_phan_id).map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})` })), onChange: (v) => { g.ca_id = v; build(); } }),
      selectField({ label: 'Kíp', value: g.kip_id || '', placeholder: '— Chọn kíp —', options: cat.kip(nm).map((k) => ({ value: k.id, label: k.ten })), onChange: (v) => { g.kip_id = v; build(); } }),
      selectField({ label: 'Bộ phận', value: g.bo_phan_id, req: true, options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })),
        onChange: (v) => { if (v === g.bo_phan_id) return; g.bo_phan_id = v; g.nang_suat = []; g.chat_luong = []; build(); } }),
      el(`<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:40px">${esc(cat.name('nha_may', nm))}</span></div>`),
    );
    if (canEdit) head.append(el(`<div class="nn-field span-2"><button class="nn-btn nn-btn-secondary nn-btn-md" data-fill>${icon('sync', 18)}Lấy số từ phiếu ghi nhận vận hành của ca này</button>
      <span class="nn-field-msg">Tự điền ${dg ? 'Chất lượng, Máy móc' : 'Năng suất, Chất lượng, Máy móc'} từ các phiếu đã ghi (đúng bộ phận, ngày, ca, kíp). Sửa / thêm dòng được sau đó.</span></div>`));
    $$('[data-head] input, [data-head] select', main).forEach((x) => { x.disabled = !canEdit; });

    // --- bảng
    tbl('ns', dg ? 'ns_dg' : 'ns_sx', 'nang_suat');
    tbl('cl', dg ? 'cl_dg' : 'cl_sx', 'chat_luong');
    tbl('mm', 'mm', 'may_moc');
    tbl('tc', 'tc', null);

    // --- con người: định biên (khóa) -> có mặt -> vắng tự trừ; điều động mượn / cho mượn -> thực tế đứng máy
    const db = dinhBien();
    if (canEdit) cn.dinh_bien = db;
    const bc = $('[data-cn]', main);
    const ro = (label, val, msg) => el(`<div class="nn-field"><span class="nn-label">${esc(label)}</span><div class="nn-input-wrap nn-input-md auto-fill"><input class="nn-input" readonly value="${esc(val ?? '')}" data-ro="${esc(label)}"></div>${msg ? `<div class="nn-field-msg">${msg}</div>` : ''}</div>`);
    const num = (label, k, msg, req) => { const f = el(`<div class="nn-field"><label class="nn-label ${req ? 'req' : ''}">${esc(label)}</label><div class="nn-input-wrap nn-input-md"><input class="nn-input" inputmode="numeric" value="${esc(cn[k] ?? '')}" ${canEdit ? '' : 'disabled'}></div>${msg ? `<div class="nn-field-msg">${msg}</div>` : ''}</div>`);
      const i = $('input', f); bindNum(i, 'int'); i.oninput = () => { cn[k] = toInt(i.value); paintCN(); }; return f; };
    const txt = (label, k, ph, span) => { const f = el(`<div class="nn-field ${span ? 'span-2' : ''}"><label class="nn-label">${esc(label)}</label><div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" placeholder="${esc(ph || '')}" ${canEdit ? '' : 'disabled'}>${esc(cn[k] ?? '')}</textarea></div></div>`);
      const t = $('textarea', f); grow(t); t.oninput = () => { cn[k] = t.value; grow(t); }; return f; };
    bc.append(
      ro('Định biên', cn.dinh_bien, db == null && canEdit ? 'Chưa khai định biên cho bộ phận + ca + kíp này (Danh mục → Định biên)' : 'Tự điền theo ca / kíp'),
      num('Sĩ số có mặt', 'co_mat', '', true),
      ro('Vắng mặt', '', 'Tự trừ = Định biên − Có mặt'),
      num('Mượn thêm (+)', 'muon', 'Người chuyền khác sang hỗ trợ'),
      num('Cho mượn (−)', 'cho_muon', 'Người cho chuyền khác mượn'),
      ro('Thực tế đứng máy', '', 'Có mặt + Mượn − Cho mượn'),
      txt('Ghi chú điều động', 'dieu_dong', 'VD: mượn 2 người Line 2 từ 9h', true),
      txt('Ghi chú nhân sự', 'ghi_chu', 'VD: Minh OFF, Linh làm chiều 7H', true),
    );
    function paintCN() {
      const vang = cn.dinh_bien != null && cn.co_mat != null ? cn.dinh_bien - cn.co_mat : null;
      const tt = cn.co_mat != null ? cn.co_mat + (cn.muon || 0) - (cn.cho_muon || 0) : null;
      cn.vang = vang; cn.thuc_te = tt;
      $('[data-ro="Vắng mặt"]', main).value = vang ?? ''; $('[data-ro="Thực tế đứng máy"]', main).value = tt ?? '';
    }
    paintCN();

    // --- kỷ luật: Tốt / Có vi phạm -> chọn lỗi (danh sách thêm bớt được), người vi phạm, ghi chú (bắt buộc nếu lỗi khác)
    const kl = $('[data-kl]', main);
    const seg = el('<div class="nn-field span-2"></div>');
    seg.append(segmented([{ value: 'tot', label: 'Tốt' }, { value: 'vi_pham', label: 'Có vi phạm' }], cn.ky_luat, (v) => { if (!canEdit) return; cn.ky_luat = v; build(); }));
    kl.append(seg);
    if (cn.ky_luat === 'vi_pham') {
      const loiDs = [...new Set([...dsNhanh('loi_ky_luat', nm), ...cn.ky_luat_loi])];
      const chips = el(`<div class="nn-field span-2"><span class="nn-label req">Lỗi vi phạm</span><div class="nn-row" style="padding:0;gap:6px;flex-wrap:wrap">
        ${loiDs.map((x) => `<label class="chip" style="gap:6px;cursor:pointer"><input type="checkbox" data-kll="${esc(x)}" ${cn.ky_luat_loi.includes(x) ? 'checked' : ''} ${canEdit ? '' : 'disabled'} style="width:18px;height:18px">${esc(x)}</label>`).join('')
          || '<span class="t-cap">Chưa có danh sách lỗi — Danh mục → Danh sách nhập nhanh</span>'}</div></div>`);
      chips.onchange = (e) => { const x = e.target.dataset.kll; if (x == null) return; cn.ky_luat_loi = e.target.checked ? [...cn.ky_luat_loi, x] : cn.ky_luat_loi.filter((y) => y !== x); build(); };
      kl.append(chips);
      if (canEdit) kl.append(multiField({ label: 'Người vi phạm', value: cn.ky_luat_nguoi, span: true, options: nsList().map((n) => ({ value: n.id, label: n.ho_ten, sub: n.ma_nv })), onChange: (v) => { cn.ky_luat_nguoi = v; } }));
      else kl.append(el(`<div class="nn-field span-2"><span class="nn-label">Người vi phạm</span><div>${esc(cn.ky_luat_nguoi.map((x) => cat.person(x)).join(', ') || '—')}</div></div>`));
      const khac = cn.ky_luat_loi.some((x) => isLoiKhac(x));
      const f = el(`<div class="nn-field span-2"><label class="nn-label ${khac ? 'req' : ''}">Ghi chú vi phạm${khac ? ' (bắt buộc với lỗi khác)' : ''}</label><div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" ${canEdit ? '' : 'disabled'}>${esc(cn.ky_luat_ghi_chu || '')}</textarea></div></div>`);
      const t = $('textarea', f); grow(t); t.oninput = () => { cn.ky_luat_ghi_chu = t.value; grow(t); };
      kl.append(f);
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
    ].join('');
  }

  const sec = (n, t, hint, key) => `<section class="card section"><div class="card-head"><div class="t-h2">${n}. ${esc(t)} <span class="t-cap">(${esc(hint)})</span></div>
    <span class="chip" data-tong="${key}"></span></div><div data-tb="${key}"></div>
    ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="${key}" style="margin-top:8px">${icon('plus', 16)}Thêm dòng</button>` : ''}</section>`;

  const FIELD = { ns: 'nang_suat', cl: 'chat_luong', mm: 'may_moc' };
  const rowsOf = (key) => (key === 'tc' ? g.con_nguoi.tang_ca : g[FIELD[key]]);
  const colsKey = (key) => { const dg = cat.laDongGoi(g.bo_phan_id); return key === 'ns' ? (dg ? 'ns_dg' : 'ns_sx') : key === 'cl' ? (dg ? 'cl_dg' : 'cl_sx') : key; };
  const valOf = (r, c, t) => (t === 'auto' ? AUTO[c]?.(r) : r[c]);
  function tong(key) {
    const k = colsKey(key), rows = rowsOf(key) || [];
    $(`[data-tong="${key}"]`, main).textContent = TONG[k].map(([c, l]) => { const t = COLS[k].find((x) => x[0] === c)?.[3];
      return `${l}: ${fmtNum(rows.reduce((a, r) => a + (+valOf(r, c, t) || 0), 0), key === 'tc' ? 1 : 0)}`; }).join(' · ');
  }
  function cell(r, i, [c, , w, t = 'text']) {
    const dis = canEdit ? '' : 'disabled';
    const st = `style="min-width:${w}px;width:100%"`;
    if (t === 'auto') { const v = AUTO[c]?.(r); return `<span class="gc-auto" data-auto="${i}:${c}">${v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : esc(v)}</span>`; }
    if (t === 'num' || t === 'dec') return `<input class="nn-input" ${st} data-r="${i}" data-c="${c}" data-t="${t}" inputmode="${t === 'num' ? 'numeric' : 'decimal'}" value="${esc(r[c] != null ? fmtNum(r[c], t === 'dec' ? 1 : 0) : '')}" ${dis}>`;
    if (t === 'date') return `<input class="nn-input" type="date" ${st} data-r="${i}" data-c="${c}" value="${esc(r[c] || '')}" ${dis}>`;
    if (t.startsWith('sel:')) {
      const opts = SEL[t.slice(4)]();
      const cur = r[c] ?? '';
      return `<select class="nn-input" ${st} data-r="${i}" data-c="${c}" ${dis}><option value="">—</option>${cur && !opts.some(([v]) => v === cur) ? `<option value="${esc(cur)}" selected>${esc(t === 'sel:ns' ? cat.person(cur) || cur : cur)}</option>` : ''}
        ${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    }
    if (t.startsWith('list:')) return `<input class="nn-input" ${st} list="dl-${t.slice(5)}" data-r="${i}" data-c="${c}" value="${esc(r[c] ?? '')}" placeholder="Chọn hoặc gõ" ${dis}>`;
    return `<textarea class="nn-input gc-ta" rows="1" ${st} data-r="${i}" data-c="${c}" ${dis}>${esc(r[c] ?? '')}</textarea>`;
  }
  function tbl(key) {
    const k = colsKey(key), cols = COLS[k];
    const rows = rowsOf(key);
    const box = $(`[data-tb="${key}"]`, main);
    const lists = cols.filter(([, , , t]) => t?.startsWith('list:')).map(([, , , t]) => t.slice(5));
    box.innerHTML = `${lists.map((l) => `<datalist id="dl-${l}">${dsNhanh(l, nm).map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`).join('')}
      <div class="nn-table-wrap"><table class="nn-table gc-tb"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${cols.map((col) => `<td>${cell(r, i, col)}</td>`).join('')}
        ${canEdit ? `<td style="white-space:nowrap">${key === 'ns' && k === 'ns_dg' ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-dup="${i}" title="Chép dòng này xuống dưới (STT xe +1)">${icon('copy', 14)}</button>` : ''}
          <button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${key}:${i}" aria-label="Xóa dòng">${icon('x', 14)}</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${cols.length + 1}" class="muted">Chưa có dòng nào</td></tr>`}</tbody></table></div>`;
    $$('textarea.gc-ta', box).forEach(grow);
    $$('[data-t="num"]', box).forEach((x) => bindNum(x, 'int'));
    const paintAuto = (i) => { for (const [c, , , t] of cols) if (t === 'auto') { const a = box.querySelector(`[data-auto="${i}:${c}"]`); const v = AUTO[c]?.(rows[i]); if (a) a.textContent = v == null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : v; } };
    const upd = (x) => {
      const i = +x.dataset.r, c = x.dataset.c, t = x.dataset.t;
      rows[i][c] = t === 'num' ? toInt(x.value) : t === 'dec' ? toNum(x.value) : x.value;
      if (x.tagName === 'TEXTAREA') grow(x);
      paintAuto(i); tong(key);
    };
    box.oninput = (e) => { const x = e.target.closest('[data-r]'); if (x) upd(x); };
    box.onchange = (e) => { const x = e.target.closest('[data-r]'); if (x) upd(x); };
    tong(key);
  }

  /** Lưu nháp hoặc gửi */
  async function luu(gui) {
    if (!g.ngay || !g.ca_id || !g.bo_phan_id) return toast('Chọn đủ ngày, ca, bộ phận', 'warning');
    const clean = (arr) => arr.filter((r) => Object.values(r).some((v) => v != null && v !== ''));
    const dg = cat.laDongGoi(g.bo_phan_id);
    if (gui) {
      const errs = [];
      if (cn.co_mat == null) errs.push('Chưa nhập sĩ số có mặt');
      if (!g.ve_sinh.danh_gia) errs.push('Chưa đánh giá Vệ sinh 5S');
      if (g.ve_sinh.danh_gia === 'Không đạt' && !String(g.ve_sinh.ghi_chu || '').trim()) errs.push('5S Không đạt thì phải ghi chú');
      if (cn.ky_luat === 'vi_pham' && !cn.ky_luat_loi.length) errs.push('Có vi phạm kỷ luật thì chọn lỗi vi phạm');
      if (cn.ky_luat === 'vi_pham' && cn.ky_luat_loi.some((x) => isLoiKhac(x)) && !String(cn.ky_luat_ghi_chu || '').trim()) errs.push('Kỷ luật có "lỗi khác" thì phải ghi chú');
      clean(cn.tang_ca).forEach((r, i) => { if (!r.ns || !(r.gio > 0)) errs.push(`Tăng ca dòng ${i + 1}: chọn người và nhập số giờ`); });
      if (errs.length) return toast(errs.slice(0, 4).join(' · '), 'danger', 'Chưa gửi được');
      if (!(await confirmBox('Gửi báo cáo giao ca? Sau khi gửi, báo cáo bị khóa — muốn sửa phải nhờ quản lý / admin mở khóa.', { ok: 'Gửi báo cáo' }))) return;
    }
    // Lưu giá trị tự tính vào dòng để xuất / in đúng như lúc gửi
    const ns = clean(g.nang_suat).map((r) => (dg ? { ...r, ca_dg: AUTO.ca_dg(), ngay_dg: AUTO.ngay_dg(), ten_sp: AUTO.ten_sp(r), tong_sku: AUTO.tong_sku(r), tong_chai: AUTO.tong_chai(r), nha_may: maNM() }
      : { ...r, con_lai: AUTO.con_lai(r) }));
    const tc = clean(cn.tang_ca);
    const body = { ...g, gui, nang_suat: ns, chat_luong: clean(g.chat_luong), may_moc: clean(g.may_moc), kip_id: g.kip_id || null,
      con_nguoi: { ...cn, tang_ca: tc, tong_gio_tang_ca: tc.reduce((a, r) => a + (+r.gio || 0), 0), ky_luat_loi: cn.ky_luat === 'vi_pham' ? cn.ky_luat_loi : [] } };
    const nid = await rpc('luu_giao_ca', { p: body });
    toast(gui ? 'Đã gửi báo cáo giao ca' : 'Đã lưu nháp', 'success');
    if (nid !== id) go(`#/giao-ca/${nid}`); else editor(main, id);
  }

  main.onclick = async (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { rowsOf(add.dataset.add).push({}); build(); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); rowsOf(k).splice(+i, 1); build(); return; }
    const dup = t.closest('[data-dup]');
    if (dup) { const i = +dup.dataset.dup, r = g.nang_suat[i]; g.nang_suat.splice(i + 1, 0, { ...r, stt_xe: r.stt_xe != null ? r.stt_xe + 1 : null }); build(); return; }
    try {
      if (t.closest('[data-fill]')) {
        if (!g.ca_id) return toast('Chọn ca trước', 'warning');
        const r = await tuPhieu(g);
        const de = (r.nang_suat && g.nang_suat.length) || g.chat_luong.length || g.may_moc.length;
        if (de && !(await confirmBox(`Ghi đè ${r.nang_suat ? 'Năng suất, ' : ''}Chất lượng, Máy móc bằng số liệu từ phiếu?`, { ok: 'Ghi đè' }))) return;
        if (r.nang_suat) g.nang_suat = r.nang_suat;
        Object.assign(g, { chat_luong: r.chat_luong, may_moc: r.may_moc });
        build(); toast(r.so_phieu ? `Đã lấy số từ ${r.so_phieu} phiếu` : 'Không có phiếu nào của bộ phận, ngày, ca này', r.so_phieu ? 'success' : 'warning');
      } else if (t.closest('[data-draft]')) await luu(false);
      else if (t.closest('[data-send]')) await luu(true);
      else if (t.closest('[data-unlock]')) {
        const ly = await askText('Mở khóa báo cáo giao ca', 'Lý do mở khóa (bắt buộc — lưu vào nhật ký)', '', 'Mở khóa');
        if (ly == null) return;
        await rpc('mo_khoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã mở khóa — báo cáo trở về nháp', 'info'); editor(main, id);
      } else if (t.closest('[data-print]')) window.print();
    } catch (err) { toast(errText(err), 'danger'); }
  };
  build();
}

/** Ô chữ tự giãn chiều cao để chữ dài xuống dòng, không bị khuất */
function grow(t) { t.style.height = 'auto'; t.style.height = `${Math.max(36, t.scrollHeight + 2)}px`; }
