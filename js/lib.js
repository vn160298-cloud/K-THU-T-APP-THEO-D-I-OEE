// Tiện ích chung: định dạng kiểu Việt Nam, ngày giờ, icon, nhãn
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nf = (d) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtNum = (n, d = 0) => (n == null || !isFinite(n) ? '—' : nf(d).format(n));
export const fmtPct = (x, d = 1) => (x == null || !isFinite(x) ? '—' : nf(d).format(x * 100) + '%');
export const fmtMin = (m) => {
  if (m == null || !isFinite(m)) return '—';
  m = Math.round(m);
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} giờ ${r} phút` : `${h} giờ`;
};

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const fmtDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5) + 1;
export const monthStart = (s) => s.slice(0, 8) + '01';
export const monthEnd = (s) => { const d = parseISO(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return toISO(d); };
export const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const hm = (t) => (t ? String(t).slice(0, 5) : '');
export const fmtDateTime = (ts) => { if (!ts) return '—'; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
export const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

/** Số phút giữa 2 mốc HH:MM (qua nửa đêm thì cộng 24h) */
export const minutesBetween = (a, b) => {
  if (!a || !b) return 0;
  const [h1, m1] = hm(a).split(':').map(Number), [h2, m2] = hm(b).split(':').map(Number);
  return (((h2 * 60 + m2) - (h1 * 60 + m1)) + 1440) % 1440;
};
/** Mốc giờ có nằm trong ca không (xử lý ca qua đêm) */
export const timeInRange = (t, a, b) => {
  const x = minutesBetween(a, t), len = minutesBetween(a, b);
  return x <= len;
};

/** Số giờ kể từ lúc máy bắt đầu dừng (ngày phiếu + giờ dừng; dừng sau nửa đêm của ca đêm tính sang ngày hôm sau) */
export const stopAgeHours = (stop, phieu) => {
  const t = hm(stop.gio_bd) || '00:00';
  const d = new Date(`${phieu.ngay}T${t}:00`);
  if (phieu.gio_bd && t < hm(phieu.gio_bd)) d.setDate(d.getDate() + 1);
  return (Date.now() - d.getTime()) / 36e5;
};
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const by = (k) => (a, b) => (a[k] ?? 0) > (b[k] ?? 0) ? 1 : (a[k] ?? 0) < (b[k] ?? 0) ? -1 : 0;
export const sortCat = (arr) => [...arr].sort((a, b) => (a.thu_tu ?? 0) - (b.thu_tu ?? 0) || String(a.ma ?? a.ten).localeCompare(String(b.ma ?? b.ten), 'vi', { numeric: true }));
/** Số thập phân: chấp nhận cả "12,5" và "12.5" */
export const toNum = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : null; };
/** Số nguyên (sản lượng): bỏ dấu phân cách hàng nghìn "12.450" -> 12450 */
export const toInt = (v) => { if (v === '' || v == null) return null; const s = String(v).replace(/[^\d]/g, ''); return s ? parseInt(s, 10) : null; };
export const noAccent = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

// ---------- Icon (SVG 24×24 chuẩn NutriNest) ----------
const P = {
  kythuat: ['M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z'],
  sanxuat: ['M3 21V10l5 3V10l5 3V5h4l1 16H3z', 'M3 21h18', 'M7 17h2M12 17h2'],
  pass: ['M5 12.5l4.5 4.5L19 7.5'],
  hold: ['M12 7v5l3 2', 'M12 21a9 9 0 100-18 9 9 0 000 18z'],
  fail: ['M6 6l12 12M18 6L6 18'],
  info: ['M12 11v6', 'M12 7.5v.5', 'M12 21a9 9 0 100-18 9 9 0 000 18z'],
  warn: ['M12 4l9 16H3l9-16z', 'M12 10v4', 'M12 17v.5'],
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  plus: ['M12 5v14M5 12h14'],
  doc: ['M7 3h7l5 5v13H7z', 'M14 3v5h5', 'M10 13h6M10 17h6'],
  chart: ['M4 20V4', 'M4 20h16', 'M8 16v-5M12 16V8M16 16v-3'],
  cal: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4M16 3v4'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  list: ['M9 6h11M9 12h11M9 18h11', 'M4 6h.5M4 12h.5M4 18h.5'],
  gear: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 21a8 8 0 0116 0'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  print: ['M7 9V3h10v6', 'M7 17H4v-7h16v7h-3', 'M7 14h10v7H7z'],
  share: ['M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6z', 'M8.6 13.5l6.8 4M15.4 6.5l-6.8 4'],
  edit: ['M4 20h4L19 9l-4-4L4 16v4z', 'M14 6l4 4'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  chevL: ['M15 6l-6 6 6 6'],
  chevR: ['M9 6l6 6-6 6'],
  chevD: ['M6 9l6 6 6-6'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4-4'],
  lock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 018 0v4'],
  unlock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 017.5-2'],
  sync: ['M20 11a8 8 0 00-14.6-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0014.6 4.5L20 16', 'M20 20v-4h-4'],
  wifiOff: ['M3 3l18 18', 'M8.5 16.5a5 5 0 017 0', 'M5 12.5a10 10 0 015.2-2.7M19 12.5a10 10 0 00-2.4-1.7', 'M2 8.8a15 15 0 014.4-2.6M22 8.8A15 15 0 0011 5', 'M12 20h.01'],
  logout: ['M10 4H5v16h5', 'M14 8l4 4-4 4', 'M18 12H9'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  x: ['M6 6l12 12M18 6L6 18'],
};
export const icon = (name, size = 20, cls = '') =>
  `<svg class="nn-icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(P[name] || P.info).map((d) => `<path d="${d}"/>`).join('')}</svg>`;

// ---------- Nhãn nghiệp vụ ----------
export const VAI_TRO = {
  van_hanh: 'Vận hành', to_truong: 'Tổ trưởng', ky_thuat: 'Kỹ thuật', quan_ly: 'Quản lý', admin: 'Admin',
};
export const TINH_TRANG = {
  cho_xu_ly: { label: 'Chờ xử lý', tone: 'warning', icon: 'hold' },
  cho_vat_tu: { label: 'Chờ vật tư', tone: 'info', icon: 'info' },
  da_xu_ly: { label: 'Đã xử lý', tone: 'success', icon: 'pass' },
  chua_khac_phuc: { label: 'Chưa khắc phục được', tone: 'danger', icon: 'fail' },
};
export const TRANG_THAI_PHIEU = {
  nhap: { label: 'Nháp', tone: 'info', icon: 'edit' },
  cho_dong_bo: { label: 'Chờ đồng bộ', tone: 'warning', icon: 'sync' },
  da_gui: { label: 'Chờ xác nhận', tone: 'warning', icon: 'hold' },
  da_xac_nhan: { label: 'Đã xác nhận', tone: 'success', icon: 'lock' },
  chua_co: { label: 'Chưa có phiếu', tone: 'info', icon: 'info' },
};
export const NHOM_TT = {
  1: 'Hỏng hóc thiết bị',
  2: 'Chuẩn bị / điều chỉnh',
  3: 'Dừng ngắn / chạy không tải',
  4: 'Giảm tốc độ',
  5: 'Lỗi trong quá trình',
  6: 'Lỗi khởi động',
};
export const LOAI_LOI = ['Cơ', 'Điện', 'Vận hành', 'Nguyên liệu', 'Tiện ích', 'Chất lượng', 'Khác'];

export const badge = (tone, ic, text, size = 14) => `<span class="nn-status nn-tone-${tone}">${icon(ic, size)}${esc(text)}</span>`;
export const ttBadge = (k) => { const t = TINH_TRANG[k] || TINH_TRANG.cho_xu_ly; return badge(t.tone, t.icon, t.label); };
export const phieuBadge = (k) => { const t = TRANG_THAI_PHIEU[k] || TRANG_THAI_PHIEU.da_gui; return badge(t.tone, t.icon, t.label); };

/** Mức màu OEE theo ngưỡng của máy (hoặc mặc định 85/60) */
export const oeeLevel = (oee, xanh = 85, vang = 60) => {
  if (oee == null || !isFinite(oee)) return null;
  const v = oee * 100;
  return v >= xanh ? 'g' : v >= vang ? 'y' : 'r';
};
/** short = chỉ chữ đánh giá (dùng trong thẻ KPI đã có số to) */
export const oeeBadge = (oee, xanh, vang, short = false) => {
  const lv = oeeLevel(oee, xanh, vang);
  if (!lv) return badge('info', 'info', short ? 'Thiếu dữ liệu' : 'Chưa đủ dữ liệu');
  const n = short ? '' : ` ${fmtPct(oee)}`;
  return lv === 'g' ? badge('success', 'pass', `Đạt${n}`)
    : lv === 'y' ? badge('warning', 'warn', `Theo dõi${n}`)
      : badge('danger', 'fail', `Thấp${n}`);
};
