// Lưu trữ cục bộ trên thiết bị (chạy khi mất mạng): danh mục, phiếu nháp, hàng đợi đồng bộ
const K = 'oee:';
export const lsGet = (k, def = null) => { try { const v = localStorage.getItem(K + k); return v == null ? def : JSON.parse(v); } catch { return def; } };
export const lsSet = (k, v) => { try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) { console.warn('Không lưu được bộ nhớ máy', e); } };
export const lsDel = (k) => { try { localStorage.removeItem(K + k); } catch { /* bỏ qua */ } };

let uid = 'anon';
export const setUser = (id) => { uid = id || 'anon'; };

// ---- Phiếu nháp theo tài khoản ----
export const drafts = {
  all: () => lsGet(`${uid}:drafts`, {}),
  get: (id) => drafts.all()[id] || null,
  put: (d) => { const a = drafts.all(); a[d.id] = { ...d, _savedAt: new Date().toISOString() }; lsSet(`${uid}:drafts`, a); return a[d.id]; },
  del: (id) => { const a = drafts.all(); delete a[id]; lsSet(`${uid}:drafts`, a); },
  list: () => Object.values(drafts.all()).sort((a, b) => (b._savedAt || '').localeCompare(a._savedAt || '')),
};

// ---- Hàng đợi phiếu chờ gửi (khi mất mạng) ----
export const queue = {
  all: () => lsGet(`${uid}:queue`, []),
  push: (p) => { const q = queue.all().filter((x) => x.id !== p.id); q.push({ ...p, _queuedAt: new Date().toISOString(), _error: null }); lsSet(`${uid}:queue`, q); },
  remove: (id) => lsSet(`${uid}:queue`, queue.all().filter((x) => x.id !== id)),
  setError: (id, err) => lsSet(`${uid}:queue`, queue.all().map((x) => (x.id === id ? { ...x, _error: err } : x))),
};
