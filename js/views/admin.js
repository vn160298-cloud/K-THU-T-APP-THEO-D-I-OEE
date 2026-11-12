// Danh mục (Admin): máy, mã lỗi, dây chuyền, sản phẩm, tốc độ định mức, ca, lý do dừng KH, nhân sự, bộ phận, khu vực, nhà máy, cài đặt
// Mọi danh mục (trừ Nhà máy) quản lý riêng theo từng nhà máy: chọn nhà máy ở đầu trang.
import { S, sb, cat, can, loadCatalog, rpc, errText } from '../api.js';
import { lsSet } from '../store.js';
import { clearCalc } from '../data.js';
import { esc, icon, hm, NHOM_TT, LOAI_LOI, VAI_TRO, toNum, sortCat, noAccent, numInput } from '../lib.js';
import { el, $, $$, toast, openSheet, confirmBox, inputField, selectField, comboField, segmented } from '../ui.js';
import { drawHeader } from '../app.js';
import { exportCatalog, importCatalog, confirmPin } from './catalog_xlsx.js';

const yes = (v) => (v ? `<span class="nn-status nn-tone-success">${icon('pass', 14)}Đang dùng</span>` : `<span class="nn-status nn-tone-info">${icon('info', 14)}Ngưng</span>`);

const TABS = () => [
  { k: 'may', t: 'Máy' }, { k: 'ma_loi', t: 'Mã lỗi' }, { k: 'day_chuyen', t: 'Dây chuyền' }, { k: 'san_pham', t: 'Sản phẩm' },
  { k: 'toc_do', t: 'Tốc độ định mức' }, { k: 'ca', t: 'Ca làm việc' }, { k: 'ly_do_ke_hoach', t: 'Lý do dừng KH' },
  { k: 'nhan_su', t: 'Nhân sự' }, { k: 'phan_cong', t: 'Phân công' }, { k: 'bo_phan', t: 'Bộ phận' }, { k: 'khu_vuc', t: 'Khu vực' },
  can.adminTong() && { k: 'nha_may', t: 'Nhà máy' }, { k: 'cai_dat', t: 'Cài đặt' },
].filter(Boolean);

const opt = (list, f = (x) => x.ten) => list.map((x) => ({ value: x.id, label: f(x) }));
const ofNm = (t) => S.cat[t].filter((r) => r.nha_may_id === S.nm);
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
  }),
  san_pham: () => ({
    title: 'Sản phẩm', rows: ofNm('san_pham'),
    cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên sản phẩm'], ['dvt', 'ĐVT'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã sản phẩm', 'text', true], ['ten', 'Tên sản phẩm', 'text', true], ['dvt', 'Đơn vị tính (ĐVT)', 'text'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('san_pham').length + 1 }),
    headerExtra: () => (S.cat.nha_may.length > 1 ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-copyprod>${icon('copy', 18)}Sao chép từ nhà máy khác</button>` : ''),
  }),
  ca: () => ({
    title: 'Ca làm việc', rows: ofNm('ca'),
    cols: [['ten', 'Ca'], [(r) => cat.name('bo_phan', r.bo_phan_id) || 'Tất cả', 'Bộ phận'], [(r) => `${hm(r.gio_bd)}–${hm(r.gio_kt)}`, 'Giờ'], ['nghi_phut', 'Nghỉ (phút)'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Tên ca', 'text', true], ['bo_phan_id', 'Bộ phận (để trống = tất cả)', 'select', false, () => opt(ofNm('bo_phan'))],
      ['gio_bd', 'Giờ bắt đầu', 'time', true], ['gio_kt', 'Giờ kết thúc', 'time', true], ['nghi_phut', 'Nghỉ giữa ca (phút)', 'number'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, nghi_phut: 30, hoat_dong: true, thu_tu: ofNm('ca').length + 1 }),
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
  let tab = q.tab || 'may';
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Danh mục</div><div class="muted">Thêm, sửa các danh sách xổ xuống dùng trong app — quản lý riêng theo từng nhà máy</div></div>
    <div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-md" data-export>${icon('download', 18)}Xuất Excel toàn bộ danh mục</button>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-import>${icon('upload', 18)}Nhập từ Excel</button>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-reload>${icon('sync', 18)}Tải lại</button></div></div>
    <div class="filters" data-nm></div>
    <div class="nn-row" style="padding:0 0 16px;gap:8px" data-tabs></div><div data-body></div>`;
  const nmBox = $('[data-nm]', main);
  if (can.adminTong()) {
    nmBox.append(selectField({ label: 'Nhà máy đang quản lý', size: 'md', placeholder: '— Chọn nhà máy —', value: S.nm, options: opt(S.cat.nha_may),
      onChange: (v) => { if (!v) return; S.nm = v; lsSet('nm', v); clearCalc(); drawHeader(); show(); } }));
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
    else if (CFG[tab]) crud(body, () => ({ ...CFG[tab](), table: tab }), show);
    else if (tab === 'ma_loi') maLoi(body, show);
    else if (tab === 'toc_do') tocDo(body);
    else if (tab === 'day_chuyen') dayChuyen(body, show);
    else if (tab === 'cai_dat') caiDat(body);
    else if (tab === 'phan_cong') phanCong(body);
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

// ---------- Bảng thêm/sửa chung ----------
function crud(box, cfgFn, refresh) {
  const cfg = cfgFn();
  let kw = '';
  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2">${esc(cfg.title)} (${cfg.rows.length})</div>
    <div class="nn-row" style="padding:0"><div class="nn-input-wrap nn-input-md">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm…" data-kw></div>
    ${cfg.headerExtra ? cfg.headerExtra() : ''}<button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm</button></div></div><div data-tb></div></section>`;
  const draw = () => {
    const rows = cfg.rows.filter((r) => !kw || noAccent(JSON.stringify(r)).includes(kw));
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr>${cfg.cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${cfg.cols.map(([k, , t]) => { const v = typeof k === 'function' ? k(r) : r[k]; return `<td class="${t === 'mono' ? 'nn-mono' : ''}">${t === 'html' ? v : esc(v ?? '')}</td>`; }).join('')}
        <td style="white-space:nowrap"><button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id ?? r.nha_may_id}">${icon('edit', 14)}Sửa</button></td></tr>`).join('')
        || `<tr><td colspan="${cfg.cols.length + 1}" class="muted">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
  };
  draw();
  $('[data-kw]', box).oninput = (e) => { kw = noAccent(e.target.value); draw(); };
  box.onclick = async (e) => {
    if (e.target.closest('[data-add]')) return editRow(cfg, cfg.def(), refresh);
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg, cfg.rows.find((r) => r.id === ed.dataset.edit), refresh);
    if (e.target.closest('[data-copyprod]')) return copyProducts(refresh);
  };
}

function editRow(cfg, row, refresh, table = cfg.table) {
  const isNew = !row.id;
  const val = { ...row };
  const body = el('<div class="form-grid"></div>');
  for (const [k, label, type, req, options, hint] of cfg.fields) {
    if (type === 'bool') {
      const f = el(`<label class="nn-field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" style="width:22px;height:22px" ${val[k] ? 'checked' : ''}> ${esc(label)}</label>`);
      $('input', f).onchange = (e) => { val[k] = e.target.checked; };
      body.append(f);
    } else if (type === 'select') {
      body.append(selectField({ label, value: val[k] ?? '', req, size: 'md', options: options(), onChange: (v) => { val[k] = v || null; } }));
    } else {
      body.append(inputField({ label, value: type === 'time' ? hm(val[k]) : (val[k] ?? ''), type: type === 'time' ? 'time' : 'text', req, size: 'md', msg: hint,
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
  const st = { nm: S.nm, bp: '', kw: '' };
  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2" data-title></div><button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm nhân sự</button></div>
    <div class="filters" data-f></div><div data-tb></div></section>`;
  const bpOpts = () => S.cat.bo_phan.filter((b) => !st.nm || b.nha_may_id === st.nm).map((b) => ({ value: b.id, label: `${b.ten}${st.nm ? '' : ` · ${nmName(b.nha_may_id)}`}` }));
  const fBp = selectField({ label: 'Bộ phận', size: 'md', placeholder: 'Tất cả bộ phận', options: bpOpts(), onChange: (v) => { st.bp = v; draw(); } });
  const kw = inputField({ label: 'Tìm kiếm', size: 'md', placeholder: 'Mã NV hoặc họ tên…', onInput: (v) => { st.kw = noAccent(v); draw(); } });
  if (can.adminTong()) {
    $('[data-f]', box).append(selectField({ label: 'Nhà máy', size: 'md', placeholder: 'Tất cả nhà máy', value: st.nm, options: opt(S.cat.nha_may),
      onChange: (v) => { st.nm = v; st.bp = ''; fBp.setOptions(bpOpts(), ''); draw(); } }));
  }
  $('[data-f]', box).append(fBp, kw);
  const draw = () => {
    const rows = S.cat.nhan_su.filter((n) => (!st.nm || n.nha_may_id === st.nm || !n.nha_may_id) && (!st.bp || n.bo_phan_id === st.bp)
      && (!st.kw || noAccent(`${n.ma_nv} ${n.ho_ten}`).includes(st.kw))).sort((a, b) => a.ma_nv.localeCompare(b.ma_nv, 'vi', { numeric: true }));
    $('[data-title]', box).textContent = `Nhân sự (${rows.length})`;
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Mã NV</th><th>Họ tên</th><th>Vai trò</th><th>Nhà máy</th><th>Bộ phận</th><th>Tài khoản</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="nn-mono">${esc(r.ma_nv)}</td><td>${esc(r.ho_ten)}</td><td>${esc(VAI_TRO[r.vai_tro])}</td><td>${esc(r.nha_may_id ? nmName(r.nha_may_id) : 'Tất cả (admin tổng)')}</td><td>${esc(cat.name('bo_phan', r.bo_phan_id))}</td>
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

// ---------- Mã lỗi theo máy ----------
function maLoi(box, refresh) {
  let mayId = maLoi.last && S.cat.byId.may[maLoi.last]?.nha_may_id === S.nm ? maLoi.last : ofNm('may')[0]?.id;
  box.innerHTML = `<section class="card"><div class="filters" data-f style="margin-bottom:12px"></div><div data-tb></div></section>`;
  const draw = () => {
    maLoi.last = mayId;
    const rows = sortCat(S.cat.ma_loi.filter((l) => l.may_id === mayId));
    $('[data-tb]', box).innerHTML = `<div class="card-head"><div class="t-h2">${esc(cat.mayLabel(mayId))} · ${rows.length} mã</div>
      <div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-md" data-copy>${icon('copy', 18)}Sao chép từ máy khác</button>
      <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm mã lỗi</button></div></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Mã</th><th>Tên lỗi</th><th>Nhóm 6 tổn thất</th><th>Loại lỗi</th><th>Trạng thái</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="nn-mono">${esc(r.ma)}</td><td class="wrap">${esc(r.ten)}</td><td><span class="chip dept">${r.nhom_ton_that}. ${esc(NHOM_TT[r.nhom_ton_that])}</span></td><td>${esc(r.loai_loi)}</td>
        <td>${yes(r.hoat_dong)}</td><td><button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id}">${icon('edit', 14)}Sửa</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Chưa có mã lỗi</td></tr>'}
      </tbody></table></div><p class="t-cap">Nhóm 4–6 (giảm tốc độ, lỗi trong quá trình, lỗi khởi động): các lần dừng gắn nhóm này vẫn tính thời gian dừng, và biểu đồ 6 tổn thất cộng thêm phần app tự tính từ sản lượng. Lần dừng dưới ngưỡng dừng ngắn luôn xếp vào nhóm 3.</p>`;
  };
  const cfg = () => ({
    title: 'Mã lỗi', rows: S.cat.ma_loi.filter((l) => l.may_id === mayId),
    fields: [['ma', 'Mã lỗi', 'text', true], ['ten', 'Tên lỗi', 'text', true],
      ['nhom_ton_that', 'Nhóm 6 tổn thất', 'select', true, () => [1, 2, 3, 4, 5, 6].map((i) => ({ value: i, label: `${i}. ${NHOM_TT[i]}` }))],
      ['loai_loi', 'Loại lỗi', 'select', true, () => LOAI_LOI.map((x) => ({ value: x, label: x }))], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
  });
  $('[data-f]', box).append(comboField({ label: 'Máy', value: mayId, size: 'md', allowClear: false, options: ofNm('may').map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { mayId = v; draw(); } }));
  draw();
  box.onclick = async (e) => {
    if (e.target.closest('[data-add]')) return editRow(cfg(), { may_id: mayId, nhom_ton_that: 1, loai_loi: 'Cơ', hoat_dong: true, thu_tu: cfg().rows.length + 1 }, refresh, 'ma_loi');
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg(), S.cat.byId.ma_loi[ed.dataset.edit], refresh, 'ma_loi');
    if (e.target.closest('[data-copy]')) {
      let src = '';
      const f = comboField({ label: 'Sao chép toàn bộ mã lỗi từ máy', options: ofNm('may').filter((m) => m.id !== mayId).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { src = v; } });
      const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('copy', 18)}Sao chép</button>`);
      const s = openSheet({ title: 'Sao chép bộ mã lỗi', body: f, foot: [ok] });
      ok.onclick = async () => {
        if (!src) return toast('Chọn máy nguồn', 'warning');
        const dst = S.cat.byId.may[mayId], srcM = S.cat.byId.may[src];
        const have = new Set(S.cat.ma_loi.filter((l) => l.may_id === mayId).map((l) => noAccent(l.ten)));
        const rows = S.cat.ma_loi.filter((l) => l.may_id === src && !have.has(noAccent(l.ten))).map((l) => ({
          may_id: mayId, ma: l.ma.startsWith(srcM.ma) ? dst.ma + l.ma.slice(srcM.ma.length) : l.ma, ten: l.ten, nhom_ton_that: l.nhom_ton_that, loai_loi: l.loai_loi, thu_tu: l.thu_tu, hoat_dong: l.hoat_dong,
        }));
        if (!rows.length) return toast('Không có mã mới để chép (trùng tên)', 'info');
        const { error } = await sb.from('ma_loi').insert(rows);
        if (error) return toast(errText(error), 'danger');
        await reload(); s.close(); toast(`Đã chép ${rows.length} mã lỗi`); refresh();
      };
    }
  };
}

// ---------- Sản phẩm & tốc độ định mức theo dây chuyền / máy đơn ----------
// Chọn sản phẩm mà dây chuyền (hoặc máy đơn) chạy + nhập tốc độ. Máy thuộc dây chuyền dùng tốc độ của dây chuyền.
function tocDo(box) {
  const st = (tocDo.st = tocDo.st && tocDo.st.nm === S.nm ? tocDo.st : { nm: S.nm, kind: 'chuyen', id: '' });
  const targets = () => (st.kind === 'chuyen'
    ? ofNm('day_chuyen').map((l) => ({ value: l.id, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → ') }))
    : cat.mayDon(true).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}`, sub: cat.name('khu_vuc', m.khu_vuc_id) })));
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
  f.append(segWrap, fTarget);

  const draw = () => {
    const prods = ofNm('san_pham').filter((p) => p.hoat_dong).filter((p) => !kw || noAccent(`${p.ma} ${p.ten}`).includes(kw));
    const inLine = cat.mayDon(true).length !== cat.may(true).length ? cat.may(true).filter((m) => cat.lineOfMay(m.id)).map((m) => m.ma).join(', ') : '';
    $('[data-tb]', box).innerHTML = !st.id ? `<div class="empty">${st.kind === 'chuyen' ? 'Chưa có dây chuyền — thêm ở tab Dây chuyền' : 'Không có máy đơn'}</div>` : `
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
  const lines = ofNm('day_chuyen');
  const tongs = ofNm('day_chuyen_tong');
  const tongName = (id) => tongs.find((t) => t.id === id)?.ten || '';
  box.innerHTML = `<section class="card section"><div class="card-head"><div><div class="t-h2">Dây chuyền tổng (${tongs.length})</div>
    <div class="t-cap">Ghép nhiều công đoạn thành 1 dây chuyền để xem báo cáo chung, ví dụ: nấu dung dịch + sơ chế sợi → bồn mix, chiết rót. Mỗi công đoạn là 1 dây chuyền bên dưới, có phiếu và sản lượng riêng. OEE dây chuyền tổng = OEE công đoạn cuối.</div></div>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-addtong>${icon('plus', 18)}Thêm dây chuyền tổng</button></div>
    ${tongs.length ? `<div class="list-cards">${tongs.map((t) => { const cd = S.cat.day_chuyen.filter((l) => l.tong_id === t.id); const fin = cat.cdCuoi(t.id);
      return `<div class="lc" data-edittong="${t.id}"><div class="lc-row"><b>${esc(t.ten)}</b>${yes(t.hoat_dong)}</div>
        <div class="nn-row" style="padding:0;gap:6px">${cd.map((l) => `<span class="chip ${l.id === fin?.id ? 'dept' : ''}">${esc(l.ten)}${l.id === fin?.id ? ' · công đoạn cuối' : ''}</span>`).join('') || '<span class="t-cap">Chưa có công đoạn — mở từng dây chuyền bên dưới, chọn "Thuộc dây chuyền tổng"</span>'}</div></div>`; }).join('')}</div>`
      : '<div class="t-cap">Chưa có. Chỉ cần khi một sản phẩm đi qua nhiều nhánh / công đoạn có sản lượng khác đơn vị.</div>'}</section>
    <section class="card"><div class="card-head"><div><div class="t-h2">Dây chuyền / công đoạn (${lines.length})</div>
    <div class="t-cap">Một phiếu cho cả dây chuyền; mã lỗi theo từng máy. Một máy có thể thuộc nhiều dây chuyền (máy dùng chung): mỗi ca máy đó chỉ tính cho dây chuyền ghi phiếu trước. Máy không thuộc dây chuyền nào là máy đơn.</div></div>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm dây chuyền</button></div>
    <div class="list-cards">${lines.map((l) => {
      const mem = cat.members(l.id);
      const last = cat.lastMay(l.id);
      return `<div class="lc" data-edit="${l.id}"><div class="lc-row"><b>${esc(l.ten)}</b>${yes(l.hoat_dong)}</div>
        <div class="nn-row" style="padding:0;gap:6px">${mem.map((m) => `<span class="chip ${m.may_id === last ? 'dept' : ''}">${esc(cat.name('may', m.may_id, 'ma'))}${m.may_id === last ? ' · cuối' : ''}</span>`).join(icon('chevR', 14)) || '<span class="t-cap">Chưa gán máy</span>'}</div>
        <div class="t-cap">${S.cat.day_chuyen_san_pham.filter((x) => x.day_chuyen_id === l.id).length} sản phẩm · ${S.cat.toc_do_day_chuyen.filter((x) => x.day_chuyen_id === l.id).length} tốc độ đã khai báo${l.tong_id ? ` · thuộc <b>${esc(tongName(l.tong_id))}</b>${l.la_cd_cuoi ? ' (công đoạn cuối)' : ''}` : ''}</div></div>`;
    }).join('') || '<div class="empty">Chưa có dây chuyền</div>'}</div></section>`;
  const tongCfg = { title: 'Dây chuyền tổng', table: 'day_chuyen_tong', fields: [['ten', 'Tên dây chuyền tổng', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']] };
  box.onclick = (e) => {
    if (e.target.closest('[data-addtong]')) return editRow(tongCfg, { nha_may_id: S.nm, hoat_dong: true, thu_tu: tongs.length + 1 }, refresh);
    const et = e.target.closest('[data-edittong]'); if (et) return editRow(tongCfg, tongs.find((t) => t.id === et.dataset.edittong), refresh);
    if (e.target.closest('[data-add]')) return editLine({ nha_may_id: S.nm, ten: '', hoat_dong: true, thu_tu: lines.length + 1 }, []);
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
    if (tongs.length || v.tong_id) {
      const fin = el(`<label class="nn-row" style="padding:0;gap:8px"><input type="checkbox" ${v.la_cd_cuoi ? 'checked' : ''} style="width:22px;height:22px"> Công đoạn cuối (OEE dây chuyền tổng lấy theo công đoạn này)</label>`);
      $('input', fin).onchange = (e) => { v.la_cd_cuoi = e.target.checked; };
      $('[data-g]', body).append(selectField({ label: 'Thuộc dây chuyền tổng (nếu là 1 công đoạn)', size: 'md', placeholder: '— Không —', value: v.tong_id || '', options: opt(tongs),
        onChange: (x) => { v.tong_id = x || null; if (!x) { v.la_cd_cuoi = false; $('input', fin).checked = false; } } }), fin);
    }
    const drawM = () => {
      $('[data-m]', body).innerHTML = mem.map((m, i) => `<div class="stop"><div class="lc-row"><b>${i + 1}. ${esc(cat.mayLabel(m.may_id))}</b>
        <span><button class="nn-btn nn-btn-ghost nn-btn-sm" data-up="${i}" aria-label="Lên">▲</button><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${i}">${icon('trash', 14)}</button></span></div>
        <div class="nn-row" style="padding:4px 0 0"><label><input type="radio" name="last" data-last="${i}" ${m.la_may_cuoi ? 'checked' : ''}> Máy cuối chuyền (đếm sản lượng đạt)</label></div></div>`).join('') || '<div class="t-cap">Chưa có máy</div>';
    };
    drawM();
    const free = () => cat.may(true).filter((m) => !mem.some((x) => x.may_id === m.id));
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
      // Chưa chạy SQL v1.2 thì bản ghi không có cột tong_id: không gửi cột này để khỏi lỗi
      if (!v.tong_id) { if ('tong_id' in line) { v.tong_id = null; v.la_cd_cuoi = false; } else { delete v.tong_id; delete v.la_cd_cuoi; } }
      try {
        const { data, error } = await sb.from('day_chuyen').upsert(v).select().single(); if (error) throw error;
        if (data.tong_id && data.la_cd_cuoi) {  // mỗi dây chuyền tổng chỉ 1 công đoạn cuối
          const { error: e1 } = await sb.from('day_chuyen').update({ la_cd_cuoi: false }).eq('tong_id', data.tong_id).neq('id', data.id); if (e1) throw e1;
        }
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
  const cas = ofNm('ca').filter((c) => c.hoat_dong);
  const targets = () => [
    ...cat.dayChuyen().map((l) => ({ value: `dc:${l.id}`, label: l.ten, sub: cat.members(l.id).map((x) => cat.name('may', x.may_id, 'ma')).join(' → '), group: 'Dây chuyền' })),
    ...cat.mayDon().map((m) => ({ value: `m:${m.id}`, label: `${m.ma} · ${m.ten}`, group: 'Máy đơn' })),
  ];
  const tOf = (v) => (v.startsWith('dc:') ? { day_chuyen_id: v.slice(3), may_id: null } : { may_id: v.slice(2), day_chuyen_id: null });
  const tLabel = (x) => (x.day_chuyen_id ? cat.name('day_chuyen', x.day_chuyen_id) : cat.mayLabel(x.may_id));
  const rowsOf = () => (S.cat.phan_cong || []).filter((x) => x.nha_may_id === S.nm);
  if (!cas.some((c) => c.id === st.ca)) st.ca = cas[0]?.id || '';
  if (!targets().some((t) => t.value === st.t)) st.t = targets()[0]?.value || '';

  box.innerHTML = `<section class="card section"><div class="card-head"><div><div class="t-h2">Phân công theo ca</div>
    <div class="t-cap">Chọn ca và dây chuyền / máy đơn, rồi thêm tổ trưởng và người vận hành. Khi ghi phiếu, app tự điền tổ trưởng và chỉ gợi ý người vận hành được phân công (vẫn có nút "Xem tất cả" khi có người làm thay).</div></div></div>
    <div class="filters" data-f></div><div data-cur></div></section>
    <section class="card"><div class="card-head"><div class="t-h2" data-sumt></div></div><div data-sum></div></section>`;
  if (!S.cat.phan_cong) { $('[data-cur]', box).innerHTML = '<div class="empty">Chưa cập nhật database — chạy lại file supabase/01_schema.sql bản mới</div>'; return; }
  const fCa = selectField({ label: 'Ca', size: 'md', value: st.ca, options: cas.map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})${c.bo_phan_id ? ` · ${cat.name('bo_phan', c.bo_phan_id)}` : ''}` })),
    onChange: (v) => { st.ca = v; drawCur(); } });
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
      options: cat.nhanSu(roles).filter((n) => !have.has(n.id)).map((n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · ${VAI_TRO[n.vai_tro]}${n.bo_phan_id ? ` · ${cat.name('bo_phan', n.bo_phan_id)}` : ''}` })),
      onChange: async (v) => {
        if (!v) return;
        const { error } = await sb.from('phan_cong').insert({ nha_may_id: S.nm, ca_id: st.ca, ...tOf(st.t), nhan_su_id: v, vai_tro: vt, thu_tu: cur.length + 1 });
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
    $('[data-sumt]', box).textContent = `Bảng phân công ${nmName(S.nm)} (${arr.length})`;
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

