// Kết nối Supabase + trạng thái dùng chung + đồng bộ ngoại tuyến
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN, pinToPassword } from './config.js';
import { lsGet, lsSet, lsDel, setUser, drafts, queue } from './store.js';
import { sortCat } from './lib.js';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT');
export const sb = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'oee-auth' },
}) : null;

/** Trạng thái app */
export const S = { profile: null, cat: null, nm: null, online: navigator.onLine, session: null };

export const isNetErr = (e) => !navigator.onLine || /fetch|network|load failed|timeout|ECONN/i.test(e?.message || String(e));
export const errText = (e) => {
  if (!e) return 'Lỗi không xác định';
  if (isNetErr(e)) return 'Mất kết nối mạng';
  const m = e.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Sai mã nhân viên hoặc PIN';
  if (/duplicate key|unique/i.test(m)) return 'Dữ liệu bị trùng — kiểm tra lại mã';
  if (/foreign key/i.test(m)) return 'Đang được dùng ở dữ liệu khác — chuyển sang "Ngưng dùng" thay vì xóa';
  return m;
};

// ---------- Đăng nhập ----------
export const maToEmail = (ma) => `${String(ma).toLowerCase().replace(/[^a-z0-9]/g, '')}@${EMAIL_DOMAIN}`;

export async function login(ma, pin) {
  const { data, error } = await sb.auth.signInWithPassword({ email: maToEmail(ma), password: pinToPassword(pin) });
  if (error) throw error;
  S.session = data.session;
  await loadProfile(true);
  return S.profile;
}

/** Xác nhận lại bằng PIN của chính người đang đăng nhập (dùng trước thao tác quan trọng) */
export async function verifyPin(pin) {
  if (!navigator.onLine) throw new Error('Cần kết nối mạng để xác nhận PIN');
  const { data, error } = await sb.auth.signInWithPassword({ email: maToEmail(S.profile.ma_nv), password: pinToPassword(pin) });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'PIN không đúng' : error.message);
  S.session = data.session;
  return true;
}

export async function logout() {
  try { await sb.auth.signOut(); } catch { /* mất mạng vẫn cho thoát */ }
  lsDel('profile'); S.profile = null; S.session = null;
}

export async function loadProfile(force) {
  const cached = lsGet('profile');
  if (cached && !force && !navigator.onLine) { S.profile = cached; setUser(cached.user_id); return cached; }
  try {
    const { data, error } = await sb.rpc('toi');
    if (error) throw error;
    if (!data || !data.id) throw new Error('Tài khoản chưa được gán nhân sự — liên hệ Admin');
    if (!data.hoat_dong) throw new Error('Tài khoản đã ngưng hoạt động');
    S.profile = data; lsSet('profile', data);
  } catch (e) {
    if (isNetErr(e) && cached) S.profile = cached; else throw e;
  }
  setUser(S.profile.user_id);
  S.nm = S.profile.nha_may_id || lsGet('nm') || null;
  return S.profile;
}

export const can = {
  ghiPhieu: () => ['van_hanh', 'to_truong', 'quan_ly', 'admin'].includes(S.profile?.vai_tro),
  xacNhan: () => ['to_truong', 'quan_ly', 'admin'].includes(S.profile?.vai_tro),
  suaKhoa: () => ['quan_ly', 'admin'].includes(S.profile?.vai_tro),
  xuLyLoi: () => ['ky_thuat', 'quan_ly', 'admin'].includes(S.profile?.vai_tro),
  admin: () => S.profile?.vai_tro === 'admin',
  adminTong: () => S.profile?.vai_tro === 'admin' && !S.profile?.nha_may_id,
};

// ---------- Danh mục ----------
const TABLES = ['nha_may', 'bo_phan', 'khu_vuc', 'may', 'ma_loi', 'ly_do_ke_hoach', 'san_pham', 'toc_do', 'ca',
  'day_chuyen', 'day_chuyen_may', 'nhan_su', 'cai_dat', 'may_san_pham', 'day_chuyen_san_pham', 'toc_do_day_chuyen',
  'day_chuyen_tong', 'phan_cong'];

const OPTIONAL = ['day_chuyen_tong', 'phan_cong'];

async function fetchAll(table, build = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(sb.from(table).select('*')).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadCatalog(force = false) {
  let raw = lsGet('cat');
  if (force || !raw || navigator.onLine) {
    try {
      // Bảng mới của v1.2: nếu chưa chạy SQL mới thì coi như rỗng, app vẫn chạy
      const res = await Promise.all(TABLES.map((t) => fetchAll(t).catch((e) => { if (OPTIONAL.includes(t)) return []; throw e; })));
      raw = Object.fromEntries(TABLES.map((t, i) => [t, res[i]]));
      raw._at = new Date().toISOString();
      lsSet('cat', raw);
    } catch (e) {
      if (!raw) throw e;
    }
  }
  S.cat = indexCat(raw);
  if (!S.nm) S.nm = sortCat(S.cat.nha_may)[0]?.id || null;
  return S.cat;
}

function indexCat(raw) {
  const c = { ...raw, byId: {} };
  for (const t of TABLES) {
    c[t] = sortCat(raw[t] || []);
    c.byId[t] = Object.fromEntries(c[t].map((r) => [r.id ?? r.nha_may_id, r]));
  }
  return c;
}

/** Danh mục lọc theo nhà máy đang chọn */
export const cat = {
  may: (all) => S.cat.may.filter((m) => m.nha_may_id === S.nm && (all || m.hoat_dong)),
  boPhan: () => S.cat.bo_phan.filter((b) => b.nha_may_id === S.nm && b.hoat_dong),
  ca: (boPhanId) => S.cat.ca.filter((c) => c.nha_may_id === S.nm && c.hoat_dong && (!boPhanId || !c.bo_phan_id || c.bo_phan_id === boPhanId)),
  maLoi: (mayId) => S.cat.ma_loi.filter((l) => l.may_id === mayId && l.hoat_dong),
  lyDo: () => S.cat.ly_do_ke_hoach.filter((l) => l.nha_may_id === S.nm && l.hoat_dong),
  sanPham: () => S.cat.san_pham.filter((s) => s.nha_may_id === S.nm && s.hoat_dong),
  nhanSu: (roles) => S.cat.nhan_su.filter((n) => n.hoat_dong && (n.nha_may_id === S.nm || !n.nha_may_id) && (!roles || roles.includes(n.vai_tro))),
  tocDo: (mayId, spId) => S.cat.toc_do.find((t) => t.may_id === mayId && t.san_pham_id === spId)?.sp_phut ?? null,
  caiDat: () => S.cat.byId.cai_dat[S.nm] || { nguong_dung_ngan: 5, gio_qua_han: 4 },
  dayChuyen: () => S.cat.day_chuyen.filter((d) => d.nha_may_id === S.nm && d.hoat_dong),
  caiDatOf: (nmId) => S.cat.byId.cai_dat[nmId] || { nguong_dung_ngan: 5, gio_qua_han: 4 },
  /** Các dây chuyền (đang dùng) chứa máy — máy dùng chung có thể thuộc nhiều dây chuyền */
  linesOfMay: (mayId) => S.cat.day_chuyen_may.filter((r) => r.may_id === mayId).map((r) => S.cat.byId.day_chuyen[r.day_chuyen_id]).filter((l) => l && l.hoat_dong),
  /** Dây chuyền đầu tiên chứa máy, hoặc null nếu là máy đơn */
  lineOfMay: (mayId) => cat.linesOfMay(mayId)[0] || null,
  /** Tên các dây chuyền của máy, nối bằng dấu phẩy ('' nếu máy đơn) */
  lineNames: (mayId) => cat.linesOfMay(mayId).map((l) => l.ten).join(', '),
  /** Dây chuyền tổng (ghép công đoạn) và các công đoạn của nó */
  dayChuyenTong: () => (S.cat.day_chuyen_tong || []).filter((d) => d.nha_may_id === S.nm && d.hoat_dong),
  congDoan: (tongId) => S.cat.day_chuyen.filter((l) => l.tong_id === tongId && l.hoat_dong),
  cdCuoi: (tongId) => { const cd = cat.congDoan(tongId); return cd.find((l) => l.la_cd_cuoi) || cd[cd.length - 1] || null; },
  /** Phân công: người của ca × (dây chuyền | máy đơn). vaiTro: 'van_hanh' | 'to_truong' */
  phanCong: (caId, t, vaiTro) => (S.cat.phan_cong || []).filter((x) => x.ca_id === caId && x.vai_tro === vaiTro
    && (t.day_chuyen_id ? x.day_chuyen_id === t.day_chuyen_id : x.may_id === t.may_id))
    .map((x) => S.cat.byId.nhan_su[x.nhan_su_id]).filter((n) => n && n.hoat_dong),
  members: (lineId) => S.cat.day_chuyen_may.filter((x) => x.day_chuyen_id === lineId).sort((a, b) => a.thu_tu - b.thu_tu),
  lastMay: (lineId) => { const m = cat.members(lineId); return (m.find((x) => x.la_may_cuoi) || m[m.length - 1])?.may_id || null; },
  /** Máy đơn: không thuộc dây chuyền nào đang dùng */
  mayDon: (all) => cat.may(all).filter((m) => !cat.lineOfMay(m.id)),
  /** Tốc độ định mức: t = {day_chuyen_id} -> theo dây chuyền; t = {may_id} -> theo máy */
  tocDoChuyen: (lineId, spId) => S.cat.toc_do_day_chuyen.find((t) => t.day_chuyen_id === lineId && t.san_pham_id === spId)?.sp_phut ?? null,
  speedFor: (t, spId) => (t.day_chuyen_id ? cat.tocDoChuyen(t.day_chuyen_id, spId) : t.may_id ? cat.tocDo(t.may_id, spId) : null),
  /** Sản phẩm của máy / dây chuyền (chưa gán gì thì hiện tất cả sản phẩm của nhà máy) */
  sanPhamFor: (t) => {
    const ids = t.day_chuyen_id ? S.cat.day_chuyen_san_pham.filter((x) => x.day_chuyen_id === t.day_chuyen_id).map((x) => x.san_pham_id)
      : t.may_id ? S.cat.may_san_pham.filter((x) => x.may_id === t.may_id).map((x) => x.san_pham_id) : [];
    const all = cat.sanPham();
    return ids.length ? all.filter((s) => ids.includes(s.id)) : all;
  },
  name: (t, id, f = 'ten') => S.cat.byId[t]?.[id]?.[f] ?? '',
  person: (id) => S.cat.byId.nhan_su?.[id]?.ho_ten ?? '',
  mayLabel: (id) => { const m = S.cat.byId.may[id]; return m ? `${m.ma} · ${m.ten}` : '—'; },
};

// ---------- Phiếu ----------
/** nm: id nhà máy (mặc định nhà máy đang chọn); nm = '' -> mọi nhà máy (chỉ admin tổng thấy hết nhờ RLS) */
export async function fetchPhieu({ from, to, mayId, nm } = {}) {
  const nmId = nm === undefined ? S.nm : nm;
  return fetchAll('phieu', () => {
    let q = sb.from('phieu').select('*, dung_may(*), dung_ke_hoach(*)').gte('ngay', from).lte('ngay', to).order('ngay').order('id');
    if (nmId) q = q.eq('nha_may_id', nmId);
    if (mayId) q = q.eq('may_id', mayId);
    return q;
  });
}

export async function getPhieu(id) {
  const { data, error } = await sb.from('phieu').select('*, dung_may(*), dung_ke_hoach(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchOpenFaults() {
  const { data, error } = await sb.from('dung_may')
    .select('*, phieu!inner(id, ngay, ca_id, may_id, nha_may_id, trang_thai, created_at, nguoi_van_hanh_id, gio_bd, day_chuyen_id, nhom_id)')
    .eq('goc', true).eq('phieu.nha_may_id', S.nm).neq('tinh_trang', 'da_xu_ly').order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;
  return data;
}

export async function fetchFaults({ from, to }) {
  const { data, error } = await sb.from('dung_may')
    .select('*, phieu!inner(id, ngay, ca_id, may_id, nha_may_id, trang_thai, created_at, nguoi_van_hanh_id, gio_bd, day_chuyen_id, nhom_id)')
    .eq('goc', true).eq('phieu.nha_may_id', S.nm).gte('phieu.ngay', from).lte('phieu.ngay', to).order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  return data;
}

const PHIEU_SEL = '*, dung_may(*), dung_ke_hoach(*)';
/** Phiếu dây chuyền: trả về tất cả phiếu con cùng nhóm. Phiếu máy đơn: mảng 1 phần tử. Không có: mảng rỗng. */
export async function getPhieuGroup(id) {
  let { data, error } = await sb.from('phieu').select(PHIEU_SEL).eq('nhom_id', id);
  if (error) throw error;
  if (data.length) return data;
  const p = await getPhieu(id);
  if (!p) return [];
  if (!p.nhom_id) return [p];
  ({ data, error } = await sb.from('phieu').select(PHIEU_SEL).eq('nhom_id', p.nhom_id));
  if (error) throw error;
  return data;
}

const rpcName = (body) => (body.day_chuyen_id ? 'luu_phieu_chuyen' : 'luu_phieu');
const clean = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !k.startsWith('_')));

/** Gửi phiếu: có mạng thì gửi ngay, mất mạng thì đưa vào hàng đợi */
export async function submitPhieu(p) {
  const body = clean(p);
  if (!navigator.onLine) { queue.push(body); drafts.del(p.id); return { queued: true }; }
  const { data, error } = await sb.rpc(rpcName(body), { p: body });
  if (error) {
    if (isNetErr(error)) { queue.push(body); drafts.del(p.id); return { queued: true }; }
    throw error;
  }
  drafts.del(p.id); queue.remove(p.id); deleteDraftServer(p.id);
  return data;
}

let flushing = false;
export async function flushQueue({ retryErrors = false } = {}) {
  if (flushing || !sb || !navigator.onLine || !S.profile) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    for (const item of queue.all()) {
      if (item._error && !retryErrors) continue;
      const { error } = await sb.rpc(rpcName(item), { p: clean(item) });
      if (!error) { queue.remove(item.id); deleteDraftServer(item.id); sent++; }
      else if (isNetErr(error)) break;
      else { queue.setError(item.id, errText(error)); failed++; }
    }
    // Xóa các nháp đã bỏ khi mất mạng
    const del = lsGet(`${S.profile.user_id}:draftDel`, []);
    if (del.length) {
      const { error } = await sb.from('nhap_phieu').delete().in('id', del);
      if (!error) lsSet(`${S.profile.user_id}:draftDel`, []);
    }
  } finally { flushing = false; }
  return { sent, failed };
}

// ---------- Nháp đồng bộ giữa các thiết bị ----------
export async function saveDraftServer(d) {
  if (!navigator.onLine || !sb) return;
  try { await sb.from('nhap_phieu').upsert({ id: d.id, du_lieu: d, updated_at: new Date().toISOString() }); } catch { /* thử lại lần sau */ }
}
export async function deleteDraftServer(id) {
  const key = `${S.profile.user_id}:draftDel`;
  if (!navigator.onLine) { lsSet(key, [...new Set([...lsGet(key, []), id])]); return; }
  const { error } = await sb.from('nhap_phieu').delete().eq('id', id);
  if (error) lsSet(key, [...new Set([...lsGet(key, []), id])]);
}
export async function pullDrafts() {
  if (!navigator.onLine) return;
  const { data, error } = await sb.from('nhap_phieu').select('*');
  if (error) return;
  const del = new Set(lsGet(`${S.profile.user_id}:draftDel`, []));
  const queued = new Set(queue.all().map((q) => q.id));
  for (const row of data) {
    if (del.has(row.id) || queued.has(row.id)) continue;
    const local = drafts.get(row.id);
    if (!local || (local._savedAt || '') < (row.du_lieu._savedAt || '')) drafts.put(row.du_lieu);
  }
}

export const rpc = async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
};
