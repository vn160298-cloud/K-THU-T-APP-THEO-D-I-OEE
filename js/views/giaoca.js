// v1.6 — BÁO CÁO GIAO CA (biểu mẫu GMP01-BM03-v00) cho bộ phận Sản xuất / Đóng gói.
// 1 báo cáo / bộ phận + ngày + ca + kíp. Năng suất, Chất lượng, Máy móc tự lấy từ các phiếu ghi nhận vận hành trong ca
// (sửa / thêm dòng được); Con người, Vệ sinh 5S, Cần chú ý, Đã họp do tổ trưởng nhập. Ca sau bấm "Nhận ca" -> khóa.
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { loadCalc, groupEntries, entryLabel } from '../data.js';
import { esc, icon, today, addDays, hm, fmtNum, fmtDate, fmtDateTime, toInt, TINH_TRANG } from '../lib.js';
import { $, el, toast, selectField, rangeField, dateField, bindNum } from '../ui.js';
import { go } from '../app.js';
import { askText, historyHtml } from './form.js';

const MA_BM = 'GMP01-BM03-v00';
const DANH_GIA = ['Tốt', 'Đạt', 'Chưa đạt'];

export async function render(main, { params }) {
  if (!params[0]) return list(main);
  return editor(main, params[0] === 'moi' ? null : params[0]);
}

const tieuDe = (g) => `${cat.name('bo_phan', g.bo_phan_id)} · ${fmtDate(g.ngay)} · ${cat.name('ca', g.ca_id)}${g.kip_id ? ` · ${cat.name('kip', g.kip_id)}` : ''}`;
const ttBadgeGC = (g) => (g.trang_thai === 'da_nhan'
  ? `<span class="nn-status nn-tone-success">${icon('lock', 14)}Đã nhận ca</span>`
  : `<span class="nn-status nn-tone-warning">${icon('hold', 14)}Chờ nhận ca</span>`);

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
      <div class="t-cap">Giao: ${esc(cat.person(g.nguoi_giao) || '—')} · ${fmtDateTime(g.luc_giao)}${g.nguoi_nhan ? ` · Nhận: ${esc(cat.person(g.nguoi_nhan))} · ${fmtDateTime(g.luc_nhan)}` : ''}</div>
      <div class="t-cap">${g.nang_suat.length} dòng năng suất · ${g.chat_luong.length} dòng lỗi · ${g.may_moc.length} lần dừng${g.da_hop ? ' · Đã họp giao ca' : ''}</div></a>`).join('')}</div>`
      : '<div class="empty">Chưa có báo cáo giao ca trong khoảng này</div>';
  }
  load();
}

// ================= LẬP / XEM BÁO CÁO =================
// Cột của từng phần theo mẫu. num = ô số; auto = tự tính (không nhập)
const COLS = {
  ns_sx: [['nd', 'Nội dung / sản phẩm', 3], ['ke_hoach', 'SL kế hoạch', 1, 'num'], ['hoan_thanh', 'SL hoàn thành', 1, 'num'], ['con_lai', 'SL còn lại', 1, 'auto']],
  ns_dg: [['sp', 'Sản phẩm', 2], ['ngay_sx', 'Ngày SX', 1], ['line', 'Line', 1], ['thung', 'Thùng', 1, 'num'], ['lo', 'Lô', 1], ['kip_sx', 'Kíp SX', 1], ['so_phieu', 'Số phiếu / ghi chú', 1]],
  cl_sx: [['nd', 'Nội dung lỗi', 3], ['sl', 'SL lỗi', 1, 'num'], ['ghi_chu', 'Ghi chú', 2]],
  cl_dg: [['sp', 'Sản phẩm (ngày SX) / lỗi', 3], ['sl', 'SL lỗi', 1, 'num'], ['tong_kiem', 'Tổng kiểm', 1, 'num'], ['kip_sx', 'Kíp SX', 1], ['ghi_chu', 'Ghi chú', 2]],
  mm: [['tb', 'Line / thiết bị', 2], ['loi', 'Tình trạng / lỗi', 2], ['gio', 'Khung giờ', 1], ['phut', 'Dừng (phút)', 1, 'num'], ['xu_ly', 'Xử lý', 1]],
};
const TONG = { ns_sx: ['hoan_thanh', 'SL hoàn thành'], ns_dg: ['thung', 'Thùng'], cl_sx: ['sl', 'SL lỗi'], cl_dg: ['sl', 'SL lỗi'], mm: ['phut', 'Dừng (phút)'] };

/** Lấy năng suất, chất lượng, máy móc từ các phiếu ghi nhận vận hành của bộ phận + ngày + ca (+ kíp) */
async function tuPhieu(g) {
  const dg = cat.laDongGoi(g.bo_phan_id);
  const rows = (await loadCalc(g.ngay, g.ngay, { force: true }))
    .filter(({ p }) => p.bo_phan_id === g.bo_phan_id && p.ca_id === g.ca_id && (!g.kip_id || !p.kip_id || p.kip_id === g.kip_id));
  const ns = [], cl = [], mm = [];
  for (const e of groupEntries(rows)) {
    const { p, c } = e.rep;
    const sp = cat.name('san_pham', p.san_pham_id) || 'Chưa chọn sản phẩm', ten = entryLabel(e);
    const kipSx = cat.name('kip', p.kip_sx_id || p.kip_id);
    if (dg) ns.push({ sp, ngay_sx: p.ngay_sx ? fmtDate(p.ngay_sx) : '', line: ten, thung: p.so_thung ?? null, lo: p.lo || '', kip_sx: kipSx, so_phieu: p.so_phieu_kho || '' });
    else ns.push({ nd: `${sp} — ${ten}`, ke_hoach: p.sl_ke_hoach ?? null, hoan_thanh: c.good ?? null });
    const loi = (p.loi_sp || []).length ? p.loi_sp : ((+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) ? [{ ten: 'Lỗi (chưa phân loại)', so_luong: (+p.sl_loi_kd || 0) + (+p.sl_loi_qt || 0) }] : []);
    for (const x of loi) {
      if (dg) cl.push({ sp: `${sp}${p.ngay_sx ? ` ${fmtDate(p.ngay_sx).slice(0, 5)}` : ''} — ${x.ten}`, sl: x.so_luong, tong_kiem: p.tong_sl ?? null, kip_sx: kipSx, ghi_chu: x.ghi_chu || '' });
      else cl.push({ nd: `${sp} — ${x.ten}`, sl: x.so_luong, ghi_chu: x.ghi_chu || '' });
    }
    for (const ch of e.children) for (const s of (ch.p.dung_may || []).filter((x) => x.goc !== false).sort((a, b) => (a.gio_bd > b.gio_bd ? 1 : -1))) {
      mm.push({ tb: cat.mayLabel(ch.p.may_id), loi: s.ten_loi || '', gio: `${hm(s.gio_bd)}–${hm(s.gio_kt)}`, phut: s.phut ?? null, xu_ly: TINH_TRANG[s.tinh_trang]?.label || '' });
    }
  }
  return { nang_suat: ns, chat_luong: cl, may_moc: mm, so_phieu: groupEntries(rows).length };
}

async function editor(main, id) {
  let g;
  if (id) {
    const { data, error } = await sb.from('giao_ca').select('*').eq('id', id).maybeSingle();
    if (error || !data) { main.innerHTML = `<div class="empty">${esc(error ? errText(error) : 'Không tìm thấy báo cáo giao ca')}</div>`; return; }
    g = data;
  } else {
    if (!can.giaoCa()) { main.innerHTML = '<div class="empty">Chỉ tổ trưởng, quản lý hoặc admin được lập báo cáo giao ca</div>'; return; }
    const bp = S.profile.bo_phan_id && cat.boPhan().some((b) => b.id === S.profile.bo_phan_id) ? S.profile.bo_phan_id : cat.boPhan()[0]?.id || '';
    g = { ngay: today(), ca_id: '', kip_id: '', bo_phan_id: bp, nang_suat: [], chat_luong: [], may_moc: [], con_nguoi: {}, ve_sinh: {}, can_chu_y: '', da_hop: false };
  }
  const locked = g.trang_thai === 'da_nhan';
  const canEdit = can.giaoCa() && !locked;
  const logs = id ? ((await sb.from('nhat_ky').select('*').eq('phieu_id', id).order('luc', { ascending: false }).limit(100)).data || []) : [];

  function build() {
    const dg = cat.laDongGoi(g.bo_phan_id);
    const kNS = dg ? 'ns_dg' : 'ns_sx', kCL = dg ? 'cl_dg' : 'cl_sx';
    main.innerHTML = `<div class="page-head"><div><div class="t-page">Báo cáo giao ca — ${esc(cat.name('bo_phan', g.bo_phan_id) || '')}</div>
      <div class="muted">Biểu mẫu ${MA_BM}${id ? ` · Giao: ${esc(cat.person(g.nguoi_giao) || '')} · ${fmtDateTime(g.luc_giao)}` : ''}${g.nguoi_nhan ? ` · Nhận: ${esc(cat.person(g.nguoi_nhan))} · ${fmtDateTime(g.luc_nhan)}` : ''}</div></div>
      <div class="nn-row" style="padding:0">${id ? ttBadgeGC(g) : ''}<a class="nn-btn nn-btn-ghost nn-btn-md no-print" href="#/giao-ca">${icon('chevL', 18)}Danh sách</a></div></div>
      ${locked ? `<div class="nn-alert nn-alert-info section"><span class="nn-alert-icon nn-tone-info">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Ca sau đã nhận ca — báo cáo đã khóa${g.ghi_chu_nhan ? `. Ghi chú nhận ca: ${esc(g.ghi_chu_nhan)}` : ''}. Muốn sửa: quản lý / admin bấm Mở khóa kèm lý do.</div></div></div>` : ''}
      <section class="card section"><div class="form-grid" data-head></div></section>
      ${sec(1, 'Năng suất', 'Số lượng?', kNS, 'ns')}
      ${sec(2, 'Chất lượng', 'Hàng lỗi?', kCL, 'cl')}
      <section class="card section"><div class="card-head"><div class="t-h2">3. Con người</div></div><div class="form-grid" data-cn></div></section>
      ${sec(4, 'Máy móc', 'Tình trạng?', 'mm', 'mm')}
      <section class="card section"><div class="card-head"><div class="t-h2">5. Vệ sinh — 5S</div></div><div class="form-grid" data-vs></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">6. Cần chú ý?</div></div><div data-ccy></div>
        <label class="nn-row" style="padding:12px 0 0;gap:8px"><input type="checkbox" data-hop ${g.da_hop ? 'checked' : ''} ${canEdit ? '' : 'disabled'} style="width:22px;height:22px">
        <span><b>Đã họp giao ca</b> — họp ở nhà ăn, theo mô hình vòng tròn.</span></label></section>
      <section class="card section no-print action-bar"><div class="nn-row" style="padding:0;justify-content:flex-end" data-act></div></section>
      ${id ? historyHtml(logs, []) : ''}`;
    // --- đầu phiếu: ngày, ca, kíp, bộ phận
    const head = $('[data-head]', main);
    const caOpts = cat.ca(g.bo_phan_id).map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})` }));
    head.append(
      dateField({ label: 'Ngày', value: g.ngay, req: true, onChange: (v) => { g.ngay = v; } }),
      selectField({ label: 'Ca', value: g.ca_id, req: true, placeholder: '— Chọn ca —', options: caOpts, onChange: (v) => { g.ca_id = v; } }),
      selectField({ label: 'Kíp', value: g.kip_id || '', placeholder: '— Chọn kíp —', options: cat.kip().map((k) => ({ value: k.id, label: k.ten })), onChange: (v) => { g.kip_id = v; } }),
      selectField({ label: 'Bộ phận', value: g.bo_phan_id, req: true, options: cat.boPhan().map((b) => ({ value: b.id, label: b.ten })),
        onChange: (v) => { if (v === g.bo_phan_id) return; g.bo_phan_id = v; g.nang_suat = []; g.chat_luong = []; build(); } }),
      el(`<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:40px">${esc(cat.name('nha_may', S.nm))}</span></div>`),
    );
    if (canEdit) {
      const b = el(`<div class="nn-field span-2"><button class="nn-btn nn-btn-secondary nn-btn-md" data-fill>${icon('sync', 18)}Lấy số từ phiếu ghi nhận vận hành của ca này</button>
        <span class="nn-field-msg">Tự điền Năng suất, Chất lượng, Máy móc từ các phiếu đã ghi (đúng bộ phận, ngày, ca, kíp). Ghi đè 3 phần này; sửa / thêm dòng được sau đó.</span></div>`);
      head.append(b);
    }
    $$('[data-head] input, [data-head] select', main).forEach((x) => { x.disabled = !canEdit; });
    // --- bảng các phần
    tbl('ns', kNS, 'nang_suat'); tbl('cl', kCL, 'chat_luong'); tbl('mm', 'mm', 'may_moc');
    // --- con người
    const cn = g.con_nguoi || (g.con_nguoi = {});
    const inp = (box, obj, k, label, ph = '', span) => { const f = el(`<div class="nn-field ${span ? 'span-2' : ''}"><label class="nn-label">${esc(label)}</label><div class="nn-input-wrap nn-input-md"><input class="nn-input" value="${esc(obj[k] ?? '')}" placeholder="${esc(ph)}" ${canEdit ? '' : 'disabled'}></div></div>`);
      $('input', f).oninput = (e) => { obj[k] = e.target.value; }; box.append(f); };
    const bc = $('[data-cn]', main);
    inp(bc, cn, 'co_mat', 'Sĩ số có mặt'); inp(bc, cn, 'vang', 'Vắng mặt'); inp(bc, cn, 'dinh_bien', 'Định biên'); inp(bc, cn, 'ky_luat', 'Kỷ luật lao động', 'VD: Tốt');
    inp(bc, cn, 'tang_ca', 'Tăng ca', 'VD: 8 người × 2,5H'); inp(bc, cn, 'ghi_chu', 'Ghi chú nhân sự', 'VD: Minh OFF, Linh làm chiều 7H');
    // --- 5S
    const vs = g.ve_sinh || (g.ve_sinh = {});
    const bv = $('[data-vs]', main);
    bv.append(selectField({ label: 'Đánh giá', value: vs.danh_gia || '', placeholder: '— Chọn —', options: DANH_GIA.map((x) => ({ value: x, label: x })), onChange: (v) => { vs.danh_gia = v; } }));
    inp(bv, vs, 'ghi_chu', 'Ghi chú', 'VD: người trực vệ sinh, khu vực chưa đạt…', true);
    $$('[data-vs] select', main).forEach((x) => { x.disabled = !canEdit; });
    // --- cần chú ý
    const ta = el(`<div class="nn-input-wrap nn-input-lg ta"><textarea class="nn-input" rows="3" ${canEdit ? '' : 'disabled'} placeholder="Việc ca sau cần lưu ý…">${esc(g.can_chu_y || '')}</textarea></div>`);
    $('textarea', ta).oninput = (e) => { g.can_chu_y = e.target.value; };
    $('[data-ccy]', main).append(ta);
    $('[data-hop]', main).onchange = (e) => { g.da_hop = e.target.checked; };
    // --- nút
    const me = S.profile;
    $('[data-act]', main).innerHTML = [
      canEdit ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-save>${icon('send', 18)}${id ? 'Lưu & gửi lại' : 'Gửi báo cáo'}</button>` : '',
      id && !locked && can.giaoCa() && (g.nguoi_giao !== me.id || can.moKhoa()) ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-nhan>${icon('pass', 18)}Nhận ca</button>` : '',
      id && locked && can.moKhoa() ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-unlock>${icon('unlock', 18)}Mở khóa</button>` : '',
      id ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-print>${icon('print', 18)}In / PDF</button>` : '',
    ].join('');
  }

  const sec = (n, t, hint, k, key) => `<section class="card section"><div class="card-head"><div class="t-h2">${n}. ${esc(t)} <span class="t-cap">(${esc(hint)})</span></div>
    <span class="chip" data-tong="${key}"></span></div><div data-tb="${key}"></div>
    ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-add="${key}" style="margin-top:8px">${icon('plus', 16)}Thêm dòng</button>` : ''}</section>`;

  const KEY = { ns: 'nang_suat', cl: 'chat_luong', mm: 'may_moc' };
  const colsOf = (key) => { const dg = cat.laDongGoi(g.bo_phan_id); return key === 'ns' ? (dg ? 'ns_dg' : 'ns_sx') : key === 'cl' ? (dg ? 'cl_dg' : 'cl_sx') : 'mm'; };
  function tong(key) {
    const k = colsOf(key), [c, lbl] = TONG[k];
    const sum = (g[KEY[key]] || []).reduce((a, r) => a + (+r[c] || 0), 0);
    $(`[data-tong="${key}"]`, main).textContent = `${lbl} — tổng: ${fmtNum(sum)}`;
  }
  function tbl(key, k, field) {
    const rows = g[field] || (g[field] = []);
    const cols = COLS[k];
    const box = $(`[data-tb="${key}"]`, main);
    const conLai = (r) => (r.ke_hoach != null && r.hoan_thanh != null ? (+r.ke_hoach || 0) - (+r.hoan_thanh || 0) : '');
    box.innerHTML = `<div class="nn-table-wrap"><table class="nn-table gc-tb"><thead><tr>${cols.map(([, l]) => `<th>${esc(l)}</th>`).join('')}${canEdit ? '<th></th>' : ''}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr>${cols.map(([c, , w, t]) => `<td style="min-width:${w * 70}px">${t === 'auto'
        ? `<span class="nn-mono" data-auto="${i}">${conLai(r) === '' ? '—' : fmtNum(conLai(r))}</span>`
        : `<input class="nn-input" style="height:36px;width:100%" data-r="${i}" data-c="${c}" ${t === 'num' ? 'inputmode="numeric" data-num' : ''} value="${esc(t === 'num' && r[c] != null ? fmtNum(r[c]) : r[c] ?? '')}" ${canEdit ? '' : 'disabled'}>`}</td>`).join('')}
        ${canEdit ? `<td><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${key}:${i}" aria-label="Xóa dòng">${icon('x', 14)}</button></td>` : ''}</tr>`).join('')
        || `<tr><td colspan="${cols.length + 1}" class="muted">Chưa có dòng nào${canEdit ? ' — bấm "Lấy số từ phiếu" hoặc "Thêm dòng"' : ''}</td></tr>`}</tbody></table></div>`;
    box.querySelectorAll('[data-num]').forEach((x) => bindNum(x, 'int'));
    box.oninput = (e) => {
      const x = e.target.closest('[data-r]'); if (!x) return;
      const r = rows[+x.dataset.r];
      r[x.dataset.c] = x.hasAttribute('data-num') ? toInt(x.value) : x.value;
      const a = box.querySelector(`[data-auto="${x.dataset.r}"]`); if (a) { const v = conLai(r); a.textContent = v === '' ? '—' : fmtNum(v); }
      tong(key);
    };
    tong(key);
  }

  main.onclick = async (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { g[KEY[add.dataset.add]].push({}); build(); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { const [k, i] = rm.dataset.rm.split(':'); g[KEY[k]].splice(+i, 1); build(); return; }
    try {
      if (t.closest('[data-fill]')) {
        if (!g.ca_id) return toast('Chọn ca trước', 'warning');
        if ((g.nang_suat.length || g.chat_luong.length || g.may_moc.length) && !confirm('Ghi đè phần Năng suất, Chất lượng, Máy móc bằng số liệu từ phiếu?')) return;
        const r = await tuPhieu(g);
        Object.assign(g, { nang_suat: r.nang_suat, chat_luong: r.chat_luong, may_moc: r.may_moc });
        build(); toast(r.so_phieu ? `Đã lấy số từ ${r.so_phieu} phiếu` : 'Không có phiếu nào của bộ phận, ngày, ca này', r.so_phieu ? 'success' : 'warning');
      } else if (t.closest('[data-save]')) {
        if (!g.ngay || !g.ca_id || !g.bo_phan_id) return toast('Chọn đủ ngày, ca, bộ phận', 'warning');
        const clean = (arr) => arr.filter((r) => Object.values(r).some((v) => v != null && v !== ''));
        const body = { ...g, nang_suat: clean(g.nang_suat), chat_luong: clean(g.chat_luong), may_moc: clean(g.may_moc), kip_id: g.kip_id || null };
        const nid = await rpc('luu_giao_ca', { p: body });
        toast('Đã gửi báo cáo giao ca — chờ ca sau nhận ca', 'success'); go(`#/giao-ca/${nid}`);
        if (nid === id) editor(main, id);
      } else if (t.closest('[data-nhan]')) {
        const gc = await askText('Nhận ca', 'Ghi chú khi nhận ca (không bắt buộc)', 'VD: đã kiểm tra máy, thiếu 1 người', 'Nhận ca và khóa báo cáo', false);
        if (gc == null) return;
        await rpc('nhan_ca', { p_id: id, p_ghi_chu: gc }); toast('Đã nhận ca', 'success'); editor(main, id);
      } else if (t.closest('[data-unlock]')) {
        const ly = await askText('Mở khóa báo cáo giao ca', 'Lý do mở khóa (bắt buộc — lưu vào nhật ký)', '', 'Mở khóa');
        if (ly == null) return;
        await rpc('mo_khoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã mở khóa', 'info'); editor(main, id);
      } else if (t.closest('[data-print]')) {
        window.print();
      }
    } catch (err) { toast(errText(err), 'danger'); }
  };
  build();
}

const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
