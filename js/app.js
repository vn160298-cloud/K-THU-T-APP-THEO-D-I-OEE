// Khởi động app, điều hướng, đồng bộ nền
import { S, sb, configured, loadProfile, loadCatalog, flushQueue, pullDrafts, can, fetchOpenFaults, cat } from './api.js';
import { queue, lsGet } from './store.js';
import { icon, esc, VAI_TRO, stopAgeHours } from './lib.js';
import { $, toast } from './ui.js';

const VIEWS = {
  'hom-nay': () => import('./views/today.js'),
  'ghi-phieu': () => import('./views/form.js'),
  phieu: () => import('./views/form.js'),
  loi: () => import('./views/faults.js'),
  'chi-so': () => import('./views/kpis.js'),
  lich: () => import('./views/calendar.js'),
  'danh-sach': () => import('./views/list.js'),
  'bao-cao': () => import('./views/reports.js'),
  'danh-muc': () => import('./views/admin.js'),
  'nhap-du-lieu': () => import('./views/import.js'),
  'tai-khoan': () => import('./views/account.js'),
  in: () => import('./views/print.js'),
  them: () => import('./views/account.js'),
};

const NAV = () => [
  { r: 'hom-nay', t: 'Hôm nay', i: 'home', tab: true },
  can.ghiPhieu() && { r: 'ghi-phieu', t: 'Ghi phiếu', i: 'plus', tab: true },
  { r: 'loi', t: 'Lỗi cần xử lý', tt: 'Lỗi', i: 'warn', tab: true, badge: 'faults' },
  { r: 'chi-so', t: 'Chỉ số OEE', tt: 'Chỉ số', i: 'chart', tab: true },
  { r: 'lich', t: 'Lịch tháng', i: 'cal' },
  { r: 'danh-sach', t: 'Danh sách phiếu', i: 'list' },
  { r: 'bao-cao', t: 'Báo cáo', i: 'print' },
  can.admin() && { sep: 'Quản trị' },
  can.admin() && { r: 'danh-muc', t: 'Danh mục', i: 'gear' },
  can.admin() && { r: 'nhap-du-lieu', t: 'Nhập dữ liệu cũ', i: 'upload' },
  { sep: 'Cá nhân' },
  { r: 'tai-khoan', t: 'Tài khoản', i: 'user' },
].filter(Boolean);

let faultCount = 0;
let cleanup = null;

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'hom-nay';
  const [path, qs] = h.split('?');
  const [route, ...rest] = path.split('/');
  return { route, params: rest, q: Object.fromEntries(new URLSearchParams(qs || '')) };
}
export const go = (h) => { location.hash = h; };

function drawNav() {
  const { route } = parseHash();
  const items = NAV();
  const badge = (it) => (it.badge === 'faults' && faultCount ? `<span class="badge-dot">${faultCount > 99 ? '99+' : faultCount}</span>` : '');
  const side = $('#side');
  side.hidden = false;
  side.innerHTML = items.map((it) => (it.sep ? `<div class="nn-label">${esc(it.sep)}</div>`
    : `<a href="#/${it.r}" class="${route === it.r ? 'is-active' : ''}">${icon(it.i, 20)}<span>${esc(it.t)}</span>${badge(it)}</a>`)).join('');
  const tabs = items.filter((x) => x.tab);
  const more = !tabs.some((t) => t.r === route) ;
  const tb = $('#tabbar');
  tb.hidden = false;
  tb.style.gridTemplateColumns = `repeat(${tabs.length + 1}, 1fr)`;
  tb.innerHTML = tabs.map((it) => `<a href="#/${it.r}" class="${route === it.r ? 'is-active' : ''}">${icon(it.i, 22)}<span>${esc(it.tt || it.t)}</span>${badge(it)}</a>`).join('')
    + `<a href="#/them" class="${more ? 'is-active' : ''}">${icon('menu', 22)}<span>Thêm</span></a>`;
}

export function drawHeader() {
  const p = S.profile;
  const pend = queue.all().length;
  const net = !S.online
    ? `<span class="hdr-net" title="Phiếu sẽ tự gửi khi có mạng">${icon('wifiOff', 14)}Ngoại tuyến${pend ? ` · ${pend}` : ''}</span>`
    : pend ? `<span class="hdr-net">${icon('sync', 14)}Chờ gửi ${pend}</span>` : '';
  const nm = S.cat && S.nm ? cat.name('nha_may', S.nm) : '';
  $('#hdrEnd').innerHTML = p ? `${net}<span class="nn-header-user hdr-user">${esc(p.ho_ten)} · ${esc(VAI_TRO[p.vai_tro])}${nm ? ` · ${esc(nm)}` : ''}</span>
    <a class="hdr-btn" href="#/tai-khoan" aria-label="Tài khoản" title="${esc(p.ho_ten)}">${icon('user', 22)}</a>` : net;
}

export async function refreshFaultBadge() {
  if (!S.online || !S.profile) return;
  try {
    const list = await fetchOpenFaults();
    const h = cat.caiDat().gio_qua_han || 4;
    faultCount = list.filter((d) => d.tinh_trang !== 'da_xu_ly' && stopAgeHours(d, d.phieu) >= h).length || 0;
    S.openFaults = list;
    drawNav();
  } catch { /* bỏ qua */ }
}

async function route() {
  if (!S.profile) return;
  const { route: r, params, q } = parseHash();
  const loader = VIEWS[r] || VIEWS['hom-nay'];
  drawNav();
  try { cleanup?.(); } catch { /* */ }
  cleanup = null;
  const main = $('#main');
  main.onclick = null; main.onchange = null; main.oninput = null;
  main.innerHTML = '<div class="empty">Đang tải…</div>';
  try {
    const mod = await loader();
    cleanup = await mod.render(main, { route: r, params, q }) || null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="nn-alert nn-alert-danger" role="alert"><span class="nn-alert-icon nn-tone-danger">${icon('fail', 20)}</span>
      <div class="nn-alert-body"><div class="nn-alert-title">Không mở được trang</div><div class="nn-alert-text">${esc(e.message || e)}</div></div></div>`;
  }
  window.scrollTo(0, 0);
}

async function sync(manual) {
  if (!S.online || !S.profile) return;
  const r = await flushQueue();
  if (r.sent) toast(`Đã gửi ${r.sent} phiếu chờ đồng bộ`, 'success');
  if (r.failed) toast(`${r.failed} phiếu không gửi được — mở "Ghi phiếu" để xem lỗi`, 'danger');
  if (manual) await pullDrafts();
  drawHeader();
}

export async function startApp() {
  $('#side').hidden = false; $('#tabbar').hidden = false;
  await loadCatalog().catch((e) => toast(`Không tải được danh mục: ${e.message}`, 'danger'));
  drawHeader(); drawNav();
  window.addEventListener('hashchange', route);
  await route();
  sync(true);
  refreshFaultBadge();
}

async function boot() {
  const theme = lsGet('theme', 'light');
  document.documentElement.dataset.theme = theme;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('online', () => { S.online = true; drawHeader(); sync(true); refreshFaultBadge(); });
  window.addEventListener('offline', () => { S.online = false; drawHeader(); });
  setInterval(() => { sync(); }, 60000);
  setInterval(() => { refreshFaultBadge(); }, 5 * 60000);

  const main = $('#main');
  if (!configured) {
    main.innerHTML = `<div class="card login"><div class="t-h2">Chưa cấu hình Supabase</div>
      <p>Mở file <span class="nn-mono">js/config.js</span> và điền <b>SUPABASE_URL</b>, <b>SUPABASE_ANON_KEY</b>. Xem hướng dẫn trong <span class="nn-mono">HUONG_DAN_TRIEN_KHAI.md</span>.</p></div>`;
    return;
  }
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  const cachedProfile = lsGet('profile');
  if (S.session || (cachedProfile && !navigator.onLine)) {
    try { await loadProfile(); return startApp(); } catch (e) { toast(e.message, 'danger'); }
  }
  const { render } = await import('./views/login.js');
  render(main);
}

boot();
