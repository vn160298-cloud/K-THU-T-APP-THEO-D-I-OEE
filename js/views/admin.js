// Danh mục (Admin): máy, mã lỗi, sản phẩm, tốc độ định mức, ca, lý do dừng KH, bộ phận, khu vực, dây chuyền, nhân sự, nhà máy, cài đặt
import { S, sb, cat, can, loadCatalog, rpc, errText } from '../api.js';
import { esc, icon, hm, NHOM_TT, LOAI_LOI, VAI_TRO, toNum, sortCat, noAccent } from '../lib.js';
import { el, $, $$, toast, openSheet, confirmBox, inputField, selectField, comboField, segmented } from '../ui.js';
import { drawHeader } from '../app.js';

const yes = (v) => (v ? `<span class="nn-status nn-tone-success">${icon('pass', 14)}Đang dùng</span>` : `<span class="nn-status nn-tone-info">${icon('info', 14)}Ngưng</span>`);

const TABS = () => [
  { k: 'may', t: 'Máy / Line' }, { k: 'ma_loi', t: 'Mã lỗi' }, { k: 'san_pham', t: 'Sản phẩm' }, { k: 'toc_do', t: 'Tốc độ định mức' },
  { k: 'ca', t: 'Ca làm việc' }, { k: 'ly_do_ke_hoach', t: 'Lý do dừng KH' }, { k: 'day_chuyen', t: 'Dây chuyền' },
  { k: 'nhan_su', t: 'Nhân sự' }, { k: 'bo_phan', t: 'Bộ phận' }, { k: 'khu_vuc', t: 'Khu vực / Line' },
  can.adminTong() && { k: 'nha_may', t: 'Nhà máy' }, { k: 'cai_dat', t: 'Cài đặt' },
].filter(Boolean);

const opt = (list, f = (x) => x.ten) => list.map((x) => ({ value: x.id, label: f(x) }));
const ofNm = (t) => S.cat[t].filter((r) => r.nha_may_id === S.nm);

const CFG = {
  may: () => ({
    title: 'Máy / Line', rows: ofNm('may'),
    cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên máy'], [(r) => cat.name('bo_phan', r.bo_phan_id), 'Bộ phận'], [(r) => cat.name('khu_vuc', r.khu_vuc_id), 'Khu vực'],
      [(r) => `${r.oee_muc_tieu}% · ${r.nguong_vang}/${r.nguong_xanh}`, 'Mục tiêu · ngưỡng'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã máy', 'text', true], ['ten', 'Tên máy', 'text', true], ['bo_phan_id', 'Bộ phận', 'select', true, () => opt(ofNm('bo_phan'))],
      ['khu_vuc_id', 'Khu vực / Line', 'select', false, () => opt(ofNm('khu_vuc'))], ['oee_muc_tieu', 'OEE mục tiêu (%)', 'number'],
      ['nguong_xanh', 'Ngưỡng xanh từ (%)', 'number'], ['nguong_vang', 'Ngưỡng vàng từ (%)', 'number'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, oee_muc_tieu: 85, nguong_xanh: 85, nguong_vang: 60, hoat_dong: true, thu_tu: ofNm('may').length + 1 }),
  }),
  san_pham: () => ({
    title: 'Sản phẩm', rows: ofNm('san_pham'),
    cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên sản phẩm'], ['quy_cach', 'Quy cách'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã sản phẩm', 'text', true], ['ten', 'Tên sản phẩm', 'text', true], ['quy_cach', 'Quy cách', 'text'], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('san_pham').length + 1 }),
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
    title: 'Khu vực / Line', rows: ofNm('khu_vuc'), cols: [['ten', 'Khu vực'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ten', 'Tên khu vực / line', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ nha_may_id: S.nm, hoat_dong: true, thu_tu: ofNm('khu_vuc').length + 1 }),
  }),
  nha_may: () => ({
    title: 'Nhà máy', rows: S.cat.nha_may, cols: [['ma', 'Mã', 'mono'], ['ten', 'Tên nhà máy'], [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma', 'Mã nhà máy', 'text', true], ['ten', 'Tên nhà máy', 'text', true], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
    def: () => ({ hoat_dong: true, thu_tu: S.cat.nha_may.length + 1 }),
    after: async (row) => { await sb.from('cai_dat').upsert({ nha_may_id: row.id }, { onConflict: 'nha_may_id', ignoreDuplicates: true }); },
  }),
  nhan_su: () => ({
    title: 'Nhân sự', rows: S.cat.nhan_su.filter((n) => n.nha_may_id === S.nm || !n.nha_may_id),
    cols: [['ma_nv', 'Mã NV', 'mono'], ['ho_ten', 'Họ tên'], [(r) => VAI_TRO[r.vai_tro], 'Vai trò'], [(r) => cat.name('bo_phan', r.bo_phan_id), 'Bộ phận'],
      [(r) => (r.user_id ? `<span class="nn-status nn-tone-success">${icon('pass', 14)}Có PIN</span>` : `<span class="nn-status nn-tone-warning">${icon('hold', 14)}Chưa cấp</span>`), 'Tài khoản', 'html'],
      [(r) => yes(r.hoat_dong), 'Trạng thái', 'html']],
    fields: [['ma_nv', 'Mã nhân viên', 'text', true], ['ho_ten', 'Họ tên', 'text', true],
      ['vai_tro', 'Vai trò', 'select', true, () => Object.entries(VAI_TRO).map(([k, v]) => ({ value: k, label: v }))],
      ['bo_phan_id', 'Bộ phận', 'select', false, () => opt(ofNm('bo_phan'))],
      ['nha_may_id', 'Nhà máy (để trống = admin tổng)', 'select', false, () => opt(S.cat.nha_may)], ['hoat_dong', 'Đang hoạt động', 'bool']],
    def: () => ({ nha_may_id: S.nm, vai_tro: 'van_hanh', hoat_dong: true }),
    extra: (r) => `<button class="nn-btn nn-btn-secondary nn-btn-sm" data-pin="${r.id}">${icon('lock', 14)}${r.user_id ? 'Đổi PIN' : 'Cấp PIN'}</button>`,
  }),
};

export async function render(main, { q }) {
  if (!can.admin()) { main.innerHTML = '<div class="empty">Chỉ Admin được vào Danh mục</div>'; return; }
  let tab = q.tab || 'may';
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Danh mục</div><div class="muted">Thêm, sửa danh sách xổ xuống dùng trong app · ${esc(cat.name('nha_may', S.nm))}</div></div>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-reload>${icon('sync', 18)}Tải lại</button></div>
    <div class="nn-row" style="padding:0 0 16px;gap:8px" data-tabs></div><div data-body></div>`;
  const drawTabs = () => {
    $('[data-tabs]', main).innerHTML = TABS().map((t) => `<button class="nn-btn ${t.k === tab ? 'nn-btn-primary' : 'nn-btn-secondary'} nn-btn-sm" data-tab="${t.k}">${esc(t.t)}</button>`).join('');
  };
  const show = () => {
    drawTabs(); history.replaceState(null, '', `#/danh-muc?tab=${tab}`);
    const body = $('[data-body]', main); body.innerHTML = '';
    if (CFG[tab]) crud(body, () => ({ ...CFG[tab](), table: tab }), show);
    else if (tab === 'ma_loi') maLoi(body, show);
    else if (tab === 'toc_do') tocDo(body);
    else if (tab === 'day_chuyen') dayChuyen(body, show);
    else if (tab === 'cai_dat') caiDat(body);
  };
  $('[data-tabs]', main).onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; show(); } };
  $('[data-reload]', main).onclick = async () => { await loadCatalog(true); toast('Đã tải lại danh mục', 'info'); show(); };
  show();
}

const reload = async () => { await loadCatalog(true); drawHeader(); };

// ---------- Bảng thêm/sửa chung ----------
function crud(box, cfgFn, refresh) {
  const cfg = cfgFn();
  let kw = '';
  box.innerHTML = `<section class="card"><div class="card-head"><div class="t-h2">${esc(cfg.title)} (${cfg.rows.length})</div>
    <div class="nn-row" style="padding:0"><div class="nn-input-wrap nn-input-md">${icon('search', 18, 'muted')}<input class="nn-input" placeholder="Tìm…" data-kw></div>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm</button></div></div><div data-tb></div></section>`;
  const draw = () => {
    const rows = cfg.rows.filter((r) => !kw || noAccent(JSON.stringify(r)).includes(kw));
    $('[data-tb]', box).innerHTML = `<div class="nn-table-wrap"><table class="nn-table"><thead><tr>${cfg.cols.map((c) => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr>${cfg.cols.map(([k, , t]) => { const v = typeof k === 'function' ? k(r) : r[k]; return `<td class="${t === 'mono' ? 'nn-mono' : ''}">${t === 'html' ? v : esc(v ?? '')}</td>`; }).join('')}
        <td style="white-space:nowrap">${cfg.extra ? cfg.extra(r) : ''} <button class="nn-btn nn-btn-ghost nn-btn-sm" data-edit="${r.id ?? r.nha_may_id}">${icon('edit', 14)}Sửa</button></td></tr>`).join('')
        || `<tr><td colspan="${cfg.cols.length + 1}" class="muted">Chưa có dữ liệu</td></tr>`}</tbody></table></div>`;
  };
  draw();
  $('[data-kw]', box).oninput = (e) => { kw = noAccent(e.target.value); draw(); };
  box.onclick = async (e) => {
    if (e.target.closest('[data-add]')) return editRow(cfg, cfg.def(), refresh);
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg, cfg.rows.find((r) => r.id === ed.dataset.edit), refresh);
    const pin = e.target.closest('[data-pin]'); if (pin) return setPin(S.cat.byId.nhan_su[pin.dataset.pin], refresh);
  };
}

function editRow(cfg, row, refresh, table = cfg.table) {
  const isNew = !row.id;
  const val = { ...row };
  const body = el('<div class="form-grid"></div>');
  for (const [k, label, type, req, options] of cfg.fields) {
    if (type === 'bool') {
      const f = el(`<label class="nn-field" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" style="width:22px;height:22px" ${val[k] ? 'checked' : ''}> ${esc(label)}</label>`);
      $('input', f).onchange = (e) => { val[k] = e.target.checked; };
      body.append(f);
    } else if (type === 'select') {
      body.append(selectField({ label, value: val[k] ?? '', req, size: 'md', options: options(), onChange: (v) => { val[k] = v || null; } }));
    } else {
      body.append(inputField({ label, value: type === 'time' ? hm(val[k]) : (val[k] ?? ''), type: type === 'time' ? 'time' : 'text', req, size: 'md',
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

// ---------- Mã lỗi theo máy ----------
function maLoi(box, refresh) {
  let mayId = maLoi.last || cat.may(true)[0]?.id;
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
      </tbody></table></div><p class="t-cap">Nhóm 4–6 (giảm tốc độ, lỗi quá trình, lỗi khởi động) được tính tự động từ sản lượng, không cần mã lỗi.</p>`;
  };
  const cfg = () => ({
    title: 'Mã lỗi', rows: S.cat.ma_loi.filter((l) => l.may_id === mayId),
    fields: [['ma', 'Mã lỗi', 'text', true], ['ten', 'Tên lỗi', 'text', true],
      ['nhom_ton_that', 'Nhóm 6 tổn thất', 'select', true, () => [1, 2, 3].map((i) => ({ value: i, label: `${i}. ${NHOM_TT[i]}` }))],
      ['loai_loi', 'Loại lỗi', 'select', true, () => LOAI_LOI.map((x) => ({ value: x, label: x }))], ['thu_tu', 'Thứ tự', 'number'], ['hoat_dong', 'Đang dùng', 'bool']],
  });
  $('[data-f]', box).append(comboField({ label: 'Máy', value: mayId, size: 'md', allowClear: false, options: cat.may(true).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { mayId = v; draw(); } }));
  draw();
  box.onclick = async (e) => {
    if (e.target.closest('[data-add]')) return editRow(cfg(), { may_id: mayId, nhom_ton_that: 1, loai_loi: 'Cơ', hoat_dong: true, thu_tu: cfg().rows.length + 1 }, refresh, 'ma_loi');
    const ed = e.target.closest('[data-edit]'); if (ed) return editRow(cfg(), S.cat.byId.ma_loi[ed.dataset.edit], refresh, 'ma_loi');
    if (e.target.closest('[data-copy]')) {
      let src = '';
      const f = comboField({ label: 'Sao chép toàn bộ mã lỗi từ máy', options: cat.may(true).filter((m) => m.id !== mayId).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { src = v; } });
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

// ---------- Tốc độ định mức (máy × sản phẩm) ----------
function tocDo(box) {
  let mayId = tocDo.last || cat.may(true)[0]?.id;
  box.innerHTML = `<section class="card"><div class="filters" data-f style="margin-bottom:12px"></div><div data-tb></div></section>`;
  const draw = () => {
    tocDo.last = mayId;
    const sps = cat.sanPham();
    $('[data-tb]', box).innerHTML = `<div class="card-head"><div><div class="t-h2">${esc(cat.mayLabel(mayId))}</div><div class="t-cap">Nhập số sản phẩm/phút ở tốc độ thiết kế. Để trống nếu máy không chạy sản phẩm đó.</div></div>
      <button class="nn-btn nn-btn-primary nn-btn-md" data-save>${icon('pass', 18)}Lưu tốc độ</button></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Sản phẩm</th><th>Quy cách</th><th style="width:200px">Tốc độ (sp/phút)</th></tr></thead><tbody>
      ${sps.map((s) => `<tr><td>${esc(s.ten)} <span class="t-cap nn-mono">${esc(s.ma)}</span></td><td>${esc(s.quy_cach || '')}</td>
        <td><div class="nn-input-wrap nn-input-sm"><input class="nn-input" inputmode="decimal" data-sp="${s.id}" value="${cat.tocDo(mayId, s.id) ?? ''}"><span class="nn-input-unit">sp/phút</span></div></td></tr>`).join('')}
      </tbody></table></div>`;
  };
  $('[data-f]', box).append(comboField({ label: 'Máy', value: mayId, size: 'md', allowClear: false, options: cat.may(true).map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { mayId = v; draw(); } }));
  draw();
  box.onclick = async (e) => {
    if (!e.target.closest('[data-save]')) return;
    const up = [], delIds = [];
    for (const inp of $$('[data-sp]', box)) {
      const v = toNum(inp.value);
      const ex = S.cat.toc_do.find((t) => t.may_id === mayId && t.san_pham_id === inp.dataset.sp);
      if (v > 0) up.push({ may_id: mayId, san_pham_id: inp.dataset.sp, sp_phut: v });
      else if (ex) delIds.push(ex.id);
    }
    try {
      if (up.length) { const { error } = await sb.from('toc_do').upsert(up, { onConflict: 'may_id,san_pham_id' }); if (error) throw error; }
      if (delIds.length) { const { error } = await sb.from('toc_do').delete().in('id', delIds); if (error) throw error; }
      await reload(); toast('Đã lưu tốc độ định mức'); draw();
    } catch (err) { toast(errText(err), 'danger'); }
  };
}

// ---------- Dây chuyền sản phẩm ----------
function dayChuyen(box, refresh) {
  const lines = ofNm('day_chuyen');
  box.innerHTML = `<section class="card"><div class="card-head"><div><div class="t-h2">Dây chuyền sản phẩm (${lines.length})</div>
    <div class="t-cap">Dùng để tính OEE dây chuyền (OPE). Đánh dấu máy cuối (đếm SL đạt) và máy nút cổ chai (chu kỳ lý tưởng).</div></div>
    <button class="nn-btn nn-btn-primary nn-btn-md" data-add>${icon('plus', 18)}Thêm dây chuyền</button></div>
    <div class="list-cards">${lines.map((l) => {
      const mem = S.cat.day_chuyen_may.filter((x) => x.day_chuyen_id === l.id).sort((a, b) => a.thu_tu - b.thu_tu);
      return `<div class="lc" data-edit="${l.id}"><div class="lc-row"><b>${esc(l.ten)}</b>${yes(l.hoat_dong)}</div>
        <div class="t-cap">Sản phẩm: ${esc(cat.name('san_pham', l.san_pham_id) || 'Tất cả')}</div>
        <div class="nn-row" style="padding:0;gap:6px">${mem.map((m) => `<span class="chip ${m.la_may_cuoi || m.la_nut_co_chai ? 'dept' : ''}">${esc(cat.name('may', m.may_id, 'ma'))}${m.la_nut_co_chai ? ' · nút cổ chai' : ''}${m.la_may_cuoi ? ' · cuối' : ''}</span>`).join(icon('chevR', 14)) || '<span class="t-cap">Chưa gán máy</span>'}</div></div>`;
    }).join('') || '<div class="empty">Chưa có dây chuyền</div>'}</div></section>`;
  box.onclick = (e) => {
    if (e.target.closest('[data-add]')) return editLine({ nha_may_id: S.nm, ten: '', san_pham_id: null, hoat_dong: true }, []);
    const ed = e.target.closest('[data-edit]');
    if (ed) { const l = S.cat.byId.day_chuyen[ed.dataset.edit]; editLine(l, S.cat.day_chuyen_may.filter((x) => x.day_chuyen_id === l.id).sort((a, b) => a.thu_tu - b.thu_tu)); }
  };
  function editLine(line, members) {
    const v = { ...line }; let mem = members.map((m) => ({ ...m }));
    const body = el('<div class="nn-stack" style="padding:0"><div class="form-grid" data-g></div><div class="t-h3">Các máy theo thứ tự</div><div data-m></div><div data-addm></div></div>');
    $('[data-g]', body).append(
      inputField({ label: 'Tên dây chuyền', value: v.ten, req: true, size: 'md', onInput: (x) => { v.ten = x.trim(); } }),
      selectField({ label: 'Sản phẩm (trống = tất cả)', value: v.san_pham_id || '', size: 'md', options: opt(cat.sanPham()), onChange: (x) => { v.san_pham_id = x || null; } }),
    );
    const act = el(`<label class="nn-row" style="padding:0;gap:8px"><input type="checkbox" ${v.hoat_dong ? 'checked' : ''} style="width:22px;height:22px"> Đang dùng</label>`);
    $('input', act).onchange = (e) => { v.hoat_dong = e.target.checked; };
    $('[data-g]', body).append(act);
    const drawM = () => {
      $('[data-m]', body).innerHTML = mem.map((m, i) => `<div class="stop"><div class="lc-row"><b>${i + 1}. ${esc(cat.mayLabel(m.may_id))}</b>
        <span><button class="nn-btn nn-btn-ghost nn-btn-sm" data-up="${i}" aria-label="Lên">▲</button><button class="nn-btn nn-btn-ghost nn-btn-sm" data-rm="${i}">${icon('trash', 14)}</button></span></div>
        <div class="nn-row" style="padding:4px 0 0"><label><input type="radio" name="last" data-last="${i}" ${m.la_may_cuoi ? 'checked' : ''}> Máy cuối</label>
        <label><input type="radio" name="bott" data-bott="${i}" ${m.la_nut_co_chai ? 'checked' : ''}> Nút cổ chai</label></div></div>`).join('') || '<div class="t-cap">Chưa có máy</div>';
    };
    drawM();
    $('[data-addm]', body).append(comboField({ label: 'Thêm máy vào dây chuyền', size: 'md', options: cat.may().map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })),
      onChange: (x, f) => { if (x && !mem.some((m) => m.may_id === x)) { mem.push({ may_id: x, la_may_cuoi: false, la_nut_co_chai: false }); drawM(); } f.setValue(''); } }));
    body.addEventListener('click', (e) => {
      const up = e.target.closest('[data-up]'); if (up) { const i = +up.dataset.up; if (i > 0) { [mem[i - 1], mem[i]] = [mem[i], mem[i - 1]]; drawM(); } }
      const rm = e.target.closest('[data-rm]'); if (rm) { mem.splice(+rm.dataset.rm, 1); drawM(); }
    });
    body.addEventListener('change', (e) => {
      if (e.target.dataset.last != null) mem.forEach((m, i) => { m.la_may_cuoi = i === +e.target.dataset.last; });
      if (e.target.dataset.bott != null) mem.forEach((m, i) => { m.la_nut_co_chai = i === +e.target.dataset.bott; });
    });
    const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu</button>`);
    const del = v.id ? el(`<button class="nn-btn nn-btn-danger nn-btn-lg">${icon('trash', 18)}Xóa</button>`) : null;
    const s = openSheet({ title: v.id ? 'Sửa dây chuyền' : 'Thêm dây chuyền', body, foot: [del, ok].filter(Boolean), wide: true });
    ok.onclick = async () => {
      if (!v.ten) return toast('Nhập tên dây chuyền', 'warning');
      try {
        const { data, error } = await sb.from('day_chuyen').upsert(v).select().single(); if (error) throw error;
        await sb.from('day_chuyen_may').delete().eq('day_chuyen_id', data.id);
        if (mem.length) {
          const { error: e2 } = await sb.from('day_chuyen_may').insert(mem.map((m, i) => ({ day_chuyen_id: data.id, may_id: m.may_id, thu_tu: i + 1, la_may_cuoi: m.la_may_cuoi, la_nut_co_chai: m.la_nut_co_chai })));
          if (e2) throw e2;
        }
        await reload(); s.close(); toast('Đã lưu dây chuyền'); refresh();
      } catch (e) { toast(errText(e), 'danger'); }
    };
    if (del) del.onclick = async () => {
      if (!(await confirmBox('Xóa dây chuyền này?', { ok: 'Xóa', danger: true }))) return;
      const { error } = await sb.from('day_chuyen').delete().eq('id', v.id); if (error) return toast(errText(error), 'danger');
      await reload(); s.close(); refresh();
    };
  }
}

// ---------- Cài đặt ----------
function caiDat(box) {
  const c = { nha_may_id: S.nm, ...cat.caiDat() };
  box.innerHTML = '<section class="card"><div class="card-head"><div class="t-h2">Cài đặt nhà máy</div></div><div class="form-grid" data-g></div><div class="nn-row" style="padding:16px 0 0" data-a></div></section>';
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
