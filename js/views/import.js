// Nhập dữ liệu cũ (phiếu giấy / Excel) bằng file Excel mẫu
import { S, cat, can, sb, errText } from '../api.js';
import { clearCalc } from '../data.js';
import { esc, icon, uuid, pad, toISO, fmtDate, noAccent, TINH_TRANG, NHOM_TT, hm, sortCat } from '../lib.js';
import { $, toast } from '../ui.js';

const H_PHIEU = ['MaPhieu', 'Ngay', 'MaMay', 'Ca', 'MaSanPham', 'TocDo_sp_phut', 'GioBatDau', 'GioKetThuc', 'NghiGiuaCa_phut', 'TongSL', 'LoiKhoiDong', 'LoiQuaTrinh', 'MaNV_VanHanh', 'MaNV_ToTruong', 'MaNV_KyThuat', 'GhiChu'];
const H_DUNG = ['MaPhieu', 'MaLoi', 'TenLoi', 'TuGio', 'DenGio', 'VanDeChatLuong', 'MaNV_XuLy', 'TinhTrang', 'GhiChu'];
const H_KH = ['MaPhieu', 'LyDo', 'TuGio', 'DenGio'];

export async function render(main) {
  if (!can.admin()) { main.innerHTML = '<div class="empty">Chỉ Admin được nhập dữ liệu cũ</div>'; return; }
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Nhập dữ liệu cũ</div><div class="muted">Chuyển phiếu giấy / Excel cũ vào app bằng file Excel mẫu</div></div></div>
    <section class="card section"><div class="t-h2">Bước 1 · Tải file mẫu</div>
      <p>File gồm 3 sheet: <b>Phieu</b> (mỗi dòng 1 phiếu), <b>DungMay</b> (mỗi dòng 1 lần dừng, nối với phiếu bằng cột MaPhieu), <b>DungKeHoach</b>. Sheet <b>DanhMuc</b> liệt kê mã máy, ca, sản phẩm, mã lỗi, nhân sự để tra cứu.</p>
      <button class="nn-btn nn-btn-secondary nn-btn-lg" data-tpl>${icon('download', 18)}Tải file Excel mẫu</button></section>
    <section class="card section"><div class="t-h2">Bước 2 · Tải file đã điền lên</div>
      <p class="t-cap">Ngày dạng 20/10/2026, giờ dạng 06:00. Phiếu nhập vào sẽ ở trạng thái <b>Đã xác nhận</b>. Tình trạng lỗi để trống = Đã xử lý.</p>
      <label class="nn-btn nn-btn-secondary nn-btn-lg">${icon('upload', 18)}Chọn file Excel<input type="file" accept=".xlsx,.xls" hidden data-file></label></section>
    <div data-preview></div>`;
  let parsed = [];
  main.onclick = async (e) => {
    if (e.target.closest('[data-tpl]')) template();
    if (e.target.closest('[data-run]')) run(e.target.closest('[data-run]'));
  };
  $('[data-file]', main).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
    try { parsed = parse(XLSX.read(await f.arrayBuffer(), { cellDates: true })); preview(); } catch (err) { toast(`Không đọc được file: ${err.message}`, 'danger'); }
    e.target.value = '';
  };

  function preview() {
    const ok = parsed.filter((p) => !p.errors.length);
    $('[data-preview]', main).innerHTML = `<section class="card section"><div class="card-head"><div class="t-h2">Bước 3 · Kiểm tra (${ok.length}/${parsed.length} phiếu hợp lệ)</div>
      <button class="nn-btn nn-btn-primary nn-btn-lg" data-run ${ok.length ? '' : 'disabled'}>${icon('upload', 18)}Nhập ${ok.length} phiếu</button></div>
      <div class="nn-table-wrap"><table class="nn-table"><thead><tr><th>Mã phiếu</th><th>Ngày</th><th>Máy</th><th>Ca</th><th class="num">Tổng SL</th><th class="num">Lần dừng</th><th>Kiểm tra</th></tr></thead><tbody>
      ${parsed.map((p) => `<tr data-row="${esc(p.key)}"><td class="nn-mono">${esc(p.key)}</td><td>${fmtDate(p.body.ngay)}</td><td class="nn-mono">${esc(p.raw.MaMay)}</td><td>${esc(p.raw.Ca)}</td>
        <td class="num">${p.body.tong_sl ?? ''}</td><td class="num">${p.body.dung_may.length}</td>
        <td class="wrap" data-res>${p.errors.length ? `<span class="nn-status nn-tone-danger">${icon('fail', 14)}Lỗi</span> ${esc(p.errors.join(' · '))}` : `<span class="nn-status nn-tone-success">${icon('pass', 14)}Hợp lệ</span>`}</td></tr>`).join('')}
      </tbody></table></div></section>`;
  }

  async function run(btn) {
    btn.disabled = true;
    let okN = 0, bad = 0;
    for (const p of parsed.filter((x) => !x.errors.length && !x.done)) {
      const cell = $(`[data-row="${CSS.escape(p.key)}"] [data-res]`, main);
      const { error } = await sb.rpc('luu_phieu', { p: p.body });
      if (error) { bad++; cell.innerHTML = `<span class="nn-status nn-tone-danger">${icon('fail', 14)}${esc(errText(error))}</span>`; }
      else { okN++; p.done = true; cell.innerHTML = `<span class="nn-status nn-tone-success">${icon('pass', 14)}Đã nhập</span>`; }
    }
    clearCalc();
    toast(`Đã nhập ${okN} phiếu${bad ? `, ${bad} phiếu lỗi` : ''}`, bad ? 'warning' : 'success');
  }
}

// ---------- Đọc giá trị ô ----------
const dateOf = (v) => {
  if (v instanceof Date) return toISO(new Date(v.getTime() + 12 * 36e5)); // tránh lệch múi giờ
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0].slice(0, 10);
  return null;
};
const timeOf = (v) => {
  if (v instanceof Date) { const d = new Date(Math.round(v.getTime() / 60000) * 60000); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }
  const m = String(v || '').trim().match(/^(\d{1,2})[:hH.](\d{2})/); return m ? `${pad(m[1])}:${m[2]}` : null;
};
const intOf = (v) => (v === '' || v == null ? null : Math.round(Number(String(v).replace(/[^\d.-]/g, ''))));
const numOf = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
const k = (s) => noAccent(String(s ?? '').trim());

function parse(wb) {
  const rows = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []);
  const P = rows('Phieu'), D = rows('DungMay'), KH = rows('DungKeHoach');
  if (!P.length) throw new Error('Không thấy sheet "Phieu" hoặc sheet trống');
  const may = cat.may(true), ns = cat.nhanSu(), sp = cat.sanPham(), ly = cat.lyDo();
  const findNs = (ma) => (ma ? ns.find((n) => k(n.ma_nv) === k(ma)) : null);
  const ttOf = (s) => (!s ? 'da_xu_ly' : Object.keys(TINH_TRANG).find((x) => k(TINH_TRANG[x].label) === k(s) || x === s));
  return P.filter((r) => r.MaPhieu !== '' || r.MaMay !== '').map((r, i) => {
    const errors = [];
    const key = String(r.MaPhieu || `dong-${i + 2}`);
    const m = may.find((x) => k(x.ma) === k(r.MaMay));
    if (!m) errors.push(`Không có mã máy "${r.MaMay}"`);
    const cas = cat.ca(m?.bo_phan_id);
    const c = cas.find((x) => k(x.ten) === k(r.Ca));
    if (!c) errors.push(`Không có ca "${r.Ca}"`);
    const s = sp.find((x) => k(x.ma) === k(r.MaSanPham) || k(x.ten) === k(r.MaSanPham));
    if (r.MaSanPham && !s) errors.push(`Không có sản phẩm "${r.MaSanPham}"`);
    const ngay = dateOf(r.Ngay); if (!ngay) errors.push('Sai ngày');
    const speed = numOf(r.TocDo_sp_phut) || (m && s ? cat.speedFor({ may_id: m.id, day_chuyen_id: cat.lineOfMay(m.id)?.id }, s.id) : null);
    if (!speed) errors.push('Thiếu tốc độ định mức');
    const gbd = timeOf(r.GioBatDau) || (c && hm(c.gio_bd)), gkt = timeOf(r.GioKetThuc) || (c && hm(c.gio_kt));
    const tong = intOf(r.TongSL); if (tong == null) errors.push('Thiếu tổng SL');
    const codes = m ? cat.maLoi(m.id).concat(S.cat.ma_loi.filter((l) => l.may_id === m.id && !l.hoat_dong)) : [];
    const stops = D.filter((d) => String(d.MaPhieu) === String(r.MaPhieu) && r.MaPhieu !== '').map((d, j) => {
      const code = codes.find((x) => k(x.ma) === k(d.MaLoi)) || codes.find((x) => k(x.ten) === k(d.TenLoi));
      if (!code) errors.push(`Lần dừng ${j + 1}: không có mã lỗi "${d.MaLoi || d.TenLoi}" của máy ${r.MaMay}`);
      const a = timeOf(d.TuGio), b = timeOf(d.DenGio); if (!a || !b) errors.push(`Lần dừng ${j + 1}: thiếu giờ`);
      const tt = ttOf(d.TinhTrang); if (!tt) errors.push(`Lần dừng ${j + 1}: tình trạng "${d.TinhTrang}" không hợp lệ`);
      return { id: uuid(), stt: j + 1, ma_loi_id: code?.id || null, gio_bd: a, gio_kt: b, van_de_cl: String(d.VanDeChatLuong || '') || null,
        nguoi_xu_ly_id: findNs(d.MaNV_XuLy)?.id || null, tinh_trang: tt || 'da_xu_ly', ghi_chu: String(d.GhiChu || '') || null };
    });
    const ke = KH.filter((d) => String(d.MaPhieu) === String(r.MaPhieu) && r.MaPhieu !== '').map((d) => {
      const l = ly.find((x) => k(x.ten) === k(d.LyDo));
      return { ly_do_id: l?.id || null, ly_do_ten: String(d.LyDo || ''), gio_bd: timeOf(d.TuGio), gio_kt: timeOf(d.DenGio) };
    });
    const kd = intOf(r.LoiKhoiDong) || 0, qt = intOf(r.LoiQuaTrinh) || 0;
    if (tong != null && kd + qt > tong) errors.push('SL lỗi lớn hơn tổng SL');
    return {
      key, raw: r, errors,
      body: { id: uuid(), may_id: m?.id, ngay, ca_id: c?.id, san_pham_id: s?.id || null, toc_do_dm: speed, gio_bd: gbd, gio_kt: gkt,
        nghi_phut: intOf(r.NghiGiuaCa_phut) ?? c?.nghi_phut ?? 0, tong_sl: tong, sl_loi_kd: kd, sl_loi_qt: qt,
        nguoi_van_hanh_id: findNs(r.MaNV_VanHanh)?.id || null, to_truong_id: findNs(r.MaNV_ToTruong)?.id || null, ky_thuat_id: findNs(r.MaNV_KyThuat)?.id || null,
        ghi_chu: String(r.GhiChu || '') || null, trang_thai: 'da_xac_nhan', ke_hoach: ke, dung_may: stops },
    };
  });
}

function template() {
  if (!window.XLSX) return toast('Chưa tải được thư viện Excel — kiểm tra mạng', 'danger');
  const m = cat.may()[0], c = m ? cat.ca(m.bo_phan_id)[0] : null, s = cat.sanPham()[0], code = m ? cat.maLoi(m.id)[0] : null;
  const wb = XLSX.utils.book_new();
  const sheet = (name, header, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header }), name);
  sheet('Phieu', H_PHIEU, [{ MaPhieu: 'P001', Ngay: '20/10/2026', MaMay: m?.ma, Ca: c?.ten, MaSanPham: s?.ma, TocDo_sp_phut: '', GioBatDau: c ? hm(c.gio_bd) : '06:00', GioKetThuc: c ? hm(c.gio_kt) : '14:00',
    NghiGiuaCa_phut: c?.nghi_phut ?? 30, TongSL: 15000, LoiKhoiDong: 20, LoiQuaTrinh: 35, MaNV_VanHanh: 'VH01', MaNV_ToTruong: 'TT01', MaNV_KyThuat: 'KT01', GhiChu: 'Dòng ví dụ — xóa trước khi nhập' }]);
  sheet('DungMay', H_DUNG, [{ MaPhieu: 'P001', MaLoi: code?.ma, TenLoi: code?.ten, TuGio: '08:10', DenGio: '08:35', VanDeChatLuong: '', MaNV_XuLy: 'KT01', TinhTrang: 'Đã xử lý', GhiChu: '' }]);
  sheet('DungKeHoach', H_KH, [{ MaPhieu: 'P001', LyDo: cat.lyDo()[0]?.ten || 'Họp đầu ca', TuGio: '06:00', DenGio: '06:15' }]);
  const dm = [];
  for (const x of cat.may()) {
    dm.push({ Loai: 'Máy', Ma: x.ma, Ten: x.ten, GhiChu: cat.name('bo_phan', x.bo_phan_id) });
    for (const l of cat.maLoi(x.id)) dm.push({ Loai: `Mã lỗi ${x.ma}`, Ma: l.ma, Ten: l.ten, GhiChu: NHOM_TT[l.nhom_ton_that] });
  }
  sortCat(cat.ca()).forEach((x) => dm.push({ Loai: 'Ca', Ma: x.ten, Ten: `${hm(x.gio_bd)}–${hm(x.gio_kt)}`, GhiChu: cat.name('bo_phan', x.bo_phan_id) }));
  cat.sanPham().forEach((x) => dm.push({ Loai: 'Sản phẩm', Ma: x.ma, Ten: x.ten, GhiChu: x.quy_cach || '' }));
  cat.lyDo().forEach((x) => dm.push({ Loai: 'Lý do dừng KH', Ma: '', Ten: x.ten, GhiChu: '' }));
  cat.nhanSu().forEach((x) => dm.push({ Loai: 'Nhân sự', Ma: x.ma_nv, Ten: x.ho_ten, GhiChu: x.vai_tro }));
  Object.values(TINH_TRANG).forEach((t) => dm.push({ Loai: 'Tình trạng lỗi', Ma: '', Ten: t.label, GhiChu: '' }));
  sheet('DanhMuc', ['Loai', 'Ma', 'Ten', 'GhiChu'], dm);
  XLSX.writeFile(wb, 'Mau_NhapDuLieuCu_OEE.xlsx');
}
