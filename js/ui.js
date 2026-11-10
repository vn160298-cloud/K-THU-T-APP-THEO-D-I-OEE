// Thành phần giao diện dùng chung: toast, sheet, ô chọn có tìm kiếm, lịch chọn ngày
import { esc, icon, fmtDate, today, parseISO, toISO, pad, DOW, MONTHS, noAccent, addDays, monthStart, monthEnd } from './lib.js';

export const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Toast ----------
export function toast(text, tone = 'success', title = '') {
  const ic = { success: 'pass', warning: 'warn', danger: 'fail', info: 'info' }[tone];
  const n = el(`<div class="nn-alert nn-alert-${tone}" role="${tone === 'danger' ? 'alert' : 'status'}">
    <span class="nn-alert-icon nn-tone-${tone}">${icon(ic, 20)}</span>
    <div class="nn-alert-body">${title ? `<div class="nn-alert-title">${esc(title)}</div>` : ''}<div class="nn-alert-text">${esc(text)}</div></div></div>`);
  $('#toasts').append(n);
  setTimeout(() => n.remove(), tone === 'danger' ? 7000 : 3500);
}

// ---------- Sheet (hộp thoại trượt lên trên điện thoại) ----------
export function openSheet({ title, body, foot, onClose, wide }) {
  const back = el(`<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true" ${wide ? 'style="max-width:900px"' : ''}>
    <div class="sheet-head"><div class="t-h3">${esc(title)}</div>
    <button class="nn-btn nn-btn-ghost nn-btn-sm" data-x aria-label="Đóng">${icon('x', 18)}</button></div>
    <div class="sheet-body"></div>${foot ? '<div class="sheet-foot"></div>' : ''}</div></div>`);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  $('[data-x]', back).onclick = close;
  document.addEventListener('keydown', onKey);
  const b = $('.sheet-body', back);
  typeof body === 'string' ? (b.innerHTML = body) : b.append(body);
  if (foot) { const f = $('.sheet-foot', back); typeof foot === 'string' ? (f.innerHTML = foot) : f.append(...[].concat(foot)); }
  document.body.append(back);
  return { el: back, body: b, close };
}

export function confirmBox(text, { ok = 'Xác nhận', danger = false, title = 'Xác nhận' } = {}) {
  return new Promise((res) => {
    let done = false;
    const okB = el(`<button class="nn-btn ${danger ? 'nn-btn-danger' : 'nn-btn-primary'} nn-btn-lg">${esc(ok)}</button>`);
    const noB = el('<button class="nn-btn nn-btn-secondary nn-btn-lg">Hủy</button>');
    const s = openSheet({ title, body: `<p>${esc(text)}</p>`, foot: [noB, okB], onClose: () => { if (!done) res(false); } });
    okB.onclick = () => { done = true; s.close(); res(true); };
    noB.onclick = () => { done = true; s.close(); res(false); };
  });
}

// ---------- Ô nhập ----------
let fid = 0;
const nextId = () => `f${++fid}`;
const wrapField = (label, inner, { req, msg, span, cls = '' } = {}) => {
  const id = nextId();
  const f = el(`<div class="nn-field ${span ? 'span-2' : ''} ${cls}">
    <label class="nn-label ${req ? 'req' : ''}" for="${id}">${esc(label)}</label>${inner.replace('__ID__', id)}
    ${msg ? `<div class="nn-field-msg">${msg}</div>` : '<div class="nn-field-msg" hidden></div>'}</div>`);
  return f;
};
export const setFieldError = (f, text) => {
  const m = $('.nn-field-msg', f);
  f.classList.toggle('nn-field-error', !!text);
  if (text) { m.hidden = false; m.innerHTML = `${icon('fail', 14)}${esc(text)}`; } else if (!m.dataset.keep) { m.hidden = true; m.innerHTML = ''; }
};

export function inputField({ label, value = '', type = 'text', unit, inputmode, placeholder = '', req, msg, span, readonly, onInput, size = 'lg', attrs = '' }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size} ${readonly ? 'auto-fill' : ''}">
    <input id="__ID__" class="nn-input" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" ${readonly ? 'readonly' : ''} ${attrs}>
    ${unit ? `<span class="nn-input-unit">${esc(unit)}</span>` : ''}</div>`, { req, msg, span });
  const inp = $('input', f);
  if (onInput) inp.addEventListener('input', () => onInput(inp.value, f));
  f.input = inp;
  return f;
}

export function textField({ label, value = '', placeholder = '', span = true, onInput, size = 'lg' }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size} ta"><textarea id="__ID__" class="nn-input" rows="2" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`, { span });
  const t = $('textarea', f);
  if (onInput) t.addEventListener('input', () => onInput(t.value, f));
  f.input = t;
  return f;
}

export function selectField({ label, value = '', options = [], req, placeholder = '— Chọn —', onChange, size = 'lg', span }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size}"><select id="__ID__" class="nn-input">
    <option value="">${esc(placeholder)}</option>
    ${options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select><span class="sel-caret">${icon('chevD', 18)}</span></div>`, { req, span });
  const s = $('select', f);
  if (onChange) s.addEventListener('change', () => onChange(s.value, f));
  f.input = s;
  return f;
}

/** Danh sách xổ xuống có ô tìm kiếm — dùng cho danh sách dài (máy, mã lỗi, nhân sự) */
export function comboField({ label, value = '', options = [], req, placeholder = '— Chọn —', onChange, size = 'lg', span, msg, allowClear = true }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size}">
    <button type="button" id="__ID__" class="combo-btn"></button><span class="sel-caret">${icon('search', 18)}</span></div>`, { req, span, msg });
  const btn = $('.combo-btn', f);
  let cur = value;
  const paint = () => {
    const o = options.find((x) => String(x.value) === String(cur));
    btn.textContent = o ? o.label : placeholder;
    btn.classList.toggle('placeholder', !o);
  };
  paint();
  btn.onclick = () => {
    const box = el(`<div><div class="nn-input-wrap nn-input-lg" style="margin-bottom:12px">${icon('search', 18, 'muted')}
      <input class="nn-input" placeholder="Gõ để tìm (không cần dấu)…" autocomplete="off"></div><ul class="opt-list"></ul></div>`);
    const q = $('input', box), ul = $('ul', box);
    const draw = () => {
      const k = noAccent(q.value);
      const list = options.filter((o) => !k || noAccent(`${o.label} ${o.sub || ''} ${o.group || ''}`).includes(k));
      let g = null, html = '';
      if (allowClear && cur) html += `<li><button type="button" data-v="">${icon('x', 16)}<span class="muted">Bỏ chọn</span></button></li>`;
      for (const o of list.slice(0, 300)) {
        if (o.group && o.group !== g) { g = o.group; html += `<li class="opt-group nn-label">${esc(g)}</li>`; }
        html += `<li><button type="button" data-v="${esc(o.value)}" class="${String(o.value) === String(cur) ? 'is-on' : ''}">
          <span>${esc(o.label)}</span>${o.sub ? `<span class="opt-sub">${esc(o.sub)}</span>` : ''}</button></li>`;
      }
      ul.innerHTML = html || '<li class="empty">Không tìm thấy</li>';
    };
    draw();
    q.addEventListener('input', draw);
    const s = openSheet({ title: label, body: box });
    ul.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      cur = b.dataset.v; paint(); s.close(); onChange?.(cur, f);
    });
    setTimeout(() => q.focus(), 50);
  };
  f.setOptions = (opts, v) => { options = opts; if (v !== undefined) cur = v; paint(); };
  f.getValue = () => cur;
  f.setValue = (v) => { cur = v; paint(); };
  return f;
}

// ---------- Lịch ----------
/** Vẽ lưới tháng. opts: {month:'YYYY-MM-01', sel, from, to, decorate(iso)->{cls, html}} */
export function calendarGrid({ month, sel, from, to, decorate, big }) {
  const first = parseISO(month);
  const startDow = (first.getDay() + 6) % 7; // Thứ 2 đầu tuần
  const start = new Date(first); start.setDate(1 - startDow);
  const t = today();
  let html = `<div class="cal ${big ? 'cal-big' : ''}"><div class="cal-grid">${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = toISO(d);
    if (i >= 35 && d.getMonth() !== first.getMonth()) break;
    const dec = decorate?.(iso) || {};
    const cls = ['cal-day', d.getMonth() !== first.getMonth() && 'out', iso === t && 'today', (iso === sel || iso === from || iso === to) && 'sel',
      from && to && iso > from && iso < to && 'in-range', dec.cls].filter(Boolean).join(' ');
    html += `<button type="button" class="${cls}" data-d="${iso}" aria-label="${fmtDate(iso)}"><span class="cd-n">${d.getDate()}</span>${dec.html || ''}</button>`;
  }
  return html + '</div></div>';
}

function calHeader(month) {
  const d = parseISO(month);
  return `<div class="cal-head"><button type="button" class="nn-btn nn-btn-secondary nn-btn-md" data-nav="-1" aria-label="Tháng trước">${icon('chevL', 18)}</button>
    <div class="t-h3">${MONTHS[d.getMonth()]} ${d.getFullYear()}</div>
    <button type="button" class="nn-btn nn-btn-secondary nn-btn-md" data-nav="1" aria-label="Tháng sau">${icon('chevR', 18)}</button></div>`;
}
const shiftMonth = (m, n) => { const d = parseISO(m); d.setMonth(d.getMonth() + n); return toISO(d).slice(0, 8) + '01'; };

/** Chọn 1 ngày bằng bảng lịch */
export function pickDate(value, title = 'Chọn ngày') {
  return new Promise((res) => {
    let month = monthStart(value || today());
    const box = el('<div></div>');
    const draw = () => { box.innerHTML = calHeader(month) + calendarGrid({ month, sel: value }); };
    draw();
    const todayB = el('<button class="nn-btn nn-btn-secondary nn-btn-md">Hôm nay</button>');
    let picked = null;
    const s = openSheet({ title, body: box, foot: [todayB], onClose: () => res(picked) });
    todayB.onclick = () => { picked = today(); s.close(); };
    box.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]'); if (n) { month = shiftMonth(month, +n.dataset.nav); draw(); return; }
      const d = e.target.closest('[data-d]'); if (d) { picked = d.dataset.d; s.close(); }
    });
  });
}

export function dateField({ label, value, req, onChange, size = 'lg' }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size}"><button type="button" id="__ID__" class="combo-btn"></button><span class="sel-caret">${icon('cal', 18)}</span></div>`, { req });
  const btn = $('button', f);
  let cur = value;
  const paint = () => { btn.textContent = cur ? fmtDate(cur) : 'Chọn ngày'; btn.classList.toggle('placeholder', !cur); };
  paint();
  btn.onclick = async () => { const v = await pickDate(cur, label); if (v) { cur = v; paint(); onChange?.(v, f); } };
  f.getValue = () => cur;
  f.setValue = (v) => { cur = v; paint(); };
  return f;
}

/** Chọn khoảng ngày: nút nhanh + bảng lịch chọn 2 lần */
export function rangeField({ label = 'Khoảng ngày', from, to, onChange, size = 'md' }) {
  const f = wrapField(label, `<div class="nn-input-wrap nn-input-${size}"><button type="button" id="__ID__" class="combo-btn"></button><span class="sel-caret">${icon('cal', 18)}</span></div>`, {});
  const btn = $('button', f);
  const paint = () => { btn.textContent = from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`; };
  paint();
  btn.onclick = () => {
    let a = from, b = to, picking = false, month = monthStart(to);
    const box = el('<div></div>');
    const t = today();
    const presets = [
      ['Hôm nay', t, t], ['7 ngày', addDays(t, -6), t], ['30 ngày', addDays(t, -29), t],
      ['Tháng này', monthStart(t), t], ['Tháng trước', monthStart(addDays(monthStart(t), -1)), monthEnd(addDays(monthStart(t), -1))],
      ['Năm nay', t.slice(0, 4) + '-01-01', t],
    ];
    const draw = () => {
      box.innerHTML = `<div class="nn-row" style="padding:0 0 12px">${presets.map((p, i) => `<button type="button" class="nn-btn nn-btn-secondary nn-btn-sm" data-p="${i}">${p[0]}</button>`).join('')}</div>
        <p class="t-cap">${picking ? 'Chọn ngày kết thúc' : 'Chọn ngày bắt đầu'} · Đang chọn: <b>${fmtDate(a)} – ${fmtDate(b)}</b></p>
        ${calHeader(month)}${calendarGrid({ month, from: a, to: b })}`;
    };
    draw();
    const okB = el('<button class="nn-btn nn-btn-primary nn-btn-lg">Áp dụng</button>');
    const s = openSheet({ title: label, body: box, foot: [okB] });
    const apply = () => { from = a; to = b; paint(); s.close(); onChange?.(from, to); };
    okB.onclick = apply;
    box.addEventListener('click', (e) => {
      const p = e.target.closest('[data-p]'); if (p) { [, a, b] = presets[+p.dataset.p]; apply(); return; }
      const n = e.target.closest('[data-nav]'); if (n) { month = shiftMonth(month, +n.dataset.nav); draw(); return; }
      const d = e.target.closest('[data-d]'); if (!d) return;
      const v = d.dataset.d;
      if (!picking) { a = v; b = v; picking = true; } else { if (v < a) { b = a; a = v; } else b = v; picking = false; }
      draw();
    });
  };
  f.set = (a, b) => { from = a; to = b; paint(); };
  return f;
}

export function segmented(options, value, onChange) {
  const s = el(`<div class="seg" role="group">${options.map((o) => `<button type="button" data-v="${esc(o.value)}" class="${o.value === value ? 'is-on' : ''}">${esc(o.label)}</button>`).join('')}</div>`);
  s.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', s).forEach((x) => x.classList.toggle('is-on', x === b));
    onChange(b.dataset.v);
  });
  return s;
}

export const kpiCard = ({ label, value, unit = '', foot = '', status = '', small }) => `<div class="nn-kpi">
  <div class="nn-kpi-top"><span class="nn-label">${esc(label)}</span>${status}</div>
  <div class="nn-kpi-value ${small ? 'sm' : ''}">${value}${unit ? `<span class="nn-kpi-unit">${esc(unit)}</span>` : ''}</div>
  <div class="nn-kpi-foot">${foot}</div></div>`;

export const cssVar = (n) => getComputedStyle(document.body).getPropertyValue(n).trim();
export { pad };
