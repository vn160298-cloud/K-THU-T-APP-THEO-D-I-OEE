import { login, errText } from '../api.js';
import { el, inputField, $, setFieldError } from '../ui.js';
import { icon } from '../lib.js';
import { lsGet, lsSet } from '../store.js';

export function render(main) {
  $('#side').hidden = true; $('#tabbar').hidden = true;
  main.innerHTML = '';
  const card = el(`<form class="card login nn-stack" style="padding:24px" novalidate>
    <div><div class="t-page">Đăng nhập</div><p class="muted" style="margin:4px 0 0">Theo dõi OEE · Bộ phận Kỹ thuật</p></div>
    <div data-f></div>
    <div class="nn-alert nn-alert-danger" role="alert" hidden data-err><span class="nn-alert-icon nn-tone-danger">${icon('fail', 20)}</span>
      <div class="nn-alert-body"><div class="nn-alert-text" data-errt></div></div></div>
    <button class="nn-btn nn-btn-primary nn-btn-lg" type="submit">${icon('user', 20)}Đăng nhập</button>
    <p class="t-cap">Quên PIN? Liên hệ Admin để cấp lại. Đăng nhập một lần, lần sau mở app sẽ vào thẳng — kể cả khi mất mạng.</p>
  </form>`);
  const fMa = inputField({ label: 'Mã nhân viên', value: lsGet('lastMa', ''), req: true, attrs: 'autocomplete="username" autocapitalize="characters"' });
  const fPin = inputField({ label: 'Mã PIN (4–6 số)', type: 'password', inputmode: 'numeric', req: true, attrs: 'autocomplete="current-password" maxlength="6" pattern="[0-9]*"' });
  $('[data-f]', card).append(fMa, fPin);
  main.append(card);
  (fMa.input.value ? fPin : fMa).input.focus();

  card.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ma = fMa.input.value.trim(), pin = fPin.input.value.trim();
    setFieldError(fMa, ma ? '' : 'Nhập mã nhân viên');
    setFieldError(fPin, /^\d{4,6}$/.test(pin) ? '' : 'PIN gồm 4–6 chữ số');
    if (!ma || !/^\d{4,6}$/.test(pin)) return;
    const btn = $('button[type=submit]', card);
    btn.disabled = true; btn.lastChild.textContent = 'Đang đăng nhập…';
    try {
      await login(ma, pin);
      lsSet('lastMa', ma);
      const { startApp } = await import('../app.js');
      if (!location.hash || location.hash === '#/') location.hash = '#/hom-nay';
      await startApp();
    } catch (err) {
      $('[data-err]', card).hidden = false;
      $('[data-errt]', card).textContent = errText(err);
      btn.disabled = false; btn.lastChild.textContent = 'Đăng nhập';
    }
  });
}
