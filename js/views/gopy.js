// v1.8 — GÓP Ý CHỈNH SỬA APP: mọi người dùng gửi góp ý tự do (báo lỗi / đề xuất / khác); quản lý, admin xem và trả lời.
import { S, sb, cat, can, rpc, errText } from '../api.js';
import { esc, icon, fmtDateTime } from '../lib.js';
import { $, el, toast, selectField, textField, inputField, segmented, openSheet } from '../ui.js';

const LOAI = { de_xuat: 'Đề xuất', loi: 'Báo lỗi', khac: 'Khác' };
const TT = { moi: ['info', 'info', 'Mới'], dang_xu_ly: ['warning', 'hold', 'Đang xử lý'], da_xong: ['success', 'pass', 'Đã xong'], khong_lam: ['danger', 'fail', 'Không làm'] };
const badge = (k) => { const [tone, ic, t] = TT[k] || TT.moi; return `<span class="nn-status nn-tone-${tone}">${icon(ic, 14)}${t}</span>`; };

export async function render(main) {
  const quanLy = can.moKhoa();
  const st = { loai: 'de_xuat', man_hinh: '', noi_dung: '', loc: '' };
  main.innerHTML = `<div class="page-head"><div><div class="t-page">Góp ý chỉnh sửa app</div>
    <div class="muted">Bạn thấy chỗ nào khó dùng, sai, hay muốn thêm tính năng — cứ ghi tự do. ${quanLy ? 'Bạn thấy góp ý của mọi người và trả lời được.' : 'Bạn xem được góp ý của mình và câu trả lời.'}</div></div></div>
    <section class="card section"><div class="card-head"><div class="t-h2">Gửi góp ý mới</div></div><div class="form-grid" data-form></div>
      <div class="nn-row" style="padding:12px 0 0;justify-content:flex-end"><button class="nn-btn nn-btn-primary nn-btn-lg" data-send>${icon('send', 18)}Gửi góp ý</button></div></section>
    <section class="card"><div class="card-head"><div class="t-h2" data-title>Góp ý</div><div data-f></div></div><div data-list></div></section>`;
  const f = $('[data-form]', main);
  const seg = el('<div class="nn-field span-2"><span class="nn-label">Loại góp ý</span></div>');
  seg.append(segmented(Object.entries(LOAI).map(([k, v]) => ({ value: k, label: v })), st.loai, (v) => { st.loai = v; }));
  const nd = textField({ label: 'Nội dung góp ý', placeholder: 'VD: Ô chọn giờ trên điện thoại hơi nhỏ, khó bấm…', onInput: (v) => { st.noi_dung = v; } });
  $('.nn-label', nd).classList.add('req');
  f.append(seg, inputField({ label: 'Ở màn hình nào (không bắt buộc)', size: 'md', placeholder: 'VD: Ghi phiếu, Báo cáo giao ca…', onInput: (v) => { st.man_hinh = v; } }), nd);
  if (quanLy) $('[data-f]', main).append(selectField({ label: '', size: 'md', placeholder: 'Tất cả trạng thái', options: Object.entries(TT).map(([k, v]) => ({ value: k, label: v[2] })), onChange: (v) => { st.loc = v; load(); } }));

  let rows = [];
  async function load() {
    let q = sb.from('gop_y').select('*').order('luc', { ascending: false }).limit(300);
    if (st.loc) q = q.eq('trang_thai', st.loc);
    const { data, error } = await q;
    if (error) { $('[data-list]', main).innerHTML = `<div class="empty">${esc(errText(error))}${/gop_y/.test(error.message || '') ? ' — chạy lại file supabase/01_schema.sql bản mới' : ''}</div>`; return; }
    rows = data;
    $('[data-title]', main).textContent = `${quanLy ? 'Tất cả góp ý' : 'Góp ý của bạn'} (${rows.length})`;
    $('[data-list]', main).innerHTML = rows.length ? `<div class="list-cards">${rows.map((r) => `<div class="lc" style="cursor:default">
      <div class="lc-row"><span><span class="chip">${esc(LOAI[r.loai] || r.loai)}</span>${r.man_hinh ? ` <span class="chip dept">${esc(r.man_hinh)}</span>` : ''}</span>${badge(r.trang_thai)}</div>
      <div class="wrap" style="white-space:pre-wrap">${esc(r.noi_dung)}</div>
      <div class="t-cap">${esc(cat.person(r.nguoi_id) || '')} · ${fmtDateTime(r.luc)}</div>
      ${r.phan_hoi ? `<div class="nn-alert nn-alert-info" style="margin-top:6px"><div class="nn-alert-body"><div class="nn-alert-text"><b>Trả lời:</b> ${esc(r.phan_hoi)} <span class="t-cap">— ${esc(cat.person(r.nguoi_phan_hoi) || '')} · ${fmtDateTime(r.luc_phan_hoi)}</span></div></div></div>` : ''}
      ${quanLy ? `<div class="nn-row" style="padding:0"><button class="nn-btn nn-btn-secondary nn-btn-md" data-reply="${r.id}">${icon('edit', 16)}Trả lời / đổi trạng thái</button></div>` : ''}
      </div>`).join('')}</div>` : '<div class="empty">Chưa có góp ý nào</div>';
  }
  main.onclick = async (e) => {
    if (e.target.closest('[data-send]')) {
      if (!st.noi_dung.trim()) return toast('Chưa nhập nội dung góp ý', 'warning');
      try {
        await rpc('gui_gop_y', { p_loai: st.loai, p_man_hinh: st.man_hinh, p_noi_dung: st.noi_dung });
        toast('Đã gửi góp ý — cảm ơn bạn!', 'success'); render(main);
      } catch (err) { toast(errText(err), 'danger'); }
      return;
    }
    const b = e.target.closest('[data-reply]');
    if (b) {
      const r = rows.find((x) => x.id === b.dataset.reply);
      let tt = r.trang_thai === 'moi' ? 'dang_xu_ly' : r.trang_thai, ph = r.phan_hoi || '';
      const body = el('<div class="nn-stack" style="padding:0;gap:10px"></div>');
      body.append(selectField({ label: 'Trạng thái', value: tt, options: Object.entries(TT).map(([k, v]) => ({ value: k, label: v[2] })), onChange: (v) => { tt = v; } }),
        textField({ label: 'Trả lời người góp ý', value: ph, onInput: (v) => { ph = v; } }));
      const ok = el(`<button class="nn-btn nn-btn-primary nn-btn-lg">${icon('pass', 18)}Lưu</button>`);
      const sh = openSheet({ title: 'Trả lời góp ý', body, foot: [ok] });
      ok.onclick = async () => {
        try { await rpc('tra_loi_gop_y', { p_id: r.id, p_trang_thai: tt, p_phan_hoi: ph }); sh.close(); toast('Đã lưu'); load(); } catch (err) { toast(errText(err), 'danger'); }
      };
    }
  };
  load();
}
