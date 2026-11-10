// Lỗi cần xử lý (Kỹ thuật) + cập nhật tình trạng + Gửi qua Zalo
import { S, cat, can, fetchOpenFaults, fetchFaults, rpc, errText } from '../api.js';
import { esc, icon, fmtDate, hm, NHOM_TT, TINH_TRANG, ttBadge, fmtDateTime, today, addDays, VAI_TRO, stopAgeHours, badge } from '../lib.js';
import { el, $, toast, openSheet, selectField, comboField, textField, rangeField, segmented } from '../ui.js';
import { refreshFaultBadge } from '../app.js';

export async function render(main, { q }) {
  const st = { mode: q.tt || 'open', from: addDays(today(), -29), to: today(), may: '', search: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Lỗi cần xử lý</div>
    <div class="muted">Trạng thái xử lý lỗi của từng máy · quá ${cat.caiDat().gio_qua_han} giờ chưa xử lý được đánh dấu</div></div></div>
    <div class="filters" data-f></div><div data-list><div class="empty">Đang tải…</div></div>`;
  const f = $('[data-f]', main);
  const seg = segmented([{ value: 'open', label: 'Đang mở' }, { value: 'all', label: 'Tất cả' }], st.mode, (v) => { st.mode = v; rng.hidden = v === 'open'; load(); });
  const segWrap = el('<div class="nn-field" style="flex:0 0 auto;min-width:0"><span class="nn-label">Hiển thị</span></div>'); segWrap.append(seg);
  const rng = rangeField({ from: st.from, to: st.to, onChange: (a, b) => { st.from = a; st.to = b; load(); } });
  rng.hidden = st.mode === 'open';
  f.append(segWrap, rng,
    comboField({ label: 'Máy', size: 'md', placeholder: 'Tất cả máy', options: cat.may().map((m) => ({ value: m.id, label: `${m.ma} · ${m.ten}` })), onChange: (v) => { st.may = v; draw(); } }),
    selectField({ label: 'Tình trạng', size: 'md', placeholder: 'Tất cả', options: Object.entries(TINH_TRANG).map(([k, t]) => ({ value: k, label: t.label })), onChange: (v) => { st.tt = v; draw(); } }));

  let rows = [];
  async function load() {
    $('[data-list]', main).innerHTML = '<div class="empty">Đang tải…</div>';
    if (!S.online) { $('[data-list]', main).innerHTML = '<div class="empty">Cần kết nối mạng</div>'; return; }
    try { rows = st.mode === 'open' ? await fetchOpenFaults() : await fetchFaults({ from: st.from, to: st.to }); draw(); } catch (e) { $('[data-list]', main).innerHTML = `<div class="empty">${esc(errText(e))}</div>`; }
  }
  function draw() {
    const h = cat.caiDat().gio_qua_han || 4;
    const list = rows.filter((r) => (!st.may || r.phieu.may_id === st.may) && (!st.tt || r.tinh_trang === st.tt));
    // Tổng hợp theo máy
    const byMay = new Map();
    for (const r of list) { const k = r.phieu.may_id; byMay.set(k, (byMay.get(k) || 0) + 1); }
    const box = $('[data-list]', main);
    if (!list.length) { box.innerHTML = `<div class="card empty">${icon('pass', 24)}<div>Không có lỗi nào${st.mode === 'open' ? ' đang mở' : ''}</div></div>`; return; }
    const counts = Object.keys(TINH_TRANG).map((k) => [k, list.filter((r) => r.tinh_trang === k).length]).filter(([, n]) => n);
    box.innerHTML = `<div class="nn-row" style="padding:0 0 12px">${counts.map(([k, n]) => `${ttBadge(k).replace('</span>', ` · ${n}</span>`)}`).join('')}
      <span class="t-cap">${byMay.size} máy · ${list.length} lần dừng</span></div>
      <div class="list-cards">${list.map((r) => {
      const age = stopAgeHours(r, r.phieu);
      const late = r.tinh_trang !== 'da_xu_ly' && age >= h;
      return `<div class="lc" style="cursor:default">
        <div class="lc-row"><b>${esc(cat.mayLabel(r.phieu.may_id))}</b>${ttBadge(r.tinh_trang)}</div>
        ${r.phieu.day_chuyen_id ? `<div class="t-cap">Dây chuyền: ${esc(cat.name('day_chuyen', r.phieu.day_chuyen_id))}</div>` : ''}
        <div class="lc-row"><span>${esc(r.ten_loi || '')} <span class="chip nn-mono">${esc(r.ma_loi || '')}</span></span><span class="muted">${r.phut} phút</span></div>
        <div class="lc-row t-cap"><span>${fmtDate(r.phieu.ngay)} · ${esc(cat.name('ca', r.phieu.ca_id))} · ${hm(r.gio_bd)}–${hm(r.gio_kt)} · ${esc(NHOM_TT[r.dung_ngan ? 3 : r.nhom_ton_that] || '')}</span>
          <span>Xử lý: ${esc(cat.person(r.nguoi_xu_ly_id) || 'chưa giao')}</span></div>
        ${late ? `<div>${badge('danger', 'warn', `Quá ${Math.floor(age)} giờ chưa xử lý xong`)}</div>` : ''}
        ${r.ghi_chu_xu_ly ? `<div class="t-cap">Ghi chú xử lý: ${esc(r.ghi_chu_xu_ly)}</div>` : ''}
        <div class="nn-row" style="padding:0">
          ${can.xuLyLoi() ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-upd="${r.id}">${icon('edit', 16)}Cập nhật</button>` : ''}
          <button class="nn-btn nn-btn-ghost nn-btn-md" data-zalo="${r.id}">${icon('share', 16)}Gửi qua Zalo</button>
          <a class="nn-btn nn-btn-ghost nn-btn-md" href="#/phieu/${r.phieu.id}">${icon('doc', 16)}Xem phiếu</a></div></div>`;
    }).join('')}</div>`;
  }
  main.onclick = (e) => {
    const u = e.target.closest('[data-upd]');
    if (u) { const r = rows.find((x) => x.id === u.dataset.upd); openFaultUpdate(r, r.phieu, () => { load(); refreshFaultBadge(); }); }
    const z = e.target.closest('[data-zalo]');
    if (z) { const r = rows.find((x) => x.id === z.dataset.zalo); shareZalo(r, r.phieu); }
  };
  load();
}

export function openFaultUpdate(stop, phieu, onDone) {
  let tt = stop.tinh_trang, ns = stop.nguoi_xu_ly_id || (S.profile.vai_tro === 'ky_thuat' ? S.profile.id : ''), note = stop.ghi_chu_xu_ly || '';
  const body = el(`<div class="nn-stack" style="padding:0"><div><b>${esc(stop.ten_loi || '')}</b><div class="t-cap">${esc(cat.mayLabel(phieu.may_id))} · ${fmtDate(phieu.ngay)} · ${hm(stop.gio_bd)}–${hm(stop.gio_kt)}</div></div></div>`);
  body.append(
    selectField({ label: 'Tình trạng lỗi', value: tt, req: true, options: Object.entries(TINH_TRANG).map(([k, t]) => ({ value: k, label: t.label })), onChange: (v) => { tt = v; } }),
    comboField({ label: 'Người xử lý', value: ns, options: cat.nhanSu().map((n) => ({ value: n.id, label: n.ho_ten, sub: VAI_TRO[n.vai_tro] })), onChange: (v) => { ns = v; } }),
    textField({ label: 'Ghi chú xử lý', value: note, placeholder: 'Đã làm gì, thay vật tư gì, còn chờ gì…', onInput: (v) => { note = v; } }),
  );
  const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu tình trạng</button>`);
  const s = openSheet({ title: 'Cập nhật tình trạng lỗi', body, foot: [ok] });
  ok.onclick = async () => {
    if (!tt) return toast('Chọn tình trạng', 'warning');
    ok.disabled = true;
    try {
      await rpc('cap_nhat_tinh_trang', { p_id: stop.id, p_tinh_trang: tt, p_nguoi_xu_ly: ns || null, p_ghi_chu: note || null });
      toast(`Đã cập nhật: ${TINH_TRANG[tt].label}`); s.close(); onDone?.();
    } catch (e) { ok.disabled = false; toast(errText(e), 'danger'); }
  };
}

/** Soạn sẵn nội dung lỗi và mở bảng chia sẻ (chọn Zalo) — không có thì chép vào bộ nhớ tạm */
export async function shareZalo(stop, phieu) {
  const may = S.cat.byId.may[phieu.may_id];
  const text = [
    `[OEE] LỖI MÁY ${may?.ma || ''} - ${may?.ten || ''}`,
    `Ngày ${fmtDate(phieu.ngay)} · ${cat.name('ca', phieu.ca_id)}`,
    `Lỗi: ${stop.ma_loi || ''} ${stop.ten_loi || ''} (${NHOM_TT[stop.dung_ngan ? 3 : stop.nhom_ton_that] || ''})`,
    `Dừng: ${hm(stop.gio_bd)}–${hm(stop.gio_kt)} (${stop.phut ?? ''} phút)`,
    `Tình trạng: ${TINH_TRANG[stop.tinh_trang]?.label || ''}`,
    stop.nguoi_xu_ly_id ? `Người xử lý: ${cat.person(stop.nguoi_xu_ly_id)}` : 'Người xử lý: chưa giao',
    stop.van_de_cl ? `Chất lượng: ${stop.van_de_cl}` : '',
    stop.ghi_chu ? `Ghi chú: ${stop.ghi_chu}` : '',
    stop.ghi_chu_xu_ly ? `Xử lý: ${stop.ghi_chu_xu_ly}` : '',
    `Báo bởi: ${S.profile.ho_ten} · ${fmtDateTime(new Date())}`,
    `Xem phiếu: ${location.origin}${location.pathname}#/phieu/${phieu.id}`,
  ].filter(Boolean).join('\n');
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Đã chép nội dung — mở Zalo, vào nhóm và dán', 'info', 'Gửi qua Zalo'); }
  catch {
    openSheet({ title: 'Nội dung gửi Zalo', body: `<p class="t-cap">Chép đoạn dưới và dán vào nhóm Zalo</p><textarea class="nn-input" style="width:100%;min-height:220px;border:1px solid var(--line);border-radius:8px;padding:8px">${esc(text)}</textarea>` });
  }
}
