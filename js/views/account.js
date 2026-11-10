// Tài khoản + menu "Thêm" trên điện thoại
import { S, cat, can, logout, rpc, errText, loadCatalog } from '../api.js';
import { APP_VERSION } from '../config.js';
import { lsGet, lsSet, queue, drafts } from '../store.js';
import { clearCalc } from '../data.js';
import { esc, icon, VAI_TRO } from '../lib.js';
import { el, $, toast, inputField, selectField, segmented, confirmBox } from '../ui.js';
import { drawHeader } from '../app.js';

export async function render(main, { route }) {
  const p = S.profile;
  const links = [
    ['lich', 'cal', 'Lịch tháng'], ['danh-sach', 'list', 'Danh sách phiếu'], ['bao-cao', 'print', 'Báo cáo'],
    can.admin() && ['danh-muc', 'gear', 'Danh mục'], can.admin() && ['nhap-du-lieu', 'upload', 'Nhập dữ liệu cũ'],
  ].filter(Boolean);
  main.innerHTML = `${route === 'them' ? `<div class="page-head"><div class="t-page">Thêm</div></div>
    <section class="list-cards section">${links.map(([r, i, t]) => `<a class="lc" href="#/${r}" style="flex-direction:row;align-items:center;text-decoration:none;color:inherit">${icon(i, 22)}<b style="flex:1">${t}</b>${icon('chevR', 18)}</a>`).join('')}</section>` : ''}
    <div class="page-head"><div class="t-page">Tài khoản</div></div>
    <section class="card section"><div class="nn-table-wrap"><table class="nn-table"><tbody>
      <tr><th>Họ tên</th><td>${esc(p.ho_ten)}</td></tr><tr><th>Mã nhân viên</th><td class="nn-mono">${esc(p.ma_nv)}</td></tr>
      <tr><th>Vai trò</th><td>${esc(VAI_TRO[p.vai_tro])}</td></tr><tr><th>Nhà máy</th><td>${esc(p.nha_may_id ? cat.name('nha_may', p.nha_may_id) : 'Tất cả (admin tổng)')}</td></tr>
      <tr><th>Phiếu nháp / chờ gửi</th><td>${drafts.list().length} / ${queue.all().length}</td></tr>
    </tbody></table></div></section>
    <section class="card section"><div class="t-h2" style="margin-bottom:12px">Cài đặt hiển thị</div><div class="form-grid" data-set></div></section>
    <section class="card section"><div class="t-h2" style="margin-bottom:12px">Đổi PIN</div><div class="form-grid" data-pin></div>
      <div class="nn-row" style="padding:12px 0 0"><button class="nn-btn nn-btn-secondary nn-btn-lg" data-savepin>${icon('lock', 18)}Đổi PIN</button></div></section>
    <section class="card section"><div class="t-h2">Cài app lên điện thoại</div>
      <p><b>iPhone (Safari):</b> bấm nút Chia sẻ ${icon('share', 16)} → <b>Thêm vào MH chính</b>.<br>
      <b>Android (Chrome):</b> bấm menu ⋮ → <b>Thêm vào màn hình chính</b> / <b>Cài đặt ứng dụng</b>.<br>
      Mở từ biểu tượng trên màn hình chính, app chạy toàn màn hình, không có thanh địa chỉ.</p></section>
    <section class="nn-row section" style="padding:0">
      <button class="nn-btn nn-btn-secondary nn-btn-lg" data-update>${icon('sync', 18)}Tải lại dữ liệu & bản mới</button>
      <button class="nn-btn nn-btn-danger nn-btn-lg" data-logout>${icon('logout', 18)}Đăng xuất</button></section>
    <p class="t-cap">KỸ THUẬT - THEO DÕI OEE · phiên bản ${APP_VERSION}</p>`;

  const set = $('[data-set]', main);
  const theme = el('<div class="nn-field"><span class="nn-label">Giao diện</span></div>');
  theme.append(segmented([{ value: 'light', label: 'Sáng' }, { value: 'dark', label: 'Tối' }], lsGet('theme', 'light'), (v) => { document.documentElement.dataset.theme = v; lsSet('theme', v); }));
  set.append(theme);
  if (can.adminTong()) {
    set.append(selectField({ label: 'Nhà máy đang xem', value: S.nm, placeholder: '— Chọn nhà máy —', options: S.cat.nha_may.map((n) => ({ value: n.id, label: n.ten })),
      onChange: (v) => { if (!v) return; S.nm = v; lsSet('nm', v); clearCalc(); drawHeader(); toast(`Đang xem: ${cat.name('nha_may', v)}`, 'info'); } }));
  }
  const p1 = inputField({ label: 'PIN mới (4–6 số)', type: 'password', inputmode: 'numeric', attrs: 'maxlength="6" autocomplete="new-password"' });
  const p2 = inputField({ label: 'Nhập lại PIN mới', type: 'password', inputmode: 'numeric', attrs: 'maxlength="6" autocomplete="new-password"' });
  $('[data-pin]', main).append(p1, p2);

  main.onclick = async (e) => {
    if (e.target.closest('[data-savepin]')) {
      const a = p1.input.value.trim(), b = p2.input.value.trim();
      if (!/^\d{4,6}$/.test(a)) return toast('PIN gồm 4–6 chữ số', 'warning');
      if (a !== b) return toast('Hai lần nhập PIN không khớp', 'warning');
      try { await rpc('doi_pin', { p_pin: a }); p1.input.value = p2.input.value = ''; toast('Đã đổi PIN — lần sau đăng nhập bằng PIN mới'); } catch (err) { toast(errText(err), 'danger'); }
    }
    if (e.target.closest('[data-update]')) {
      try { await loadCatalog(true); clearCalc(); } catch { /* */ }
      const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update();
      location.reload();
    }
    if (e.target.closest('[data-logout]')) {
      const pend = queue.all().length;
      if (pend && !(await confirmBox(`Còn ${pend} phiếu chưa gửi lên máy chủ. Phiếu vẫn được giữ trên máy này và tự gửi khi bạn đăng nhập lại. Đăng xuất?`, { ok: 'Đăng xuất', danger: true }))) return;
      await logout(); location.hash = ''; location.reload();
    }
  };
}
