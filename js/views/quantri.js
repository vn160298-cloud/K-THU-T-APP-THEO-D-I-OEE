// v1.5 — Quản trị: Yêu cầu mở khóa (quản lý / admin), Nhật ký thao tác (quản lý / admin), Dung lượng & lưu trữ (admin)
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { esc, icon, today, addDays, fmtNum, fmtDate, fmtDateTime } from '../lib.js';
import { $, el, toast, confirmBox, selectField, inputField, rangeField } from '../ui.js';
import { clearCalc } from '../data.js';
import { askText } from './form.js';
import { refreshFaultBadge } from '../app.js';

export async function render(main, { route }) {
  if (route === 'yeu-cau') return yeuCau(main);
  if (route === 'nhat-ky') return nhatKy(main);
  if (route === 'dung-luong') return dungLuong(main);
}

const deny = (main, who) => { main.innerHTML = `<div class="empty">Chỉ ${who} được vào trang này</div>`; };
const lbl = (p) => (p ? `${p.day_chuyen_id ? cat.name('day_chuyen', p.day_chuyen_id) : cat.mayLabel(p.may_id)} · ${fmtDate(p.ngay)} · ${cat.name('ca', p.ca_id)}` : '(phiếu không còn)');

/** Lấy phiếu đại diện cho danh sách id (id phiếu máy hoặc id nhóm dây chuyền) */
async function phieuOf(ids) {
  if (!ids.length) return {};
  const [a, b] = await Promise.all([
    sb.from('phieu').select('id, nhom_id, may_id, day_chuyen_id, ngay, ca_id').in('id', ids),
    sb.from('phieu').select('id, nhom_id, may_id, day_chuyen_id, ngay, ca_id').in('nhom_id', ids),
  ]);
  const out = {};
  for (const p of [...(a.data || []), ...(b.data || [])]) out[p.nhom_id && ids.includes(p.nhom_id) ? p.nhom_id : p.id] ??= p;
  return out;
}

// ================= YÊU CẦU MỞ KHÓA =================
async function yeuCau(main) {
  if (!can.moKhoa()) return deny(main, 'quản lý hoặc admin');
  const st = { tt: 'cho_duyet' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Yêu cầu mở khóa</div>
    <div class="muted">Phiếu đã khóa chỉ sửa được sau khi quản lý / admin duyệt. Mọi lần duyệt, từ chối đều ghi nhật ký.</div></div></div>
    <div class="filters" data-f></div><div data-body></div>`;
  $('[data-f]', main).append(selectField({ label: 'Trạng thái', size: 'md', value: st.tt, placeholder: 'Tất cả',
    options: [{ value: 'cho_duyet', label: 'Đang chờ duyệt' }, { value: 'da_duyet', label: 'Đã duyệt' }, { value: 'tu_choi', label: 'Đã từ chối' }],
    onChange: (v) => { st.tt = v; load(); } }));
  let rows = [], ph = {};
  async function load() {
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    let q = sb.from('yeu_cau_mo_khoa').select('*').eq('nha_may_id', S.nm).order('luc', { ascending: false }).limit(200);
    if (st.tt) q = q.eq('trang_thai', st.tt);
    const { data, error } = await q;
    if (error) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(error))}</div>`; return; }
    rows = data; ph = await phieuOf([...new Set(rows.map((r) => r.phieu_id))]);
    draw();
  }
  const TT = { cho_duyet: ['warning', 'hold', 'Chờ duyệt'], da_duyet: ['success', 'pass', 'Đã duyệt'], tu_choi: ['danger', 'fail', 'Từ chối'] };
  function draw() {
    $('[data-body]', main).innerHTML = rows.length ? `<div class="list-cards">${rows.map((r) => { const [tone, ic, t] = TT[r.trang_thai];
      return `<div class="lc" style="cursor:default"><div class="lc-row"><b>${esc(lbl(ph[r.phieu_id]))}</b><span class="nn-status nn-tone-${tone}">${icon(ic, 14)}${t}</span></div>
        <div class="t-cap">${esc(cat.person(r.nguoi_yc) || '')} · ${fmtDateTime(r.luc)}</div>
        <div>Lý do: ${esc(r.ly_do)}</div>
        ${r.nguoi_duyet ? `<div class="t-cap">${r.trang_thai === 'tu_choi' ? 'Từ chối' : 'Duyệt'} bởi ${esc(cat.person(r.nguoi_duyet) || '')} · ${fmtDateTime(r.luc_duyet)}${r.ghi_chu_duyet ? ` · ${esc(r.ghi_chu_duyet)}` : ''}</div>` : ''}
        <div class="nn-row" style="padding:0"><a class="nn-btn nn-btn-ghost nn-btn-md" href="#/phieu/${r.phieu_id}">${icon('list', 16)}Xem phiếu</a>
        ${r.trang_thai === 'cho_duyet' ? `<button class="nn-btn nn-btn-primary nn-btn-md" data-ok="${r.id}">${icon('unlock', 16)}Duyệt mở khóa</button>
          <button class="nn-btn nn-btn-secondary nn-btn-md" data-no="${r.id}">${icon('x', 16)}Từ chối</button>` : ''}</div></div>`; }).join('')}</div>`
      : `<div class="empty">${st.tt === 'cho_duyet' ? 'Không có yêu cầu nào đang chờ' : 'Không có yêu cầu'}</div>`;
  }
  main.onclick = async (e) => {
    const b = e.target.closest('[data-ok],[data-no]'); if (!b) return;
    const ok = !!b.dataset.ok;
    const gc = await askText(ok ? 'Duyệt mở khóa' : 'Từ chối mở khóa', ok ? 'Ghi chú (không bắt buộc)' : 'Lý do từ chối (bắt buộc)', '', ok ? 'Duyệt và mở khóa' : 'Từ chối', !ok);
    if (gc == null) return;
    try { await rpc('duyet_mo_khoa', { p_yc: b.dataset.ok || b.dataset.no, p_dong_y: ok, p_ghi_chu: gc }); toast(ok ? 'Đã mở khóa phiếu' : 'Đã từ chối', 'info'); clearCalc(); refreshFaultBadge(); load(); }
    catch (err) { toast(errText(err), 'danger'); }
  };
  load();
}

// ================= NHẬT KÝ THAO TÁC =================
const HD = { tao: 'Tạo', sua: 'Sửa', xoa: 'Xóa', xac_nhan: 'Xác nhận & khóa', mo_khoa: 'Mở khóa', doi_tinh_trang: 'Đổi tình trạng lỗi',
  yeu_cau_mo_khoa: 'Yêu cầu mở khóa', tu_choi_mo_khoa: 'Từ chối mở khóa', luu_tru: 'Chuyển lưu trữ' };
async function nhatKy(main) {
  if (!can.moKhoa()) return deny(main, 'quản lý hoặc admin');
  const st = { from: addDays(today(), -6), to: today(), hd: '', kw: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Nhật ký thao tác</div>
    <div class="muted">Hệ thống tự ghi: ai, lúc nào, làm gì, số cũ → số mới. Không ai sửa / xóa được nhật ký.</div></div></div>
    <div class="filters" data-f></div><div data-body></div>`;
  $('[data-f]', main).append(
    rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } }),
    selectField({ label: 'Thao tác', size: 'md', placeholder: 'Tất cả', options: Object.entries(HD).map(([k, v]) => ({ value: k, label: v })), onChange: (v) => { st.hd = v; load(); } }),
    inputField({ label: 'Người thực hiện', size: 'md', placeholder: 'Tên hoặc mã NV…', onInput: (v) => { st.kw = v.trim().toLowerCase(); draw(); } }),
  );
  let rows = [], ph = {};
  async function load() {
    $('[data-body]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    let q = sb.from('nhat_ky').select('*').eq('nha_may_id', S.nm).gte('luc', `${st.from}T00:00:00`).lte('luc', `${st.to}T23:59:59`).order('luc', { ascending: false }).limit(1000);
    if (st.hd) q = q.eq('hanh_dong', st.hd);
    const { data, error } = await q;
    if (error) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(error))}</div>`; return; }
    rows = data; ph = await phieuOf([...new Set(rows.map((r) => r.nhom_id || r.phieu_id).filter(Boolean))]);
    draw();
  }
  const chiTiet = (r) => {
    if (r.hanh_dong !== 'sua' && r.hanh_dong !== 'doi_tinh_trang') return '';
    return Object.entries(r.thay_doi || {}).filter(([k]) => !/(_boi|_luc|^id$|_id$)/.test(k) || k === 'san_pham_id')
      .map(([k, [a, b]]) => `${esc(k)}: ${esc(a == null ? '—' : typeof a === 'object' ? '…' : String(a).slice(0, 30))} → <b>${esc(b == null ? '—' : typeof b === 'object' ? '…' : String(b).slice(0, 30))}</b>`).join(' · ');
  };
  function draw() {
    const list = rows.filter((r) => !st.kw || (r.nguoi || '').toLowerCase().includes(st.kw));
    $('[data-body]', main).innerHTML = list.length ? `<section class="card"><div class="t-cap" style="margin-bottom:8px">${fmtNum(list.length)} dòng${rows.length >= 1000 ? ' (hiện 1.000 dòng mới nhất — thu hẹp khoảng ngày để xem thêm)' : ''}</div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Lúc</th><th>Người</th><th>Thao tác</th><th>Phiếu</th><th>Chi tiết</th></tr></thead><tbody>
      ${list.map((r) => { const k = r.nhom_id || r.phieu_id; return `<tr><td class="nn-mono" style="white-space:nowrap">${fmtDateTime(r.luc)}</td><td>${esc(r.nguoi || '')}</td>
        <td><b>${esc(HD[r.hanh_dong] || r.hanh_dong)}</b>${r.bang === 'dung_may' ? ' <span class="chip">Lần dừng</span>' : ''}</td>
        <td class="wrap">${k ? (ph[k] ? `<a href="#/phieu/${k}">${esc(lbl(ph[k]))}</a>` : `<span class="t-cap">${r.hanh_dong === 'xoa' ? 'Đã xóa' : 'Không còn / đã lưu trữ'}</span>`) : ''}</td>
        <td class="wrap">${r.ly_do ? `Lý do: ${esc(r.ly_do)} ` : ''}${chiTiet(r)}</td></tr>`; }).join('')}</tbody></table></div></section>`
      : '<div class="empty">Không có thao tác nào trong khoảng này</div>';
  }
  load();
}

// ================= DUNG LƯỢNG & LƯU TRỮ =================
const TEN_BANG = { phieu: 'Phiếu', dung_may: 'Lần dừng máy', dung_ke_hoach: 'Dừng có kế hoạch (cũ)', nhat_ky: 'Nhật ký thao tác', phieu_luu_tru: 'Phiếu lưu trữ',
  ma_loi: 'Mã lỗi', may: 'Máy', san_pham: 'Sản phẩm', nhan_su: 'Nhân sự', nhap_phieu: 'Phiếu nháp', yeu_cau_mo_khoa: 'Yêu cầu mở khóa', loi_san_pham: 'Lỗi sản phẩm' };
const GOI = [{ value: '500', label: 'Free — 500 MB' }, { value: '8192', label: 'Pro — 8 GB' }];
const mb = (b) => b / 1048576;
const fmtMB = (b) => (mb(b) >= 1024 ? `${fmtNum(mb(b) / 1024, 2)} GB` : `${fmtNum(mb(b), mb(b) < 10 ? 1 : 0)} MB`);

async function dungLuong(main) {
  if (!can.admin()) return deny(main, 'admin');
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Dung lượng & lưu trữ</div><div class="muted">Dung lượng cơ sở dữ liệu Supabase của app</div></div>
    <button class="nn-btn nn-btn-secondary nn-btn-md" data-reload>${icon('sync', 18)}Tải lại</button></div><div data-body><div class="empty">Đang tải…</div></div>`;
  let d;
  async function load() {
    try { d = await rpc('dung_luong'); draw(); } catch (e) { $('[data-body]', main).innerHTML = `<div class="empty">${esc(errText(e))} — nếu báo "function does not exist": chạy lại file supabase/01_schema.sql bản mới</div>`; }
  }
  function draw() {
    const limMB = +d.gioi_han_mb || 500, used = mb(d.db), pct = Math.min(100, (used / limMB) * 100), con = Math.max(0, limMB - used);
    const tone = pct >= 85 ? 'danger' : pct >= 70 ? 'warning' : 'success';
    const big = (d.bang || []).slice(0, 10);
    const body = $('[data-body]', main);
    body.innerHTML = `
      <section class="card section"><div class="card-head"><div class="t-h2">Đã dùng</div><span class="nn-status nn-tone-${tone}">${fmtNum(pct, 1)}%</span></div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px">
          <div><div class="t-cap">Đã dùng</div><div class="t-page">${fmtMB(d.db)}</div></div>
          <div><div class="t-cap">Còn lại</div><div class="t-page">${fmtMB(con * 1048576)}</div></div>
          <div><div class="t-cap">Giới hạn gói</div><div class="t-page">${fmtMB(limMB * 1048576)}</div></div></div>
        <div style="height:14px;border-radius:7px;background:var(--line);overflow:hidden" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
          <div style="height:100%;width:${pct}%;background:var(--${tone === 'success' ? 'dept' : tone === 'warning' ? 'warning' : 'danger'}, var(--dept))"></div></div>
        <div class="filters" data-goi style="margin-top:12px"></div>
        ${pct >= 70 ? `<div class="nn-alert nn-alert-${tone}"><span class="nn-alert-icon nn-tone-${tone}">${icon('warn', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">Dung lượng đã dùng ${fmtNum(pct, 0)}% — nên nâng cấp gói (xem hướng dẫn bên dưới). Khi đầy, Supabase có thể chuyển cơ sở dữ liệu sang chỉ đọc và app không ghi phiếu được.</div></div></div>` : ''}
      </section>
      <section class="card section"><div class="card-head"><div class="t-h2">Bảng lớn nhất</div></div>
        <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Bảng</th><th class="num">Số dòng (ước tính)</th><th class="num">Dung lượng</th></tr></thead><tbody>
        ${big.map((b) => `<tr><td>${esc(TEN_BANG[b.ten] || b.ten)} <span class="t-cap nn-mono">${esc(b.ten)}</span></td><td class="num">${fmtNum(b.dong)}</td><td class="num">${fmtMB(b.byte)}</td></tr>`).join('')}
        </tbody></table></div></section>
      <section class="card section"><div class="card-head"><div><div class="t-h2">Lưu trữ phiếu cũ</div>
        <div class="t-cap">Phiếu đã xác nhận, mọi lỗi đã xử lý xong, cũ hơn 6 tháng → chuyển sang kho lưu trữ để bảng phiếu hằng ngày nhỏ, mở nhanh.
        Báo cáo khoảng thời gian cũ vẫn tự đọc kho lưu trữ (chỉ xem, không sửa). Lưu ý: lưu trữ giúp app nhanh hơn, <b>không</b> giảm dung lượng.</div></div></div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px">
          <div><div class="t-cap">Phiếu đang dùng</div><div class="t-h2">${fmtNum(d.phieu)}</div></div>
          <div><div class="t-cap">Đã lưu trữ</div><div class="t-h2">${fmtNum(d.luu_tru)}</div></div>
          <div><div class="t-cap">Đủ điều kiện lưu trữ</div><div class="t-h2">${fmtNum(d.cho_luu_tru)}</div></div>
          <div><div class="t-cap">Dòng nhật ký</div><div class="t-h2">${fmtNum(d.nhat_ky)}</div></div></div>
        <button class="nn-btn nn-btn-primary nn-btn-md" data-archive ${d.cho_luu_tru ? '' : 'disabled'}>${icon('download', 18)}Chuyển ${fmtNum(d.cho_luu_tru)} phiếu sang lưu trữ</button></section>
      <section class="card section"><div class="card-head"><div class="t-h2">Cách nâng cấp dung lượng</div></div>
        <ol style="margin:0;padding-left:20px;line-height:1.7">
          <li>Đăng nhập <b>supabase.com</b> bằng tài khoản chủ dự án → chọn dự án của app.</li>
          <li>Vào <b>Settings → Billing</b> (hoặc biểu tượng tổ chức → <b>Billing</b>) → <b>Change plan / Upgrade</b> → chọn <b>Pro</b>.</li>
          <li>Nhập thẻ thanh toán của công ty → xác nhận. Không cần làm gì trong app, dữ liệu giữ nguyên.</li>
          <li>Quay lại trang này, chọn <b>Gói đang dùng = Pro — 8 GB</b> để thanh dung lượng tính đúng.</li>
        </ol>
        <p class="t-cap">Tham khảo (kiểm tra giá mới nhất trên trang Supabase): gói Free 500 MB cơ sở dữ liệu, dự án tạm dừng nếu 7 ngày không dùng (app đã có lịch tự “ping”);
        gói Pro khoảng 25 USD/tháng, gồm 8 GB, dùng thêm tính phí theo GB, có sao lưu hằng ngày.</p>
        <p class="t-cap">Cách tiết kiệm trước khi nâng cấp: xóa phiếu nháp cũ không dùng; nhật ký là phần tăng đều theo thời gian — đó là đánh đổi để minh bạch.</p></section>`;
    $('[data-goi]', body).append(selectField({ label: 'Gói Supabase đang dùng', size: 'md', value: GOI.some((g) => g.value === String(limMB)) ? String(limMB) : '',
      placeholder: `Khác (${fmtNum(limMB)} MB)`, options: GOI,
      onChange: async (v) => { if (!v) return; const { error } = await sb.from('cau_hinh').upsert({ khoa: 'gioi_han_mb', gia_tri: v }); if (error) return toast(errText(error), 'danger'); d.gioi_han_mb = v; draw(); toast('Đã lưu gói đang dùng'); } }));
    $('[data-archive]', body).onclick = async () => {
      if (!(await confirmBox(`Chuyển ${fmtNum(d.cho_luu_tru)} phiếu đã đóng (cũ hơn 6 tháng) sang lưu trữ? Phiếu lưu trữ vẫn xem được và vẫn có trong báo cáo, nhưng không sửa được nữa.`, { ok: 'Chuyển sang lưu trữ', title: 'Lưu trữ phiếu cũ' }))) return;
      try { const n = await rpc('luu_tru_phieu', { p_thang: 6 }); clearCalc(); toast(`Đã chuyển ${fmtNum(n)} phiếu sang lưu trữ`); load(); } catch (e) { toast(errText(e), 'danger'); }
    };
  }
  $('[data-reload]', main).onclick = load;
  load();
}
