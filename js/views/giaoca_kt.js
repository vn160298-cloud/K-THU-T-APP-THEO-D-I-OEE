// v1.12 — PHIẾU BÁO CÁO GIAO CA KỸ THUẬT (gộp phiếu ghi nhận OEE + báo cáo giao ca cho bộ phận Kỹ thuật)
// 1. Thông tin chung: nhà máy, bộ phận, ngày, ca, kíp, người giao / nhận ca, trạng thái từng máy kỹ thuật
//    (hoạt động / dự phòng / dừng sửa); giờ khởi động (ca đầu ngày) và giờ dừng máy (ca cuối ngày) cho máy hoạt động.
// 2. Nhật ký vận hành: hạng mục kiểm tra an toàn & vận hành đầu ca của từng máy hoạt động (Danh mục → Hạng mục kiểm tra KT).
// 3. Sự cố & dừng máy: như phiếu ghi nhận OEE — máy chủ tạo phiếu + lần dừng (vào Lỗi cần xử lý, MTBF / MTTR / Pareto; không tính OEE).
// 4. Bàn giao tồn đọng, 5S & rò rỉ (Không đạt: bắt buộc ghi chú hoặc ảnh), xác nhận 2 chiều (giờ bấm thật do máy chủ ghi).
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { esc, icon, today, hm, fmtDate, fmtDateTime, toNum, uuid, nowHM, TINH_TRANG, MUC_DO, VAI_TRO, isLoiKhac, minutesBetween } from '../lib.js';
import { $, $$, el, toast, selectField, comboField, multiField, dateField, timeField, segmented, confirmBox, openSheet } from '../ui.js';
import { go, drawHeader, refreshFaultBadge } from '../app.js';
import { lsSet } from '../store.js';
import { askText, historyHtml } from './form.js';

const TT_MAY = { hoat_dong: 'Hoạt động', du_phong: 'Dự phòng', dung_sua: 'Dừng sửa' };
const HE = [['A. Hệ thống Lò hơi', /l[oò] h[oơ]i/i], ['B. Hệ thống Khí nén', /n[eé]n kh[ií]|kh[ií] n[eé]n/i], ['C. Hệ thống Làm mềm nước', /l[aà]m m[eề]m/i]];
const heOf = (m) => HE.find(([, re]) => re.test(m?.ten || ''))?.[0] || 'D. Máy kỹ thuật khác';
const TT_GC = { nhap: ['info', 'edit', 'Nháp'], da_gui: ['warning', 'send', 'Đã giao ca — chờ nhận'], da_nhan: ['success', 'lock', 'Đã nhận ca'] };
const badgeGC = (t) => { const [tone, ic, l] = TT_GC[t] || TT_GC.nhap; return `<span class="nn-status nn-tone-${tone}">${icon(ic, 14)}${l}</span>`; };
const dsNhanh = (loai) => (S.cat.ds_nhap_nhanh || []).filter((x) => x.loai === loai && x.hoat_dong).sort((a, b) => a.thu_tu - b.thu_tu).map((x) => x.ten);
const grow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.max(36, t.scrollHeight + 2)}px`; };

/** Nén ảnh chụp còn cạnh dài 1280px, JPEG ~0.7 (≈150 KB) */
async function nenAnh(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const k = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.7));
}

export async function editorKT(main, g0, bp0) {
  const me = S.profile;
  let g = g0;
  const id = g0?.id || null;
  if (!g) {
    if (!can.giaoCaKT()) { main.innerHTML = '<div class="empty">Chỉ kỹ thuật, tổ trưởng, quản lý hoặc admin được lập báo cáo giao ca Kỹ thuật</div>'; return; }
    g = { id: uuid(), ngay: today(), ca_id: '', kip_id: '', bo_phan_id: bp0, nha_may_id: S.nm, trang_thai: 'nhap', nang_suat: [], chat_luong: [], may_moc: [],
      con_nguoi: {}, ve_sinh: {}, can_chu_y: '', da_hop: false, kt: {} };
  }
  let nm = g.nha_may_id || S.nm;
  const kt = (g.kt ||= {});
  kt.may ||= []; kt.kiem_tra ||= {}; kt.su_co ||= []; kt.s5 ||= []; kt.ton_dong ||= '';
  if (!id) { kt.nguoi_giao_id ||= me.id; }
  const canEdit = can.giaoCaKT() && (!id || g.trang_thai === 'nhap');
  const logs = id ? ((await sb.from('nhat_ky').select('*').eq('phieu_id', id).order('luc', { ascending: false }).limit(100)).data || []) : [];

  // --- danh mục
  const mayKT = () => S.cat.may.filter((m) => m.nha_may_id === nm && m.hoat_dong && cat.laKyThuat(m.bo_phan_id)).sort((a, b) => heOf(a).localeCompare(heOf(b), 'vi') || a.ma.localeCompare(b.ma, 'vi', { numeric: true }));
  const syncMay = () => {   // mọi máy kỹ thuật đều có 1 dòng trạng thái (mặc định hoạt động)
    const co = new Map(kt.may.map((x) => [x.may_id, x]));
    kt.may = [...mayKT().map((m) => co.get(m.id) || { may_id: m.id, trang_thai: 'hoat_dong' }), ...kt.may.filter((x) => !mayKT().some((m) => m.id === x.may_id))];
  };
  if (canEdit) syncMay();
  const hoatDong = () => kt.may.filter((x) => x.trang_thai === 'hoat_dong');
  const hangMuc = (mayId) => (S.cat.hang_muc_kt || []).filter((h) => h.may_id === mayId && h.hoat_dong).sort((a, b) => a.thu_tu - b.thu_tu);
  const caDs = () => cat.ca(g.bo_phan_id).slice().sort((a, b) => hm(a.gio_bd).localeCompare(hm(b.gio_bd)));
  const laCaDau = () => caDs()[0]?.id === g.ca_id;
  const laCaCuoi = () => caDs().at(-1)?.id === g.ca_id;
  const caObj = () => S.cat.byId.ca[g.ca_id];
  const kipList = () => (can.adminTong() ? (S.cat.kip || []).filter((k) => k.hoat_dong) : cat.kip(nm));
  const nguoi = (roles) => S.cat.nhan_su.filter((n) => n.hoat_dong && (!n.nha_may_id || n.nha_may_id === nm) && (!roles || roles.includes(n.vai_tro)));
  const ktOpts = () => { const ds = nguoi(); const k = ds.filter((n) => n.vai_tro === 'ky_thuat' || n.bo_phan_id === g.bo_phan_id);
    const toO = (n) => ({ value: n.id, label: n.ho_ten, sub: `${n.ma_nv} · ${VAI_TRO[n.vai_tro]}${n.ca_id ? ` · ${cat.name('ca', n.ca_id)}` : ''}` });
    return { nhom: k.map(toO), tatCa: ds.map(toO) }; };
  kt.s5 = (() => { const co = new Map(kt.s5.map((x) => [x.ten, x])); const ds = dsNhanh('kt_5s'); return [...ds.map((t) => co.get(t) || { ten: t, kq: '', ghi_chu: '', anh: [] }), ...(canEdit ? [] : kt.s5.filter((x) => !ds.includes(x.ten)))]; })();

  // Sự cố đã lưu: lấy tình trạng / người xử lý mới nhất (có thể đã cập nhật ở trang Lỗi cần xử lý)
  if (id && kt.su_co.length) {
    const { data } = await sb.from('dung_may').select('id, tinh_trang, nguoi_xu_ly_id, nguoi_ho_tro, ghi_chu_xu_ly').in('id', kt.su_co.map((x) => x.id));
    for (const r of data || []) Object.assign(kt.su_co.find((x) => x.id === r.id) || {}, { tinh_trang: r.tinh_trang, nguoi_xu_ly_id: r.nguoi_xu_ly_id, nguoi_ho_tro: r.nguoi_ho_tro, ghi_chu_xu_ly: r.ghi_chu_xu_ly });
  }
  // Việc tồn đọng ca trước: báo cáo KT gần nhất trước ca này + sự cố máy kỹ thuật chưa xử lý xong
  let truoc = null, chuaXong = [];
  async function napTruoc() {
    try {
      const { data } = await sb.from('giao_ca').select('id, ngay, ca_id, kt, nguoi_giao, luc_giao').eq('bo_phan_id', g.bo_phan_id).neq('id', g.id || '')
        .lte('ngay', g.ngay).order('ngay', { ascending: false }).order('created_at', { ascending: false }).limit(5);
      truoc = (data || []).find((x) => x.ngay < g.ngay || hm(S.cat.byId.ca[x.ca_id]?.gio_bd) < hm(caObj()?.gio_bd)) || null;
      const ids = new Set(mayKT().map((m) => m.id));
      const { data: dm } = await sb.from('dung_may').select('id, ten_loi, gio_bd, tinh_trang, nguoi_xu_ly_id, ghi_chu_xu_ly, phieu!inner(ngay, may_id, giao_ca_id)')
        .neq('tinh_trang', 'da_xu_ly').limit(200);
      chuaXong = (dm || []).filter((x) => ids.has(x.phieu?.may_id) && x.phieu?.giao_ca_id !== g.id);
    } catch { truoc = null; chuaXong = []; }
  }

  function build() {
    const locked = !canEdit;
    const coCa = !!g.ca_id;
    main.innerHTML = `<div class="page-head"><div><div class="t-page">Phiếu báo cáo giao ca — ${esc(cat.name('bo_phan', g.bo_phan_id) || 'Kỹ thuật')}</div>
      <div class="muted">${esc(cat.name('nha_may', nm))} · Nhật ký vận hành lò hơi, khí nén, làm mềm nước · sự cố · bàn giao</div></div>
      <div class="nn-row" style="padding:0">${id ? badgeGC(g.trang_thai) : ''}<a class="nn-btn nn-btn-ghost nn-btn-md no-print" href="#/giao-ca?bp=${g.bo_phan_id}">${icon('chevL', 18)}Danh sách</a></div></div>
      ${id && locked && g.trang_thai !== 'nhap' ? `<div class="nn-alert nn-alert-info section"><span class="nn-alert-icon nn-tone-info">${icon('lock', 20)}</span><div class="nn-alert-body"><div class="nn-alert-text">
        Đã xác nhận giao ca — báo cáo bị khóa. Muốn sửa: quản lý / admin bấm Mở khóa kèm lý do (ghi nhật ký).</div></div></div>` : ''}
      <div data-ton></div>
      <section class="card section"><div class="card-head"><div class="t-h2">1. Thông tin chung</div></div><div class="form-grid" data-head></div>
        <div class="t-h3" style="margin:16px 0 8px">Tình trạng máy kỹ thuật</div><div data-may></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">2. Nhật ký vận hành & chỉ số</div><span class="t-cap">Kiểm tra an toàn & vận hành đầu ca — máy đang hoạt động</span></div><div data-kt></div></section>
      <section class="card section"><div class="card-head"><div class="t-h2">3. Sự cố & dừng máy <span class="chip" data-nsc></span></div></div><div data-sc></div>
        ${canEdit ? `<button class="nn-btn nn-btn-secondary nn-btn-md" data-addsc style="margin-top:8px">${icon('plus', 18)}Thêm lần dừng</button>` : ''}
        <p class="t-cap" style="margin-top:8px">Lần dừng tự vào trang Lỗi cần xử lý và chỉ số MTBF / MTTR / Pareto (không tính OEE). Chưa xong thì để trống giờ kết thúc — tính đến hết ca, tình trạng không được là "Đã xử lý".</p></section>
      <section class="card section"><div class="card-head"><div class="t-h2">4. Bàn giao tồn đọng, 5S & xác nhận</div></div><div data-bg></div></section>
      <section class="card section no-print action-bar"><div class="nn-row" style="padding:0;justify-content:flex-end;flex-wrap:wrap" data-act></div></section>
      ${id ? historyHtml(logs, []) : ''}`;

    // --- việc tồn đọng ca trước
    if (truoc?.kt?.ton_dong || chuaXong.length) {
      $('[data-ton]', main).innerHTML = `<div class="nn-alert nn-alert-warning section"><span class="nn-alert-icon nn-tone-warning">${icon('warn', 20)}</span><div class="nn-alert-body">
        <div class="nn-alert-title">Việc cần ưu tiên từ ca trước</div><div class="nn-alert-text">
        ${truoc?.kt?.ton_dong ? `<div style="white-space:pre-wrap"><b>${esc(fmtDate(truoc.ngay))} · ${esc(cat.name('ca', truoc.ca_id))}:</b> ${esc(truoc.kt.ton_dong)}</div>` : ''}
        ${chuaXong.length ? `<div style="margin-top:4px"><b>Sự cố chưa xử lý xong (${chuaXong.length}):</b> ${chuaXong.slice(0, 8).map((x) => `${esc(cat.mayLabel(x.phieu.may_id))} — ${esc(x.ten_loi || '')} (${esc(TINH_TRANG[x.tinh_trang]?.label || '')}, ${fmtDate(x.phieu.ngay)})`).join('; ')}
          ${chuaXong.length > 8 ? '…' : ''} · <a href="#/loi">Mở Lỗi cần xử lý</a></div>` : ''}</div></div></div>`;
    }

    // --- 1. thông tin chung
    const head = $('[data-head]', main);
    const nmF = can.adminTong() && !id && S.cat.nha_may.filter((n) => n.hoat_dong).length > 1
      ? selectField({ label: 'Nhà máy', value: nm, req: true, options: S.cat.nha_may.filter((n) => n.hoat_dong).map((n) => ({ value: n.id, label: n.ten })), onChange: async (v) => { doiNM(v); await napTruoc(); build(); } })
      : el(`<div class="nn-field"><span class="nn-label">Nhà máy</span><span class="chip dept" style="height:40px">${esc(cat.name('nha_may', nm))}</span></div>`);
    const ko = ktOpts();
    const pick = (label, key, req) => { const cur = kt[key] && !ko.nhom.some((o) => o.value === kt[key]) ? ko.tatCa.filter((o) => o.value === kt[key]) : [];
      return comboField({ label, value: kt[key] || '', req, options: [...ko.nhom, ...cur], more: { label: 'Xem tất cả nhân sự', options: () => ko.tatCa }, onChange: (v) => { kt[key] = v; } }); };
    head.append(nmF,
      el(`<div class="nn-field"><span class="nn-label">Bộ phận</span><span class="chip dept" style="height:40px">${esc(cat.name('bo_phan', g.bo_phan_id))}</span></div>`),
      dateField({ label: 'Ngày', value: g.ngay, req: true, onChange: async (v) => { g.ngay = v; await napTruoc(); build(); } }),
      selectField({ label: 'Ca', value: g.ca_id, req: true, placeholder: '— Chọn ca —', options: caDs().map((c) => ({ value: c.id, label: `${c.ten} (${hm(c.gio_bd)}–${hm(c.gio_kt)})` })),
        onChange: async (v) => { g.ca_id = v; await napTruoc(); build(); } }),
      selectField({ label: 'Kíp', value: g.kip_id || '', placeholder: '— Chọn kíp —', options: kipList().map((k) => ({ value: k.id, label: `${k.ten}${k.nha_may_id !== nm ? ` · ${cat.name('nha_may', k.nha_may_id)}` : ''}${k.ca_id ? ` · ${cat.name('ca', k.ca_id)}` : ''}` })),
        onChange: async (v) => { const k = S.cat.byId.kip?.[v]; if (k && k.nha_may_id !== nm) doiNM(k.nha_may_id); g.kip_id = v;
          if (k?.ca_id && caDs().some((c) => c.id === k.ca_id)) g.ca_id = k.ca_id; await napTruoc(); build(); } }),
      pick('Người giao ca', 'nguoi_giao_id', true), pick('Người nhận ca', 'nguoi_nhan_id', true));
    $$('[data-head] input, [data-head] select, [data-head] button', main).forEach((x) => { if (locked) x.disabled = true; });

    // máy: trạng thái + giờ khởi động (ca đầu) / giờ dừng (ca cuối)
    const bm = $('[data-may]', main);
    if (!kt.may.length) bm.innerHTML = '<div class="empty">Chưa có máy nào thuộc bộ phận Kỹ thuật (Danh mục → Máy)</div>';
    let heTr = '';
    for (const x of kt.may) {
      const m = S.cat.byId.may[x.may_id]; const he = heOf(m);
      if (he !== heTr) { heTr = he; bm.append(el(`<div class="t-cap" style="margin:8px 0 4px"><b>${esc(he)}</b></div>`)); }
      const row = el(`<div class="lc" style="cursor:default;gap:8px"><div class="lc-row"><b>${esc(cat.mayLabel(x.may_id))}</b></div><div data-seg></div><div class="form-grid" data-gio></div></div>`);
      const sg = segmented(Object.entries(TT_MAY).map(([k, l]) => ({ value: k, label: l })), x.trang_thai, (v) => { if (!canEdit) return; x.trang_thai = v;
        if (v !== 'hoat_dong') kt.su_co.filter((s) => s.may_id === x.may_id).forEach((s) => { s.may_id = ''; }); build(); });
      if (locked) $$('button', sg).forEach((b) => { b.disabled = true; });
      $('[data-seg]', row).append(sg);
      if (x.trang_thai === 'hoat_dong' && coCa) {
        const gb = $('[data-gio]', row);
        if (laCaDau()) gb.append(timeField({ label: 'Giờ bắt đầu khởi động', value: x.gio_khoi_dong || '', req: true, size: 'md', msg: 'Ca đầu ngày ghi', onInput: (v) => { x.gio_khoi_dong = v; } }));
        if (laCaCuoi()) gb.append(timeField({ label: 'Giờ dừng máy', value: x.gio_dung || '', req: true, size: 'md', msg: 'Ca cuối ngày ghi', onInput: (v) => { x.gio_dung = v; } }));
        if (locked) $$('select', gb).forEach((s) => { s.disabled = true; });
      }
      bm.append(row);
    }

    // --- 2. hạng mục kiểm tra
    const bk = $('[data-kt]', main);
    if (!hoatDong().length) bk.innerHTML = '<div class="empty">Không có máy nào đang hoạt động</div>';
    heTr = '';
    for (const x of hoatDong()) {
      const m = S.cat.byId.may[x.may_id]; const he = heOf(m);
      if (he !== heTr) { heTr = he; bk.append(el(`<div class="t-h3" style="margin:12px 0 6px">${esc(he)}</div>`)); }
      const ds = hangMuc(x.may_id);
      const kq = (kt.kiem_tra[x.may_id] ||= {});
      const card = el(`<div class="lc" style="cursor:default"><div class="lc-row"><b>${esc(cat.mayLabel(x.may_id))}</b><span class="chip" data-kqn="${x.may_id}"></span></div><div data-items class="nn-stack" style="padding:0;gap:6px"></div></div>`);
      const box = $('[data-items]', card);
      if (!ds.length) box.innerHTML = '<span class="t-cap">Chưa khai hạng mục kiểm tra cho máy này — Danh mục → Hạng mục kiểm tra KT</span>';
      let nhomTr = null;
      for (const h of ds) {
        if (h.nhom && h.nhom !== nhomTr) { box.append(el(`<div class="t-cap" style="margin-top:4px"><b>${esc(h.nhom)}</b></div>`)); }
        nhomTr = h.nhom || null;
        const v = (kq[h.id] ||= {});
        if (h.kieu === 'so') {
          const f = el(`<div class="nn-row" style="padding:0;gap:8px;align-items:center;flex-wrap:nowrap"><span style="flex:1">${esc(h.ten)}</span>
            <div class="nn-input-wrap nn-input-md" style="width:130px"><input class="nn-input" inputmode="decimal" value="${esc(v.v ?? '')}" ${locked ? 'disabled' : ''}>${h.don_vi ? `<span class="nn-input-unit">${esc(h.don_vi)}</span>` : ''}</div></div>`);
          $('input', f).oninput = (e) => { v.v = e.target.value.trim() === '' ? null : toNum(e.target.value); };
          box.append(f);
        } else {
          const f = el(`<div class="nn-stack" style="padding:0;gap:4px"><div class="nn-row" style="padding:0;gap:8px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:160px">${esc(h.ten)}</span><span data-sg></span></div><div data-note></div></div>`);
          const sg = segmented([{ value: 'dat', label: 'Đạt' }, { value: 'khong', label: 'Không đạt' }], v.v || '', (val) => { if (!canEdit) return; v.v = val; note(); dem(); });
          if (locked) $$('button', sg).forEach((b) => { b.disabled = true; });
          $('[data-sg]', f).append(sg);
          const note = () => { const n = $('[data-note]', f); n.innerHTML = '';
            if (v.v !== 'khong') return;
            const t = el(`<div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" placeholder="Nguyên nhân không đạt (bắt buộc)" ${locked ? 'disabled' : ''}>${esc(v.ghi_chu || '')}</textarea></div>`);
            const ta = $('textarea', t); grow(ta); ta.oninput = () => { v.ghi_chu = ta.value; grow(ta); }; n.append(t); };
          note(); box.append(f);
        }
      }
      const dem = () => { const n = ds.filter((h) => h.kieu !== 'so'); const kd = n.filter((h) => kq[h.id]?.v === 'khong').length; const chua = n.filter((h) => !kq[h.id]?.v).length;
        const c = $(`[data-kqn="${x.may_id}"]`, main); if (c) c.textContent = n.length ? `${n.length - chua}/${n.length} đã kiểm${kd ? ` · ${kd} không đạt` : ''}` : ''; };
      bk.append(card); dem();
    }

    // --- 3. sự cố
    drawSuCo();

    // --- 4. bàn giao
    const bg = $('[data-bg]', main);
    const td = el(`<div class="nn-field span-2"><label class="nn-label">Công việc tồn đọng / lưu ý ca sau</label>
      <div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="2" placeholder="VD: Lò hơi 01 rò hơi van xả đáy, chờ vật tư — ca sau theo dõi áp suất" ${locked ? 'disabled' : ''}>${esc(kt.ton_dong)}</textarea></div>
      ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-keo style="align-self:flex-start;margin-top:4px">${icon('sync', 16)}Lấy từ sự cố chưa dứt điểm</button>` : ''}</div>`);
    const tdt = $('textarea', td); grow(tdt); tdt.oninput = () => { kt.ton_dong = tdt.value; grow(tdt); };
    bg.append(td, el('<div class="t-h3" style="margin:16px 0 8px">Kiểm tra 5S & rò rỉ</div>'));
    if (!kt.s5.length) bg.append(el('<div class="t-cap">Chưa có hạng mục — Danh mục → Danh sách nhập nhanh → Hạng mục 5S & rò rỉ (Kỹ thuật)</div>'));
    kt.s5.forEach((x, i) => {
      const f = el(`<div class="lc" style="cursor:default;gap:6px"><div class="nn-row" style="padding:0;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:160px">${esc(x.ten)}</b><span data-sg></span></div><div data-ct></div></div>`);
      const sg = segmented([{ value: 'dat', label: 'Đạt' }, { value: 'khong', label: 'Không đạt' }], x.kq || '', (v) => { if (!canEdit) return; x.kq = v; ct(); });
      if (locked) $$('button', sg).forEach((b) => { b.disabled = true; });
      $('[data-sg]', f).append(sg);
      const ct = () => {
        const c = $('[data-ct]', f); c.innerHTML = '';
        if (x.kq !== 'khong' && !(x.anh || []).length) return;
        const t = el(`<div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" placeholder="Ghi chú (bắt buộc ghi chú hoặc chụp ảnh khi Không đạt)" ${locked ? 'disabled' : ''}>${esc(x.ghi_chu || '')}</textarea></div>`);
        const ta = $('textarea', t); grow(ta); ta.oninput = () => { x.ghi_chu = ta.value; grow(ta); };
        const anh = el(`<div class="nn-row" style="padding:4px 0 0;gap:6px;flex-wrap:wrap" data-anh></div>`);
        (x.anh || []).forEach((p, j) => anh.append(el(`<span class="chip" style="gap:6px"><button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-xem="${esc(p)}">${icon('doc', 14)}Ảnh ${j + 1}</button>
          ${canEdit ? `<button type="button" class="nn-btn nn-btn-ghost nn-btn-sm" data-boanh="${i}:${j}" aria-label="Bỏ ảnh">${icon('x', 14)}</button>` : ''}</span>`)));
        if (canEdit) {
          const up = el(`<label class="nn-btn nn-btn-secondary nn-btn-sm" style="cursor:pointer">${icon('upload', 16)}Chụp / chọn ảnh<input type="file" accept="image/*" capture="environment" hidden></label>`);
          $('input', up).onchange = async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            up.style.opacity = '.5';
            try {
              const blob = await nenAnh(file);
              const path = `kt/${g.id}/${uuid()}.jpg`;
              const { error } = await sb.storage.from('anh').upload(path, blob, { contentType: 'image/jpeg' });
              if (error) throw error;
              (x.anh ||= []).push(path); toast('Đã tải ảnh lên — nhớ bấm Lưu nháp', 'success'); ct();
            } catch (err) { toast(`Không tải được ảnh: ${errText(err)}${/bucket/i.test(err?.message || '') ? ' — chạy lại file supabase/01_schema.sql bản mới' : ''}`, 'danger'); up.style.opacity = ''; }
          };
          anh.append(up);
        }
        c.append(t, anh);
      };
      ct(); bg.append(f);
    });
    // xác nhận 2 chiều
    bg.append(el(`<div class="t-h3" style="margin:16px 0 8px">Xác nhận 2 chiều</div>`), el(`<div class="nn-stack" style="padding:0;gap:4px">
      <div>${icon('send', 16)} <b>Giao ca:</b> ${g.luc_giao && g.trang_thai !== 'nhap' ? `${esc(cat.person(g.nguoi_giao) || '')} · <b>${fmtDateTime(g.luc_giao)}</b>` : `<span class="t-cap">chưa xác nhận${kt.nguoi_giao_id ? ` — ${esc(cat.person(kt.nguoi_giao_id))}` : ''}</span>`}</div>
      <div>${icon('pass', 16)} <b>Nhận ca:</b> ${g.luc_nhan ? `${esc(cat.person(g.nguoi_nhan) || '')} · <b>${fmtDateTime(g.luc_nhan)}</b>` : `<span class="t-cap">chưa xác nhận${kt.nguoi_nhan_id ? ` — ${esc(cat.person(kt.nguoi_nhan_id))}` : ''}</span>`}</div>
      <div class="t-cap">Giờ ghi nhận là giờ bấm nút thực tế (máy chủ ghi), không sửa được — tránh nhập bù cuối tuần.</div></div>`));

    // --- nút
    const nhanDuoc = id && g.trang_thai === 'da_gui' && can.giaoCaKT() && (kt.nguoi_nhan_id ? kt.nguoi_nhan_id === me.id || can.moKhoa() : g.nguoi_giao !== me.id || can.moKhoa());
    $('[data-act]', main).innerHTML = [
      canEdit ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-draft>${icon('edit', 18)}Lưu nháp</button>` : '',
      canEdit ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-send>${icon('send', 18)}Xác nhận giao ca</button>` : '',
      nhanDuoc ? `<button class="nn-btn nn-btn-primary nn-btn-lg" data-nhan>${icon('pass', 18)}Xác nhận nhận ca</button>` : '',
      id && !canEdit && g.trang_thai !== 'nhap' && can.moKhoa() ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-unlock>${icon('unlock', 18)}Mở khóa</button>` : '',
      id ? `<button class="nn-btn nn-btn-secondary nn-btn-lg" data-print>${icon('print', 18)}In / PDF</button>` : '',
      id && can.admin() ? `<button class="nn-btn nn-btn-danger nn-btn-lg" data-xoa>${icon('trash', 18)}Xóa báo cáo</button>` : '',
    ].join('');
  }

  function drawSuCo() {
    const box = $('[data-sc]', main); box.innerHTML = '';
    $('[data-nsc]', main).textContent = `${kt.su_co.length} lần`;
    if (!kt.su_co.length) box.innerHTML = '<div class="t-cap">Không có sự cố trong ca</div>';
    const locked = !canEdit;
    const mayOpts = hoatDong().map((x) => ({ value: x.may_id, label: cat.mayLabel(x.may_id) }));
    kt.su_co.forEach((s, i) => {
      const c = el(`<div class="lc" style="cursor:default;gap:6px"><div class="lc-row"><b>Lần dừng ${i + 1}</b>
        ${canEdit ? `<button class="nn-btn nn-btn-ghost nn-btn-sm" data-rmsc="${i}" aria-label="Xóa lần dừng">${icon('trash', 14)}</button>` : ''}</div><div class="form-grid"></div></div>`);
      const f = $('.form-grid', c);
      const mls = s.may_id ? cat.maLoi(s.may_id) : [];
      const xl = cat.nguoiXuLy({ ca_id: g.ca_id, may_id: s.may_id, nm });
      const toO = (n) => ({ value: n.id, label: n.ho_ten, sub: VAI_TRO[n.vai_tro] });
      const nhom = xl.nhom.map(toO), tatCa = xl.tatCa.map(toO), ids = new Set(nhom.map((o) => o.value));
      const ca = caObj();
      f.append(
        selectField({ label: 'Máy dừng', value: s.may_id || '', req: true, placeholder: '— Máy đang hoạt động —', options: mayOpts, onChange: (v) => { s.may_id = v; s.ma_loi_id = ''; drawSuCo(); } }),
        comboField({ label: 'Mã lỗi', value: s.ma_loi_id || '', options: mls.map((l) => ({ value: l.id, label: `${l.ma} · ${l.ten}` })), placeholder: mls.length ? '— Chọn mã lỗi —' : 'Máy chưa khai mã lỗi — ghi mô tả bên dưới',
          onChange: (v) => { s.ma_loi_id = v; const l = S.cat.byId.ma_loi[v]; if (l) { s.ten_loi = l.ten; if (l.muc_do && !s.muc_do) s.muc_do = l.muc_do; } } }),
        (() => { const t = el(`<div class="nn-field span-2"><label class="nn-label">Mô tả sự cố</label><div class="nn-input-wrap nn-input-md"><input class="nn-input" value="${esc(s.ten_loi || '')}" placeholder="VD: Mất lửa buồng đốt" ${locked ? 'disabled' : ''}></div></div>`);
          $('input', t).oninput = (e) => { s.ten_loi = e.target.value; }; return t; })(),
        timeField({ label: 'Bắt đầu dừng', value: s.gio_bd || '', req: true, size: 'md', min: ca ? hm(ca.gio_bd) : '', max: ca ? hm(ca.gio_kt) : '', onInput: (v) => { s.gio_bd = v; } }),
        timeField({ label: 'Kết thúc dừng', value: s.gio_kt || '', size: 'md', min: ca ? hm(ca.gio_bd) : '', max: ca ? hm(ca.gio_kt) : '', msg: 'Để trống nếu chưa xong', onInput: (v) => { s.gio_kt = v; } }),
        selectField({ label: 'Mức độ', value: s.muc_do || '', placeholder: '— Chọn —', options: Object.entries(MUC_DO).map(([k, m]) => ({ value: k, label: m.label })), onChange: (v) => { s.muc_do = v; } }),
        comboField({ label: 'Người xử lý chính', value: s.nguoi_xu_ly_id || '', options: [...nhom, ...(s.nguoi_xu_ly_id && !ids.has(s.nguoi_xu_ly_id) ? tatCa.filter((o) => o.value === s.nguoi_xu_ly_id) : [])],
          msg: nhom.length ? 'Kỹ thuật + vận hành của máy này (theo phân công ca)' : '', more: { label: 'Xem tất cả nhân sự (người làm thay)', options: () => tatCa },
          onChange: (v) => { s.nguoi_xu_ly_id = v; s.nguoi_ho_tro = (s.nguoi_ho_tro || []).filter((x) => x !== v); } }),
        multiField({ label: 'Người hỗ trợ', value: s.nguoi_ho_tro || [], options: [...nhom, ...tatCa.filter((o) => !ids.has(o.value))], span: true, onChange: (v) => { s.nguoi_ho_tro = v.filter((x) => x !== s.nguoi_xu_ly_id); } }),
        selectField({ label: 'Tình trạng', value: s.tinh_trang || 'cho_xu_ly', options: Object.entries(TINH_TRANG).map(([k, t]) => ({ value: k, label: t.label })), onChange: (v) => { s.tinh_trang = v; } }),
        (() => { const t = el(`<div class="nn-field span-2"><label class="nn-label">Ghi chú</label><div class="nn-input-wrap nn-input-md ta"><textarea class="nn-input" rows="1" ${locked ? 'disabled' : ''}>${esc(s.ghi_chu || '')}</textarea></div></div>`);
          const ta = $('textarea', t); grow(ta); ta.oninput = () => { s.ghi_chu = ta.value; grow(ta); }; return t; })(),
      );
      if (locked) $$('input, select, textarea, button:not([data-xem])', c).forEach((x) => { x.disabled = true; });
      box.append(c);
    });
  }

  function doiNM(v) {
    if (!v || v === nm) return;
    const bpTen = cat.name('bo_phan', g.bo_phan_id), caTen = cat.name('ca', g.ca_id);
    nm = v; g.nha_may_id = v; S.nm = v; lsSet('nm', v); drawHeader();
    g.bo_phan_id = cat.boPhan().find((b) => b.ten === bpTen)?.id || cat.boPhan().find((b) => cat.laKyThuat(b.id))?.id || '';
    g.ca_id = cat.ca(g.bo_phan_id).find((c) => c.ten === caTen)?.id || ''; g.kip_id = '';
    kt.may = []; kt.kiem_tra = {}; kt.su_co = []; syncMay();
  }

  async function luu(gui) {
    if (!g.ngay || !g.ca_id) return toast('Chọn ngày và ca', 'warning');
    const ca = caObj();
    const errs = [];
    if (gui) {
      if (!kt.nguoi_giao_id) errs.push('Chọn người giao ca');
      if (!kt.nguoi_nhan_id) errs.push('Chọn người nhận ca');
      if (kt.nguoi_giao_id && kt.nguoi_giao_id === kt.nguoi_nhan_id) errs.push('Người nhận ca phải khác người giao ca');
      for (const x of hoatDong()) {
        const ten = cat.name('may', x.may_id, 'ma');
        if (laCaDau() && !x.gio_khoi_dong) errs.push(`${ten}: chưa ghi giờ khởi động`);
        if (laCaCuoi() && !x.gio_dung) errs.push(`${ten}: chưa ghi giờ dừng máy`);
        for (const h of hangMuc(x.may_id).filter((h) => h.kieu !== 'so')) {
          const v = kt.kiem_tra[x.may_id]?.[h.id];
          if (!v?.v) errs.push(`${ten}: chưa kiểm "${h.ten}"`);
          else if (v.v === 'khong' && !String(v.ghi_chu || '').trim()) errs.push(`${ten}: "${h.ten}" không đạt — ghi nguyên nhân`);
        }
      }
      kt.s5.forEach((x) => { if (!x.kq) errs.push(`5S: chưa đánh giá "${x.ten}"`); else if (x.kq === 'khong' && !String(x.ghi_chu || '').trim() && !(x.anh || []).length) errs.push(`5S "${x.ten}" không đạt — ghi chú hoặc chụp ảnh`); });
    }
    kt.su_co.forEach((s, i) => {
      if (!s.may_id) errs.push(`Lần dừng ${i + 1}: chọn máy dừng`);
      if (!s.gio_bd) errs.push(`Lần dừng ${i + 1}: chưa có giờ bắt đầu`);
      if (!s.ma_loi_id && !String(s.ten_loi || '').trim()) errs.push(`Lần dừng ${i + 1}: chọn mã lỗi hoặc ghi mô tả`);
      if (!s.gio_kt && s.tinh_trang === 'da_xu_ly') errs.push(`Lần dừng ${i + 1}: chưa có giờ kết thúc thì chưa thể "Đã xử lý"`);
      if (s.ma_loi_id && isLoiKhac(S.cat.byId.ma_loi[s.ma_loi_id]?.ten) && !String(s.ghi_chu || '').trim()) errs.push(`Lần dừng ${i + 1}: lỗi khác thì phải ghi chú`);
    });
    if (errs.length) return toast(errs.slice(0, 4).join(' · ') + (errs.length > 4 ? ` · (+${errs.length - 4})` : ''), 'danger', gui ? 'Chưa xác nhận giao ca được' : 'Chưa lưu được');
    if (gui && !(await confirmBox(`Xác nhận giao ca cho ${cat.person(kt.nguoi_nhan_id)}? Giờ giao ca ghi theo giờ bấm thật; sau đó báo cáo bị khóa.`, { ok: 'Xác nhận giao ca' }))) return;
    // bản chụp hạng mục để in / xem lại đúng như lúc giao
    const ktLuu = { ...kt,
      kiem_tra_ds: hoatDong().map((x) => ({ may_id: x.may_id, items: hangMuc(x.may_id).map((h) => ({ id: h.id, nhom: h.nhom, ten: h.ten, kieu: h.kieu, don_vi: h.don_vi, ...(kt.kiem_tra[x.may_id]?.[h.id] || {}) })) })),
      su_co: kt.su_co.map((s, i) => ({ ...s, stt: i + 1, ma_loi_id: s.ma_loi_id || null, nguoi_xu_ly_id: s.nguoi_xu_ly_id || null, nguoi_ho_tro: s.nguoi_ho_tro || [],
        chua_xong: !s.gio_kt, gio_kt: s.gio_kt || (ca ? (minutesBetween(hm(ca.gio_bd), nowHM()) < minutesBetween(hm(ca.gio_bd), hm(ca.gio_kt)) && g.ngay === today() ? nowHM() : hm(ca.gio_kt)) : null) })) };
    try {
      const nid = await rpc('luu_giao_ca', { p: { ...g, gui, kip_id: g.kip_id || null, kt: ktLuu } });
      toast(gui ? 'Đã xác nhận giao ca' : 'Đã lưu nháp', 'success'); refreshFaultBadge();
      if (!id) go(`#/giao-ca/${nid}`); else reload();
    } catch (err) { toast(errText(err), 'danger'); }
  }
  const reload = async () => { const { data } = await sb.from('giao_ca').select('*').eq('id', g.id).maybeSingle(); if (data) editorKT(main, data); };

  main.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-addsc]')) {
      kt.su_co.push({ id: uuid(), may_id: hoatDong().length === 1 ? hoatDong()[0].may_id : '', ma_loi_id: '', ten_loi: '', gio_bd: g.ngay === today() ? nowHM() : '', gio_kt: '', muc_do: '', nguoi_xu_ly_id: '', nguoi_ho_tro: [], tinh_trang: 'cho_xu_ly', ghi_chu: '' });
      drawSuCo(); return;
    }
    const rs = t.closest('[data-rmsc]');
    if (rs) { kt.su_co.splice(+rs.dataset.rmsc, 1); drawSuCo(); return; }
    const xem = t.closest('[data-xem]');
    if (xem) {
      const { data, error } = await sb.storage.from('anh').createSignedUrl(xem.dataset.xem, 3600);
      if (error) return toast(errText(error), 'danger');
      openSheet({ title: 'Ảnh 5S / rò rỉ', body: el(`<div><img src="${esc(data.signedUrl)}" alt="Ảnh hiện trường" style="max-width:100%;border-radius:8px"></div>`), wide: true });
      return;
    }
    const bo = t.closest('[data-boanh]');
    if (bo) { const [i, j] = bo.dataset.boanh.split(':').map(Number); kt.s5[i].anh.splice(j, 1); build(); return; }
    if (t.closest('[data-keo]')) {
      const ds = [...kt.su_co.filter((s) => s.tinh_trang !== 'da_xu_ly' && s.may_id).map((s) => `- ${cat.name('may', s.may_id, 'ma')}: ${s.ten_loi || S.cat.byId.ma_loi[s.ma_loi_id]?.ten || ''} (${TINH_TRANG[s.tinh_trang]?.label || ''})`),
        ...chuaXong.map((x) => `- ${cat.name('may', x.phieu.may_id, 'ma')}: ${x.ten_loi || ''} (${TINH_TRANG[x.tinh_trang]?.label || ''}, từ ${fmtDate(x.phieu.ngay)})`)];
      if (!ds.length) return toast('Không có sự cố nào chưa dứt điểm', 'info');
      kt.ton_dong = [kt.ton_dong.trim(), ...ds.filter((l) => !kt.ton_dong.includes(l))].filter(Boolean).join('\n'); build(); return;
    }
    try {
      if (t.closest('[data-draft]')) await luu(false);
      else if (t.closest('[data-send]')) await luu(true);
      else if (t.closest('[data-nhan]')) {
        if (!(await confirmBox('Xác nhận nhận ca? Giờ nhận ca ghi theo giờ bấm thật.', { ok: 'Xác nhận nhận ca' }))) return;
        await rpc('nhan_ca', { p_id: id, p_ghi_chu: null }); toast('Đã xác nhận nhận ca', 'success'); reload();
      } else if (t.closest('[data-unlock]')) {
        const ly = await askText('Mở khóa báo cáo giao ca', 'Lý do mở khóa (bắt buộc — lưu vào nhật ký)', '', 'Mở khóa');
        if (ly == null) return;
        await rpc('mo_khoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã mở khóa — báo cáo trở về nháp', 'info'); reload();
      } else if (t.closest('[data-xoa]')) {
        const ly = await askText(`Xóa hẳn báo cáo giao ca ${fmtDate(g.ngay)} · ${cat.name('ca', g.ca_id)}`, 'Lý do xóa (bắt buộc — xóa luôn các phiếu, lần dừng tự tạo)', '', 'Xóa hẳn');
        if (ly == null) return;
        await rpc('xoa_giao_ca', { p_id: id, p_ly_do: ly }); toast('Đã xóa báo cáo giao ca', 'info'); refreshFaultBadge(); go(`#/giao-ca?bp=${g.bo_phan_id}`);
      } else if (t.closest('[data-print]')) window.print();
    } catch (err) { toast(errText(err), 'danger'); }
  };
  main.onchange = null; main.oninput = null;
  if (!g.ca_id && canEdit) {   // ca mặc định theo giờ hiện tại
    const now = nowHM();
    g.ca_id = caDs().find((c) => { const a = hm(c.gio_bd), b = hm(c.gio_kt); return a <= b ? now >= a && now < b : now >= a || now < b; })?.id || caDs()[0]?.id || '';
  }
  await napTruoc();
  build();
}
